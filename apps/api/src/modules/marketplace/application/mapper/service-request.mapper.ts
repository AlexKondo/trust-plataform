import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import { PRICING_MODEL } from '../../domain/entities/marketplace-types';
import { ServiceRequest } from '../../domain/entities/service-request';
import { MarketplaceCategory, ListingSearchRow } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceRequestEngagementRecord } from '../../domain/repositories/service-request.repository';
import {
  OfferComparisonTerms,
  ServiceRequestEngagementResponse,
  ServiceRequestMatchResponse,
  ServiceRequestOfferComparisonItem,
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

// ── Competitive Quotes & Comparison Map (IP-004) ────────────────────────────

/**
 * `amount` é sempre o valor literal do `MarketplaceOffer` (nunca recalculado
 * por esta IP). Para HOURLY, `amount` já É o mínimo contratado derivado
 * (`calculateInitialHourlyAmount`, PACK-02) — `estimatedTotalBasis` só rotula
 * explicitamente o que esse número significa, para a UI nunca apresentar um
 * valor HOURLY como se fosse um total fechado equivalente a um FIXED_PRICE.
 */
export function toOfferComparisonTerms(offer: MarketplaceOffer, roundCount: number, now: Date): OfferComparisonTerms {
  return {
    offerId: offer.id,
    status: offer.effectiveStatus(now),
    createdBy: offer.createdBy,
    pricingModel: offer.pricingModel,
    currency: offer.currency,
    quantity: offer.quantity,
    amount: offer.amount,
    estimatedTotalBasis:
      offer.pricingModel === PRICING_MODEL.HOURLY ? 'HOURLY_MINIMUM_COMMITMENT' : 'FIXED_TOTAL',
    hourlyRateAmount: offer.hourlyRateAmount,
    minimumMinutes: offer.minimumMinutes,
    billingIncrementMinutes: offer.billingIncrementMinutes,
    notes: offer.notes,
    expiresAt: offer.expiresAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    roundCount,
  };
}

export function toOfferComparisonItem(
  engagement: ServiceRequestEngagementRecord,
  listing: MarketplaceListing | null,
  conversationStatus: string | null,
  offers: MarketplaceOffer[],
  trustScore: { score: number; level: string } | null,
  now: Date,
): ServiceRequestOfferComparisonItem {
  // A cadeia (`findByConversation`, mais antiga -> mais nova) tem, no máximo,
  // uma proposta "viva" por vez (MRK-009 §6.3 `assertNoLiveOffer`): cada
  // `counter()` fecha o pai como COUNTERED e nasce no fim da lista (MRK-012
  // BR-004). O último item é sempre a rodada atual da negociação.
  const current = offers.length > 0 ? offers[offers.length - 1] : null;
  return {
    engagementId: engagement.id,
    listingId: engagement.listingId,
    listingTitle: listing?.title ?? null,
    partner: {
      identityId: engagement.partnerId,
      trustScore: trustScore?.score ?? null,
      trustLevel: trustScore?.level ?? null,
    },
    conversationId: engagement.conversationId,
    conversationStatus,
    engagedAt: engagement.engagedAt.toISOString(),
    hasOffer: current !== null,
    offer: current ? toOfferComparisonTerms(current, offers.length, now) : null,
  };
}
