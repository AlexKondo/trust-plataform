import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { RejectionReason } from '../../domain/entities/verification-types';
import { VerificationNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { VerificationRepository } from '../../domain/repositories/verification.repository';
import { RequestMeta } from '../dto/verification.dtos';

const VRF_PRODUCER = 'verification-service';

interface DecideInput {
  decision: 'APPROVED' | 'REJECTED';
  reasonCode?: RejectionReason;
  comments?: string;
}

/**
 * Núcleo compartilhado de decisão (VRF-004/005): encerra a revisão ativa,
 * grava a decisão irreversível e publica os eventos. Exposto pelos use cases
 * ApproveVerificationUseCase e RejectVerificationUseCase.
 */
@Injectable()
export class DecideVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DecideVerificationUseCase.name);
  }

  async execute(
    deciderIdentityId: string,
    verificationId: string,
    input: DecideInput,
    meta: RequestMeta = {},
  ): Promise<{ verificationId: string; status: string }> {
    const verification = await this.repository.findById(verificationId);
    if (!verification) {
      throw new VerificationNotFoundException();
    }

    const decidedAt = new Date();
    if (input.decision === 'APPROVED') {
      verification.approve(decidedAt);
    } else {
      verification.reject(decidedAt);
    }

    const activeReview = await this.repository.findActiveReview(verification.id);

    await this.db.transaction(async (tx) => {
      if (activeReview) {
        await this.repository.completeReview(activeReview.id, decidedAt, tx);
      }
      await this.repository.addDecision(
        {
          id: uuidv7(),
          verificationId: verification.id,
          reviewId: activeReview?.id ?? uuidv7(),
          decision: input.decision,
          decisionSource: activeReview?.reviewType ?? 'MANUAL',
          reasonCode: input.reasonCode ?? null,
          comments: input.comments ?? null,
          decidedBy: deciderIdentityId,
          decidedAt,
        },
        tx,
      );
      await this.repository.save(verification, tx);

      const eventName =
        input.decision === 'APPROVED' ? 'Verification.Approved' : 'Verification.Rejected';
      const decisionEvent = await this.outboxService.enqueue(tx, {
        eventName,
        producer: VRF_PRODUCER,
        correlationId: meta.correlationId ?? verification.id,
        payload: {
          verificationId: verification.id,
          trustPassportId: verification.trustPassportId,
          // Titular no payload: quem consome (notificações) não deveria
          // precisar resolver o Passport para saber a quem avisar.
          identityId: verification.identityId,
          type: verification.type,
          ...(input.decision === 'REJECTED' ? { reasonCode: input.reasonCode } : {}),
          [input.decision === 'APPROVED' ? 'approvedAt' : 'rejectedAt']: decidedAt.toISOString(),
        },
      });
      await this.outboxService.enqueue(tx, {
        eventName: 'Verification.ReviewCompleted',
        producer: VRF_PRODUCER,
        correlationId: meta.correlationId ?? verification.id,
        causationId: decisionEvent.eventId,
        payload: {
          verificationId: verification.id,
          reviewId: activeReview?.id ?? null,
          decision: input.decision,
          completedAt: decidedAt.toISOString(),
        },
      });

      await this.auditLogService.record(
        {
          identityId: deciderIdentityId,
          operation: input.decision === 'APPROVED' ? 'ApproveVerification' : 'RejectVerification',
          resource: 'Verification',
          resourceId: verification.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { decision: input.decision, reasonCode: input.reasonCode },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'DecideVerification',
        verificationId: verification.id,
        decision: input.decision,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Verification decided.',
    );

    return { verificationId: verification.id, status: verification.status };
  }
}

/** VRF-004 — aprovar (IN_REVIEW → APPROVED). */
@Injectable()
export class ApproveVerificationUseCase {
  constructor(private readonly decide: DecideVerificationUseCase) {}

  execute(
    deciderIdentityId: string,
    verificationId: string,
    comments: string | undefined,
    meta: RequestMeta = {},
  ): Promise<{ verificationId: string; status: string }> {
    return this.decide.execute(
      deciderIdentityId,
      verificationId,
      { decision: 'APPROVED', comments },
      meta,
    );
  }
}

/** VRF-005 — rejeitar (IN_REVIEW → REJECTED; motivo obrigatório BR-002). */
@Injectable()
export class RejectVerificationUseCase {
  constructor(private readonly decide: DecideVerificationUseCase) {}

  execute(
    deciderIdentityId: string,
    verificationId: string,
    input: { reasonCode: RejectionReason; comments?: string },
    meta: RequestMeta = {},
  ): Promise<{ verificationId: string; status: string }> {
    return this.decide.execute(
      deciderIdentityId,
      verificationId,
      { decision: 'REJECTED', reasonCode: input.reasonCode, comments: input.comments },
      meta,
    );
  }
}
