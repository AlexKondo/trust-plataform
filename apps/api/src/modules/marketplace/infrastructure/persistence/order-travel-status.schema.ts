import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { marketplaceOrders } from './marketplace-order.schema';

/**
 * IP-005 — status de deslocamento do Partner (ver `order-travel-status.ts`).
 * `UNIQUE(order_id)`: um pedido tem no máximo UM registro de deslocamento
 * vivo (ele é mutado em lugar — NOT_STARTED -> EN_ROUTE -> ARRIVED — o próprio
 * status já é a auditoria via `enRouteAt`/`arrivedAt`; o evento de domínio,
 * não esta tabela, é quem carrega o histórico completo de declarações de ETA).
 * Deliberadamente NENHUMA coluna de latitude/longitude aqui — ver o
 * comentário de `TRAVEL_STATUS` em `marketplace-types.ts` para a justificativa
 * completa de privacidade.
 */
export const marketplaceOrderTravelStatuses = pgTable(
  'marketplace_order_travel_statuses',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** NOT_STARTED | EN_ROUTE | ARRIVED */
    status: varchar('status', { length: 20 }).notNull(),
    declaredEtaMinutes: integer('declared_eta_minutes'),
    estimatedArrivalAt: timestamp('estimated_arrival_at', { withTimezone: true, mode: 'date' }),
    /** PARTNER_DECLARED | PROVIDER_COMPUTED (ver EtaEstimatorPort). */
    etaSource: varchar('eta_source', { length: 30 }),
    enRouteAt: timestamp('en_route_at', { withTimezone: true, mode: 'date' }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_order_travel_status_order').on(table.orderId)],
);

export type OrderTravelStatusRow = typeof marketplaceOrderTravelStatuses.$inferSelect;
