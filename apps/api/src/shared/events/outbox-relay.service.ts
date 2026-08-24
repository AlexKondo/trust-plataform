import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { asc, eq, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import PgBoss from 'pg-boss';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE, Database } from '../database/database.module';
import { OUTBOX_STATUS, OutboxEventRow, outboxEvents, processedEvents } from '../database/schema';
import { EventConsumer } from './event-consumer';
import { ConsumedEvent } from './event-envelope';
import { readPersistedEvent } from './legacy-event-compat';

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
    private readonly discovery: DiscoveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboxRelayService.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    this.boss = new PgBoss({
      connectionString: this.config.databaseUrl,
      schema: 'pgboss',
      max: Math.min(2, this.config.dbPoolMax),
    });
    this.boss.on('error', (error) =>
      this.logger.error({ err: error }, 'pg-boss reported an error.'),
    );
    await this.boss.start();
    await this.registerConsumers();
    this.timer = setInterval(() => void this.tick(), this.config.outboxPollIntervalMs);
    this.logger.info(
      { operation: 'OutboxRelayStart', pollIntervalMs: this.config.outboxPollIntervalMs },
      'Outbox relay started.',
    );
  }

  /**
   * Descobre todos os providers que estendem EventConsumer e os registra no
   * pg-boss. Cada consumo roda em transação com dedupe por (consumer, eventId).
   */
  private async registerConsumers(): Promise<void> {
    const consumers = this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance as unknown)
      .filter((instance): instance is EventConsumer => instance instanceof EventConsumer);

    for (const consumer of consumers) {
      // Fan-out: fila própria por consumer, inscrita no evento — cada consumer
      // recebe SUA cópia do evento (pg-boss é fila de jobs, não pub/sub por queue)
      await this.ensureQueue(consumer.consumerName);
      await this.boss!.subscribe(consumer.eventType, consumer.consumerName);
      await this.boss!.work(consumer.consumerName, async (jobs: PgBoss.Job<unknown>[]) => {
        for (const job of jobs) {
          // Caminho tolerante (PACK-00 v1.1 §11): jobs enfileirados antes da
          // migration 0024 carregam o envelope legado (eventName, sem agregado).
          await this.consume(consumer, readPersistedEvent(job.data));
        }
      });
      this.logger.info(
        {
          operation: 'ConsumerRegistered',
          eventType: consumer.eventType,
          consumerName: consumer.consumerName,
        },
        'Event consumer registered.',
      );
    }
  }

  private async consume(consumer: EventConsumer, envelope: ConsumedEvent): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(processedEvents)
          .values({ consumerName: consumer.consumerName, eventId: envelope.eventId })
          .onConflictDoNothing()
          .returning({ eventId: processedEvents.eventId });
        if (inserted.length === 0) {
          // já processado (at-least-once) — idempotência garantida
          return;
        }
        await consumer.handle(envelope, tx);
      });
      this.logger.info(
        {
          operation: 'EventConsumed',
          eventType: envelope.eventType,
          eventId: envelope.eventId,
          consumerName: consumer.consumerName,
          correlationId: envelope.correlationId,
          result: 'SUCCESS',
        },
        'Event consumed.',
      );
    } catch (error) {
      this.logger.error(
        {
          err: error,
          operation: 'EventConsumed',
          eventType: envelope.eventType,
          eventId: envelope.eventId,
          consumerName: consumer.consumerName,
          correlationId: envelope.correlationId,
          result: 'FAILURE',
        },
        'Event consumer failed; pg-boss will retry.',
      );
      throw error;
    }
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
    // Linhas anteriores à migration 0024 não têm identidade de agregado; o Pack
    // proíbe fabricá-la, então o envelope publicado a omite (PACK-00 v1.1 §11).
    const envelope: ConsumedEvent = {
      eventId: row.eventId,
      eventType: row.eventType,
      eventVersion: row.eventVersion,
      occurredAt: row.occurredAt.toISOString(),
      producer: row.producer,
      aggregateType: row.aggregateType ?? undefined,
      aggregateId: row.aggregateId ?? undefined,
      correlationId: row.correlationId ?? row.eventId,
      causationId: row.causationId ?? undefined,
      payload: row.payload as Record<string, unknown>,
    };

    try {
      // publish = fan-out para todas as filas inscritas no evento (0..N consumers);
      // singletonKey = eventId → o broker deduplica reenvios do relay por fila
      await this.boss!.publish(row.eventType, envelope, { singletonKey: row.eventId });
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
          eventType: row.eventType,
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
    // Retry com backoff exponencial (2s, 4s, 8s…) — dependências entre consumers
    // (ex.: score ainda não criado quando a verificação pontua) se resolvem rápido
    await this.boss!.createQueue(name, {
      name,
      retryLimit: 12,
      retryDelay: 2,
      retryBackoff: true,
    });
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
