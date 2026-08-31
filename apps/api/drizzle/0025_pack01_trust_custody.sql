-- PACK-01 §13 — Trust Custody (PAY-003/PAY-004).
-- Aditiva e não destrutiva: cria uma tabela nova e nada mais. Os estados
-- FUNDS_IN_CUSTODY e FUNDS_RELEASED do Payment já existiam desde a migration
-- 0022 (status é varchar validado no domínio), então não há alteração em
-- `payments`. Guardada para permitir reexecução segura.

CREATE TABLE IF NOT EXISTS "trust_custodies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "payment_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
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
    WHERE constraint_name = 'trust_custodies_payment_id_payments_id_fk'
  ) THEN
    ALTER TABLE "trust_custodies" ADD CONSTRAINT "trust_custodies_payment_id_payments_id_fk"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_custodies_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "trust_custodies" ADD CONSTRAINT "trust_custodies_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_custodies_buyer_id_identities_id_fk'
  ) THEN
    ALTER TABLE "trust_custodies" ADD CONSTRAINT "trust_custodies_buyer_id_identities_id_fk"
      FOREIGN KEY ("buyer_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_custodies_seller_id_identities_id_fk'
  ) THEN
    ALTER TABLE "trust_custodies" ADD CONSTRAINT "trust_custodies_seller_id_identities_id_fk"
      FOREIGN KEY ("seller_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_trust_custody_payment" ON "trust_custodies" ("payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_custody_order" ON "trust_custodies" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_custody_status" ON "trust_custodies" ("status");
