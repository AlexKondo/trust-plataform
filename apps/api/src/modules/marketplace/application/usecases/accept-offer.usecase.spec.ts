import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { CommercialPolicy } from '../../domain/entities/commercial-policy';
import { MarketplaceConversation } from '../../domain/entities/marketplace-conversation';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import {
  LISTING_STATUS,
  LISTING_TYPE,
  OFFER_STATUS,
  PRICING_MODEL,
} from '../../domain/entities/marketplace-types';
import {
  MarketplaceListingNotAvailableForOrderException,
  MarketplaceOfferNotRecipientException,
} from '../../domain/exceptions/marketplace.exceptions';
import { CommercialPolicyRepository } from '../../domain/repositories/commercial-policy.repository';
import { MarketplaceCommercialSnapshotRepository } from '../../domain/repositories/marketplace-commercial-snapshot.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import { AcceptOfferUseCase } from './accept-offer.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

function publishedListing(): MarketplaceListing {
  const listing = MarketplaceListing.createDraft({
    ownerId: SELLER,
    title: 'Instalação de ar-condicionado split',
    description: 'Instalação completa com suporte, vácuo e teste de estanqueidade.',
    listingType: LISTING_TYPE.SERVICE,
    categoryId: '019fe8f0-0000-7000-8000-0000000000c1',
    price: 600,
    currency: 'BRL',
  });
  listing.publish();
  return listing;
}

function scenario(
  options: {
    competitors?: MarketplaceOffer[];
    listing?: MarketplaceListing;
    commercialPolicy?: CommercialPolicy;
  } = {},
) {
  const listing = options.listing ?? publishedListing();
  const conversation = MarketplaceConversation.open({
    listingId: listing.id,
    sellerId: SELLER,
    buyerId: BUYER,
  });
  const offer = MarketplaceOffer.create({
    conversationId: conversation.id,
    listingId: listing.id,
    buyerId: BUYER,
    sellerId: SELLER,
    createdBy: BUYER,
    terms: {
      amount: 550,
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(5),
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      hourlyRateAmount: null,
      minimumMinutes: null,
      billingIncrementMinutes: null,
    },
  });

  const offerRepository = {
    findById: vi.fn().mockResolvedValue(offer),
    findPendingByConversation: vi.fn().mockResolvedValue([offer, ...(options.competitors ?? [])]),
    saveAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarketplaceOfferRepository;
  const orderRepository = {
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarketplaceOrderRepository;
  const listingRepository = {
    findById: vi.fn().mockResolvedValue(listing),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarketplaceListingRepository;
  const conversationRepository = {
    findById: vi.fn().mockResolvedValue(conversation),
  } as never;
  const outbox = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }),
  } as unknown as OutboxService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLogService;
  const db = {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(Symbol('tx'))),
  } as unknown as Database;

  // PACK-02 §10 — política ativa (seed técnico de 1000 bps = 10%, ver migration 0026).
  const commercialPolicy = CommercialPolicy.restore({
    id: 'policy-1',
    trustFeeRateBps: 1000,
    defaultBillingIncrementMinutes: 30,
    createdAt: new Date(),
  });
  const commercialPolicyRepository = {
    findActive: vi.fn().mockResolvedValue(options.commercialPolicy ?? commercialPolicy),
  } as unknown as CommercialPolicyRepository;
  const commercialSnapshotRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findByOrderId: vi.fn().mockResolvedValue(null),
  } as unknown as MarketplaceCommercialSnapshotRepository;

  const offerService = new MarketplaceOfferService(
    offerRepository,
    conversationRepository,
    listingRepository,
  );

  return {
    offer,
    listing,
    offerRepository,
    orderRepository,
    listingRepository,
    outbox,
    commercialPolicyRepository,
    commercialSnapshotRepository,
    useCase: new AcceptOfferUseCase(
      offerRepository,
      orderRepository,
      listingRepository,
      offerService,
      commercialPolicyRepository,
      commercialSnapshotRepository,
      outbox,
      audit,
      db,
      logger(),
    ),
  };
}

const eventNames = (outbox: OutboxService) =>
  vi.mocked(outbox.enqueue).mock.calls.map((call) => (call[1] as { eventType: string }).eventType);

