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
    /**
     * IP-002 — locale do destinatário resolvido no momento em que o aviso
     * nasce (preferência salva → PT-BR default). O texto em si ainda só
     * existe em PT-BR (catálogo NTF-001 é conteúdo pré-existente, fora do
     * escopo desta fundação), mas o campo já deixa a renderização localizada
     * pronta para entrar sem mais uma migration.
     */
    locale: varchar('locale', { length: 10 }).notNull().default('pt-BR'),
    /**
     * IP-013 — por qual canal este aviso foi (ou será) entregue. Hoje só
     * IN_APP nasce de verdade (a criação da linha JÁ É a entrega); EMAIL/PUSH
     * são valores estruturalmente aceitos para um adapter futuro gravar aqui
     * sem precisar de outra migration — nenhum provedor de e-mail/push é
     * chamado por este módulo (fora de escopo, ver notification-types.ts).
     */
    channel: varchar('channel', { length: 20 }).notNull().default('IN_APP'),
    /**
     * IP-013 — status de entrega do aviso NESTE canal. IN_APP é sempre
     * DELIVERED no instante da criação (não existe "enviar" separado de
     * "criar" para um aviso in-app); PENDING/FAILED existem para um canal
     * assíncrono (EMAIL/PUSH) que ainda não está implementado.
     */
    deliveryStatus: varchar('delivery_status', { length: 20 }).notNull().default('DELIVERED'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    /** Motivo da falha de entrega quando deliveryStatus = FAILED (canal futuro). */
    failedReason: text('failed_reason'),
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
