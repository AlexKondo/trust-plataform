import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { JwtTokenService } from '../../../../shared/security/jwt-token.service';
import { Session } from '../../domain/entities/session';
import {
  AccountLockedException,
  IdentityNotActiveException,
  InvalidCredentialsException,
} from '../../domain/exceptions/auth.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { LoginRequest } from '../dto/login.request';
import { LoginResponse } from '../dto/login.response';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

/**
 * Hash Argon2id de uma senha impossível — usado quando o e-mail não existe,
 * para igualar o tempo de resposta e impedir enumeração por timing (DOC-002).
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/**
 * IDN-003 — Authenticate Identity.
 * Ordem de defesa: lockout → senha (mensagem opaca, BR-004) → status ACTIVE (BR-001).
 * O status só é revelado após a senha correta, para não vazar existência de conta.
 */
@Injectable()
export class AuthenticateIdentityUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthenticateIdentityUseCase.name);
  }

  async execute(request: LoginRequest, metadata: RequestMetadata = {}): Promise<LoginResponse> {
    const startedAt = Date.now();

    const identity = await this.identityRepository.findByEmail(request.email);
    if (!identity) {
      await this.passwordHashService.verify(request.password, DUMMY_PASSWORD_HASH);
      await this.auditFailure(null, 'UNKNOWN_EMAIL', metadata);
      throw new InvalidCredentialsException();
    }

    if (identity.isLocked()) {
      await this.auditFailure(identity.id, 'ACCOUNT_LOCKED', metadata);
      throw new AccountLockedException();
    }

    const passwordMatches = await this.passwordHashService.verify(
      request.password,
      identity.passwordHash,
    );
    if (!passwordMatches) {
      identity.registerFailedLogin(
        this.config.loginMaxFailedAttempts,
        this.config.loginLockoutMinutes,
      );
      await this.identityRepository.save(identity);
      await this.auditFailure(identity.id, 'WRONG_PASSWORD', metadata);
      throw new InvalidCredentialsException();
    }

    if (!identity.isActive) {
      await this.auditFailure(identity.id, 'IDENTITY_NOT_ACTIVE', metadata);
      throw new IdentityNotActiveException();
    }

    const authenticatedAt = new Date();
    const issuedAccess = this.jwtTokenService.issueAccessToken(identity.id);
    const refresh = this.tokenGenerator.generate();
    const session = Session.createNew({
      identityId: identity.id,
      refreshTokenHash: refresh.tokenHash,
      accessTokenId: issuedAccess.tokenId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      ttlDays: this.config.refreshTokenTtlDays,
    });
    identity.registerSuccessfulLogin(authenticatedAt);

    await this.db.transaction(async (tx) => {
      await this.sessionRepository.save(session, tx);
      await this.identityRepository.save(identity, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'Identity.Authenticated',
        aggregateType: 'Identity',
        aggregateId: identity.id,
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? session.id,
        payload: {
          identityId: identity.id,
          sessionId: session.id,
          authenticatedAt: authenticatedAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'AuthenticateIdentity',
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
        operation: 'AuthenticateIdentity',
        identityId: identity.id,
        sessionId: session.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Identity authenticated successfully.',
    );

    return {
      accessToken: issuedAccess.accessToken,
      refreshToken: refresh.token,
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
      operation: 'AuthenticateIdentity',
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
