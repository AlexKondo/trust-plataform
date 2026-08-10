import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ACTIVE_DISPUTE_STATUSES,
  DecisionType,
  DisputeCategory,
  DisputeDecision,
  DisputeStatus,
  MarketplaceDispute,
} from '../../domain/entities/marketplace-dispute';
import {
  MarketplaceReview,
  ReviewCriterion,
  ReviewScores,
} from '../../domain/entities/marketplace-review';
import {
  MarketplaceReviewRepository,
  ReviewSummary,
} from '../../domain/repositories/marketplace-review.repository';
import {
  MarketplaceDisputeDecisionRow,
  MarketplaceDisputeRow,
  MarketplaceReviewRow,
  marketplaceDisputeDecisions,
  marketplaceDisputes,
  marketplaceReviewScores,
  marketplaceReviews,
} from './marketplace-review.schema';

@Injectable()
export class DrizzleMarketplaceReviewRepository extends MarketplaceReviewRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  // ── Disputas ───────────────────────────────────────────────────────────────
  async saveDispute(dispute: MarketplaceDispute, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = dispute.toProps();
    await target
      .insert(marketplaceDisputes)
      .values(props)
      .onConflictDoUpdate({
        target: marketplaceDisputes.id,
        // Pedido, autor, categoria e descrição são imutáveis (BR-006).
        set: {
          status: props.status,
          decisionId: props.decisionId,
          updatedAt: props.updatedAt,
        },
      });
  }

  async findDisputeById(id: string): Promise<MarketplaceDispute | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, id))
      .limit(1);
    return row ? toDispute(row) : null;
  }

  async findActiveDisputeByOrder(orderId: string): Promise<MarketplaceDispute | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceDisputes)
      .where(
        and(
          eq(marketplaceDisputes.orderId, orderId),
          inArray(marketplaceDisputes.status, [...ACTIVE_DISPUTE_STATUSES]),
        ),
      )
      .limit(1);
    return row ? toDispute(row) : null;
  }

  async listDisputesByOrder(orderId: string): Promise<MarketplaceDispute[]> {
    const rows = await this.db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.orderId, orderId))
      .orderBy(desc(marketplaceDisputes.openedAt));
    return rows.map(toDispute);
  }

  async listActiveDisputes(
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceDispute[]; totalItems: number }> {
    const where = inArray(marketplaceDisputes.status, [...ACTIVE_DISPUTE_STATUSES]);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(marketplaceDisputes)
        .where(where)
        .orderBy(marketplaceDisputes.openedAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(marketplaceDisputes).where(where),
    ]);
    return { items: rows.map(toDispute), totalItems: total?.count ?? 0 };
  }

  async saveDecision(decision: DisputeDecision, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    // Append-only (BR-006): a decisão nunca é reescrita.
    await target.insert(marketplaceDisputeDecisions).values(decision.toProps());
  }

  async findDecisionByDispute(disputeId: string): Promise<DisputeDecision | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceDisputeDecisions)
      .where(eq(marketplaceDisputeDecisions.disputeId, disputeId))
      .limit(1);
    return row ? toDecision(row) : null;
  }

  // ── Avaliações ─────────────────────────────────────────────────────────────
  async saveReview(review: MarketplaceReview, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = review.toProps();
    await target.insert(marketplaceReviews).values({
      id: props.id,
      orderId: props.orderId,
      reviewerId: props.reviewerId,
      reviewedUserId: props.reviewedUserId,
      overallScore: props.overallScore,
      recommended: props.recommended,
      comment: props.comment,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });

    const criteria = Object.entries(props.scores);
    if (criteria.length > 0) {
      await target.insert(marketplaceReviewScores).values(
        criteria.map(([criterion, score]) => ({ reviewId: props.id, criterion, score })),
      );
    }
  }

  async findReviewByOrderAndReviewer(
    orderId: string,
    reviewerId: string,
  ): Promise<MarketplaceReview | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceReviews)
      .where(
        and(eq(marketplaceReviews.orderId, orderId), eq(marketplaceReviews.reviewerId, reviewerId)),
      )
      .limit(1);
    return row ? this.hydrate(row) : null;
  }

  async listReviewsByOrder(orderId: string): Promise<MarketplaceReview[]> {
    const rows = await this.db
      .select()
      .from(marketplaceReviews)
      .where(eq(marketplaceReviews.orderId, orderId))
      .orderBy(marketplaceReviews.createdAt);
    return this.hydrateAll(rows);
  }

  async listReviewsReceived(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceReview[]; totalItems: number }> {
    const where = eq(marketplaceReviews.reviewedUserId, identityId);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(marketplaceReviews)
        .where(where)
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(marketplaceReviews).where(where),
    ]);
    return { items: await this.hydrateAll(rows), totalItems: total?.count ?? 0 };
  }

  async summarizeReviewsReceived(identityId: string): Promise<ReviewSummary> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        average: sql<string | null>`avg(${marketplaceReviews.overallScore})`,
        recommended: sql<number>`count(*) filter (where ${marketplaceReviews.recommended} = true)::int`,
        answered: sql<number>`count(*) filter (where ${marketplaceReviews.recommended} is not null)::int`,
      })
      .from(marketplaceReviews)
      .where(eq(marketplaceReviews.reviewedUserId, identityId));

    const total = row?.total ?? 0;
    return {
      totalReviews: total,
      averageScore: row?.average ? Math.round(Number(row.average) * 100) / 100 : null,
      recommendationRate:
        row && row.answered > 0 ? Math.round((row.recommended / row.answered) * 100) : null,
    };
  }

  /** Carrega as notas por critério das avaliações informadas (1 query). */
  private async hydrateAll(rows: MarketplaceReviewRow[]): Promise<MarketplaceReview[]> {
    if (rows.length === 0) {
      return [];
    }
    const scoreRows = await this.db
      .select()
      .from(marketplaceReviewScores)
      .where(
        inArray(
          marketplaceReviewScores.reviewId,
          rows.map((row) => row.id),
        ),
      );
    const byReview = new Map<string, ReviewScores>();
    for (const score of scoreRows) {
      const scores = byReview.get(score.reviewId) ?? {};
      scores[score.criterion as ReviewCriterion] = score.score;
      byReview.set(score.reviewId, scores);
    }
    return rows.map((row) => toReview(row, byReview.get(row.id) ?? {}));
  }

  private async hydrate(row: MarketplaceReviewRow): Promise<MarketplaceReview> {
    const [review] = await this.hydrateAll([row]);
    return review!;
  }
}

function toDispute(row: MarketplaceDisputeRow): MarketplaceDispute {
  return MarketplaceDispute.restore({
    id: row.id,
    orderId: row.orderId,
    openedBy: row.openedBy,
    category: row.category as DisputeCategory,
    description: row.description,
    status: row.status as DisputeStatus,
    openedAt: row.openedAt,
    decisionId: row.decisionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDecision(row: MarketplaceDisputeDecisionRow): DisputeDecision {
  return DisputeDecision.restore({
    id: row.id,
    disputeId: row.disputeId,
    decidedBy: row.decidedBy,
    decisionType: row.decisionType as DecisionType,
    justification: row.justification,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
  });
}

function toReview(row: MarketplaceReviewRow, scores: ReviewScores): MarketplaceReview {
  return MarketplaceReview.restore({
    id: row.id,
    orderId: row.orderId,
    reviewerId: row.reviewerId,
    reviewedUserId: row.reviewedUserId,
    overallScore: row.overallScore,
    recommended: row.recommended,
    comment: row.comment,
    scores,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
