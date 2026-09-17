import { index, jsonb, pgTable, text, timestamp, uuid, varchar, boolean } from 'drizzle-orm/pg-core';
import { identities } from '../../../../identity/infrastructure/persistence/identities.schema';

/**
 * IP-023 — assinatura de webhook OUTBOUND administrada por um admin da
 * plataforma para um parceiro externo (ID-006/§4 "no hidden admin bypass" —
 * só `AdminGuard`, nunca o próprio dono do recurso assinado, que não existe
 * como ator nesta IP).
 *
 * Rotação de segredo: modelo "dois segredos ativos" (`secretActive` +
 * `secretPrevious`). `secretActive` é o único usado para ASSINAR novas
 * entregas; `secretPrevious` fica preservado só como referência de
 * verificação/depuração até o admin confirmar a rotação (endpoint
 * `POST /admin/webhooks/subscriptions/:id/rotate-secret`, que desloca o
 * segredo atual para `secretPrevious` e gera um novo `secretActive`) — ver
 * Completion Report §"Secret rotation" para o racional completo.
 *
 * Segredos NUNCA aparecem em `GET` depois da criação/rotação — só na
 * resposta do próprio `POST`/`rotate-secret` (mostrados uma única vez).
 */
export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey(),
    url: text('url').notNull(),
    description: varchar('description', { length: 200 }),
    /** Subconjunto da allowlist (`WEBHOOK_ALLOWED_EVENT_TYPES`) — nunca validado contra "todo o catálogo". */
    eventTypes: jsonb('event_types').notNull().$type<string[]>(),
    secretActive: text('secret_active').notNull(),
    secretPrevious: text('secret_previous'),
    secretRotatedAt: timestamp('secret_rotated_at', { withTimezone: true, mode: 'date' }),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_webhook_subscription_active').on(table.active),
  ],
);

export type WebhookSubscriptionRow = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscriptionRow = typeof webhookSubscriptions.$inferInsert;
