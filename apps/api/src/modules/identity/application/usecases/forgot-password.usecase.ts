import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordResetTokenRepository } from '../../domain/repositories/password-reset-token.repository';
import { EmailService } from '../../domain/services/email.service';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { ForgotPasswordRequest } from '../dto/password.requests';
import { RequestMetadata } from './create-identity.usecase';

const IDENTITY_PRODUCER = 'identity-service';

export interface ForgotPasswordResponse {
  message: string;
}

const PUBLIC_MESSAGE =
  'If an account exists for this email, password recovery instructions have been sent.';

/**
 * IDN-007 — Forgot Password. Anti-enumeração (BR-003): a resposta é SEMPRE a
 * mesma, exista ou não a conta; nenhuma exceção específica chega ao cliente.
 */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly tokenRepository: PasswordResetTokenRepository,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly emailService: EmailService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ForgotPasswordUseCase.name);
  }

  async execute(
    request: ForgotPasswordRequest,
    metadata: RequestMetadata = {},
  ): Promise<ForgotPasswordResponse> {
    try {
      const identity = await this.identityRepository.findByEmail(request.email);
      if (identity) {
        await this.issueAndSend(identity.id, identity.email, identity.fullName, metadata);
      } else {
        // Auditoria interna sem expor nada ao cliente (log não revela existência)
        await this.auditLogService.recordSafe({
          operation: 'ForgotPassword',
          resource: 'Identity',
          result: 'DENIED',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          correlationId: metadata.correlationId,
          requestId: metadata.requestId,
          metadata: { reason: 'UNKNOWN_EMAIL' },
        });
      }
    } catch (error) {
      // BR-003: falha interna não pode mudar a resposta pública
      this.logger.error(
        { err: error, operation: 'ForgotPassword', correlationId: metadata.correlationId },
        'Forgot password flow failed internally; public response unchanged.',
      );
    }
    return { message: PUBLIC_MESSAGE };
  }

  private async issueAndSend(
    identityId: string,
    email: string,
    fullName: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const generated = this.tokenGenerator.generate();
    const token = PasswordResetToken.createNew({
      identityId,
      tokenHash: generated.tokenHash,
      ttlMinutes: this.config.passwordResetTtlMinutes,
    });
    const requestedAt = new Date();

    await this.db.transaction(async (tx) => {
      await this.tokenRepository.invalidateActiveByIdentity(identityId, tx);
      await this.tokenRepository.save(token, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'Identity.PasswordRecoveryRequested',
        producer: IDENTITY_PRODUCER,
        correlationId: metadata.correlationId ?? token.id,
        payload: { identityId, requestedAt: requestedAt.toISOString() },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'ForgotPassword',
          resource: 'PasswordResetToken',
          resourceId: token.id,
          result: 'SUCCESS',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          correlationId: metadata.correlationId,
          requestId: metadata.requestId,
        },
        tx,
      );
    });

    const resetUrl = `${this.config.appBaseUrl}/reset-password?token=${generated.token}`;
    try {
      await this.emailService.sendPasswordResetEmail({ to: email, fullName, resetUrl });
    } catch (error) {
      this.logger.error(
        { err: error, operation: 'ForgotPassword', identityId, tokenId: token.id },
        'Password reset email could not be sent; user can request again.',
      );
    }
  }
}
