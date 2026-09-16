import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { URGENCY_LEVEL } from '../../domain/entities/marketplace-types';
import { ServiceRequest } from '../../domain/entities/service-request';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { DiscoverServiceRequestMatchesUseCase } from './discover-service-request-matches.usecase';

const MEMBER = '019fe41e-0000-7000-8000-000000000001';
const CATEGORY = '019fe41e-0000-7000-8000-0000000000c1';

function openRequest(minimumTrustLevel: string | null = null): ServiceRequest {
  return ServiceRequest.create({
    memberId: MEMBER,
    categoryId: CATEGORY,
    title: 'Preciso de um eletricista',
    description: 'Chuveiro parou de esquentar e um disjuntor desarma sozinho.',
    locationLabel: 'Vila Mariana, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
    minimumTrustLevel,
  });
}

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function searchRow(id: string) {
  return {
    id,
    title: 'Eletricista residencial',
    description: 'Atendo emergências elétricas.',
    listingType: 'SERVICE',
    categoryCode: 'ELECTRICAL',
    categoryName: 'Elétrica',
    price: 150,
    currency: 'BRL',
    location: 'São Paulo/SP',
    publishedAt: new Date(),
    viewCount: 3,
    imageUrl: null,
    ownerId: 'partner-1',
    sellerScore: 40,
    sellerLevel: 'SILVER',
  };
}

function makeScenario(options: {
  request?: ServiceRequest | null;
  searchResult?: { items: ReturnType<typeof searchRow>[]; totalItems: number };
  levelRules?: Array<{ level: string; rank: number }>;
  engagements?: Array<{ listingId: string }>;
}) {
  const serviceRequestRepository = {
    findById: vi.fn().mockResolvedValue(options.request === undefined ? openRequest() : options.request),
    listEngagements: vi.fn().mockResolvedValue(options.engagements ?? []),
  } as unknown as ServiceRequestRepository;
  const listingRepository = {
    search: vi
      .fn()
      .mockResolvedValue(options.searchResult ?? { items: [searchRow('listing-1')], totalItems: 1 }),
  } as unknown as MarketplaceListingRepository;
  const trustScoreRepository = {
    listLevelRules: vi
      .fn()
      .mockResolvedValue(
        options.levelRules ?? [
          { level: 'BRONZE', rank: 1 },
          { level: 'SILVER', rank: 2 },
          { level: 'GOLD', rank: 3 },
        ],
      ),
  } as unknown as TrustScoreRepository;

  return {
    listingRepository,
    useCase: new DiscoverServiceRequestMatchesUseCase(
      serviceRequestRepository,
      listingRepository,
      trustScoreRepository,
      logger(),
    ),
  };
}

describe('DiscoverServiceRequestMatchesUseCase (IP-003)', () => {
  it('reaproveita MarketplaceListingRepository.search() com categoria/localização do pedido', async () => {
    const { useCase, listingRepository } = makeScenario({});

    const result = await useCase.execute(MEMBER, 'sr-1', 1, 20);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.alreadyEngaged).toBe(false);
    expect(listingRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: CATEGORY,
        listingType: 'SERVICE',
        location: 'Vila Mariana, São Paulo/SP',
        sort: 'trust_score',
      }),
    );
  });

  it('marca alreadyEngaged para anúncios já engajados', async () => {
    const { useCase } = makeScenario({ engagements: [{ listingId: 'listing-1' }] });
    const result = await useCase.execute(MEMBER, 'sr-1', 1, 20);
    expect(result.items[0]!.alreadyEngaged).toBe(true);
  });

  it('minimumTrustLevel desconhecido devolve página vazia sem consultar o repositório de anúncios', async () => {
    const { useCase, listingRepository } = makeScenario({
      request: openRequest('PLATINUM'),
      levelRules: [{ level: 'BRONZE', rank: 1 }],
    });
    const result = await useCase.execute(MEMBER, 'sr-1', 1, 20);
    expect(result.pagination.totalItems).toBe(0);
    expect(listingRepository.search).not.toHaveBeenCalled();
  });

  it('pedido inexistente ou de outro Member → 404', async () => {
    const { useCase } = makeScenario({ request: null });
    await expect(useCase.execute(MEMBER, 'sr-1', 1, 20)).rejects.toThrow(ServiceRequestNotFoundException);
  });
});
