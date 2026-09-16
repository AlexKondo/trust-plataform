import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { TrustScoreRepository } from '../../../trust-score/infrastructure/persistence/drizzle-trust-score.repository';
import { LISTING_TYPE, SEARCH_SORT } from '../../domain/entities/marketplace-types';
import { ServiceRequestNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { levelsAtOrAbove } from '../../domain/services/marketplace-publication.service';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestRepository } from '../../domain/repositories/service-request.repository';
import { ServiceRequestMatchResponse } from '../dto/service-request.dtos';
import { toServiceRequestMatch } from '../mapper/service-request.mapper';

/**
 * IP-003 — fundação de matching determinístico, sem IA. "Eligible Partner"
 * aqui é "Partner com anúncio SERVICE PUBLISHED que bate categoria + texto de
 * localização + nível mínimo do pedido" — reaproveita `MarketplaceListingRepository.search()`
 * e `levelsAtOrAbove` EXATAMENTE como `SearchListingsUseCase` (MRK-004) já faz;
 * nenhuma consulta/índice novo foi criado para isto. Ordenado por reputação
 * (`trust_score`, igual ao `sort=trust_score` do MRK-004) — determinístico e
 * explicável, sem ranking por IA/embedding.
 *
 * Geolocalização real (raio geométrico) NÃO é calculada aqui: nenhum dado de
 * coordenada de Partner existe no repositório hoje (a busca do MRK-004 já é
 * só texto livre — IP-000 §14, linha IP-015) e criar geocoding de Partner só
 * para este filtro seria infraestrutura nova fora do escopo desta IP; fica
 * para o IP-005 (ver §11 do Completion Report).
 */
@Injectable()
export class DiscoverServiceRequestMatchesUseCase {
  constructor(
    private readonly serviceRequestRepository: ServiceRequestRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly trustScoreRepository: TrustScoreRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DiscoverServiceRequestMatchesUseCase.name);
  }

  async execute(
    memberId: string,
    serviceRequestId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ServiceRequestMatchResponse>> {
    const request = await this.serviceRequestRepository.findById(serviceRequestId);
    if (!request || !request.isOwnedBy(memberId)) {
      throw new ServiceRequestNotFoundException();
    }

    let allowedSellerLevels: string[] | undefined;
    if (request.minimumTrustLevel) {
      const levelRules = await this.trustScoreRepository.listLevelRules();
      allowedSellerLevels = levelsAtOrAbove(
        new Map(levelRules.map((rule) => [rule.level, rule.rank])),
        request.minimumTrustLevel.toUpperCase(),
      );
      if (allowedSellerLevels.length === 0) {
        return PaginatedResult.of([], page, pageSize, 0);
      }
    }

    const [{ items, totalItems }, engagements] = await Promise.all([
      this.listingRepository.search({
        categoryId: request.categoryId,
        listingType: LISTING_TYPE.SERVICE,
        location: request.locationLabel,
        allowedSellerLevels,
        sort: SEARCH_SORT.TRUST_SCORE,
        page,
        pageSize,
      }),
      this.serviceRequestRepository.listEngagements(serviceRequestId),
    ]);
    const engagedListingIds = new Set(engagements.map((engagement) => engagement.listingId));

    this.logger.info(
      {
        operation: 'DiscoverServiceRequestMatches',
        identityId: memberId,
        serviceRequestId,
        categoryId: request.categoryId,
        resultCount: items.length,
        totalItems,
        result: 'SUCCESS',
      },
      'Service request matches discovered.',
    );

    return PaginatedResult.of(
      items.map((row) => toServiceRequestMatch(row, engagedListingIds.has(row.id))),
      page,
      pageSize,
      totalItems,
    );
  }
}
