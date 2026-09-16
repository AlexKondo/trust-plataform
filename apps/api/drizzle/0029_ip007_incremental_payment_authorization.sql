-- IP-007 — Incremental Payment Authorization.
-- Resolve o gap `amountAuthorizedNotInCustody` autorreportado pelo PACK-03
-- (§9.1 do relatório daquele Pack): um Trust Change Order aprovado fica
-- comercialmente autorizado mas o `Payment`/`TrustCustody` do PACK-01
-- continuam congelados no valor da contratação original.
--
-- Aditiva e não destrutiva: só CREATE TABLE IF NOT EXISTS / índices
-- condicionais / FK condicionais. Reexecutável, no mesmo estilo de
-- 0025/0026/0027/0028. NADA aqui altera `payments` ou `trust_custodies`:
-- o valor original do Payment continua imutável (mandato do programa) e a
-- custódia original continua com UNIQUE(payment_id) — a autorização
-- incremental e sua custódia vivem em tabelas PRÓPRIAS, uma "tranche" por
-- Change Order aprovado, para não colidir com esse índice único existente.

-- 1) Tentativa de autorização incremental (uma por Change Order aprovado, para
-- sempre — UNIQUE(change_order_id) é a garantia final contra duplicidade,
-- mesmo com reentrega do evento TrustChangeOrder.Approved). O valor vem
-- SEMPRE do changeGrossAmount congelado do Change Order — nunca digitado de
-- novo aqui.
CREATE TABLE IF NOT EXISTS "payment_incremental_authorizations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "payment_id" uuid NOT NULL,
  "change_order_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "buyer_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "provider_id" varchar(60) NOT NULL,
  "idempotency_key" varchar(120) NOT NULL,
  "provider_transaction_id" varchar(200),
  "authorization_code" varchar(100),
  "amount" numeric(18, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" varchar(30) NOT NULL,
  "provider_code" varchar(100),
  "message" text,
  "authorized_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "gateway_response" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_incremental_authorizations_payment_id_payments_id_fk'
  ) THEN
    ALTER TABLE "payment_incremental_authorizations" ADD CONSTRAINT "payment_incremental_authorizations_payment_id_payments_id_fk"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_incremental_authorizations_change_order_id_trust_change_orders_id_fk'
  ) THEN
    ALTER TABLE "payment_incremental_authorizations" ADD CONSTRAINT "payment_incremental_authorizations_change_order_id_trust_change_orders_id_fk"
      FOREIGN KEY ("change_order_id") REFERENCES "trust_change_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_incremental_authorizations_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "payment_incremental_authorizations" ADD CONSTRAINT "payment_incremental_authorizations_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_incremental_authorizations_buyer_id_identities_id_fk'
  ) THEN
    ALTER TABLE "payment_incremental_authorizations" ADD CONSTRAINT "payment_incremental_authorizations_buyer_id_identities_id_fk"
      FOREIGN KEY ("buyer_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payment_incremental_authorizations_seller_id_identities_id_fk'
  ) THEN
    ALTER TABLE "payment_incremental_authorizations" ADD CONSTRAINT "payment_incremental_authorizations_seller_id_identities_id_fk"
      FOREIGN KEY ("seller_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_incremental_authorization_change_order" ON "payment_incremental_authorizations" ("change_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_incremental_authorization_idempotency" ON "payment_incremental_authorizations" ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_incremental_authorization_payment" ON "payment_incremental_authorizations" ("payment_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_incremental_authorization_order" ON "payment_incremental_authorizations" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_incremental_authorization_status" ON "payment_incremental_authorizations" ("status");
--> statement-breakpoint

-- 2) Custódia da tranche incremental — mesmo formato/máquina de estados de
-- `trust_custodies` (IN_CUSTODY -> READY_FOR_RELEASE -> RELEASED), em tabela
-- PRÓPRIA porque `trust_custodies` tem UNIQUE(payment_id): um Payment já tem
-- no máximo uma linha lá (PACK-01 §6.2), e essa garantia continua valendo
-- para o valor ORIGINAL. Cada Change Order aprovado com autorização
-- incremental aprovada ganha sua própria linha aqui, todas apontando para o
-- mesmo payment_id/order_id — a soma de todas as linhas (original +
-- incrementais) é o total EFETIVAMENTE custodiado (ver
-- payment-custody-summary.service.ts).
CREATE TABLE IF NOT EXISTS "incremental_trust_custodies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "payment_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "change_order_id" uuid NOT NULL,
  "incremental_authorization_id" uuid NOT NULL,
  "buyer_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" varchar(30) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_payment_id_payments_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_payment_id_payments_id_fk"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_change_order_id_trust_change_orders_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_change_order_id_trust_change_orders_id_fk"
      FOREIGN KEY ("change_order_id") REFERENCES "trust_change_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_incremental_authorization_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_incremental_authorization_id_fk"
      FOREIGN KEY ("incremental_authorization_id") REFERENCES "payment_incremental_authorizations"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_buyer_id_identities_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_buyer_id_identities_id_fk"
      FOREIGN KEY ("buyer_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'incremental_trust_custodies_seller_id_identities_id_fk'
  ) THEN
    ALTER TABLE "incremental_trust_custodies" ADD CONSTRAINT "incremental_trust_custodies_seller_id_identities_id_fk"
      FOREIGN KEY ("seller_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_incremental_trust_custody_change_order" ON "incremental_trust_custodies" ("change_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_incremental_trust_custody_authorization" ON "incremental_trust_custodies" ("incremental_authorization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incremental_trust_custody_payment" ON "incremental_trust_custodies" ("payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incremental_trust_custody_order" ON "incremental_trust_custodies" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incremental_trust_custody_status" ON "incremental_trust_custodies" ("status");
