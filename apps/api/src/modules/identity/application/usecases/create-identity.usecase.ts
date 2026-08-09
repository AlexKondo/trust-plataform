import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { Identity } from '../../domain/entities/identity';
import { EmailAlreadyExistsException } from '../../domain/exceptions/email-already-exists.exception';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import { PasswordHashService } from '../../domain/services/password-hash.service';
import { CreateIdentityRequest } from '../dto/create-identity.request';
import { CreateIdentityResponse } from '../dto/create-identity.response';
import { IdentityMapper } from '../mapper/identity.mapper';

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
    private readonly auditLogService: AuditLogService,
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
