import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from './identities.schema';

/**
 * Sessões autenticadas (IDN-003). Exceções documentadas aos padrões:
 * usa revoked_at em vez de deleted_at; o refresh token nunca é persistido
 * em claro — apenas o SHA-256 (P7/DOC-002).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull(),
    accessTokenId: uuid('access_token_id').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastAccessAt: timestamp('last_access_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('idx_session_refresh_token_hash').on(table.refreshTokenHash),
    index('idx_session_identity').on(table.identityId, table.createdAt),
    index('idx_session_expires').on(table.expiresAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
