import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { trustPassports } from '../../../trust-passport/infrastructure/persistence/trust-passports.schema';

/** Catálogo de badges (TRS-012). Critérios JSON (P5) sobre {score, level}. */
export const trustBadges = pgTable(
  'trust_badges',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 60 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull(),
    /** PERMANENT: nunca revogado; DYNAMIC: reflete o estado atual. */
    badgeType: varchar('badge_type', { length: 20 }).notNull(),
    criteria: jsonb('criteria').notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_trust_badge_code').on(table.code)],
);

/** Badges concedidos (TRS-013). Revogação só para DYNAMIC. */
export const awardedBadges = pgTable(
  'awarded_badges',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => trustBadges.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    awardedAt: timestamp('awarded_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_awarded_badge_passport').on(table.trustPassportId),
    uniqueIndex('idx_awarded_badge_active')
      .on(table.trustPassportId, table.badgeId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

/** Políticas de visibilidade do perfil público (TRS-016). 1:1 com o Passport. */
export const trustVisibilityPolicies = pgTable(
  'trust_visibility_policies',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    showScore: boolean('show_score').notNull().default(true),
    showLevel: boolean('show_level').notNull().default(true),
    showBadges: boolean('show_badges').notNull().default(true),
    showVerifications: boolean('show_verifications').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_visibility_passport').on(table.trustPassportId)],
);

/** Links de compartilhamento (TRS-017/019). Token: só o SHA-256 é persistido (P7). */
export const trustProfileShares = pgTable(
  'trust_profile_shares',
  {
    id: uuid('id').primaryKey(),
    trustPassportId: uuid('trust_passport_id')
      .notNull()
      .references(() => trustPassports.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_profile_share_token').on(table.tokenHash),
    index('idx_profile_share_passport').on(table.trustPassportId, table.createdAt),
  ],
);

/** Acessos a perfis compartilhados (TRS-020; nasce com o TRS-017). Append-only. */
export const trustProfileAccessLogs = pgTable(
  'trust_profile_access_logs',
  {
    id: uuid('id').primaryKey(),
    shareId: uuid('share_id')
      .notNull()
      .references(() => trustProfileShares.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    trustPassportId: uuid('trust_passport_id').notNull(),
    accessedAt: timestamp('accessed_at', { withTimezone: true, mode: 'date' }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 500 }),
  },
  (table) => [index('idx_profile_access_share').on(table.shareId, table.accessedAt)],
);

export type TrustBadgeRow = typeof trustBadges.$inferSelect;
export type AwardedBadgeRow = typeof awardedBadges.$inferSelect;
export type VisibilityPolicyRow = typeof trustVisibilityPolicies.$inferSelect;
export type ProfileShareRow = typeof trustProfileShares.$inferSelect;
export type ProfileAccessLogRow = typeof trustProfileAccessLogs.$inferSelect;
