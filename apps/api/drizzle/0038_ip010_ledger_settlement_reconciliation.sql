-- IP-010 — Ledger, Settlement & Reconciliation.
-- Migration aditiva (mesmo estilo de 0024..0037): CREATE TABLE IF NOT EXISTS,
-- índices condicionais, nenhuma tabela existente é alterada/dropada.
--
-- `ledger_entries` é APPEND-ONLY: nenhum código de aplicação executa UPDATE
-- ou DELETE nela (Shared Standards §5 "financial snapshots/history
-- immutable"); um estorno é uma linha nova invertida, nunca uma edição.
--
-- `idx_ledger_entry_dedupe` é a segunda camada de idempotência de posting
-- (a primeira é `processed_events`, já usada por todo `EventConsumer`):
-- reprocessar o mesmo evento de origem para a mesma conta/direção não
-- duplica linha.

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "source_event_id" uuid NOT NULL,
  "source_event_type" varchar(120) NOT NULL,
  "source_aggregate_type" varchar(60) NOT NULL,
  "source_aggregate_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "account" varchar(40) NOT NULL,
  "direction" varchar(6) NOT NULL,
  "amount_cents" numeric(18, 0) NOT NULL,
  "currency" char(3) NOT NULL,
  "posting_group_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ledger_entry_dedupe" ON "ledger_entries" ("source_event_id", "account", "direction");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_entry_payment" ON "ledger_entries" ("payment_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_entry_account" ON "ledger_entries" ("account", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_entry_posting_group" ON "ledger_entries" ("posting_group_id");
