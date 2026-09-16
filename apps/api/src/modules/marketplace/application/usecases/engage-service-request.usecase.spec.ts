import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { LISTING_TYPE, URGENCY_LEVEL } from '../../domain/entities/marketplace-types';
import { ServiceRequest } from '../../domain/entities/service-request';
import {
  ServiceRequestListingUnavailableException,
  ServiceRequestNotEngageableException,
  ServiceRequestNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { ContactListingOwnerUseCase } from './contact-listing-owner.usecase';
import { EngageServiceRequestUseCase } from './engage-service-request.usecase';

const MEMBER = '019fe41e-0000-7000-8000-000000000001';
const PARTNER = '019fe41e-0000-7000-8000-000000000002';
const CATEGORY = '019fe41e-0000-7000-8000-0000000000c1';
const LISTING_ID = '019fe41e-0000-7000-8000-0000000000ff';

function openRequest(): ServiceRequest {
  return ServiceRequest.create({
    memberId: MEMBER,
    categoryId: CATEGORY,
    title: 'Preciso de um eletricista',
    description: 'Chuveiro parou de esquentar e um disjuntor desarma sozinho.',
    locationLabel: 'Vila Mariana, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
  });
}

function publishedListing(): MarketplaceListing {
  const listing = MarketplaceListing.createDraft({
    ownerId: PARTNER,
    title: 'Eletricista residencial',
    description: 'Atendo emergências elétricas em toda a região.',
    listingType: LISTING_TYPE.SERVICE,
    categoryId: CATEGORY,
    price: 150,
    currency: 'BRL',
  });
  listing.publish();
  return listing;
}

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function makeScenario(options: {
  request?: ServiceRequest | null;
  listing?: MarketplaceListing | null;
  contactResult?: { created: boolean };
  saveEngagementResult?: boolean;
  markMatchedIfOpenResult?: boolean;
}) {
  const serviceRequestRepository = {
    findById: vi.fn().mockResolvedValue(options.request === undefined ? openRequest() : options.request),
    markMatchedIfOpen: vi.fn().mockResolvedValue(options.markMatchedIfOpenResult ?? true),
    saveEngagement: vi.fn().mockResolvedValue(options.saveEngagementResult ?? true),
  } as unknown as ServiceRequestRepository;
  const listingRepository = {
    findPublishedById: vi
      .fn()
      .mockResolvedValue(options.listing === undefined ? publishedListing() : options.listing),
  } as unknown as MarketplaceListingRepository;
  const contactUseCase = {
    execute: vi.fn().mockResolvedValue({
      conversation: { conversationId: 'conv-1', sellerId: PARTNER, buyerId: MEMBER },
      message: { messageId: 'msg-1', message: 'Olá!' },
      created: options.contactResult?.created ?? true,
    }),
  } as unknown as ContactListingOwnerUseCase;
  const outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }) } as unknown as OutboxService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  return {
    serviceRequestRepository,
    listingRepository,
    contactUseCase,
    outbox,
    useCase: new EngageServiceRequestUseCase(
      serviceRequestRepository,
      listingRepository,
      contactUseCase,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

const eventNames = (outbox: OutboxService) =>
  vi.mocked(outbox.enqueue).mock.calls.map((call) => (call[1] as { eventType: string }).eventType);

describe('EngageServiceRequestUseCase (IP-003)', () => {
  it('engaja o Partner: reaproveita ContactListingOwnerUseCase e publica Matched + Engagement.Created', async () => {
    const { useCase, contactUseCase, serviceRequestRepository, outbox } = makeScenario({});

    const result = await useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'Olá!' });

    expect(contactUseCase.execute).toHaveBeenCalledWith(MEMBER, LISTING_ID, { message: 'Olá!' }, {});
    expect(serviceRequestRepository.markMatchedIfOpen).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true);
    expect(eventNames(outbox)).toEqual(['ServiceRequestEngagement.Created', 'ServiceRequest.Matched']);
  });

  it('segundo engajamento com o MESMO anúncio não republica ServiceRequest.Matched nem chama a CAS de novo', async () => {
    const matched = openRequest();
    matched.markMatched();
    const { useCase, serviceRequestRepository, outbox } = makeScenario({ request: matched });

    const result = await useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'De novo!' });

    expect(serviceRequestRepository.markMatchedIfOpen).not.toHaveBeenCalled();
    expect(result.created).toBe(true); // novo Partner, novo engagement — mas já estava MATCHED
    expect(eventNames(outbox)).toEqual(['ServiceRequestEngagement.Created']);
  });

  it('reengajar o MESMO anúncio (retry idempotente): saveEngagement recusa duplicata e nenhum evento é publicado', async () => {
    const matched = openRequest();
    matched.markMatched();
    const { useCase, outbox } = makeScenario({ request: matched, saveEngagementResult: false });

    const result = await useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'De novo!' });

    expect(result.created).toBe(false);
    expect(eventNames(outbox)).toEqual([]);
  });

  it('corrida: request lida como OPEN mas a CAS é perdida — publica Engagement.Created SEM publicar ServiceRequest.Matched', async () => {
    // Reproduz exatamente o cenário do defeito relatado no Diff Review §F: duas
    // chamadas concorrentes leem `status: OPEN` (a leitura pré-transação nunca
    // vê a corrida), mas só uma vence o `UPDATE ... WHERE status = 'OPEN'` no
    // banco. Esta é a chamada PERDEDORA: seu próprio engajamento (outro anúncio)
    // ainda é criado com sucesso, mas ela NUNCA deve publicar `ServiceRequest.Matched`
    // — quem venceu a CAS é quem publica esse evento, não quem lê OPEN primeiro.
    const { useCase, serviceRequestRepository, outbox } = makeScenario({
      request: openRequest(), // status OPEN na leitura
      markMatchedIfOpenResult: false, // ...mas perde a corrida no banco
    });

    const result = await useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'Consegue hoje?' });

    expect(serviceRequestRepository.markMatchedIfOpen).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true); // o engajamento em si (outro anúncio) foi criado normalmente
    expect(eventNames(outbox)).toEqual(['ServiceRequestEngagement.Created']); // SEM ServiceRequest.Matched
  });

  it('pedido inexistente ou de outro Member → 404 (nunca 403, nunca confirma existência)', async () => {
    const { useCase } = makeScenario({ request: null });
    await expect(
      useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'oi' }),
    ).rejects.toThrow(ServiceRequestNotFoundException);
  });

  it('pedido CLOSED/CANCELLED não aceita novo engajamento', async () => {
    const closed = openRequest();
    closed.close(MEMBER, null);
    const { useCase } = makeScenario({ request: closed });
    await expect(
      useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'oi' }),
    ).rejects.toThrow(ServiceRequestNotEngageableException);
  });

  it('anúncio indicado não está publicado/disponível → 404', async () => {
    const { useCase } = makeScenario({ listing: null });
    await expect(
      useCase.execute(MEMBER, 'sr-1', { listingId: LISTING_ID, message: 'oi' }),
    ).rejects.toThrow(ServiceRequestListingUnavailableException);
  });
});
