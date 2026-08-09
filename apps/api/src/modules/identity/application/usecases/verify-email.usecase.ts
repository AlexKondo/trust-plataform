import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { IdentityStatus } from '../../domain/entities/identity-status';
import {
  EmailAlreadyVerifiedException,
  ExpiredVerificationTokenException,
  IdentityNotFoundException,
  InvalidVerificationTokenException,
} from '../../domain/exceptions/verification.exceptions';
import { EmailVerificationTokenRepository } from '../../domain/repositories/email-verification-token.repository';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { RequestMetadata } from './create-identity.usecase';

export interface VerifyEmailResponse {
  status: IdentityStatus;
}

const IDENTITY_PRODUCER = 'identity-service';

/**
 * IDN-002 — Verify Email. Valida o token (BR-003/004/006), ativa a Identity
 * (BR-005) e publica `Identity.Created` + `Identity.EmailVerified` via outbox,
 * tudo na mesma transação.
 */
@Injectable()
export class VerifyEmailUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly tokenRepository: EmailVerificationTokenRepository,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VerifyEmailUseCase.name);
  }

  async execute(rawToken: string, metadata: RequestMetadata = {}): Promise<VerifyEmailResponse> {
    const startedAt = Date.now();

    const token = await this.tokenRepository.findByTokenHash(this.tokenGenerator.hash(rawToken));
    if (!token || token.invalidatedAt) {
      throw new InvalidVerificationTokenException();
    }
    if (token.verifiedAt) {
      throw new EmailAlreadyVerifiedException();
    }
    if (token.isExpired()) {
      throw new ExpiredVerificationTokenException();
    }

    const identity = await this.identityRepository.findById(token.identityId);
    if (!identity) {
      throw new IdentityNotFoundException();
    }
    if (identity.isActive) {
      throw new EmailAlreadyVerifiedException();
    }

    const verifiedAt = new Date();
    identity.activate(verifiedAt);
    token.markVerified(verifiedAt);

    const correlationId = metadata.correlationId ?? token.id;

    await this.db.transaction(async (tx) => {
      await this.tokenRepository.markAsVerified(token.id, verifiedAt, tx);
      await this.identityRepository.save(identity, tx);

      // Identity.Created marca a identidade ATIVADA para os demais módulos
      // (decisão INCONSISTENCIAS #11); TPS-001 consumirá este evento.
      const created = await this.outboxService.enqueue(tx, {
        eventName: 'Identity.Created',
        producer: IDENTITY_PRODUCER,
        correlationId,
        payload: { identityId: identity.id },
      });
      await this.outboxService.enqueue(tx, {
        eventName: 'Identity.EmailVerified',
        producer: IDENTITY_PRODUCER,
        correlationId,
        causationId: created.eventId,
        payload: { identityId: identity.id, verifiedAt: verifiedAt.toISOString() },
      });

      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'VerifyEmail',
          resource: 'Identity',
          resourceId: identity.id,
          result: 'SUCCESS',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          correlationId: metadata.correlationId,
          requestId: metadata.requestId,
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'VerifyEmail',
        identityId: identity.id,
        tokenId: token.id,
        correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Email verified; identity activated.',
    );

    return { status: identity.status };
  }
}
