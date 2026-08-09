import {
  boolean,
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
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { trustPassports } from '../../../trust-passport/infrastructure/persistence/trust-passports.schema';

/** Score consolidado (TRS-001): 1:1 com o Passport; escala 0–1000 (P4). */
export const trustScores = pgTable(
  'trust_scores',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    score: integer('score').notNull().default(0),
    level: varchar('level', { length: 30 }).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_trust_score_passport').on(table.trustPassportId)],
);

/**
 * Event store imutável do Trust Engine (TRS-002). `source_event_id` único =
 * idempotência; `points` registra o efeito da regra vigente no momento
 * (explicabilidade); rebuild (TRS-007) poderá reprocessar com regras atuais.
 */
export const trustEvents = pgTable(
  'trust_events',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    identityId: uuid('identity_id').notNull(),
    eventName: varchar('event_name', { length: 120 }).notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    payload: jsonb('payload').notNull(),
    ruleId: uuid('rule_id'),
    points: integer('points').notNull().default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_trust_event_source').on(table.sourceEventId),
    index('idx_trust_event_passport').on(table.trustPassportId, table.occurredAt),
  ],
);

/** Regras de pontuação (TRS-009, P5): condição JSON [{field, op, value}] com AND. */
export const trustScoreRules = pgTable(
  'trust_score_rules',
  {
    id: uuid('id').primaryKey(),
    eventName: varchar('event_name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    points: integer('points').notNull(),
    conditions: jsonb('conditions').notNull().default([]),
    /** Máximo de vezes que a regra pontua por passport (null = ilimitado). */
    maxOccurrences: integer('max_occurrences'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_trust_score_rule_event').on(table.eventName, table.active)],
);

/** Faixas de nível (TRS-008, P4) — dados, ajustáveis sem código. */
export const trustLevelRules = pgTable(
  'trust_level_rules',
  {
    id: uuid('id').primaryKey(),
    level: varchar('level', { length: 30 }).notNull(),
    minScore: integer('min_score').notNull(),
    maxScore: integer('max_score').notNull(),
    rank: integer('rank').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_trust_level_rule_level').on(table.level)],
);

/** Histórico de mudanças de nível (TRS-004). Append-only. */
export const trustLevelHistory = pgTable(
  'trust_level_history',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    previousLevel: varchar('previous_level', { length: 30 }),
    newLevel: varchar('new_level', { length: 30 }).notNull(),
    score: integer('score').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('idx_trust_level_history_passport').on(table.trustPassportId, table.changedAt)],
);

/**
 * Benefícios por nível/score (TRS-010/011). Elegibilidade avaliada ON-DEMAND
 * contra {score, level} — nada é "concedido"/persistido por usuário.
 */
export const trustBenefits = pgTable(
  'trust_benefits',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    /** Condições JSON (P5) sobre {score, level} — mesma semântica das score rules. */
    eligibility: jsonb('eligibility').notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_trust_benefit_active').on(table.active)],
);

export type TrustBenefitRow = typeof trustBenefits.$inferSelect;
export type TrustScoreRow = typeof trustScores.$inferSelect;
export type TrustEventRow = typeof trustEvents.$inferSelect;
export type TrustScoreRuleRow = typeof trustScoreRules.$inferSelect;
export type TrustLevelRuleRow = typeof trustLevelRules.$inferSelect;
