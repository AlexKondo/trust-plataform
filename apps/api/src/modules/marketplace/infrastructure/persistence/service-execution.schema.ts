import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import { marketplaceOrders } from './marketplace-order.schema';

/**
 * PACK-03 §10 — sessão de execução do serviço.
 *
 * Esta tabela NÃO substitui o check-in/check-out do MRK-020/021: ela é a camada
 * de TEMPO por cima deles. O check-in continua movendo o pedido para
 * IN_PROGRESS pelo `OrderLifecycleService`; a sessão nasce na mesma transação e
 * é quem sabe o que foi pausa e o que é tempo ativo. Por isso a máquina de 13
 * estados do pedido não ganhou PAUSED — pausa é fato da execução, não do pedido.
 *
 * Uma sessão por pedido no MVP (`UNIQUE(order_id)`, §10 e §24).
 */
export const serviceExecutionSessions = pgTable(
  'service_execution_sessions',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => marketplaceOrders.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    /** NOT_STARTED | ACTIVE | PAUSED | COMPLETED */
    status: varchar('status', { length: 20 }).notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true, mode: 'date' }),
    checkInBy: uuid('check_in_by'),
    checkOutAt: timestamp('check_out_at', { withTimezone: true, mode: 'date' }),
    checkOutBy: uuid('check_out_by'),
    /** Tempo decorrido total (check-out − check-in), em minutos (§11). */
    elapsedMinutes: integer('elapsed_minutes'),
    /** Soma das pausas fechadas — tempo NÃO faturável (§10.2/§11). */
    pausedMinutes: integer('paused_minutes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_service_execution_session_order').on(table.orderId)],
);

/**
 * PACK-03 §10.2 — pausas. Append-only por natureza: a pausa nasce aberta e só
 * ganha `resumed_at`. O índice parcial `WHERE resumed_at IS NULL` é a garantia
 * FINAL contra duas pausas abertas na mesma sessão (§19) — a checagem na
 * aplicação é só a mensagem de erro amigável.
 */
export const serviceExecutionPauses = pgTable(
  'service_execution_pauses',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => serviceExecutionSessions.id, {
        onUpdate: 'restrict',
        onDelete: 'restrict',
      }),
    orderId: uuid('order_id').notNull(),
    /** PERSONAL_BREAK | PERSONAL_CALL | MEAL | OTHER_NON_BILLABLE (§10.2) */
    reasonCode: varchar('reason_code', { length: 40 }).notNull(),
    note: text('note'),
    performedBy: uuid('performed_by')
      .notNull()
      .references(() => identities.id, { onUpdate: 'restrict', onDelete: 'restrict' }),
    pausedAt: timestamp('paused_at', { withTimezone: true, mode: 'date' }).notNull(),
    resumedAt: timestamp('resumed_at', { withTimezone: true, mode: 'date' }),
    durationMinutes: integer('duration_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_execution_pause_session').on(table.sessionId, table.pausedAt),
    uniqueIndex('idx_service_execution_pause_open')
      .on(table.sessionId)
      .where(sql`${table.resumedAt} is null`),
  ],
);

export type ServiceExecutionSessionRow = typeof serviceExecutionSessions.$inferSelect;
export type ServiceExecutionPauseRow = typeof serviceExecutionPauses.$inferSelect;
