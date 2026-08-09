import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Trilha de auditoria imutável (DOC-002/006 — INCONSISTENCIAS #14).
 * Append-only: UPDATE/DELETE são bloqueados por trigger na migration.
 * Exceção documentada aos padrões de tabela: sem updated_at e sem soft delete,
 * porque registros de auditoria nunca mudam nem são excluídos.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id'),
    operation: varchar('operation', { length: 120 }).notNull(),
    resource: varchar('resource', { length: 120 }).notNull(),
    resourceId: varchar('resource_id', { length: 120 }),
    result: varchar('result', { length: 30 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    correlationId: uuid('correlation_id'),
    requestId: uuid('request_id'),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_audit_log_identity').on(table.identityId, table.occurredAt),
    index('idx_audit_log_operation').on(table.operation, table.occurredAt),
    index('idx_audit_log_correlation').on(table.correlationId),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
