import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceConversation } from '../../domain/entities/marketplace-conversation';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { LISTING_TYPE } from '../../domain/entities/marketplace-types';
import {
  CannotContactOwnListingException,
  MarketplaceListingNotFoundException,
  MarketplaceListingUnavailableException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ContactListingOwnerUseCase } from './contact-listing-owner.usecase';

const SELLER = '019fe41e-0000-7000-8000-000000000001';
const BUYER = '019fe41e-0000-7000-8000-000000000002';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function publishedListing(): MarketplaceListing {
  const listing = MarketplaceListing.createDraft({
    ownerId: SELLER,
    title: 'Diarista com experiência',
    description: 'Faxina completa em apartamentos de até 3 quartos, com material.',
    listingType: LISTING_TYPE.SERVICE,
    categoryId: '019fe41e-0000-7000-8000-0000000000c1',
    price: 200,
    currency: 'BRL',
  });
  listing.publish();
  return listing;
}

function makeScenario(options: {
  listing?: MarketplaceListing | null;
  existing?: MarketplaceConversation | null;
}) {
  const listingRepository = {
    findById: vi.fn().mockResolvedValue(options.listing ?? null),
  } as unknown as MarketplaceListingRepository;
  const conversationRepository = {
    findActiveConversation: vi.fn().mockResolvedValue(options.existing ?? null),
    save: vi.fn().mockResolvedValue(undefined),
    saveMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarketplaceConversationRepository;
  const outbox = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }),
  } as unknown as OutboxService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  return {
    listingRepository,
    conversationRepository,
    outbox,
    audit,
    useCase: new ContactListingOwnerUseCase(
      listingRepository,
      conversationRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

const eventNames = (outbox: OutboxService) =>
  vi.mocked(outbox.enqueue).mock.calls.map((call) => (call[1] as { eventType: string }).eventType);

describe('ContactListingOwnerUseCase (MRK-006)', () => {
  it('cria a conversa e publica Created + Sent', async () => {
    const { useCase, outbox, conversationRepository } = makeScenario({
      listing: publishedListing(),
    });

    const result = await useCase.execute(BUYER, 'listing-id', { message: 'Ainda atende hoje?' });

    expect(result.created).toBe(true);
    expect(result.conversation.sellerId).toBe(SELLER);
    expect(result.conversation.buyerId).toBe(BUYER);
    expect(result.message.message).toBe('Ainda atende hoje?');
    expect(eventNames(outbox)).toEqual([
      'MarketplaceConversation.Created',
      'MarketplaceMessage.Sent',
    ]);
    expect(conversationRepository.saveMessage).toHaveBeenCalledTimes(1);
  });

  /** BR-005 + INCONSISTENCIAS #9: reutiliza, não duplica nem devolve 409. */
  it('reaproveita conversa ativa e publica apenas Sent', async () => {
    const listing = publishedListing();
    const existing = MarketplaceConversation.open({
      listingId: listing.id,
      sellerId: SELLER,
      buyerId: BUYER,
    });
    const { useCase, outbox } = makeScenario({ listing, existing });

    const result = await useCase.execute(BUYER, listing.id, { message: 'Voltei a precisar!' });

    expect(result.created).toBe(false);
    expect(result.conversation.conversationId).toBe(existing.id);
    expect(eventNames(outbox)).toEqual(['MarketplaceMessage.Sent']);
  });

  it('dono não conversa com o próprio anúncio (BR-003)', async () => {
    const { useCase } = makeScenario({ listing: publishedListing() });
    await expect(useCase.execute(SELLER, 'listing-id', { message: 'oi' })).rejects.toThrow(
      CannotContactOwnListingException,
    );
  });

  it('anúncio inexistente → 404', async () => {
    const { useCase } = makeScenario({ listing: null });
    await expect(useCase.execute(BUYER, 'listing-id', { message: 'oi' })).rejects.toThrow(
      MarketplaceListingNotFoundException,
    );
  });

  it('anúncio ainda em rascunho não recebe contato (BR-002)', async () => {
    const draft = MarketplaceListing.createDraft({ ownerId: SELLER, title: 'Rascunho de serviço' });
    const { useCase } = makeScenario({ listing: draft });
    await expect(useCase.execute(BUYER, draft.id, { message: 'oi' })).rejects.toThrow(
      MarketplaceListingUnavailableException,
    );
  });
});
