-- IP-013 — Notification & Communication Completion.
-- Aditiva e não destrutiva, no mesmo estilo idempotente de 0024..0030:
-- ADD COLUMN IF NOT EXISTS + CHECK condicional. Reexecutável.
--
-- Não cria tabela nova: a única mudança de esquema é tornar `notifications`
-- "email/push-ready" (canal + status de entrega por linha), sem acionar
-- nenhum provedor de e-mail/push de verdade (fora de escopo desta IP — ver
-- IP-013-COMPLETION-REPORT.md). Hoje só o canal IN_APP é produzido; a
-- criação da linha JÁ É a entrega (`deliveryStatus = 'DELIVERED'` sempre).

-- 1) Canal de entrega do aviso.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "channel" varchar(20) NOT NULL DEFAULT 'IN_APP';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_channel_supported'
  ) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_supported"
      CHECK ("channel" IN ('IN_APP', 'EMAIL', 'PUSH'));
  END IF;
END $$;
--> statement-breakpoint

-- 2) Status de entrega NESTE canal + quando entregou + motivo se falhou.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "delivery_status" varchar(20) NOT NULL DEFAULT 'DELIVERED';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_delivery_status_supported'
  ) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_delivery_status_supported"
      CHECK ("delivery_status" IN ('PENDING', 'DELIVERED', 'FAILED'));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "failed_reason" text;
--> statement-breakpoint

-- 3) Backfill: linhas existentes (todas IN_APP, todas efetivamente entregues
--    no instante da criação) recebem `delivered_at = created_at` em vez de
--    ficar NULL — o DEFAULT do ALTER acima só cobre `channel`/`delivery_status`
--    (colunas NOT NULL), não a timestamp nullable.
UPDATE "notifications" SET "delivered_at" = "created_at" WHERE "delivered_at" IS NULL;
