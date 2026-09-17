import { index, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { trustPassports } from '../../../trust-passport/infrastructure/persistence/trust-passports.schema';

/**
 * IP-011 — Trust Signal registry.
 *
 * A "signal" is an OBJECTIVE fact captured from marketplace/execution/payment
 * events that is worth showing on a Trust Timeline/Profile for explainability
 * and anti-gaming visibility, but that has NOT been given an approved
 * Trust Score rule (04_APPROVED_PRODUCT_DECISIONS: "Trust Signals are
 * objective facts; a signal is not automatically fraud" / "Do not
 * auto-penalize Trust Score without an approved deterministic rule").
 *
 * This table is intentionally separate from `trust_events` (TRS-002):
 * `trust_events` is the ONLY input to `calculateScore`/`determineLevel`
 * (golden rule TP-001/003 — only the Trust Engine alters Score/Level).
 * `trust_signals` NEVER feeds the score engine; it is a read-only,
 * append-only, explainable observation log. If a signal is later approved
 * to affect score, the approved path is to add a `trust_score_rules` row
 * for the SAME underlying domain event — never to read from this table.
 *
 * `signal_version` lets the registry (see domain/services/trust-signal-registry.ts)
 * evolve a signal's definition/explanation without breaking already-recorded
 * rows (same idempotency shape as `trust_events.source_event_id`).
 */
export const trustSignals = pgTable(
  'trust_signals',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    identityId: uuid('identity_id').notNull(),
    /** Typed catalog key — see TRUST_SIGNAL_REGISTRY. Never free text. */
    signalType: varchar('signal_type', { length: 80 }).notNull(),
    signalVersion: varchar('signal_version', { length: 10 }).notNull().default('1'),
    /** Underlying domain event this signal was derived from (audit trail). */
    sourceEventId: uuid('source_event_id').notNull(),
    sourceEventName: varchar('source_event_name', { length: 120 }).notNull(),
    payload: jsonb('payload').notNull(),
    /** PUBLIC: safe to show on shared/public profile. PRIVATE: owner-only. */
    visibility: varchar('visibility', { length: 10 }).notNull().default('PRIVATE'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotência: o mesmo evento de origem nunca gera dois sinais (mesmo
    // padrão de `trust_events.source_event_id`).
    uniqueIndex('idx_trust_signal_source').on(table.sourceEventId),
    index('idx_trust_signal_passport').on(table.trustPassportId, table.occurredAt),
  ],
);

export type TrustSignalRow = typeof trustSignals.$inferSelect;
