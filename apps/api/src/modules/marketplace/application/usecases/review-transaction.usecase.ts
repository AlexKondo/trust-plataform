import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceReview } from '../../domain/entities/marketplace-review';
import { ORDER_STATUS, OrderStatus } from '../../domain/entities/marketplace-types';
import {
  MarketplaceReviewAlreadyExistsException,
  MarketplaceReviewNotAllowedException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceReviewRepository } from '../../domain/repositories/marketplace-review.repository';
import {
  CreateReviewRequest,
  ReviewResponse,
  ReviewSummaryResponse,
} from '../dto/marketplace-review.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toReviewResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { OrderLifecycleService } from './order-lifecycle.service';

/** MRK-025 BR-003 — estados em que a transação já pode ser avaliada. */
const REVIEWABLE_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CLOSED,
  ORDER_STATUS.DISPUTE_RESOLVED,
];

/**
 * MRK-025 — avaliação da transação. É o último elo do ciclo: a nota de quem
 * contratou volta como pontos (ou penalidade) no Trust Score de quem prestou —
 * e vice-versa, porque os dois lados se avaliam.
 */
@Injectable()
export class ReviewTransactionUseCase {
  constructor(
    private readonly reviewRepository: MarketplaceReviewRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReviewTransactionUseCase.name);
  }

  async create(
    identityId: string,
    orderId: string,
    body: CreateReviewRequest,
    meta: RequestMeta = {},
  ): Promise<ReviewResponse> {
    // BR-001: só participantes avaliam
    const { order, role } = await this.lifecycle.loadForParticipant(orderId, identityId);

    if (!REVIEWABLE_STATUSES.includes(order.status)) {
      throw new MarketplaceReviewNotAllowedException(order.status);
    }
    // BR-002: uma avaliação por participante por pedido
    if (await this.reviewRepository.findReviewByOrderAndReviewer(orderId, identityId)) {
      throw new MarketplaceReviewAlreadyExistsException();
    }

    const reviewedUserId = role === 'BUYER' ? order.sellerId : order.buyerId;
    const review = MarketplaceReview.create({
      orderId,
      reviewerId: identityId,
      reviewedUserId,
      overallScore: body.overallScore,
      recommended: body.recommended,
      comment: body.comment,
      scores: body.scores,
    });

    await this.db.transaction(async (tx) => {
      await this.reviewRepository.saveReview(review, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceReview.Created',
        aggregateType: 'MarketplaceReview',
        aggregateId: review.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? review.id,
        payload: {
          reviewId: review.id,
          orderId,
          listingId: order.listingId,
          reviewerId: identityId,
          reviewedUserId,
          overallScore: review.overallScore,
          recommended: review.recommended,
          createdAt: review.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'ReviewMarketplaceTransaction',
          resource: 'MarketplaceReview',
          resourceId: review.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { orderId, reviewedUserId, overallScore: review.overallScore },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'ReviewMarketplaceTransaction',
        identityId,
        reviewId: review.id,
        orderId,
        reviewedUserId,
        overallScore: review.overallScore,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace transaction reviewed.',
    );

    return toReviewResponse(review);
  }

  /** Avaliações de um pedido (participantes veem as duas). */
  async listByOrder(identityId: string, orderId: string): Promise<ReviewResponse[]> {
    await this.lifecycle.loadForParticipant(orderId, identityId);
    const reviews = await this.reviewRepository.listReviewsByOrder(orderId);
    return reviews.map(toReviewResponse);
  }

  /** Avaliações que EU recebi + o consolidado. */
  async listReceived(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ReviewResponse>> {
    const { items, totalItems } = await this.reviewRepository.listReviewsReceived(
      identityId,
      page,
      pageSize,
    );
    return PaginatedResult.of(items.map(toReviewResponse), page, pageSize, totalItems);
  }

  async summary(identityId: string): Promise<ReviewSummaryResponse> {
    return this.reviewRepository.summarizeReviewsReceived(identityId);
  }
}