describe('AcceptOfferUseCase (MRK-013) — o pivô da negociação', () => {
  it('aceita, reserva o anúncio e cria o pedido na mesma transação', async () => {
    const { useCase, offer, listing, orderRepository } = scenario();

    const result = await useCase.execute(SELLER, offer.id);

    expect(result.offer.status).toBe(OFFER_STATUS.ACCEPTED);
    expect(result.listingStatus).toBe(LISTING_STATUS.RESERVED);
    expect(listing.status).toBe(LISTING_STATUS.RESERVED);
    // BR-005 do MRK-015: o pedido congela os valores da proposta
    expect(result.order).toMatchObject({ amount: 550, currency: 'BRL', status: 'CREATED' });
    expect(result.order.offerId).toBe(offer.id);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });

  it('publica os três eventos do aceite (BR-009)', async () => {
    const { useCase, offer, outbox } = scenario();
    await useCase.execute(SELLER, offer.id);
    expect(eventNames(outbox)).toEqual([
      'MarketplaceOffer.Accepted',
      'MarketplaceListing.Reserved',
      'MarketplaceOrder.Created',
    ]);
  });

  it('cada evento aponta o agregado responsável pelo fato (PACK-00 v1.1 §5.2)', async () => {
    const { useCase, offer, listing, outbox } = scenario();
    const result = await useCase.execute(SELLER, offer.id);

    const events = vi
      .mocked(outbox.enqueue)
      .mock.calls.map(
        (call) => call[1] as { eventType: string; aggregateType: string; aggregateId: string },
      );

    // Três eventos numa transação só, TRÊS agregados diferentes — é justamente
    // por isso que aggregateType/aggregateId não podem ser derivados do produtor.
    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'MarketplaceOffer.Accepted',
        aggregateType: 'MarketplaceOffer',
        aggregateId: offer.id,
      }),
      expect.objectContaining({
        eventType: 'MarketplaceListing.Reserved',
        aggregateType: 'MarketplaceListing',
        aggregateId: listing.id,
      }),
      expect.objectContaining({
        eventType: 'MarketplaceOrder.Created',
        aggregateType: 'MarketplaceOrder',
        aggregateId: result.order.orderId,
      }),
    ]);
  });

  it('encerra as demais propostas pendentes da negociação (BR-004)', async () => {
    const listing = publishedListing();
    const competitor = MarketplaceOffer.create({
      conversationId: 'conv',
      listingId: listing.id,
      buyerId: BUYER,
      sellerId: SELLER,
      createdBy: BUYER,
      terms: {
        amount: 500,
        currency: 'BRL',
        quantity: 1,
        expiresAt: inDays(2),
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        hourlyRateAmount: null,
        minimumMinutes: null,
        billingIncrementMinutes: null,
      },
    });
    const { useCase, offer } = scenario({ listing, competitors: [competitor] });

    const result = await useCase.execute(SELLER, offer.id);

    expect(result.closedOfferIds).toEqual([competitor.id]);
    expect(competitor.status).toBe(OFFER_STATUS.CLOSED);
  });

  it('o comprador não aceita a própria proposta (BR-001)', async () => {
    const { useCase, offer, listing } = scenario();
    await expect(useCase.execute(BUYER, offer.id)).rejects.toThrow(
      MarketplaceOfferNotRecipientException,
    );
    expect(listing.status).toBe(LISTING_STATUS.PUBLISHED); // nada foi reservado
  });

  it('anúncio já reservado por outra negociação bloqueia o aceite', async () => {
    const listing = publishedListing();
    listing.reserve();
    const { useCase, offer } = scenario({ listing });
    // O anúncio reservado deixa de ser publicamente visível: o contexto barra antes
    await expect(useCase.execute(SELLER, offer.id)).rejects.toThrow();
    expect(offer.status).toBe(OFFER_STATUS.PENDING);
  });

  it('reserve() recusa anúncio que não está publicado', () => {
    const listing = publishedListing();
    listing.reserve();
    expect(() => listing.reserve()).toThrow(MarketplaceListingNotAvailableForOrderException);
  });
});

describe('AcceptOfferUseCase — snapshot econômico (PACK-02 §10)', () => {
  it('resolve a política vigente e congela o snapshot com grossAmount === order.amount', async () => {
    const { useCase, offer, commercialPolicyRepository, commercialSnapshotRepository } = scenario();

    const result = await useCase.execute(SELLER, offer.id);

    expect(commercialPolicyRepository.findActive).toHaveBeenCalled();
    expect(commercialSnapshotRepository.save).toHaveBeenCalledTimes(1);

    const [savedSnapshot] = vi.mocked(commercialSnapshotRepository.save).mock.calls[0]!;
    expect(savedSnapshot.orderId).toBe(result.order.orderId);
    expect(savedSnapshot.grossAmount).toBe(result.order.amount);
    expect(savedSnapshot.trustFeeRateBps).toBe(1000);
    // 10% de 550 = 55.00
    expect(savedSnapshot.trustFeeAmount).toBe(55);
    expect(savedSnapshot.providerNetBeforePspFees).toBe(495);
  });

  it('taxa diferente na política produz um snapshot diferente (prova que a taxa é lida, não hard-coded)', async () => {
    const higherFeePolicy = CommercialPolicy.restore({
      id: 'policy-2',
      trustFeeRateBps: 2000,
      defaultBillingIncrementMinutes: 30,
      createdAt: new Date(),
    });
    const { useCase, offer, commercialSnapshotRepository } = scenario({
      commercialPolicy: higherFeePolicy,
    });

    await useCase.execute(SELLER, offer.id);

    const [savedSnapshot] = vi.mocked(commercialSnapshotRepository.save).mock.calls[0]!;
    expect(savedSnapshot.trustFeeRateBps).toBe(2000);
    expect(savedSnapshot.trustFeeAmount).toBe(110); // 20% de 550
  });
});
