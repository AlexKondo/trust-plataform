-- IP-012 — Trust Points, Benefits, Referral & Cashback.
-- Aditiva e não destrutiva: CREATE TABLE IF NOT EXISTS, índices condicionais,
-- FK guardada por DO $$ ... information_schema — mesmo estilo de 0024..0040.
-- Nenhum ALTER destrutivo, nenhum DROP. Benefits (trust_benefits) NÃO é
-- tocado por esta migration — TRS-010/011 é reusado como está (VERIFY_ONLY).
--
-- Todas as tabelas abaixo nascem VAZIAS. Nenhuma linha é seedada: nenhuma
-- regra de pontos, nenhuma campanha de cashback existe até um admin criar
-- uma explicitamente (ver Conflict Escalations IP-012-CONFLICT-ESCALATION-*.md
-- e IP-012-COMPLETION-REPORT.md).

-- 1) Trust Points — ledger próprio (não o ledger monetário do IP-010; ver
-- apps/api/src/modules/growth/domain/entities/points-ledger-entry.ts para a
-- justificativa de design).
CREATE TABLE IF NOT EXISTS "points_ledger" (
  "id" uuid PRIMARY KEY NOT NULL,
  "identity_id" uuid NOT NULL,
  "direction" varchar(10) NOT NULL,
  "points" integer NOT NULL,
  "reason" varchar(120) NOT NULL,
  "source_event_id" uuid NOT NULL,
  "rule_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'points_ledger_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_identity_id_identities_id_fk"
      FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
-- Idempotência: reprocessar o mesmo evento de origem nunca duplica um lançamento de pontos.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_points_ledger_source" ON "points_ledger" ("source_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_points_ledger_identity" ON "points_ledger" ("identity_id", "created_at");
--> statement-breakpoint

-- 2) Regras de acúmulo de pontos — admin-config, VAZIA por padrão (`active`
-- default false: nenhuma regra dispara até um admin ligar explicitamente).
CREATE TABLE IF NOT EXISTS "points_earning_rules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_name" varchar(120) NOT NULL,
  "description" text NOT NULL,
  "points" integer NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_points_earning_rule_event" ON "points_earning_rules" ("event_name", "active");
--> statement-breakpoint

-- 3) Referral — código 1:1 por Identity.
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "identity_id" uuid NOT NULL,
  "code" varchar(12) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_codes_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_identity_id_identities_id_fk"
      FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_code_identity" ON "referral_codes" ("identity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_code_value" ON "referral_codes" ("code");
--> statement-breakpoint

-- 4) Referral attribution — anti-abuso: 1 atribuição por identidade REFERIDA,
-- para sempre (bloqueia auto-referência sob corrida e reatribuição/reuso de
-- código já usado — "one-time-use" e "referral self-abuse blocked").
CREATE TABLE IF NOT EXISTS "referral_attributions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "referral_code_id" uuid NOT NULL,
  "referrer_identity_id" uuid NOT NULL,
  "referred_identity_id" uuid NOT NULL,
  "status" varchar(12) DEFAULT 'PENDING' NOT NULL,
  "attributed_at" timestamp with time zone NOT NULL,
  "confirmed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_attributions_referral_code_id_referral_codes_id_fk'
  ) THEN
    ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referral_code_id_referral_codes_id_fk"
      FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_attributions_referrer_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_identity_id_identities_id_fk"
      FOREIGN KEY ("referrer_identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'referral_attributions_referred_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referred_identity_id_identities_id_fk"
      FOREIGN KEY ("referred_identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_attribution_referred_unique" ON "referral_attributions" ("referred_identity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_referral_attribution_referrer" ON "referral_attributions" ("referrer_identity_id", "status");
--> statement-breakpoint

-- 5) Cashback campaigns — admin-config, VAZIA por padrão (`active` default
-- false), sempre com janela `starts_at`/`ends_at` (nunca "para sempre").
CREATE TABLE IF NOT EXISTS "cashback_campaigns" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "percentage_bps" integer NOT NULL,
  "active" boolean DEFAULT false NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "conditions" jsonb DEFAULT '[]' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cashback_campaign_active" ON "cashback_campaigns" ("active", "starts_at", "ends_at");
