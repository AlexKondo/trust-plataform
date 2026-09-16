import { index, numeric, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceCategories, marketplaceConversations, marketplaceListings } from './marketplace.schema';

/**
 * IP-003 — pedido de serviço do Trust Member. `location_label` é
 * deliberadamente texto livre e grosseiro ("Bairro, Cidade/UF"), o MESMO
 * formato que `marketplace_listings.location` já usa (MRK-004) — não existe
 * coluna de latitude/longitude neste agregado. Isto NÃO é porque nenhuma
 * coordenada de Partner exista no repositório (existe: eventos de execução em
 * campo, `marketplace_order_execution_events`, migration 0017); é porque não
 * existe um perfil de localização do Partner PRÉ-engajamento que sustente
 * matching prospectivo — ver `service-request.ts`, bloco de comentário no
 * topo, para a justificativa completa.
 */
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => marketplaceCategories.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    locationLabel: varchar('location_label', { length: 160 }).notNull(),
    radiusKm: smallint('radius_km'),
    /** ASAP | THIS_WEEK | FLEXIBLE */
    urgency: varchar('urgency', { length: 20 }).notNull(),
    preferredDate: timestamp('preferred_date', { withTimezone: true, mode: 'date' }),
    budgetMinAmount: numeric('budget_min_amount', { precision: 18, scale: 2 }),
    budgetMaxAmount: numeric('budget_max_amount', { precision: 18, scale: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    minimumTrustLevel: varchar('minimum_trust_level', { length: 30 }),
    /** OPEN | MATCHED | CLOSED | CANCELLED — EXPIRED é sempre derivado de expires_at, nunca gravado. */
    status: varchar('status', { length: 20 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    matchedAt: timestamp('matched_at', { withTimezone: true, mode: 'date' }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    closedBy: uuid('closed_by'),
    closeReason: text('close_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelledBy: uuid('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_request_member').on(table.memberId, table.createdAt),
    index('idx_service_request_category').on(table.categoryId),
    index('idx_service_request_status').on(table.status),
  ],
);

/**
 * Liga um ServiceRequest a UMA conversa (MarketplaceConversation, já
 * existente) com um Partner específico. Não é reescrito — um engajamento é um
 * fato, não um estado; `UNIQUE(service_request_id, listing_id)` é a mesma
 * garantia "reutilizar, nunca duplicar" que `idx_marketplace_conversation_active`
 * já usa para a conversa em si (MRK-006 BR-005).
 */
export const serviceRequestEngagements = pgTable(
  'service_request_engagements',
  {
    id: uuid('id').primaryKey(),
    serviceRequestId: uuid('service_request_id')
      .notNull()
      .references(() => serviceRequests.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => marketplaceConversations.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    engagedBy: uuid('engaged_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    engagedAt: timestamp('engaged_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_service_request_engagement_unique').on(table.serviceRequestId, table.listingId),
    index('idx_service_request_engagement_request').on(table.serviceRequestId),
    index('idx_service_request_engagement_conversation').on(table.conversationId),
  ],
);

export type ServiceRequestRow = typeof serviceRequests.$inferSelect;
export type ServiceRequestEngagementRow = typeof serviceRequestEngagements.$inferSelect;
