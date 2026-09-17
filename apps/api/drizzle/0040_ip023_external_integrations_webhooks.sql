-- IP-023 — External Integrations & Webhooks (outbound webhook foundation).
-- Aditiva: CREATE TABLE IF NOT EXISTS, FK guardada por DO $$ ... information_schema —
-- mesmo estilo de 0024..0039. Nenhum DROP/ALTER destrutivo.

-- 1) Assinatura de webhook administrada por admin (AdminGuard). Segredo de
-- assinatura em texto plano (necessário para HMAC na entrega) — nunca
-- retornado por GET (ver WebhookSubscriptionService.toView).
CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "description" varchar(200),
  "event_types" jsonb NOT NULL,
  "secret_active" text NOT NULL,
  "secret_previous" text,
  "secret_rotated_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'webhook_subscriptions_created_by_identities_id_fk'
  ) THEN
    ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_identities_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_subscription_active" ON "webhook_subscriptions" ("active");
--> statement-breakpoint

-- 2) Rastreio de entrega por (assinatura, evento) — retry/DLQ, visível pelo
-- admin (§"Retries/DLQ" do IP-023: "do not silently drop").
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY NOT NULL,
  "subscription_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "payload_version" varchar(10) DEFAULT '1' NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "response_status" integer,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'webhook_deliveries_subscription_id_webhook_subscriptions_id_fk'
  ) THEN
    ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_webhook_subscriptions_id_fk"
      FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
-- Idempotência de retry: uma linha por (assinatura, evento) — reentrega do
-- outbox faz UPDATE, nunca duplica.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_webhook_delivery_subscription_event" ON "webhook_deliveries" ("subscription_id", "event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_delivery_status" ON "webhook_deliveries" ("status");
