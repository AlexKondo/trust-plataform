import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from './identities.schema';

/**
 * Tokens de verificação de e-mail (IDN-002). Exceção documentada aos padrões:
 * tabela de token — sem soft delete e sem updated_at; o token em claro nunca
 * é persistido, apenas o SHA-256 (token_hash).
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_email_verification_token_hash').on(table.tokenHash),
    index('idx_email_verification_identity').on(table.identityId, table.createdAt),
  ],
);

export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
