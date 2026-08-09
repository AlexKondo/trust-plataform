import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Tabela do módulo Identity (IDN-001). Colunas conforme spec canônica
 * "Create Identity" + terms_accepted_at (evidência do BR-005).
 * identities NUNCA é excluída fisicamente — soft delete via deleted_at.
 */
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [uniqueIndex('idx_identity_email').on(table.email)],
);

export type IdentityRow = typeof identities.$inferSelect;
export type NewIdentityRow = typeof identities.$inferInsert;
