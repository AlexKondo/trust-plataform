import { Inject, Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import { DRIZZLE, Database } from '../database/database.module';
import { OUTBOX_STATUS, OutboxEventRow, outboxEvents, processedEvents } from '../database/schema';
import { EventConsumer } from './event-consumer';
import { ConsumedEvent } from './event-envelope';

/**
 * Drena eventos PENDING do outbox de forma síncrona e sem estado entre
 * chamadas (at-least-once). Cada linha é entregue diretamente aos consumers
 * REGISTRADOS NO MOMENTO DA CHAMADA (via DiscoveryService) que assinam seu
 * `eventType` — sem broker/fila intermediária.
 *
 * Migração Render → Vercel (2026-09-17): removido pg-boss (fila persistente +
 * worker de longa duração, incompatível com funções serverless). `drainOnce()`
 * é chamado por um endpoint HTTP disparado externamente (GitHub Actions cron
 * a cada 5min) em vez de um `setInterval` de processo residente.
 *
 * Semântica de status por linha (decisão de design, ver Completion Report):
 * - uma linha só vira PUBLISHED quando TODOS os consumers atualmente
 *   registrados para seu eventType têm uma linha em `processedEvents`
 *   (dedupe idempotente, verificado após a tentativa desta chamada);
 * - se algum consumer falhar, a linha permanece PENDING (retry na próxima
 *   invocação) até `outboxMaxAttempts`, quando vira FAILED;
 * - consumers que já processaram com sucesso em uma tentativa anterior NÃO
 *   são re-executados numa nova tentativa da mesma linha — o filtro usa
 *   `processedEvents` para pular quem já tem dedupe gravado.
 * - risco conhecido (documentado no Completion Report): se um NOVO consumer
 *   para um eventType for implantado depois que linhas antigas desse tipo já
 *   foram marcadas PUBLISHED sob a semântica antiga (pg-boss), essas linhas
 *   antigas não serão automaticamente re-entregues a ele — isso já era
 *   verdade antes (pg-boss também não replaying jobs antigos) e não piora
 *   com esta migração, mas segue sendo uma limitação estrutural do outbox
 *   atual (não há "replay from history" automático).
 */
@Injectable()
export class OutboxRelayService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: AppConfigService,
    private readonly discovery: DiscoveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboxRelayService.name);
  }

  private getConsumers(): EventConsumer[] {
    return this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance as unknown)
      .filter((instance): instance is EventConsumer => instance instanceof EventConsumer);
  }

  /**
   * Drena até `outboxBatchSize` linhas PENDING, entregando cada uma a todos
   * os consumers registrados para seu `eventType`. Respeita um orçamento de
   * tempo (`maxDurationMs`) para caber no limite de execução de uma função
   * serverless — linhas restantes ficam PENDING e são pegas na próxima
   * invocação (cron a cada 5min).
   *
   * Substitui o antigo `tick()` (que apenas publicava no pg-boss) — agora a
   * entrega É o processamento, não apenas o enfileiramento.
   */
  async drainOnce(options?: { maxDurationMs?: number }): Promise<{ processed: number }> {
    const consumers = this.getConsumers();
    const consumersByEventType = new Map<string, EventConsumer[]>();
    for (const consumer of consumers) {
      const list = consumersByEventType.get(consumer.eventType) ?? [];
      list.push(consumer);
      consumersByEventType.set(consumer.eventType, list);
    }

    const deadline = Date.now() + (options?.maxDurationMs ?? 50_000);
    let processed = 0;

    for (;;) {
      if (Date.now() >= deadline) {
        break;
      }
      const batch = await this.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, OUTBOX_STATUS.PENDING))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(this.config.outboxBatchSize)
        .for('update', { skipLocked: true });

      if (batch.length === 0) {
        break;
      }

      for (const row of batch) {
        if (Date.now() >= deadline) {
          return { processed };
        }
        await this.drainRow(row, consumersByEventType.get(row.eventType) ?? []);
        processed += 1;
      }

      if (batch.length < this.config.outboxBatchSize) {
        break;
      }
    }

    return { processed };
  }

  private async drainRow(row: OutboxEventRow, consumers: EventConsumer[]): Promise<void> {
    if (consumers.length === 0) {
      // Nenhum consumer registrado para este eventType (ex.: evento apenas de
      // auditoria/analytics futura) — nada a entregar; marca PUBLISHED.
      await this.finalizeRow(row, true);
      return;
    }

    const envelope = this.toEnvelope(row);

    const alreadyProcessed = await this.db
      .select({ consumerName: processedEvents.consumerName })
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.eventId, row.eventId),
          inArray(
            processedEvents.consumerName,
            consumers.map((c) => c.consumerName),
          ),
        ),
      );
    const doneNames = new Set(alreadyProcessed.map((r) => r.consumerName));

    let allSucceeded = true;
    for (const consumer of consumers) {
      if (doneNames.has(consumer.consumerName)) {
        continue;
      }
      try {
        await this.consume(consumer, envelope);
      } catch {
        allSucceeded = false;
        // segue tentando os demais consumers desta linha; a linha só some do
        // PENDING quando TODOS tiverem processedEvents gravado
      }
    }

    await this.finalizeRow(row, allSucceeded);
  }

  private async finalizeRow(row: OutboxEventRow, succeeded: boolean): Promise<void> {
    if (succeeded) {
      await this.db
        .update(outboxEvents)
        .set({
          status: OUTBOX_STATUS.PUBLISHED,
          publishedAt: new Date(),
          attempts: row.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(outboxEvents.id, row.id));
      return;
    }

    const attempts = row.attempts + 1;
    const failed = attempts >= this.config.outboxMaxAttempts;
    await this.db
      .update(outboxEvents)
      .set({
        status: failed ? OUTBOX_STATUS.FAILED : OUTBOX_STATUS.PENDING,
        attempts,
        lastError: 'One or more consumers failed; see logs for eventId/consumerName.',
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, row.id));
    this.logger.error(
      {
        operation: 'OutboxDrain',
        eventId: row.eventId,
        eventType: row.eventType,
        correlationId: row.correlationId,
        attempts,
        result: failed ? 'FAILED_PERMANENT' : 'FAILURE',
      },
      failed
        ? 'Outbox event permanently failed after max attempts — manual reprocess required.'
        : 'Outbox event partially failed; will retry.',
    );
  }

  private toEnvelope(row: OutboxEventRow): ConsumedEvent {
    // Linhas anteriores à migration 0024 não têm identidade de agregado; o Pack
    // proíbe fabricá-la, então o envelope publicado a omite (PACK-00 v1.1 §11).
    return {
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
  }

  private async consume(consumer: EventConsumer, envelope: ConsumedEvent): Promise<void> {
    try {
      if (consumer.managesOwnTransaction) {
        await this.consumeOutsideTransaction(consumer, envelope);
      } else {
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
      }
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
        'Event consumer failed; outbox row stays PENDING and will retry.',
      );
      throw error;
    }
  }

  /**
   * PACK-01 §17 — caminho para consumers que falam com dependência externa.
   * Nada de transação aberta durante a chamada: verifica o dedupe, executa, e
   * só então registra o processamento. Se o processo morrer no meio, o evento
   * é reentregue e o handler idempotente absorve a repetição.
   */
  private async consumeOutsideTransaction(
    consumer: EventConsumer,
    envelope: ConsumedEvent,
  ): Promise<void> {
    const [already] = await this.db
      .select({ eventId: processedEvents.eventId })
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.consumerName, consumer.consumerName),
          eq(processedEvents.eventId, envelope.eventId),
        ),
      )
      .limit(1);
    if (already) {
      return;
    }

    await consumer.handle(envelope, this.db);

    await this.db
      .insert(processedEvents)
      .values({ consumerName: consumer.consumerName, eventId: envelope.eventId })
      .onConflictDoNothing();
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
