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
import { trustChangeOrders } from '../../../marketplace/infrastructure/persistence/trust-change-order.schema';
import { marketplaceOrders } from '../../../marketplace/infrastructure/persistence/marketplace-order.schema';
import { payments } from './payment.schema';

/**
 * IP-007 — tentativa de autorização incremental (PACK-03 §9.1 / `amountAuthorizedNotInCustody`).
 *
 * `UNIQUE(change_order_id)` é a garantia final de "no máximo uma tentativa por
 * Change Order aprovado, para sempre" — mesmo papel que
 * `idx_payment_authorization_idempotency` cumpre para a autorização original,
 * só que aqui a chave de negócio é o próprio Change Order, não uma chave
 * fornecida pelo cliente (não há ação de usuário neste fluxo).
 */
export const paymentIncrementalAuthorizations = pgTable(
  'payment_incremental_authorizations',
  {
    id: uuid('id').primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    changeOrderId: uuid('change_order_id')
      .notNull()
      .references(() => trustChangeOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    providerId: varchar('provider_id', { length: 60 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 200 }),
    authorizationCode: varchar('authorization_code', { length: 100 }),
    /** Sempre o `changeGrossAmount` congelado — nunca redigitado (mandato IP-007 item 1). */
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** APPROVED | DECLINED | ERROR */
    status: varchar('status', { length: 30 }).notNull(),
    providerCode: varchar('provider_code', { length: 100 }),
    message: text('message'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    gatewayResponse: jsonb('gateway_response').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_payment_incremental_authorization_change_order').on(table.changeOrderId),
    uniqueIndex('idx_payment_incremental_authorization_idempotency').on(table.idempotencyKey),
    index('idx_payment_incremental_authorization_payment').on(table.paymentId, table.createdAt),
    index('idx_payment_incremental_authorization_order').on(table.orderId),
    index('idx_payment_incremental_authorization_status').on(table.status),
  ],
);

/**
 * IP-007 — custódia de uma tranche incremental. Tabela PRÓPRIA, não uma
 * segunda linha em `trust_custodies` — ver o comentário de
 * `incremental-trust-custody.ts` para o porquê (aquela tabela tem
 * `UNIQUE(payment_id)`, uma garantia do PACK-01 que esta IP não pode tocar).
 */
export const incrementalTrustCustodies = pgTable(
  'incremental_trust_custodies',
  {
    id: uuid('id').primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    changeOrderId: uuid('change_order_id')
      .notNull()
      .references(() => trustChangeOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    incrementalAuthorizationId: uuid('incremental_authorization_id')
      .notNull()
      .references(() => paymentIncrementalAuthorizations.id, {
        onUpdate: 'restrict',
        onDelete: 'restrict',
      }),
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
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_incremental_trust_custody_change_order').on(table.changeOrderId),
    uniqueIndex('idx_incremental_trust_custody_authorization').on(table.incrementalAuthorizationId),
    index('idx_incremental_trust_custody_payment').on(table.paymentId),
    index('idx_incremental_trust_custody_order').on(table.orderId),
    index('idx_incremental_trust_custody_status').on(table.status),
  ],
);

export type PaymentIncrementalAuthorizationRow = typeof paymentIncrementalAuthorizations.$inferSelect;
export type IncrementalTrustCustodyRow = typeof incrementalTrustCustodies.$inferSelect;
