import {
  char,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOrders } from '../../../marketplace/infrastructure/persistence/marketplace-order.schema';
import { payments } from './payment.schema';

/**
 * IP-008 (PAY-006) — reembolsos, totais ou parciais. `UNIQUE(idempotency_key)`
 * é a garantia final contra reembolso duplicado (mesmo papel de
 * `idx_payment_authorization_idempotency`) — a chave é determinística por
 * gatilho de negócio (`refund:cancel:{orderId}`, `refund:dispute:{decisionId}`),
 * nunca fornecida livremente pelo chamador, porque não há ação humana repetível
 * entre "decidir reembolsar" e "executar o reembolso" (mesmo raciocínio do
 * IP-007 para `payment_incremental_authorizations`).
 *
 * `disputeId` é uma referência solta (sem FK): o Payments não pode depender do
 * schema do Marketplace (PACK-01 §10 — a única direção permitida é leitura via
 * porta, nunca FK cruzando módulo). Serve só de rastreabilidade/auditoria.
 */
export const fundsRefunds = pgTable(
  'funds_refunds',
  {
    id: uuid('id').primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    reason: varchar('reason', { length: 60 }).notNull(),
    reasonDetail: text('reason_detail'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Solto de propósito — ver comentário da tabela. */
    disputeId: uuid('dispute_id'),
    /** PENDING | PROCESSING | COMPLETED | FAILED */
    status: varchar('status', { length: 30 }).notNull(),
    providerId: varchar('provider_id', { length: 60 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    providerRefundId: varchar('provider_refund_id', { length: 200 }),
    providerCode: varchar('provider_code', { length: 100 }),
    message: text('message'),
    /** Resposta do provedor SANITIZADA — nunca dado de cartão (ADR §13). */
    gatewayResponse: jsonb('gateway_response').notNull().default({}),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_funds_refund_idempotency').on(table.idempotencyKey),
    index('idx_funds_refund_payment').on(table.paymentId, table.createdAt),
    index('idx_funds_refund_order').on(table.orderId),
    index('idx_funds_refund_status').on(table.status),
    index('idx_funds_refund_dispute').on(table.disputeId),
  ],
);

export type FundsRefundRow = typeof fundsRefunds.$inferSelect;
