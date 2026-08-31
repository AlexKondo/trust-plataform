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

/**
 * Pagamento (PAY-001). `UNIQUE(order_id)` garante um pagamento ativo por pedido
 * (BR-001). Valores em `numeric(18,2)` conforme a spec — o domínio trabalha em
 * centavos e converte aqui (skill trust-payments §1).
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    paymentMethodId: uuid('payment_method_id'),
    /** Provedor que executou a autorização — estorno volta para o mesmo. */
    paymentProviderId: varchar('payment_provider_id', { length: 60 }),
    /** Acumulado devolvido; teto para novos reembolsos (PAY-006 BR-005). */
    refundedAmount: numeric('refunded_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_payment_order').on(table.orderId),
    index('idx_payment_buyer').on(table.buyerId, table.createdAt),
    index('idx_payment_seller').on(table.sellerId, table.createdAt),
    index('idx_payment_status').on(table.status),
  ],
);

/**
 * Tentativas de autorização (PAY-002 BR-003: cada tentativa gera um registro).
 *
 * `idempotency_key` é único GLOBALMENTE (PAY-ARCH-001 §9): é ele que impede a
 * segunda cobrança quando o cliente clica duas vezes ou a rede repete a
 * requisição. A spec não previu a coluna; ela existe porque o ADR exige.
 */
export const paymentAuthorizations = pgTable(
  'payment_authorizations',
  {
    id: uuid('id').primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    providerId: varchar('provider_id', { length: 60 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 200 }),
    authorizationCode: varchar('authorization_code', { length: 100 }),
    authorizedAmount: numeric('authorized_amount', { precision: 18, scale: 2 }).notNull(),
    /** APPROVED | DECLINED | ERROR */
    status: varchar('status', { length: 30 }).notNull(),
    providerCode: varchar('provider_code', { length: 100 }),
    message: text('message'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    /** Resposta do provedor SANITIZADA — nunca dado de cartão (ADR §13). */
    gatewayResponse: jsonb('gateway_response').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_payment_authorization_idempotency').on(table.idempotencyKey),
    index('idx_payment_authorization_payment').on(table.paymentId, table.createdAt),
    index('idx_payment_authorization_transaction').on(table.providerTransactionId),
    index('idx_payment_authorization_status').on(table.status),
  ],
);

export type PaymentRow = typeof payments.$inferSelect;
export type PaymentAuthorizationRow = typeof paymentAuthorizations.$inferSelect;

/**
 * Custódia (PAY-003/PAY-004, PACK-01 §13.1).
 *
 * `UNIQUE(payment_id)` é a garantia final de "uma custódia por pagamento"
 * (§6.2) — o consumer é idempotente, mas quem manda é o banco.
 *
 * `amount`/`currency` repetem o tipo de `payments` de propósito: o Pack proíbe
 * um segundo modelo de dinheiro. Domínio em centavos, banco em reais, conversão
 * só no repositório.
 */
export const trustCustodies = pgTable(
  'trust_custodies',
  {
    id: uuid('id').primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** IN_CUSTODY | READY_FOR_RELEASE | RELEASED */
    status: varchar('status', { length: 30 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Só preenchido quando o gateway CONFIRMA a liberação (§6.2). */
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_trust_custody_payment').on(table.paymentId),
    index('idx_trust_custody_order').on(table.orderId),
    index('idx_trust_custody_status').on(table.status),
  ],
);

export type TrustCustodyRow = typeof trustCustodies.$inferSelect;
