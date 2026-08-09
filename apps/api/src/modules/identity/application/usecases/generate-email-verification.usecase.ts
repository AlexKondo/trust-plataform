import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { EmailVerificationToken } from '../../domain/entities/email-verification-token';
import { Identity } from '../../domain/entities/identity';
import {
  EmailAlreadyVerifiedException,
  IdentityNotFoundException,
} from '../../domain/exceptions/verification.exceptions';
import { EmailVerificationTokenRepository } from '../../domain/repositories/email-verification-token.repository';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { EmailService } from '../../domain/services/email.service';
import { TokenGeneratorService } from '../../domain/services/token-generator.service';
import { RequestMetadata } from './create-identity.usecase';

/**
 * IDN-002 — geração/reenvio do token de verificação (BR-001/002).
 * Invalida tokens pendentes anteriores (só o último link vale), persiste o novo
 * token como hash e solicita o envio do e-mail. Falha de envio não desfaz a
 * persistência — o usuário pode pedir reenvio.
 */
@Injectable()
export class GenerateEmailVerificationUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly tokenRepository: EmailVerificationTokenRepository,
    private readonly tokenGenerator: TokenGeneratorService,
    private readonly emailService: EmailService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerateEmailVerificationUseCase.name);
  }

  async execute(identityId: string, metadata: RequestMetadata = {}): Promise<void> {
    const identity = await this.identityRepository.findById(identityId);
    if (!identity) {
      throw new IdentityNotFoundException();
    }
    if (identity.isActive) {
      throw new EmailAlreadyVerifiedException();
    }
    await this.issueAndSend(identity, metadata);
  }

  /** Caminho interno usado pelo cadastro (IDN-001 → BR-001 do IDN-002). */
  async issueAndSend(identity: Identity, metadata: RequestMetadata = {}): Promise<void> {
    const generated = this.tokenGenerator.generate();
    const token = EmailVerificationToken.createNew({
      identityId: identity.id,
      tokenHash: generated.tokenHash,
      ttlHours: this.config.emailVerificationTtlHours,
    });

    await this.db.transaction(async (tx) => {
      await this.tokenRepository.invalidatePendingByIdentity(identity.id, tx);
      await this.tokenRepository.save(token, tx);
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'RequestEmailVerification',
          resource: 'EmailVerificationToken',
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

    const verificationUrl = `${this.config.appBaseUrl}/verify-email?token=${generated.token}`;
    try {
      await this.emailService.sendVerificationEmail({
        to: identity.email,
        fullName: identity.fullName,
        verificationUrl,
      });
    } catch (error) {
      this.logger.error(
        {
          err: error,
          operation: 'RequestEmailVerification',
          identityId: identity.id,
          tokenId: token.id,
          correlationId: metadata.correlationId,
          result: 'EMAIL_SEND_FAILED',
        },
        'Verification email could not be sent; user can request a resend.',
      );
    }
  }
}
