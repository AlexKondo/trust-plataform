import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { Identity } from '../../domain/entities/identity';
import { BreachedPasswordException } from '../../domain/exceptions/breached-password.exception';
import { EmailAlreadyExistsException } from '../../domain/exceptions/email-already-exists.exception';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordBreachService } from '../../domain/services/password-breach.service';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CreateIdentityRequest } from '../dto/create-identity.request';
import { CreateIdentityResponse } from '../dto/create-identity.response';
import { IdentityMapper } from '../mapper/identity.mapper';
import { GenerateEmailVerificationUseCase } from './generate-email-verification.usecase';

export interface RequestMetadata {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * IDN-001 — Create Identity.
 * Fluxo: verificar duplicidade (BR-001/006) → hash Argon2id (BR-002/003) →
 * criar Entity com status PENDING_EMAIL_VERIFICATION (BR-004) → persistir +
 * auditar na mesma transação. Não publica eventos — Identity.Created é do IDN-002.
 */
@Injectable()
export class CreateIdentityUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordBreachService: PasswordBreachService,
    private readonly auditLogService: AuditLogService,
    private readonly generateEmailVerification: GenerateEmailVerificationUseCase,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateIdentityUseCase.name);
  }

  async execute(
    request: CreateIdentityRequest,
    metadata: RequestMetadata = {},
  ): Promise<CreateIdentityResponse> {
    const startedAt = Date.now();

    if (await this.identityRepository.existsByEmail(request.email)) {
      throw new EmailAlreadyExistsException();
    }

    if (await this.passwordBreachService.isBreached(request.password)) {
      throw new BreachedPasswordException();
    }

    const passwordHash = await this.passwordHashService.hash(request.password);
    const identity = Identity.createNew({
      fullName: request.fullName,
      email: request.email,
      passwordHash,
    });

    await this.db.transaction(async (tx) => {
      await this.identityRepository.save(identity, tx);
      await this.auditLogService.record(
        {
          identityId: identity.id,
          operation: 'CreateIdentity',
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

    // IDN-002 BR-001: toda nova Identity recebe token + e-mail de verificação.
    // Falha aqui não desfaz o cadastro — o usuário pode pedir reenvio.
    try {
      await this.generateEmailVerification.issueAndSend(identity, metadata);
    } catch (error) {
      this.logger.error(
        { err: error, operation: 'CreateIdentity', identityId: identity.id },
        'Failed to issue verification email after registration.',
      );
    }

    this.logger.info(
      {
        operation: 'CreateIdentity',
        identityId: identity.id,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Identity created successfully.',
    );

    return IdentityMapper.toCreateResponse(identity);
  }
}
