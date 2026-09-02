import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * PACK-02 §6/§16 — política comercial (Trust Fee em basis points + incremento
 * padrão de cobrança HOURLY em minutos).
 *
 * Append-only por design: NUNCA fazer UPDATE nesta tabela — cada mudança de
 * política é uma linha nova; a política "vigente" é sempre a de `created_at`
 * mais recente (ver `DrizzleCommercialPolicyRepository.findActive`). Isso por
 * si só satisfaz a exigência de auditabilidade de mudanças futuras de
 * configuração global (§16): o histórico é a própria tabela.
 *
 * A seed técnica de 10% (1000 bps) inserida na migration 0026 NÃO é uma
 * decisão de negócio — ver PACK-02-COMPLETION-REPORT.md.
 */
export const commercialPolicies = pgTable('commercial_policies', {
  id: uuid('id').primaryKey(),
  trustFeeRateBps: integer('trust_fee_rate_bps').notNull(),
  defaultBillingIncrementMinutes: integer('default_billing_increment_minutes')
    .notNull()
    .default(30),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type CommercialPolicyRow = typeof commercialPolicies.$inferSelect;
