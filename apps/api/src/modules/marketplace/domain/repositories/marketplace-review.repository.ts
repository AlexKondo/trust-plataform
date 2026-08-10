import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { DisputeDecision, MarketplaceDispute } from '../entities/marketplace-dispute';
import { MarketplaceReview } from '../entities/marketplace-review';

/** Resumo das avaliações recebidas — insumo do perfil público de reputação. */
export interface ReviewSummary {
  totalReviews: number;
  averageScore: number | null;
  recommendationRate: number | null;
}

export abstract class MarketplaceReviewRepository {
  // ── Disputas (MRK-023/024) ─────────────────────────────────────────────────
  abstract saveDispute(dispute: MarketplaceDispute, executor?: DatabaseExecutor): Promise<void>;
  abstract findDisputeById(id: string): Promise<MarketplaceDispute | null>;
  abstract findActiveDisputeByOrder(orderId: string): Promise<MarketplaceDispute | null>;
  abstract listDisputesByOrder(orderId: string): Promise<MarketplaceDispute[]>;
  abstract listActiveDisputes(
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceDispute[]; totalItems: number }>;

  abstract saveDecision(decision: DisputeDecision, executor?: DatabaseExecutor): Promise<void>;
  abstract findDecisionByDispute(disputeId: string): Promise<DisputeDecision | null>;

  // ── Avaliações (MRK-025) ───────────────────────────────────────────────────
  abstract saveReview(review: MarketplaceReview, executor?: DatabaseExecutor): Promise<void>;
  abstract findReviewByOrderAndReviewer(
    orderId: string,
    reviewerId: string,
  ): Promise<MarketplaceReview | null>;
  abstract listReviewsByOrder(orderId: string): Promise<MarketplaceReview[]>;
  abstract listReviewsReceived(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceReview[]; totalItems: number }>;
  abstract summarizeReviewsReceived(identityId: string): Promise<ReviewSummary>;
}
