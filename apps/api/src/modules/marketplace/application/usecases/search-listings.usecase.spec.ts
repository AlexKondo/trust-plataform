import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { SearchListingsQuery } from '../dto/marketplace.dtos';
import { SearchListingsUseCase } from './search-listings.usecase';

const logger = () => ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function searchRow(id: string) {
  return {
    id,
    title: 'Instalação elétrica residencial',
    description: 'Atendo emergências.',
    listingType: 'SERVICE',
    categoryCode: 'ELECTRICAL',
    categoryName: 'Elétrica',
    price: 200,
    currency: 'BRL',
    location: 'São Paulo/SP',
    publishedAt: new Date(),
    viewCount: 1,
    imageUrl: null,
    ownerId: 'owner-1',
    sellerScore: 40,
    sellerLevel: 'SILVER',
  };
}

function baseQuery(overrides: Partial<SearchListingsQuery> = {}): SearchListingsQuery {
  return {
    sort: 'relevance',
    page: 1,
    size: 20,
    ...overrides,
  };
}

function makeScenario(options: {
  category?: { id: string; code: string } | null;
  levelRules?: Array<{ level: string; rank: number }>;
  searchResult?: { items: ReturnType<typeof searchRow>[]; totalItems: number };
}) {
  const listingRepository = {
    findCategoryByCode: vi.fn().mockResolvedValue(options.category === undefined ? null : options.category),
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
    trustScoreRepository,
    useCase: new SearchListingsUseCase(listingRepository, trustScoreRepository, logger()),
  };
}

describe('SearchListingsUseCase (MRK-004 / IP-015)', () => {
  it('repassa availableDayOfWeek ao repositório sem transformação (filtro do IP-015)', async () => {
    const { useCase, listingRepository } = makeScenario({});
    await useCase.execute(baseQuery({ availableDayOfWeek: 2 }));
    expect(listingRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ availableDayOfWeek: 2 }),
    );
  });

  it('availableDayOfWeek ausente vira undefined — nenhuma restrição de disponibilidade é aplicada', async () => {
    const { useCase, listingRepository } = makeScenario({});
    await useCase.execute(baseQuery());
    expect(listingRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ availableDayOfWeek: undefined }),
    );
  });

  it('categoria inexistente devolve página vazia sem consultar o repositório de anúncios', async () => {
    const { useCase, listingRepository } = makeScenario({ category: null });
    const result = await useCase.execute(baseQuery({ category: 'INEXISTENTE' }));
    expect(result.pagination.totalItems).toBe(0);
    expect(listingRepository.search).not.toHaveBeenCalled();
  });

  it('minimumTrustLevel desconhecido devolve página vazia sem consultar o repositório de anúncios', async () => {
    const { useCase, listingRepository } = makeScenario({ levelRules: [{ level: 'BRONZE', rank: 1 }] });
    const result = await useCase.execute(baseQuery({ minimumTrustLevel: 'PLATINUM' }));
    expect(result.pagination.totalItems).toBe(0);
    expect(listingRepository.search).not.toHaveBeenCalled();
  });

  it('repassa sort ao repositório sem reinterpretar — nenhum ranking é decidido no caso de uso', async () => {
    const { useCase, listingRepository } = makeScenario({});
    await useCase.execute(baseQuery({ sort: 'trust_score' }));
    expect(listingRepository.search).toHaveBeenCalledWith(expect.objectContaining({ sort: 'trust_score' }));
  });
});
