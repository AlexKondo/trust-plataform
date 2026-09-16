import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * IP-014 — Risk flags (admin review queue).
 * Um flag NUNCA bloqueia sozinho (§4 out-of-scope: "no black-box blocking
 * without reason/audit") — ele só registra um sinal explicável
 * (`reason` + `signal`) para um humano decidir em `reviewed*`. A trilha é
 * imutável em `audit_logs` (uma entrada é gravada ao levantar e ao revisar);
 * esta tabela é o estado mutável da fila (status/reviewer), não a trilha.
 */
export const riskFlags = pgTable(
  'risk_flags',
  {
    id: uuid('id').primaryKey(),
    /** Tipo da entidade sinalizada — ex.: `TrustChangeOrder`, `Identity`, `MarketplaceReview`. */
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: varchar('entity_id', { length: 120 }).notNull(),
    /** Identity dona/relacionada ao sinal, quando aplicável (para a fila do admin filtrar). */
    subjectIdentityId: uuid('subject_identity_id'),
    /** Código estável da regra determinística que gerou o sinal — nunca ML/score opaco. */
    signal: varchar('signal', { length: 80 }).notNull(),
    /** Explicação legível do porquê (DOC-002: "flags are explainable"). */
    reason: text('reason').notNull(),
    severity: varchar('severity', { length: 20 }).notNull().default('MEDIUM'),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    /** Contexto determinístico que originou o cálculo — nunca dado sensível/PII extra. */
    metadata: jsonb('metadata'),
    raisedAt: timestamp('raised_at', { withTimezone: true, mode: 'date' }).notNull(),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_risk_flag_entity').on(table.entityType, table.entityId),
    index('idx_risk_flag_status').on(table.status, table.raisedAt),
    index('idx_risk_flag_subject').on(table.subjectIdentityId),
  ],
);

export type RiskFlagRow = typeof riskFlags.$inferSelect;
export type NewRiskFlagRow = typeof riskFlags.$inferInsert;
