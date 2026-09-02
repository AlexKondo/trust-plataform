import {
  bigint,
  char,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOrders } from './marketplace-order.schema';

/**
 * PACK-03 §6/§7/§8 — Trust Change Order: a única forma de a conta do Trust
 * Member subir depois do contrato fechado.
 *
 * Por que os totais do delta são COLUNAS e não cálculo em tempo de leitura: a
 * taxa aplicada é a congelada no snapshot do PACK-02 (§8). Se recalculássemos
 * na leitura usando a `commercial_policies` vigente, uma mudança futura de
 * Trust Fee reescreveria silenciosamente o passado — exatamente o que o §5
 * proíbe. Depois de APPROVED, esta linha é imutável (§6.1): correção se faz com
 * um Change Order novo, nunca editando este.
 */
export const trustChangeOrders = pgTable(
  'trust_change_orders',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Sempre o Trust Partner: só ele propõe aumento neste Pack (§6.1). */
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** ADDITIONAL_TIME | SCOPE_CHANGE | MATERIAL | MIXED */
    type: varchar('type', { length: 30 }).notNull(),
    /** DRAFT | PENDING_MEMBER_APPROVAL | APPROVED | REJECTED | CANCELLED | EXPIRED */
    status: varchar('status', { length: 30 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** Minutos pedidos em ADDITIONAL_TIME; múltiplo do incremento congelado (§7.1). */
    additionalMinutes: integer('additional_minutes'),
    serviceDeltaAmount: numeric('service_delta_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    /** Pass-through: 0% de Trust Fee (§7.3/§14). */
    materialCostDeltaAmount: numeric('material_cost_delta_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    /** Separado do custo por decisão de política — este SIM entra na base da fee. */
    materialMarkupDeltaAmount: numeric('material_markup_delta_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    /** Cópia da taxa congelada no contrato (§8) — nunca a política global atual. */
    trustFeeRateBps: integer('trust_fee_rate_bps').notNull(),
    changeGrossAmount: numeric('change_gross_amount', { precision: 18, scale: 2 }).notNull(),
    changeTrustFeeBaseAmount: numeric('change_trust_fee_base_amount', {
      precision: 18,
      scale: 2,
    }).notNull(),
    changeTrustFeeAmount: numeric('change_trust_fee_amount', {
      precision: 18,
      scale: 2,
    }).notNull(),
    changeProviderNetBeforePspFees: numeric('change_provider_net_before_psp_fees', {
      precision: 18,
      scale: 2,
    }).notNull(),
    reason: text('reason').notNull(),
    description: text('description'),
    /** Expiração derivada na leitura, sem job — mesmo padrão das propostas (#33). */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decidedBy: uuid('decided_by'),
    decisionReason: text('decision_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_trust_change_order_order').on(table.orderId, table.createdAt),
    index('idx_trust_change_order_status').on(table.orderId, table.status),
    index('idx_trust_change_order_proposer').on(table.proposedBy),
  ],
);

/**
 * PACK-03 §13 — evidências do Change Order (foto do problema, nota do
 * fornecedor). Tabela própria: `verification_evidences` pertence ao agregado
 * Verification (verificação de IDENTIDADE) e reaproveitá-la aqui corromperia a
 * semântica daquele agregado. O que é reaproveitado é a abstração de storage,
 * promovida ao shared kernel. Imutável, como a do VRF: sem updated_at.
 */
export const trustChangeOrderEvidences = pgTable(
  'trust_change_order_evidences',
  {
    id: uuid('id').primaryKey(),
    changeOrderId: uuid('change_order_id')
      .notNull()
      .references(() => trustChangeOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** PHOTO | RECEIPT | QUOTE | DOCUMENT | OTHER */
    type: varchar('type', { length: 40 }).notNull(),
    storageKey: varchar('storage_key', { length: 300 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    uploadedBy: uuid('uploaded_by').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_trust_change_order_evidence_change_order').on(table.changeOrderId)],
);

export type TrustChangeOrderRow = typeof trustChangeOrders.$inferSelect;
export type TrustChangeOrderEvidenceRow = typeof trustChangeOrderEvidences.$inferSelect;
