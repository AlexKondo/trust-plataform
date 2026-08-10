import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';

/**
 * Avisos in-app (NTF-001). São **projeção de eventos de domínio**: nenhum
 * módulo de negócio escreve aqui diretamente — tudo chega por consumer, o que
 * mantém a notificação desacoplada e idempotente (dedupe do EventConsumer).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** Ex.: VERIFICATION_APPROVED, OFFER_RECEIVED, ORDER_SCHEDULED. */
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    /** Para onde a tela deve levar quando o aviso é clicado. */
    resourceType: varchar('resource_type', { length: 60 }),
    resourceId: uuid('resource_id'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notification_identity').on(table.identityId, table.createdAt),
    index('idx_notification_unread')
      .on(table.identityId)
      .where(sql`${table.readAt} is null`),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
