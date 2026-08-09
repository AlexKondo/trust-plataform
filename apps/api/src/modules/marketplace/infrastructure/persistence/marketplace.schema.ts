import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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

/**
 * Categorias do Marketplace (suporte a MRK-001 BR-002 e MRK-003 BR-005).
 * A exigência de reputação por categoria mora aqui: é o único ponto onde o
 * Marketplace *consome* o Trust Layer como porteiro (nunca o altera).
 */
export const marketplaceCategories = pgTable(
  'marketplace_categories',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 60 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /** Nível mínimo do anunciante para publicar nesta categoria (null = sem exigência). */
    minimumTrustLevel: varchar('minimum_trust_level', { length: 30 }),
    /** Score mínimo do anunciante para publicar nesta categoria. */
    minimumScore: integer('minimum_score').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_marketplace_category_code').on(table.code)],
);

/**
 * Anúncios (MRK-001..005). Campos de conteúdo são NULLABLE porque o rascunho
 * pode nascer incompleto (MRK-001 BR-004); a obrigatoriedade do BR-002 é
 * cobrada na publicação (MRK-003 BR-003) — ver INCONSISTENCIAS #29.
 */
export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    /** PRODUCT | SERVICE */
    listingType: varchar('listing_type', { length: 30 }),
    categoryId: uuid('category_id').references(() => marketplaceCategories.id, {
      onUpdate: 'restrict',
      onDelete: 'restrict',
    }),
    price: numeric('price', { precision: 18, scale: 2 }),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    /** Texto livre "Cidade/UF" — filtro de busca do MRK-004 (BR-006). */
    location: varchar('location', { length: 160 }),
    /** DRAFT | PUBLISHED | RESERVED | SUSPENDED | EXPIRED | REMOVED */
    status: varchar('status', { length: 30 }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    viewCount: bigint('view_count', { mode: 'number' }).notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_marketplace_listing_owner').on(table.ownerId, table.createdAt),
    index('idx_marketplace_listing_category').on(table.categoryId),
    index('idx_marketplace_listing_status').on(table.status),
    index('idx_marketplace_listing_type').on(table.listingType),
    index('idx_marketplace_listing_price').on(table.price),
    index('idx_marketplace_listing_published').on(table.publishedAt),
    index('idx_marketplace_listing_views').on(table.viewCount),
    // Índice composto da MRK-004 §7 — atende o caminho quente da busca
    index('idx_marketplace_listing_search').on(table.status, table.categoryId, table.publishedAt),
  ],
);

/** Imagens do anúncio (MRK-001/005). MVP: URLs já hospedadas; ordenadas por `position`. */
export const marketplaceListingImages = pgTable(
  'marketplace_listing_images',
  {
    id: uuid('id').primaryKey(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onUpdate: 'restrict', onDelete: 'cascade' }),
    url: varchar('url', { length: 1000 }).notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_marketplace_listing_image').on(table.listingId, table.position)],
);

/**
 * Conversas de negociação (MRK-006/007/008). O índice parcial garante o
 * "reutilizar em vez de duplicar" do MRK-006 BR-005 (INCONSISTENCIAS #9).
 */
export const marketplaceConversations = pgTable(
  'marketplace_conversations',
  {
    id: uuid('id').primaryKey(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** OPEN | CLOSED */
    status: varchar('status', { length: 30 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedBy: uuid('closed_by'),
    closeReason: text('close_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketplace_conversation_listing').on(table.listingId),
    index('idx_marketplace_conversation_seller').on(table.sellerId, table.lastMessageAt),
    index('idx_marketplace_conversation_buyer').on(table.buyerId, table.lastMessageAt),
    index('idx_marketplace_conversation_status').on(table.status),
    uniqueIndex('idx_marketplace_conversation_active')
      .on(table.listingId, table.sellerId, table.buyerId)
      .where(sql`${table.status} = 'OPEN'`),
  ],
);

/** Mensagens (MRK-007). Append-only: nunca editadas nem excluídas (BR-004/005). */
export const marketplaceMessages = pgTable(
  'marketplace_messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => marketplaceConversations.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    message: text('message').notNull(),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketplace_message_conversation').on(table.conversationId, table.sentAt),
    index('idx_marketplace_message_sender').on(table.senderId),
    index('idx_marketplace_message_unread').on(table.conversationId, table.read),
  ],
);

export type MarketplaceCategoryRow = typeof marketplaceCategories.$inferSelect;
export type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;
export type MarketplaceListingImageRow = typeof marketplaceListingImages.$inferSelect;
export type MarketplaceConversationRow = typeof marketplaceConversations.$inferSelect;
export type MarketplaceMessageRow = typeof marketplaceMessages.$inferSelect;
