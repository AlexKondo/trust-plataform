import { char, index, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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

export type PaymentRow = typeof payments.$inferSelect;
