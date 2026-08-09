import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassportNotFoundException } from '../../domain/exceptions/trust-passport.exceptions';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';
import {
  UpdateTrustPassportRequest,
  UpdateTrustPassportResponse,
} from '../dto/trust-passport.dtos';

const TPS_PRODUCER = 'trust-passport-service';

export interface UpdateContext {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * TPS-003 — atualização dos atributos EDITABLE do próprio Passport.
 * Alterar atributo verificável revoga a verificação (BR-004) e recalcula a
 * completude (BR-005); publica TrustPassport.Updated com os campos alterados.
 */
@Injectable()
export class UpdateTrustPassportUseCase {
  constructor(
    private readonly repository: TrustPassportRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UpdateTrustPassportUseCase.name);
  }

  async execute(
    identityId: string,
    request: UpdateTrustPassportRequest,
    context: UpdateContext = {},
  ): Promise<UpdateTrustPassportResponse> {
    const startedAt = Date.now();

    const passport = await this.repository.findByIdentityId(identityId);
    if (!passport) {
      throw new TrustPassportNotFoundException();
    }

    const updatedAt = new Date();
    const updatedFields = passport.updateProfile(request, updatedAt);

    if (updatedFields.length > 0) {
      await this.db.transaction(async (tx) => {
        await this.repository.save(passport, tx);
        await this.outboxService.enqueue(tx, {
          eventName: 'TrustPassport.Updated',
          producer: TPS_PRODUCER,
          correlationId: context.correlationId ?? passport.id,
          payload: {
            trustPassportId: passport.id,
            identityId,
            updatedFields,
            updatedAt: updatedAt.toISOString(),
          },
        });
        await this.auditLogService.record(
          {
            identityId,
            operation: 'UpdateTrustPassport',
            resource: 'TrustPassport',
            resourceId: passport.id,
            result: 'SUCCESS',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            correlationId: context.correlationId,
            requestId: context.requestId,
            metadata: { updatedFields },
          },
          tx,
        );
      });
    }

    this.logger.info(
      {
        operation: 'UpdateTrustPassport',
        identityId,
        trustPassportId: passport.id,
        updatedFields,
        correlationId: context.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Trust Passport updated.',
    );

    return {
      trustPassportId: passport.id,
      profileCompletion: passport.profileCompletion,
      updatedAt: passport.updatedAt.toISOString(),
    };
  }
}
