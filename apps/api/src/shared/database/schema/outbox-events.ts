import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Transactional Outbox (DOC-005): eventos de domínio são gravados aqui na MESMA
 * transação da escrita de negócio; o OutboxRelayService publica depois (at-least-once).
 * Linhas nunca são apagadas pelo fluxo normal — são o registro de publicação.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    eventVersion: varchar('event_version', { length: 10 }).notNull().default('1.0'),
    producer: varchar('producer', { length: 60 }).notNull(),
    /** PACK-00 v1.1 §5.2. Nulos APENAS em linhas anteriores à migration 0024. */
    aggregateType: varchar('aggregate_type', { length: 60 }),
    aggregateId: varchar('aggregate_id', { length: 64 }),
    correlationId: uuid('correlation_id'),
    causationId: uuid('causation_id'),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_outbox_event_event_id').on(table.eventId),
    index('idx_outbox_event_pending').on(table.status, table.createdAt),
    index('idx_outbox_event_type').on(table.eventType, table.occurredAt),
    index('idx_outbox_event_aggregate').on(table.aggregateType, table.aggregateId),
  ],
);

export const OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];
export type OutboxEventRow = typeof outboxEvents.$inferSelect;
export type NewOutboxEventRow = typeof outboxEvents.$inferInsert;
