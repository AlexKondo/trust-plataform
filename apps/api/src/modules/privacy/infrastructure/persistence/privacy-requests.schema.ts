import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';

/**
 * IP-021 — solicitação de acesso/exclusão de dados (VRF-006-like: dono ou
 * ninguém, não há visão administrativa nesta fundação). O conteúdo
 * exportado/anonimizado NÃO é persistido aqui — só metadados + um resumo de
 * contagens não-sensível (`result_summary`) para auditabilidade sem
 * duplicar PII em repouso.
 */
export const privacyRequests = pgTable(
  'privacy_requests',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** DATA_EXPORT | DATA_DELETION */
    type: varchar('type', { length: 20 }).notNull(),
    /** REQUESTED | PROCESSING | COMPLETED | REJECTED */
    status: varchar('status', { length: 20 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    rejectionReason: varchar('rejection_reason', { length: 60 }),
    resultSummary: jsonb('result_summary'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_privacy_request_identity').on(table.identityId, table.createdAt),
    index('idx_privacy_request_status').on(table.status),
  ],
);

export type PrivacyRequestRow = typeof privacyRequests.$inferSelect;
