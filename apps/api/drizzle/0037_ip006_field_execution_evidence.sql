-- IP-006 — Field Execution & Trust Evidence Hardening.
-- Aditiva e não destrutiva: só CREATE TABLE IF NOT EXISTS / índices condicionais
-- e FKs guardadas por DO $$ ... information_schema, mesmo estilo de 0024..0027.
-- Nenhum ALTER destrutivo, nenhum DROP. Não toca em nenhuma tabela do PACK-03.

-- 1) Trust Evidence de execução (foto opcional de antes/depois). Amarrada
-- diretamente ao PEDIDO, não à sessão: uma foto "antes" pode existir antes de
-- qualquer check-in, e o histórico não pode depender de o pedido ter sessão
-- (pedidos anteriores ao PACK-03 não têm). Tabela própria — mesma decisão do
-- PACK-03 §13 para não corromper `verification_evidences` nem
-- `trust_change_order_evidences`; só a ABSTRAÇÃO de storage é reaproveitada.
CREATE TABLE IF NOT EXISTS "service_execution_evidences" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "type" varchar(20) NOT NULL,
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
    WHERE constraint_name = 'service_execution_evidences_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "service_execution_evidences" ADD CONSTRAINT "service_execution_evidences_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_execution_evidence_order" ON "service_execution_evidences" ("order_id", "uploaded_at");
--> statement-breakpoint

-- 2) Nota de serviço do Partner — texto livre sobre o que foi feito, separado
-- do fluxo de disputa/avaliação (que já existe em outro módulo). Append-only.
CREATE TABLE IF NOT EXISTS "service_execution_notes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_execution_notes_order_id_marketplace_orders_id_fk'
  ) THEN
    ALTER TABLE "service_execution_notes" ADD CONSTRAINT "service_execution_notes_order_id_marketplace_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "marketplace_orders"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_execution_notes_created_by_identities_id_fk'
  ) THEN
    ALTER TABLE "service_execution_notes" ADD CONSTRAINT "service_execution_notes_created_by_identities_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_execution_note_order" ON "service_execution_notes" ("order_id", "created_at");
