import { pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Dedupe de consumo de eventos (DOC-005: consumers idempotentes, at-least-once).
 * PK composta (consumer, event) — cada consumer processa cada evento no máximo 1 vez.
 * A inserção acontece NA MESMA transação do efeito do consumer.
 */
export const processedEvents = pgTable(
  'processed_events',
  {
    consumerName: varchar('consumer_name', { length: 120 }).notNull(),
    eventId: uuid('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.consumerName, table.eventId] })],
);
