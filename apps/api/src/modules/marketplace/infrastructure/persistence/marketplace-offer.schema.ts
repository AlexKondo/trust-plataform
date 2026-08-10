import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  char,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceConversations, marketplaceListings } from './marketplace.schema';

/**
 * Propostas da negociação (MRK-009..014).
 * `parent_offer_id` encadeia a rodada anterior (MRK-012 BR-004): o histórico
 * completo da negociação é a cadeia de ofertas, nunca sobrescrita.
 * Estados: PENDING, ACCEPTED, REJECTED, WITHDRAWN, COUNTERED, EXPIRED, CLOSED
 * (não existe CANCELLED — INCONSISTENCIAS #10).
 */
export const marketplaceOffers = pgTable(
  'marketplace_offers',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => marketplaceConversations.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Quem propôs esta rodada: comprador (MRK-009) ou vendedor (MRK-012). */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    parentOfferId: uuid('parent_offer_id').references((): AnyPgColumn => marketplaceOffers.id, {
      onUpdate: 'restrict',
      onDelete: 'restrict',
    }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    notes: text('notes'),
    // Desfecho: só um dos três blocos abaixo é preenchido, conforme o estado final
    withdrewAt: timestamp('withdrew_at', { withTimezone: true, mode: 'date' }),
    withdrewBy: uuid('withdrew_by'),
    withdrawReason: text('withdraw_reason'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
    rejectedBy: uuid('rejected_by'),
    rejectReason: text('reject_reason'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    acceptedBy: uuid('accepted_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketplace_offer_conversation').on(table.conversationId, table.createdAt),
    index('idx_marketplace_offer_listing').on(table.listingId),
    index('idx_marketplace_offer_buyer').on(table.buyerId),
    index('idx_marketplace_offer_seller').on(table.sellerId),
    index('idx_marketplace_offer_status').on(table.status),
    index('idx_marketplace_offer_expires').on(table.expiresAt),
    index('idx_marketplace_offer_parent').on(table.parentOfferId),
  ],
);

/**
 * Pedido (MRK-015). Criado **exclusivamente** pelo aceite da proposta, na mesma
 * transação (MRK-013 BR-006/008 + MRK-015 BR-001/007) — não existe endpoint de
 * criação. `UNIQUE(offer_id)` garante 1 pedido por proposta aceita (BR-002).
 * A máquina de 13 estados e as demais colunas chegam no Módulo 8.
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
    status: varchar('status', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_order_offer').on(table.offerId),
    index('idx_marketplace_order_buyer').on(table.buyerId, table.createdAt),
    index('idx_marketplace_order_seller').on(table.sellerId, table.createdAt),
    index('idx_marketplace_order_status').on(table.status),
  ],
);

export type MarketplaceOfferRow = typeof marketplaceOffers.$inferSelect;
export type MarketplaceOrderRow = typeof marketplaceOrders.$inferSelect;
