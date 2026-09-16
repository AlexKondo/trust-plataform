import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceConversation } from '../../domain/entities/marketplace-conversation';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import { LISTING_TYPE, PRICING_MODEL, URGENCY_LEVEL } from '../../domain/entities/marketplace-types';
import { ServiceRequest } from '../../domain/entities/service-request';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { CompareServiceRequestOffersUseCase } from './compare-service-request-offers.usecase';

const MEMBER = '019fe900-0000-7000-8000-000000000001';
const CATEGORY = '019fe900-0000-7000-8000-0000000000c1';
const PARTNER_A = '019fe900-0000-7000-8000-0000000000a1';
const PARTNER_B = '019fe900-0000-7000-8000-0000000000a2';

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

function openRequest(): ServiceRequest {
  return ServiceRequest.create({
    memberId: MEMBER,
    categoryId: CATEGORY,
    title: 'Preciso reformar o banheiro',
    description: 'Troca de piso, box e instalação hidráulica completa.',
    locationLabel: 'Pinheiros, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
  });
}

function publishedListing(ownerId: string, title: string): MarketplaceListing {
  const listing = MarketplaceListing.createDraft({
    ownerId,
    title,
    description: 'Anúncio de serviço.',
    listingType: LISTING_TYPE.SERVICE,
    categoryId: CATEGORY,
    price: 100,
    currency: 'BRL',
  });
  listing.publish();
  return listing;
}

function fixedOffer(conversationId: string, listingId: string, sellerId: string, amount: number): MarketplaceOffer {
  return MarketplaceOffer.create({
    conversationId,
    listingId,
    buyerId: MEMBER,
    sellerId,
    createdBy: MEMBER,
    terms: {
      amount,
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(5),
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      hourlyRateAmount: null,
      minimumMinutes: null,
      billingIncrementMinutes: null,
    },
  });
}

function hourlyOffer(conversationId: string, listingId: string, sellerId: string): MarketplaceOffer {
  return MarketplaceOffer.create({
    conversationId,
    listingId,
    buyerId: MEMBER,
    sellerId,
    createdBy: MEMBER,
    terms: {
      amount: 150, // 150.00/h * 60min = 150.00 — derivado, ver hourly-pricing.service.ts
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(5),
      pricingModel: PRICING_MODEL.HOURLY,
      hourlyRateAmount: 150,
      minimumMinutes: 60,
      billingIncrementMinutes: 30,
    },
  });
}

interface Scenario {
  request?: ServiceRequest | null;
  engagements?: Array<{
    id: string;
    serviceRequestId: string;
    listingId: string;
    partnerId: string;
    conversationId: string;
    engagedBy: string;
    engagedAt: Date;
  }>;
  listings?: Map<string, MarketplaceListing | null>;
  conversations?: Map<string, MarketplaceConversation | null>;
  offersByConversation?: Map<string, MarketplaceOffer[]>;
  scores?: Map<string, { score: number; level: string; identityId: string } | null>;
}

function makeScenario(options: Scenario) {
  const serviceRequestRepository = {
    findById: vi.fn().mockResolvedValue(options.request === undefined ? openRequest() : options.request),
    listEngagements: vi.fn().mockResolvedValue(options.engagements ?? []),
  } as unknown as ServiceRequestRepository;

  const listingRepository = {
    findById: vi.fn((id: string) => Promise.resolve(options.listings?.get(id) ?? null)),
  } as unknown as MarketplaceListingRepository;

  const conversationRepository = {
    findById: vi.fn((id: string) => Promise.resolve(options.conversations?.get(id) ?? null)),
  } as unknown as MarketplaceConversationRepository;

  const offerRepository = {
    findByConversation: vi.fn((id: string) => Promise.resolve(options.offersByConversation?.get(id) ?? [])),
  } as unknown as MarketplaceOfferRepository;

  const trustScoreRepository = {
    findScoreByIdentityId: vi.fn((identityId: string) => Promise.resolve(options.scores?.get(identityId) ?? null)),
  } as unknown as TrustScoreRepository;

  return {
    listingRepository,
    conversationRepository,
    offerRepository,
    trustScoreRepository,
    useCase: new CompareServiceRequestOffersUseCase(
      serviceRequestRepository,
      listingRepository,
      conversationRepository,
      offerRepository,
      trustScoreRepository,
      logger(),
    ),
  };
}

