-- PACK-02 §13 — Commercial Amount & Fee Foundation.
-- Aditiva e não destrutiva: só ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
-- EXISTS / seed condicional. Reexecutável com segurança, no mesmo estilo das
-- migrations 0024/0025.

-- 1) Proposta (marketplace_offers) ganha o modelo comercial (§4/§9).
ALTER TABLE "marketplace_offers" ADD COLUMN IF NOT EXISTS "pricing_model" varchar(20) NOT NULL DEFAULT 'FIXED_PRICE';
--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD COLUMN IF NOT EXISTS "hourly_rate_amount" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD COLUMN IF NOT EXISTS "minimum_minutes" integer;
--> statement-breakpoint
ALTER TABLE "marketplace_offers" ADD COLUMN IF NOT EXISTS "billing_increment_minutes" integer;
--> statement-breakpoint

-- 2) Pedido (marketplace_orders) recebe a mesma cópia imutável (MRK-017 BR-001).
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "pricing_model" varchar(20) NOT NULL DEFAULT 'FIXED_PRICE';
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "hourly_rate_amount" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "minimum_minutes" integer;
--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN IF NOT EXISTS "billing_increment_minutes" integer;
--> statement-breakpoint

-- 3) Política comercial (§6/§16) — Trust Fee configurável + incremento padrão
-- HOURLY. Append-only por design: NUNCA fazer UPDATE aqui; cada mudança de
-- política é uma linha nova, e a política vigente é a de created_at mais
-- recente. O histórico da própria tabela já satisfaz a auditabilidade de
-- mudanças futuras de configuração global.
CREATE TABLE IF NOT EXISTS "commercial_policies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "trust_fee_rate_bps" integer NOT NULL,
  "default_billing_increment_minutes" integer DEFAULT 30 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 4) Snapshot econômico imutável do Trust Contract (§7/§8), um por pedido.
CREATE TABLE IF NOT EXISTS "marketplace_order_commercial_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "pricing_model" varchar(20) NOT NULL,
  "currency" char(3) NOT NULL,
  "gross_amount" numeric(18, 2) NOT NULL,
  "service_amount" numeric(18, 2) NOT NULL,
  "material_cost_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
  "material_markup_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
  "trust_fee_rate_bps" integer NOT NULL,
  "trust_fee_base_amount" numeric(18, 2) NOT NULL,
  "trust_fee_amount" numeric(18, 2) NOT NULL,
  "provider_net_before_psp_fees" numeric(18, 2) NOT NULL,
  "hourly_rate_amount" numeric(18, 2),
  "minimum_minutes" integer,
  "billing_increment_minutes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'marketplace_order_commercial_snapshots_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "marketplace_order_commercial_snapshots" ADD CONSTRAINT "marketplace_order_commercial_snapshots_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_order_commercial_snapshot_order" ON "marketplace_order_commercial_snapshots" ("order_id");
--> statement-breakpoint

-- 5) Seed técnico da política comercial: 10% (1000 bps) + 30min padrão.
-- NÃO é uma decisão de negócio validada pelo founder/Kondo — é um placeholder
-- técnico para o MVP funcionar (mesmo padrão do seed de 10% já aceito no
-- PACK-01). Ver PACK-02-COMPLETION-REPORT.md § Deviations/Decisions.
-- Sem constraint natural para idempotência (não há UNIQUE em commercial_policies
-- por design — é append-only), então o seed condiciona em "tabela vazia".
INSERT INTO "commercial_policies" ("id", "trust_fee_rate_bps", "default_billing_increment_minutes")
SELECT gen_random_uuid(), 1000, 30
WHERE NOT EXISTS (SELECT 1 FROM "commercial_policies");
