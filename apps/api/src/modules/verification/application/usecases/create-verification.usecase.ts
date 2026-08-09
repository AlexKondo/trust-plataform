import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassportNotFoundException } from '../../../trust-passport/domain/exceptions/trust-passport.exceptions';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { Verification } from '../../domain/entities/verification';
import {
  VERIFICATION_TYPES,
  VerificationType,
} from '../../domain/entities/verification-types';
import {
  ActiveVerificationExistsException,
  UnsupportedVerificationTypeException,
} from '../../domain/exceptions/verification.exceptions';
import { VerificationRepository } from '../../domain/repositories/verification.repository';
import { RequestMeta } from '../dto/verification.dtos';

const VRF_PRODUCER = 'verification-service';

/** VRF-001 — inicia uma verificação para o Passport do usuário autenticado. */
@Injectable()
export class CreateVerificationUseCase {
  constructor(
    private readonly verificationRepository: VerificationRepository,
    private readonly trustPassportRepository: TrustPassportRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateVerificationUseCase.name);
  }

  async execute(
    identityId: string,
    type: string,
    meta: RequestMeta = {},
  ): Promise<{ verificationId: string; type: string; status: string }> {
    if (!VERIFICATION_TYPES.includes(type as VerificationType)) {
      throw new UnsupportedVerificationTypeException(type);
    }
    const verificationType = type as VerificationType;

    const passport = await this.trustPassportRepository.findByIdentityId(identityId);
    if (!passport || passport.status !== 'ACTIVE') {
      throw new TrustPassportNotFoundException();
    }

    if (
      await this.verificationRepository.hasActiveByPassportAndType(passport.id, verificationType)
    ) {
      throw new ActiveVerificationExistsException();
    }

    const attempt =
      (await this.verificationRepository.countByPassportAndType(passport.id, verificationType)) +
      1;
    const verification = Verification.createNew({
      trustPassportId: passport.id,
      identityId,
      type: verificationType,
      attempt,
    });

    await this.db.transaction(async (tx) => {
      await this.verificationRepository.save(verification, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'Verification.Created',
        producer: VRF_PRODUCER,
        correlationId: meta.correlationId ?? verification.id,
        payload: {
          verificationId: verification.id,
          trustPassportId: passport.id,
          identityId,
          type: verificationType,
          attempt,
          createdAt: verification.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CreateVerification',
          resource: 'Verification',
          resourceId: verification.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { type: verificationType, attempt },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CreateVerification',
        identityId,
        verificationId: verification.id,
        type: verificationType,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Verification created.',
    );

    return { verificationId: verification.id, type: verificationType, status: verification.status };
  }
}