describe('CompareServiceRequestOffersUseCase (IP-004)', () => {
  it('pedido inexistente ou de outro Member → 404', async () => {
    const { useCase } = makeScenario({ request: null });
    await expect(useCase.execute(MEMBER, 'sr-1')).rejects.toThrow(ServiceRequestNotFoundException);
  });

  it('sem engajamentos, devolve lista vazia (não é erro)', async () => {
    const { useCase } = makeScenario({ engagements: [] });
    const result = await useCase.execute(MEMBER, 'sr-1');
    expect(result.items).toEqual([]);
  });

  it('engajamento sem proposta ainda aparece com hasOffer=false (Partner contatado, sem quote)', async () => {
    const listingA = publishedListing(PARTNER_A, 'Reforma total');
    const conversation = MarketplaceConversation.open({
      listingId: listingA.id,
      sellerId: PARTNER_A,
      buyerId: MEMBER,
    });
    const { useCase } = makeScenario({
      engagements: [
        {
          id: 'eng-1',
          serviceRequestId: 'sr-1',
          listingId: listingA.id,
          partnerId: PARTNER_A,
          conversationId: conversation.id,
          engagedBy: MEMBER,
          engagedAt: new Date(),
        },
      ],
      listings: new Map([[listingA.id, listingA]]),
      conversations: new Map([[conversation.id, conversation]]),
      offersByConversation: new Map([[conversation.id, []]]),
    });

    const result = await useCase.execute(MEMBER, 'sr-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.hasOffer).toBe(false);
    expect(result.items[0]!.offer).toBeNull();
    expect(result.items[0]!.listingTitle).toBe('Reforma total');
  });

  it('normaliza FIXED_PRICE e HOURLY lado a lado sem converter um no outro', async () => {
    const listingA = publishedListing(PARTNER_A, 'Reforma total (fechado)');
    const listingB = publishedListing(PARTNER_B, 'Reforma total (por hora)');
    const conversationA = MarketplaceConversation.open({
      listingId: listingA.id,
      sellerId: PARTNER_A,
      buyerId: MEMBER,
    });
    const conversationB = MarketplaceConversation.open({
      listingId: listingB.id,
      sellerId: PARTNER_B,
      buyerId: MEMBER,
    });
    const offerA = fixedOffer(conversationA.id, listingA.id, PARTNER_A, 2000);
    const offerB = hourlyOffer(conversationB.id, listingB.id, PARTNER_B);

    const { useCase } = makeScenario({
      engagements: [
        {
          id: 'eng-a',
          serviceRequestId: 'sr-1',
          listingId: listingA.id,
          partnerId: PARTNER_A,
          conversationId: conversationA.id,
          engagedBy: MEMBER,
          engagedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'eng-b',
          serviceRequestId: 'sr-1',
          listingId: listingB.id,
          partnerId: PARTNER_B,
          conversationId: conversationB.id,
          engagedBy: MEMBER,
          engagedAt: new Date('2026-01-01T11:00:00Z'),
        },
      ],
      listings: new Map([
        [listingA.id, listingA],
        [listingB.id, listingB],
      ]),
      conversations: new Map([
        [conversationA.id, conversationA],
        [conversationB.id, conversationB],
      ]),
      offersByConversation: new Map([
        [conversationA.id, [offerA]],
        [conversationB.id, [offerB]],
      ]),
      scores: new Map([
        [PARTNER_A, { score: 720, level: 'GOLD', identityId: PARTNER_A }],
        [PARTNER_B, { score: 300, level: 'BRONZE', identityId: PARTNER_B }],
      ]),
    });

    const result = await useCase.execute(MEMBER, 'sr-1');

    expect(result.items).toHaveLength(2);
    const [itemA, itemB] = result.items;

    expect(itemA!.offer).toMatchObject({
      pricingModel: 'FIXED_PRICE',
      amount: 2000,
      estimatedTotalBasis: 'FIXED_TOTAL',
      hourlyRateAmount: null,
    });
    expect(itemA!.partner).toEqual({ identityId: PARTNER_A, trustScore: 720, trustLevel: 'GOLD' });

    expect(itemB!.offer).toMatchObject({
      pricingModel: 'HOURLY',
      amount: 150, // mínimo contratado — NUNCA um total "equivalente" inventado
      estimatedTotalBasis: 'HOURLY_MINIMUM_COMMITMENT',
      hourlyRateAmount: 150,
      minimumMinutes: 60,
      billingIncrementMinutes: 30,
    });
    expect(itemB!.partner).toEqual({ identityId: PARTNER_B, trustScore: 300, trustLevel: 'BRONZE' });

    // Sem ranking oculto: ordem é por engagedAt (ordem de contato), não por preço/score.
    expect(result.items.map((item) => item.engagementId)).toEqual(['eng-a', 'eng-b']);
  });

  it('usa a rodada mais recente da cadeia (contraproposta) como oferta viva, e conta as rodadas', async () => {
    const listing = publishedListing(PARTNER_A, 'Reforma total');
    const conversation = MarketplaceConversation.open({
      listingId: listing.id,
      sellerId: PARTNER_A,
      buyerId: MEMBER,
    });
    const initial = fixedOffer(conversation.id, listing.id, PARTNER_A, 2000);
    const counter = initial.counter(PARTNER_A, {
      amount: 2200,
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(5),
    });

    const { useCase } = makeScenario({
      engagements: [
        {
          id: 'eng-1',
          serviceRequestId: 'sr-1',
          listingId: listing.id,
          partnerId: PARTNER_A,
          conversationId: conversation.id,
          engagedBy: MEMBER,
          engagedAt: new Date(),
        },
      ],
      listings: new Map([[listing.id, listing]]),
      conversations: new Map([[conversation.id, conversation]]),
      offersByConversation: new Map([[conversation.id, [initial, counter]]]),
    });

    const result = await useCase.execute(MEMBER, 'sr-1');

    expect(result.items[0]!.offer).toMatchObject({ offerId: counter.id, amount: 2200, roundCount: 2 });
  });
});
