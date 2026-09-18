import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';

/**
 * IP-012 — Trust Points, Referral & Cashback. Ver
 * apps/api/src/modules/growth/domain/entities/*.ts para a justificativa de
 * design de cada tabela (ledger próprio de pontos, regras/campanhas vazias
 * por padrão, anti-abuso de referral). Todas as tabelas nascem VAZIAS —
 * nenhuma regra/campanha é seedada por esta migration (ver Conflict
 * Escalations IP-012-CONFLICT-ESCALATION-*.md).
 */

/** Ledger append-only de pontos — não é o ledger monetário do IP-010 (ver domain/entities/points-ledger-entry.ts). */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    direction: varchar('direction', { length: 10 }).notNull(),
    points: integer('points').notNull(),
    reason: varchar('reason', { length: 120 }).notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    ruleId: uuid('rule_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotência: reprocessar o mesmo evento nunca duplica um lançamento de pontos.
    uniqueIndex('idx_points_ledger_source').on(table.sourceEventId),
    index('idx_points_ledger_identity').on(table.identityId, table.createdAt),
  ],
);

/** Regras de acúmulo (admin-config, VAZIA por padrão). Mesma forma de trust_score_rules. */
export const pointsEarningRules = pgTable(
  'points_earning_rules',
  {
    id: uuid('id').primaryKey(),
    eventName: varchar('event_name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    points: integer('points').notNull(),
    active: boolean('active').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_points_earning_rule_event').on(table.eventName, table.active)],
);

/** Código de referral — 1:1 por Identity. */
export const referralCodes = pgTable(
  'referral_codes',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    code: varchar('code', { length: 12 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_referral_code_identity').on(table.identityId),
    uniqueIndex('idx_referral_code_value').on(table.code),
  ],
);

/**
 * Atribuição referrer→referred. `idx_referral_attribution_referred_unique`
 * é a segunda linha de defesa anti-abuso (primeira é o domínio, ver
 * domain/entities/referral.ts): 1 atribuição por identidade REFERIDA, para
 * sempre — bloqueia tanto auto-referência quanto múltiplas atribuições.
 */
export const referralAttributions = pgTable(
  'referral_attributions',
  {
    id: uuid('id').primaryKey(),
    referralCodeId: uuid('referral_code_id')
      .notNull()
      .references(() => referralCodes.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    referrerIdentityId: uuid('referrer_identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    referredIdentityId: uuid('referred_identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    status: varchar('status', { length: 12 }).notNull().default('PENDING'),
    attributedAt: timestamp('attributed_at', { withTimezone: true, mode: 'date' }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('idx_referral_attribution_referred_unique').on(table.referredIdentityId),
    index('idx_referral_attribution_referrer').on(table.referrerIdentityId, table.status),
  ],
);

/** Campanha de cashback (admin-config, VAZIA por padrão). Percentual em basis points. */
export const cashbackCampaigns = pgTable(
  'cashback_campaigns',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    percentageBps: integer('percentage_bps').notNull(),
    active: boolean('active').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    conditions: jsonb('conditions').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_cashback_campaign_active').on(table.active, table.startsAt, table.endsAt)],
);

export type PointsLedgerRow = typeof pointsLedger.$inferSelect;
export type PointsEarningRuleRow = typeof pointsEarningRules.$inferSelect;
export type ReferralCodeRow = typeof referralCodes.$inferSelect;
export type ReferralAttributionRow = typeof referralAttributions.$inferSelect;
export type CashbackCampaignRow = typeof cashbackCampaigns.$inferSelect;
