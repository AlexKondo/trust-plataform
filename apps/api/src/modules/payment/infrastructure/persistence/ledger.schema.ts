import { char, index, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * IP-010 — Ledger financeiro imutável (append-only).
 *
 * Cada FATO monetário do domínio (custódia iniciada, liberada, reembolsada)
 * gera EXATAMENTE DUAS linhas aqui: um débito e um crédito de mesmo valor,
 * em contas diferentes (partidas dobradas — Shared Standards §5). Nenhuma
 * linha é jamais UPDATE/DELETE; um estorno é uma NOVA linha invertida.
 *
 * `source_event_id` é o `eventId` do envelope canônico (PACK-00) que originou
 * o lançamento — rastreabilidade fim-a-fim exigida pela spec ("cada linha
 * referencia o evento/entidade de origem"). A unicidade
 * `(source_event_id, account, direction)` é a segunda linha de defesa contra
 * postagem duplicada: a PRIMEIRA é o dedupe transacional do próprio
 * `EventConsumer` (`processed_events`), esta é a garantia no próprio dado,
 * caso algum dia um posting aconteça fora daquele caminho.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey(),
    /** Evento de origem (PACK-00 envelope `eventId`) — nunca nulo: todo lançamento nasce de um fato. */
    sourceEventId: uuid('source_event_id').notNull(),
    sourceEventType: varchar('source_event_type', { length: 120 }).notNull(),
    /** Agregado de origem (ex.: Payment, TrustCustody, FundsRefund) + seu id, para reconciliação. */
    sourceAggregateType: varchar('source_aggregate_type', { length: 60 }).notNull(),
    sourceAggregateId: uuid('source_aggregate_id').notNull(),
    /** Pagamento ao qual este lançamento pertence — todo lançamento é rastreável a UM Payment. */
    paymentId: uuid('payment_id').notNull(),
    /** Conta contábil (dimensão fechada em código — ver `LEDGER_ACCOUNTS`). */
    account: varchar('account', { length: 40 }).notNull(),
    /** DEBIT | CREDIT — partidas dobradas. */
    direction: varchar('direction', { length: 6 }).notNull(),
    amountCents: numeric('amount_cents', { precision: 18, scale: 0 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** Agrupa as N linhas (>= 2) do MESMO fato — todo grupo soma zero (débitos == créditos). */
    postingGroupId: uuid('posting_group_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_ledger_entry_dedupe').on(table.sourceEventId, table.account, table.direction),
    index('idx_ledger_entry_payment').on(table.paymentId, table.createdAt),
    index('idx_ledger_entry_account').on(table.account, table.createdAt),
    index('idx_ledger_entry_posting_group').on(table.postingGroupId),
  ],
);

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
