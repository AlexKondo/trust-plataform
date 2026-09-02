-- PACK-03 §20 — Trust Change Order & Time Billing.
-- Aditiva e não destrutiva: só CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS / índices condicionais. Reexecutável, no mesmo estilo de 0024/0025/0026.
-- NADA aqui altera marketplace_order_commercial_snapshots: o snapshot inicial do
-- PACK-02 permanece imutável (§5) e os deltas vivem em tabelas próprias.

-- 1) Trust Change Order (§6/§7) — proposta explícita de mudança comercial.
-- Os totais do delta são gravados calculados e CONGELADOS com a taxa do
-- contrato (§8): recalcular no futuro com a política global vigente mudaria o
-- passado, que é justamente o que o Pack proíbe.
CREATE TABLE IF NOT EXISTS "trust_change_orders" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "proposed_by" uuid NOT NULL,
  "type" varchar(30) NOT NULL,
  "status" varchar(30) NOT NULL,
  "currency" char(3) NOT NULL,
  "additional_minutes" integer,
  "service_delta_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
  "material_cost_delta_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
  "material_markup_delta_amount" numeric(18, 2) DEFAULT '0.00' NOT NULL,
  "trust_fee_rate_bps" integer NOT NULL,
  "change_gross_amount" numeric(18, 2) NOT NULL,
  "change_trust_fee_base_amount" numeric(18, 2) NOT NULL,
  "change_trust_fee_amount" numeric(18, 2) NOT NULL,
  "change_provider_net_before_psp_fees" numeric(18, 2) NOT NULL,
  "reason" text NOT NULL,
  "description" text,
  "expires_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "decided_at" timestamp with time zone,
  "decided_by" uuid,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_change_orders_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "trust_change_orders" ADD CONSTRAINT "trust_change_orders_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_change_orders_proposed_by_identities_id_fk'
  ) THEN
    ALTER TABLE "trust_change_orders" ADD CONSTRAINT "trust_change_orders_proposed_by_identities_id_fk"
      FOREIGN KEY ("proposed_by") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_change_order_order" ON "trust_change_orders" ("order_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_change_order_status" ON "trust_change_orders" ("order_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_change_order_proposer" ON "trust_change_orders" ("proposed_by");
--> statement-breakpoint

-- 2) Evidências do Change Order (§13). Tabela PRÓPRIA: verification_evidences
-- pertence ao agregado Verification (identidade) e pendurar foto de peça
-- quebrada lá corromperia a semântica daquele agregado. O que é reaproveitado
-- é a ABSTRAÇÃO de storage, agora no shared kernel.
CREATE TABLE IF NOT EXISTS "trust_change_order_evidences" (
  "id" uuid PRIMARY KEY NOT NULL,
  "change_order_id" uuid NOT NULL,
  "type" varchar(40) NOT NULL,
  "storage_key" varchar(300) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "file_size" bigint NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_change_order_evidences_change_order_id_trust_change_orders_id_fk'
  ) THEN
    ALTER TABLE "trust_change_order_evidences" ADD CONSTRAINT "trust_change_order_evidences_change_order_id_trust_change_orders_id_fk"
      FOREIGN KEY ("change_order_id") REFERENCES "trust_change_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_change_order_evidence_change_order" ON "trust_change_order_evidences" ("change_order_id");
--> statement-breakpoint

-- 3) Sessão de execução (§10). Uma por pedido no MVP (UNIQUE). Não substitui o
-- check-in/check-out do MRK-020/021 — é a camada de TEMPO por cima deles, e por
-- isso a máquina de 13 estados do pedido não muda (nem ganha PAUSED).
CREATE TABLE IF NOT EXISTS "service_execution_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL,
  "check_in_at" timestamp with time zone,
  "check_in_by" uuid,
  "check_out_at" timestamp with time zone,
  "check_out_by" uuid,
  "elapsed_minutes" integer,
  "paused_minutes" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_execution_sessions_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "service_execution_sessions" ADD CONSTRAINT "service_execution_sessions_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_execution_session_order" ON "service_execution_sessions" ("order_id");
--> statement-breakpoint

-- 4) Pausas (§10.2). O índice parcial é a garantia FINAL contra duas pausas
-- abertas simultâneas (§19) — não a checagem de aplicação.
CREATE TABLE IF NOT EXISTS "service_execution_pauses" (
  "id" uuid PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "reason_code" varchar(40) NOT NULL,
  "note" text,
  "performed_by" uuid NOT NULL,
  "paused_at" timestamp with time zone NOT NULL,
  "resumed_at" timestamp with time zone,
  "duration_minutes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_execution_pauses_session_id_service_execution_sessions_id_fk'
  ) THEN
    ALTER TABLE "service_execution_pauses" ADD CONSTRAINT "service_execution_pauses_session_id_service_execution_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "service_execution_sessions"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_execution_pause_session" ON "service_execution_pauses" ("session_id", "paused_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_execution_pause_open" ON "service_execution_pauses" ("session_id") WHERE "resumed_at" IS NULL;
