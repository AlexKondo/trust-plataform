import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { ReviewType } from '../../domain/entities/verification-types';
import { VerificationNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { VerificationRepository } from '../../domain/repositories/verification.repository';
import { RequestMeta } from '../dto/verification.dtos';

const VRF_PRODUCER = 'verification-service';

/** VRF-003 — inicia a revisão (admin): PENDING_REVIEW → IN_REVIEW. */
@Injectable()
export class ReviewVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReviewVerificationUseCase.name);
  }

  async execute(
    reviewerIdentityId: string,
    verificationId: string,
    reviewType: ReviewType,
    meta: RequestMeta = {},
  ): Promise<{ reviewId: string; status: string }> {
    const verification = await this.repository.findById(verificationId);
    if (!verification) {
      throw new VerificationNotFoundException();
    }

    const startedAt = new Date();
    verification.startReview(startedAt);

    const review = {
      id: uuidv7(),
      verificationId: verification.id,
      reviewType,
      status: 'ACTIVE' as const,
      reviewerIdentityId,
      startedAt,
      completedAt: null,
    };

    await this.db.transaction(async (tx) => {
      await this.repository.addReview(review, tx);
      await this.repository.save(verification, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'Verification.ReviewStarted',
        producer: VRF_PRODUCER,
        correlationId: meta.correlationId ?? verification.id,
        payload: {
          verificationId: verification.id,
          reviewId: review.id,
          reviewType,
          startedAt: startedAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: reviewerIdentityId,
          operation: 'ReviewVerification',
          resource: 'Verification',
          resourceId: verification.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { reviewType },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'ReviewVerification',
        verificationId: verification.id,
        reviewId: review.id,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Verification review started.',
    );

    return { reviewId: review.id, status: verification.status };
  }
}
