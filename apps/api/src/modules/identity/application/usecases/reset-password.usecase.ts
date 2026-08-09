import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { BreachedPasswordException } from '../../domain/exceptions/breached-password.exception';
import {
  ExpiredResetTokenException,
  InvalidResetTokenException,
} from '../../domain/exceptions/password.exceptions';
import { PasswordBreachService } from '../../domain/services/password-breach.service';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { ResetPasswordRequest } from '../dto/password.requests';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

/**
 * IDN-008 — Reset Password. Após redefinir: TODOS os reset tokens invalidados
 * e TODAS as sessões revogadas (BR-006, INCONSISTENCIAS #22) — novo login obrigatório.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly tokenRepository: PasswordResetTokenRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordBreachService: PasswordBreachService,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ResetPasswordUseCase.name);
  }

  async execute(request: ResetPasswordRequest, metadata: RequestMetadata = {}): Promise<void> {
    const startedAt = Date.now();

    const token = await this.tokenRepository.findByTokenHash(
      this.tokenGenerator.hash(request.token),
    );
    if (!token || token.usedAt || token.invalidatedAt) {
      throw new InvalidResetTokenException();
    }
    if (token.isExpired()) {
      throw new ExpiredResetTokenException();
    }

    const identity = await this.identityRepository.findById(token.identityId);
    if (!identity) {
      throw new InvalidResetTokenException();
    }

    if (await this.passwordBreachService.isBreached(request.newPassword)) {
      throw new BreachedPasswordException();
    }

    const resetAt = new Date();
    const newHash = await this.passwordHashService.hash(request.newPassword);
    identity.changePassword(newHash, resetAt);
    token.markUsed(resetAt);

    await this.db.transaction(async (tx) => {
      await this.identityRepository.save(identity, tx);
      await this.tokenRepository.markAsUsed(token.id, resetAt, tx);
      await this.tokenRepository.invalidateActiveByIdentity(identity.id, tx);
      await this.sessionRepository.revokeAllByIdentity(identity.id, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'Identity.PasswordReset',
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? token.id,
        payload: { identityId: identity.id, resetAt: resetAt.toISOString() },
      });
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'ResetPassword',
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
        operation: 'ResetPassword',
        identityId: identity.id,
        tokenId: token.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Password reset; all sessions revoked.',
    );
  }
}
