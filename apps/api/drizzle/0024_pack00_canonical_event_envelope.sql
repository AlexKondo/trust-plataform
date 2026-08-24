-- PACK-00 v1.1 §5/§11 — envelope canônico de eventos no Transactional Outbox.
-- NÃO destrutiva: `event_name` é RENOMEADA (dados preservados) e a identidade de
-- agregado entra como colunas anuláveis, porque o Pack proíbe fabricar
-- aggregateType/aggregateId para eventos históricos.
-- Todos os passos são guardados para permitir reexecução segura.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbox_events' AND column_name = 'event_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'outbox_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE "outbox_events" RENAME COLUMN "event_name" TO "event_type";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "aggregate_type" varchar(60);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "aggregate_id" varchar(64);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_outbox_event_name')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_outbox_event_type') THEN
    ALTER INDEX "idx_outbox_event_name" RENAME TO "idx_outbox_event_type";
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_event_type" ON "outbox_events" ("event_type","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_event_aggregate" ON "outbox_events" ("aggregate_type","aggregate_id");
