import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { JwtTokenService } from '../../../../shared/security/jwt-token.service';
import { IdentityNotActiveException } from '../../domain/exceptions/auth.exceptions';
import {
  ExpiredRefreshTokenException,
  InvalidRefreshTokenException,
  RevokedSessionException,
} from '../../domain/exceptions/refresh.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { LoginResponse } from '../dto/login.response';
import { RefreshSessionRequest } from '../dto/refresh-session.request';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

/**
 * IDN-004 — Refresh Session. Rotação obrigatória (BR-005/P7): cada renovação
 * troca o refresh token; o anterior deixa de existir no banco (só o hash novo
 * fica válido), então reuso de token antigo cai em 401 INVALID_REFRESH_TOKEN.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly jwtTokenService: JwtTokenService,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefreshSessionUseCase.name);
  }

  async execute(
    request: RefreshSessionRequest,
    metadata: RequestMetadata = {},
  ): Promise<LoginResponse> {
    const startedAt = Date.now();

    const session = await this.sessionRepository.findByRefreshTokenHash(
      this.tokenGenerator.hash(request.refreshToken),
    );
    if (!session) {
      await this.auditFailure(null, 'UNKNOWN_REFRESH_TOKEN', metadata);
      throw new InvalidRefreshTokenException();
    }
    if (session.revokedAt) {
      await this.auditFailure(session.identityId, 'SESSION_REVOKED', metadata);
      throw new RevokedSessionException();
    }
    if (!session.isActive()) {
      await this.auditFailure(session.identityId, 'REFRESH_TOKEN_EXPIRED', metadata);
      throw new ExpiredRefreshTokenException();
    }

    const identity = await this.identityRepository.findById(session.identityId);
    if (!identity || !identity.isActive) {
      await this.auditFailure(session.identityId, 'IDENTITY_NOT_ACTIVE', metadata);
      throw new IdentityNotActiveException();
    }

    const refreshedAt = new Date();
    const issuedAccess = this.jwtTokenService.issueAccessToken(identity.id);
    const newRefresh = this.tokenGenerator.generate();
    session.rotate(newRefresh.tokenHash, issuedAccess.tokenId, refreshedAt);

    await this.db.transaction(async (tx) => {
      await this.sessionRepository.save(session, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'Session.Refreshed',
        aggregateType: 'Session',
        aggregateId: session.id,
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? session.id,
        payload: {
          sessionId: session.id,
          identityId: identity.id,
          refreshedAt: refreshedAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'RefreshSession',
          resource: 'Session',
          resourceId: session.id,
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
        operation: 'RefreshSession',
        identityId: identity.id,
        sessionId: session.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Session refreshed successfully.',
    );

    return {
      accessToken: issuedAccess.accessToken,
      refreshToken: newRefresh.token,
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }

  private async auditFailure(
    identityId: string | null,
    reason: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.auditLogService.recordSafe({
      identityId: identityId ?? undefined,
      operation: 'RefreshSession',
      resource: 'Session',
      result: 'DENIED',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      correlationId: metadata.correlationId,
      requestId: metadata.requestId,
      metadata: { reason },
    });
  }
}
