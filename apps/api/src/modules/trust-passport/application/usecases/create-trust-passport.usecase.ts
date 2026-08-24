import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import {
  DRIZZLE,
  Database,
  DatabaseExecutor,
} from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { TrustPassport } from '../../domain/entities/trust-passport';
import { TrustPassportAlreadyExistsException } from '../../domain/exceptions/trust-passport.exceptions';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';

const TPS_PRODUCER = 'trust-passport-service';

export interface CreateTrustPassportResult {
  trustPassportId: string;
  status: string;
  created: boolean;
}

export interface CreateContext {
  correlationId?: string;
  causationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  /** Consumer de evento usa modo idempotente: duplicado = no-op, não erro. */
  idempotent?: boolean;
}

/**
 * TPS-001 — cria o Trust Passport (1:1 com a Identity, BR-002).
 * Invocado pelo consumer de `Identity.Created` (caminho automático) ou pela
 * API (caminho explícito). Só Identities ACTIVE chegam aqui: o evento é
 * emitido na ativação e a API exige sessão autenticada (login exige ACTIVE).
 */
@Injectable()
export class CreateTrustPassportUseCase {
  constructor(
    private readonly repository: TrustPassportRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateTrustPassportUseCase.name);
  }

  async execute(
    identityId: string,
    context: CreateContext = {},
    executor?: DatabaseExecutor,
  ): Promise<CreateTrustPassportResult> {
    const startedAt = Date.now();

    const existing = await this.repository.findByIdentityId(identityId);
    if (existing) {
      if (context.idempotent) {
        return { trustPassportId: existing.id, status: existing.status, created: false };
      }
      throw new TrustPassportAlreadyExistsException();
    }

    const passport = TrustPassport.createNew(identityId);

    const persist = async (tx: DatabaseExecutor): Promise<void> => {
      await this.repository.save(passport, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'TrustPassport.Created',
        aggregateType: 'TrustPassport',
        aggregateId: passport.id,
        producer: TPS_PRODUCER,
        correlationId: context.correlationId ?? passport.id,
        causationId: context.causationId,
        payload: {
          trustPassportId: passport.id,
          identityId,
          status: passport.status,
          createdAt: passport.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CreateTrustPassport',
          resource: 'TrustPassport',
          resourceId: passport.id,
          result: 'SUCCESS',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          correlationId: context.correlationId,
          requestId: context.requestId,
        },
        tx,
      );
    };

    if (executor) {
      await persist(executor);
    } else {
      await this.db.transaction(persist);
    }

    this.logger.info(
      {
        operation: 'CreateTrustPassport',
        identityId,
        trustPassportId: passport.id,
        correlationId: context.correlationId,
        durationMs: Date.now() - startedAt,
        result: 'SUCCESS',
      },
      'Trust Passport created.',
    );

    return { trustPassportId: passport.id, status: passport.status, created: true };
  }
}
