import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOrders } from './marketplace-order.schema';

/**
 * Disputas (MRK-023/024). O índice parcial garante **uma disputa ativa por
 * pedido** (BR-002): OPEN, IN_ANALYSIS e MEDIATION são estados vivos; RESOLVED
 * libera o pedido para uma eventual nova disputa.
 */
export const marketplaceDisputes = pgTable(
  'marketplace_disputes',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    category: varchar('category', { length: 100 }).notNull(),
    description: text('description').notNull(),
    /** OPEN | IN_ANALYSIS | MEDIATION | RESOLVED */
    status: varchar('status', { length: 30 }).notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Preenchido na resolução (MRK-024); a decisão em si é imutável. */
    decisionId: uuid('decision_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_marketplace_dispute_order').on(table.orderId),
    index('idx_marketplace_dispute_status').on(table.status, table.openedAt),
    uniqueIndex('idx_marketplace_dispute_active')
      .on(table.orderId)
      .where(sql`${table.status} in ('OPEN', 'IN_ANALYSIS', 'MEDIATION')`),
  ],
);

/**
 * Decisão da disputa (MRK-024). Append-only: permanente e nunca alterada
 * (BR-006) — revisão exige recurso, que é evolução futura.
 */
export const marketplaceDisputeDecisions = pgTable(
  'marketplace_dispute_decisions',
  {
    id: uuid('id').primaryKey(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => marketplaceDisputes.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    decidedBy: uuid('decided_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** UPHELD | PARTIALLY_UPHELD | REJECTED | SETTLED | CANCELLED */
    decisionType: varchar('decision_type', { length: 50 }).notNull(),
    justification: text('justification').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_decision_dispute').on(table.disputeId),
    index('idx_marketplace_decision_at').on(table.decidedAt),
  ],
);

/**
 * Avaliações da transação (MRK-025). `UNIQUE(order_id, reviewer_id)` garante uma
 * avaliação por participante por pedido (BR-002). Imutável após o registro
 * (BR-007) — é o insumo público da reputação.
 */
export const marketplaceReviews = pgTable(
  'marketplace_reviews',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    reviewedUserId: uuid('reviewed_user_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Nota geral 1–5 (BR-004) — único campo obrigatório. */
    overallScore: smallint('overall_score').notNull(),
    recommended: boolean('recommended'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_review_order_reviewer').on(table.orderId, table.reviewerId),
    index('idx_marketplace_review_reviewed').on(table.reviewedUserId, table.createdAt),
    index('idx_marketplace_review_score').on(table.overallScore),
  ],
);

/**
 * Notas por critério (MRK-025 BR-005). Tabela em vez de colunas fixas porque os
 * critérios são configuráveis pela Administração — acrescentar um critério novo
 * não deve exigir migration.
 */
export const marketplaceReviewScores = pgTable(
  'marketplace_review_scores',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => marketplaceReviews.id, { onUpdate: 'restrict', onDelete: 'cascade' }),
    criterion: varchar('criterion', { length: 100 }).notNull(),
    score: smallint('score').notNull(),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.criterion] })],
);

export type MarketplaceDisputeRow = typeof marketplaceDisputes.$inferSelect;
export type MarketplaceDisputeDecisionRow = typeof marketplaceDisputeDecisions.$inferSelect;
export type MarketplaceReviewRow = typeof marketplaceReviews.$inferSelect;
export type MarketplaceReviewScoreRow = typeof marketplaceReviewScores.$inferSelect;
