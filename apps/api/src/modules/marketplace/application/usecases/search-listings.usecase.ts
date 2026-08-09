import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { levelsAtOrAbove } from '../../domain/services/marketplace-publication.service';
import { ListingSummaryResponse, RequestMeta, SearchListingsQuery } from '../dto/marketplace.dtos';
import { toListingSummary } from '../mapper/marketplace.mapper';

/**
 * MRK-004 — busca pública. Só anúncios PUBLISHED entram (BR-001/002); o filtro
 * `minimumTrustLevel` e a ordenação por reputação leem o Trust Layer.
 */
@Injectable()
export class SearchListingsUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly trustScoreRepository: TrustScoreRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchListingsUseCase.name);
  }

  async execute(
    query: SearchListingsQuery,
    meta: RequestMeta = {},
  ): Promise<PaginatedResult<ListingSummaryResponse>> {
    const startedAt = Date.now();

    // Categoria inexistente não é erro: devolve página vazia (é uma busca).
    const category = query.category
      ? await this.listingRepository.findCategoryByCode(query.category.toUpperCase())
      : null;
    if (query.category && !category) {
      return PaginatedResult.of([], query.page, query.size, 0);
    }

    let allowedSellerLevels: string[] | undefined;
    if (query.minimumTrustLevel) {
      const levelRules = await this.trustScoreRepository.listLevelRules();
      allowedSellerLevels = levelsAtOrAbove(
        new Map(levelRules.map((rule) => [rule.level, rule.rank])),
        query.minimumTrustLevel.toUpperCase(),
      );
      if (allowedSellerLevels.length === 0) {
        return PaginatedResult.of([], query.page, query.size, 0);
      }
    }

    const { items, totalItems } = await this.listingRepository.search({
      text: query.q,
      categoryId: category?.id,
      listingType: query.listingType,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      currency: query.currency,
      location: query.location,
      allowedSellerLevels,
      sort: query.sort,
      page: query.page,
      pageSize: query.size,
    });

    this.logger.info(
      {
        operation: 'SearchMarketplaceListings',
        criteria: {
          q: query.q,
          category: query.category,
          listingType: query.listingType,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          currency: query.currency,
          location: query.location,
          minimumTrustLevel: query.minimumTrustLevel,
          sort: query.sort,
        },
        resultCount: items.length,
        totalItems,
        durationMs: Date.now() - startedAt,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace search executed.',
    );

    return PaginatedResult.of(items.map(toListingSummary), query.page, query.size, totalItems);
  }
}
