import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from './identities.schema';

/**
 * Tokens de recuperação de senha (IDN-007/008). Exceção documentada:
 * tabela de token — sem soft delete e sem updated_at; apenas o SHA-256 é persistido.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_password_reset_token_hash').on(table.tokenHash),
    index('idx_password_reset_identity').on(table.identityId, table.createdAt),
    index('idx_password_reset_expires').on(table.expiresAt),
  ],
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
