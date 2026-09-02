import {
  char,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOffers } from './marketplace-offer.schema';
import { marketplaceConversations, marketplaceListings } from './marketplace.schema';

/**
 * Pedido (MRK-015..022) — a entidade que orquestra a execução da transação.
 * Criado **exclusivamente** pelo aceite da proposta, na mesma transação
 * (MRK-013 BR-006/008 + MRK-015 BR-001/007). `UNIQUE(offer_id)` garante um
 * pedido por proposta aceita (BR-002). Dados comerciais são imutáveis
 * (MRK-017 BR-001): só o status e os marcos de execução mudam.
 */
export const marketplaceOrders = pgTable(
  'marketplace_orders',
  {
    id: uuid('id').primaryKey(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => marketplaceOffers.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => marketplaceConversations.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Cópia dos valores da proposta (BR-005): mudanças posteriores não afetam. */
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    /** PACK-02 §4 — copiado do offer aceito; imutável (MRK-017 BR-001). */
    pricingModel: varchar('pricing_model', { length: 20 }).notNull().default('FIXED_PRICE'),
    hourlyRateAmount: numeric('hourly_rate_amount', { precision: 18, scale: 2 }),
    minimumMinutes: integer('minimum_minutes'),
    billingIncrementMinutes: integer('billing_increment_minutes'),
    status: varchar('status', { length: 40 }).notNull(),
    // Marcos do ciclo de vida (MRK-018/020/021/022) — nenhum é apagável
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    startedBy: uuid('started_by'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    completedBy: uuid('completed_by'),
    /** Duração efetiva em minutos, do check-in ao check-out (MRK-021 BR-004). */
    actualDuration: integer('actual_duration'),
    customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true, mode: 'date' }),
    customerConfirmedBy: uuid('customer_confirmed_by'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelledBy: uuid('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_order_offer').on(table.offerId),
    index('idx_marketplace_order_buyer').on(table.buyerId, table.createdAt),
    index('idx_marketplace_order_seller').on(table.sellerId, table.createdAt),
    index('idx_marketplace_order_status').on(table.status),
    index('idx_marketplace_order_listing').on(table.listingId),
  ],
);

/**
 * Agendamento (MRK-019). `UNIQUE(order_id)` porque o MVP não tem reagendamento
 * (INCONSISTENCIAS #26); quando entrar, vira parcial `WHERE status = 'ACTIVE'`.
 */
export const marketplaceOrderSchedulings = pgTable(
  'marketplace_order_schedulings',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true, mode: 'date' }).notNull(),
    /** Duração prevista em minutos (MRK-019 BR-002/003). */
    estimatedDuration: integer('estimated_duration').notNull(),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true, mode: 'date' }).notNull(),
    timezone: varchar('timezone', { length: 50 }).notNull(),
    /** ACTIVE | CANCELLED */
    status: varchar('status', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_scheduling_order').on(table.orderId),
    index('idx_marketplace_scheduling_start').on(table.scheduledStart),
    index('idx_marketplace_scheduling_status').on(table.status),
  ],
);

/**
 * Linha do tempo da execução (MRK-020/021). Uma única tabela para CHECK_IN e
 * CHECK_OUT — a `marketplace_order_checkins` do MRK-020 é um subconjunto desta
 * (INCONSISTENCIAS #35). Append-only: registros nunca são excluídos (BR-007).
 * Fotos/vídeos ficam no futuro módulo de Evidências, referenciados por id.
 */
export const marketplaceOrderExecutionEvents = pgTable(
  'marketplace_order_execution_events',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** CHECK_IN | CHECK_OUT */
    eventType: varchar('event_type', { length: 30 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    performedBy: uuid('performed_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    accuracy: numeric('accuracy', { precision: 8, scale: 2 }),
    address: text('address'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketplace_execution_order').on(table.orderId, table.occurredAt),
    index('idx_marketplace_execution_type').on(table.eventType),
  ],
);

/** Confirmação do cliente (MRK-022). Permanente: nunca excluída (BR-008). */
export const marketplaceConfirmations = pgTable(
  'marketplace_confirmations',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    confirmedBy: uuid('confirmed_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }).notNull(),
    comments: text('comments'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_confirmation_order').on(table.orderId),
    index('idx_marketplace_confirmation_at').on(table.confirmedAt),
  ],
);

export type MarketplaceOrderRow = typeof marketplaceOrders.$inferSelect;
export type MarketplaceSchedulingRow = typeof marketplaceOrderSchedulings.$inferSelect;
export type MarketplaceExecutionEventRow = typeof marketplaceOrderExecutionEvents.$inferSelect;
export type MarketplaceConfirmationRow = typeof marketplaceConfirmations.$inferSelect;
