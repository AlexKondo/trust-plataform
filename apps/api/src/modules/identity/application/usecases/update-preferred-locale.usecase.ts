import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { IdentityNotFoundException } from '../../domain/exceptions/verification.exceptions';
import { IdentityRepository } from '../../domain/repositories/identity.repository';
import {
  UpdatePreferredLocaleRequest,
  UpdatePreferredLocaleResponse,
} from '../dto/update-preferred-locale.request';
import { RequestMetadata } from './create-identity.usecase';

/**
 * IP-002 — troca a preferência de locale da própria Identity autenticada.
 * É uma preferência de exibição, não um fato de domínio que outro módulo
 * precise reagir (Shared Engineering Standards §3: "não criar eventos para
 * persistência trivial") — por isso não publica evento no outbox, diferente
 * de TrustPassport.Updated ou Identity.PasswordChanged. Fica auditado porque
 * é uma alteração de estado do usuário autenticado (§11).
 */
@Injectable()
export class UpdatePreferredLocaleUseCase {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UpdatePreferredLocaleUseCase.name);
  }

  async execute(
    identityId: string,
    request: UpdatePreferredLocaleRequest,
    metadata: RequestMetadata = {},
  ): Promise<UpdatePreferredLocaleResponse> {
    const startedAt = Date.now();

    const identity = await this.identityRepository.findById(identityId);
    if (!identity) {
      throw new IdentityNotFoundException();
    }

    const changed = identity.preferredLocale !== request.preferredLocale;
    if (changed) {
      const changedAt = new Date();
      identity.changePreferredLocale(request.preferredLocale, changedAt);

      await this.db.transaction(async (tx) => {
        await this.identityRepository.save(identity, tx);
        await this.auditLogService.record(
          {
            identityId: identity.id,
            operation: 'UpdatePreferredLocale',
            resource: 'Identity',
            resourceId: identity.id,
            result: 'SUCCESS',
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            correlationId: metadata.correlationId,
            requestId: metadata.requestId,
            metadata: { preferredLocale: request.preferredLocale },
          },
          tx,
        );
      });
    }

    this.logger.info(
      {
        operation: 'UpdatePreferredLocale',
        identityId,
        preferredLocale: identity.preferredLocale,
        changed,
        correlationId: metadata.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Preferred locale updated.',
    );

    return {
      identityId: identity.id,
      preferredLocale: identity.preferredLocale,
      updatedAt: identity.updatedAt.toISOString(),
    };
  }
}
