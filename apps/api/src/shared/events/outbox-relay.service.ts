import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import PgBoss from 'pg-boss';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE, Database } from '../database/database.module';
import { OUTBOX_STATUS, OutboxEventRow, outboxEvents } from '../database/schema';
import { EventEnvelope } from './event-envelope';

/**
 * Publica eventos PENDING do outbox no pg-boss (at-least-once).
 * Consumidores DEVEM ser idempotentes por eventId (DOC-005): se o processo cair
 * entre publicar e marcar PUBLISHED, o evento é reenviado no próximo ciclo.
 * Após OUTBOX_MAX_ATTEMPTS falhas o evento vira FAILED e exige reprocesso manual.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private boss?: PgBoss;
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly ensuredQueues = new Set<string>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboxRelayService.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    this.boss = new PgBoss({
      connectionString: this.config.databaseUrl,
      schema: 'pgboss',
      max: 3,
    });
    this.boss.on('error', (error) =>
      this.logger.error({ err: error }, 'pg-boss reported an error.'),
    );
    await this.boss.start();
    this.timer = setInterval(() => void this.tick(), this.config.outboxPollIntervalMs);
    this.logger.info(
      { operation: 'OutboxRelayStart', pollIntervalMs: this.config.outboxPollIntervalMs },
      'Outbox relay started.',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  /** Um ciclo de publicação; exposto para testes de integração. */
  async tick(): Promise<void> {
    if (this.ticking || !this.boss) {
      return;
    }
    this.ticking = true;
    try {
      await this.db.transaction(async (tx) => {
        const batch = await tx
          .select()
          .from(outboxEvents)
          .where(eq(outboxEvents.status, OUTBOX_STATUS.PENDING))
          .orderBy(asc(outboxEvents.createdAt))
          .limit(this.config.outboxBatchSize)
          .for('update', { skipLocked: true });

        for (const row of batch) {
          await this.publishRow(tx, row);
        }
      });
    } catch (error) {
      this.logger.error({ err: error, operation: 'OutboxRelayTick' }, 'Outbox tick failed.');
    } finally {
      this.ticking = false;
    }
  }

  private async publishRow(
    tx: Pick<Database, 'update'>,
    row: OutboxEventRow,
  ): Promise<void> {
    const envelope: EventEnvelope = {
      eventId: row.eventId,
      eventName: row.eventName,
      eventVersion: row.eventVersion,
      occurredAt: row.occurredAt.toISOString(),
      producer: row.producer,
      correlationId: row.correlationId ?? row.eventId,
      causationId: row.causationId ?? undefined,
      payload: row.payload as Record<string, unknown>,
    };

    try {
      await this.ensureQueue(row.eventName);
      // singletonKey = eventId → o próprio broker deduplica reenvios do relay
      await this.boss!.send(row.eventName, envelope, { singletonKey: row.eventId });
      await tx
        .update(outboxEvents)
        .set({
          status: OUTBOX_STATUS.PUBLISHED,
          publishedAt: new Date(),
          attempts: row.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(outboxEvents.id, row.id));
    } catch (error) {
      const attempts = row.attempts + 1;
      const failed = attempts >= this.config.outboxMaxAttempts;
      await tx
        .update(outboxEvents)
        .set({
          status: failed ? OUTBOX_STATUS.FAILED : OUTBOX_STATUS.PENDING,
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(outboxEvents.id, row.id));
      this.logger.error(
        {
          err: error,
          operation: 'OutboxPublish',
          eventId: row.eventId,
          eventName: row.eventName,
          correlationId: row.correlationId,
          attempts,
          result: failed ? 'FAILED_PERMANENT' : 'FAILURE',
        },
        failed
          ? 'Outbox event permanently failed after max attempts — manual reprocess required.'
          : 'Outbox event publish failed; will retry.',
      );
    }
  }

  private async ensureQueue(name: string): Promise<void> {
    if (this.ensuredQueues.has(name)) {
      return;
    }
    await this.boss!.createQueue(name);
    this.ensuredQueues.add(name);
  }

  /** Reprocesso manual de eventos FAILED (uso administrativo/operacional). */
  async retryFailed(): Promise<number> {
    const result = await this.db
      .update(outboxEvents)
      .set({ status: OUTBOX_STATUS.PENDING, updatedAt: new Date() })
      .where(eq(outboxEvents.status, OUTBOX_STATUS.FAILED))
      .returning({ id: outboxEvents.id });
    return result.length;
  }

  /** Métricas simples para observabilidade/health. */
  async pendingCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, OUTBOX_STATUS.PENDING));
    return row?.count ?? 0;
  }
}
