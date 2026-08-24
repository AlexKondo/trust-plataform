import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { DatabaseExecutor, DRIZZLE, Database } from '../database/database.module';
import { outboxEvents } from '../database/schema';
import { CreateEventInput, EventEnvelope, createEventEnvelope } from './event-envelope';

/**
 * Grava eventos de domínio no Transactional Outbox (DOC-005).
 * REGRA: chame `enqueue` passando a MESMA transação da escrita de negócio —
 * o evento só existe se a transação de negócio for confirmada. A publicação
 * real é responsabilidade do OutboxRelayService.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async enqueue<TPayload extends Record<string, unknown>>(
    executor: DatabaseExecutor,
    input: CreateEventInput<TPayload>,
  ): Promise<EventEnvelope<TPayload>> {
    const envelope = createEventEnvelope(input);
    await executor.insert(outboxEvents).values({
      id: uuidv7(),
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      eventVersion: envelope.eventVersion,
      producer: envelope.producer,
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      payload: envelope.payload,
      occurredAt: new Date(envelope.occurredAt),
    });
    return envelope;
  }

  /** Conveniência para eventos fora de transação de negócio (raro — prefira `enqueue`). */
  async enqueueStandalone<TPayload extends Record<string, unknown>>(
    input: CreateEventInput<TPayload>,
  ): Promise<EventEnvelope<TPayload>> {
    return this.enqueue(this.db, input);
  }
}
