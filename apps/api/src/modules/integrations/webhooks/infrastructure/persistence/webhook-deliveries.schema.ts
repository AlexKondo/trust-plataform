import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { webhookSubscriptions } from './webhook-subscriptions.schema';

/**
 * IP-023 — rastreio de entrega por (assinatura, evento). Uma linha por par;
 * `attempts` incrementa a cada tentativa (retry). Estados terminais:
 * `SUCCESS` (2xx do parceiro) e `DEAD_LETTER` (excedeu
 * `WEBHOOK_MAX_DELIVERY_ATTEMPTS`, ver `webhook-delivery.constants.ts`) —
 * visíveis via `GET /admin/webhooks/deliveries` (não há descarte silencioso,
 * critério de aceite do IP-023: "DLQ ... visible via admin API").
 */
export const WEBHOOK_DELIVERY_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  DEAD_LETTER: 'DEAD_LETTER',
} as const;

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => webhookSubscriptions.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    payloadVersion: varchar('payload_version', { length: 10 }).notNull().default('1'),
    status: varchar('status', { length: 20 }).notNull().default(WEBHOOK_DELIVERY_STATUS.PENDING),
    attempts: integer('attempts').notNull().default(0),
    responseStatus: integer('response_status'),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_webhook_delivery_subscription_event').on(table.subscriptionId, table.eventId),
    index('idx_webhook_delivery_status').on(table.status),
  ],
);

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert;
