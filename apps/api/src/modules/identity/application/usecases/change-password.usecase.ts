import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import {
  CurrentPasswordInvalidException,
  SamePasswordException,
} from '../../domain/exceptions/password.exceptions';
import { IdentityNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { ChangePasswordRequest } from '../dto/password.requests';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

/**
 * IDN-009 — Change Password (usuário autenticado). Revoga todas as sessões
 * EXCETO a atual (BR-007, INCONSISTENCIAS #22 — sem configurabilidade no MVP).
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ChangePasswordUseCase.name);
  }

  async execute(
    authenticated: AuthenticatedIdentity,
    request: ChangePasswordRequest,
    metadata: RequestMetadata = {},
  ): Promise<void> {
    const startedAt = Date.now();

    const identity = await this.identityRepository.findById(authenticated.identityId);
    if (!identity) {
      throw new IdentityNotFoundException();
    }

    const currentMatches = await this.passwordHashService.verify(
      request.currentPassword,
      identity.passwordHash,
    );
    if (!currentMatches) {
      await this.auditLogService.recordSafe({
        identityId: identity.id,
        operation: 'ChangePassword',
        resource: 'Identity',
        resourceId: identity.id,
        result: 'DENIED',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        correlationId: metadata.correlationId,
        requestId: metadata.requestId,
        metadata: { reason: 'CURRENT_PASSWORD_INVALID' },
      });
      throw new CurrentPasswordInvalidException();
    }

    // BR-005: nova senha não pode ser igual à atual
    if (await this.passwordHashService.verify(request.newPassword, identity.passwordHash)) {
      throw new SamePasswordException();
    }

    const changedAt = new Date();
    const newHash = await this.passwordHashService.hash(request.newPassword);
    identity.changePassword(newHash, changedAt);

    // Sessão atual (a preservar) identificada pelo jti do access token
    const currentSession = await this.sessionRepository.findByAccessTokenId(
      authenticated.tokenId,
    );

    await this.db.transaction(async (tx) => {
      await this.identityRepository.save(identity, tx);
      if (currentSession) {
        await this.sessionRepository.revokeAllByIdentityExcept(identity.id, currentSession.id, tx);
      } else {
        await this.sessionRepository.revokeAllByIdentity(identity.id, tx);
      }
      await this.outboxService.enqueue(tx, {
        eventName: 'Identity.PasswordChanged',
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? identity.id,
        payload: { identityId: identity.id, changedAt: changedAt.toISOString() },
      });
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'ChangePassword',
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
        operation: 'ChangePassword',
        identityId: identity.id,
        sessionId: currentSession?.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Password changed; other sessions revoked.',
    );
  }
}
