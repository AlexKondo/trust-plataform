import { ServiceRequest } from '../../domain/entities/service-request';
import { MarketplaceCategory, ListingSearchRow } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestEngagementRecord } from '../../domain/repositories/service-request.repository';
import {
  ServiceRequestEngagementResponse,
  ServiceRequestMatchResponse,
  ServiceRequestResponse,
  ServiceRequestSummaryResponse,
} from '../dto/service-request.dtos';
import { excerptOf } from './marketplace.mapper';

export function toServiceRequestResponse(
  request: ServiceRequest,
  category: MarketplaceCategory | null,
  now = new Date(),
): ServiceRequestResponse {
  return {
    serviceRequestId: request.id,
    memberId: request.memberId,
    title: request.title,
    description: request.description,
    category: category?.code ?? null,
    categoryName: category?.name ?? null,
    locationLabel: request.locationLabel,
    radiusKm: request.radiusKm,
    urgency: request.urgency,
    preferredDate: request.preferredDate?.toISOString() ?? null,
    budgetMinAmount: request.budgetMinAmount,
    budgetMaxAmount: request.budgetMaxAmount,
    currency: request.currency,
    minimumTrustLevel: request.minimumTrustLevel,
    status: request.effectiveStatus(now),
    expiresAt: request.expiresAt.toISOString(),
    matchedAt: request.matchedAt?.toISOString() ?? null,
    closedAt: request.closedAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    cancellationReason: request.cancellationReason,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function toServiceRequestSummary(
  request: ServiceRequest,
  category: MarketplaceCategory | null,
  now = new Date(),
): ServiceRequestSummaryResponse {
  return {
    serviceRequestId: request.id,
    title: request.title,
    category: category?.code ?? null,
    locationLabel: request.locationLabel,
    urgency: request.urgency,
    status: request.effectiveStatus(now),
    createdAt: request.createdAt.toISOString(),
  };
}

/**
 * IP-003 — "eligible Partner" reaproveita o shape de resultado de busca do
 * MRK-004 (ListingSearchRow), acrescentando só `alreadyEngaged` (para a UI
 * não deixar o Member reabrir contato sem perceber que já engajou este
 * Partner) e trocando `seller` por `partner` (vocabulário do IP-003).
 */
export function toServiceRequestMatch(
  row: ListingSearchRow,
  alreadyEngaged: boolean,
): ServiceRequestMatchResponse {
  return {
    listingId: row.id,
    title: row.title,
    excerpt: excerptOf(row.description),
    category: row.categoryCode,
    categoryName: row.categoryName,
    price: row.price,
    currency: row.currency,
    location: row.location,
    imageUrl: row.imageUrl,
    partner: { identityId: row.ownerId, trustScore: row.sellerScore, trustLevel: row.sellerLevel },
    alreadyEngaged,
  };
}

export function toEngagementResponse(
  record: ServiceRequestEngagementRecord,
): ServiceRequestEngagementResponse {
  return {
    serviceRequestId: record.serviceRequestId,
    listingId: record.listingId,
    partnerId: record.partnerId,
    conversationId: record.conversationId,
    engagedAt: record.engagedAt.toISOString(),
  };
}
