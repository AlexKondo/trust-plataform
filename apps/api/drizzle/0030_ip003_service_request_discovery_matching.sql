-- IP-003 — Service Request, Discovery & Matching.
-- Fecha o gap autorreportado pela reconciliação de baseline (IP-000-COMPLETION-REPORT.md
-- §14, linha IP-003): "Marketplace é estritamente baseado em anúncio... não
-- existe entidade de necessidade do Member, não existe modelo de fan-out para
-- vários Partners". Esta migration cria SÓ isso: um pedido de serviço do
-- Trust Member e o registro de ligação com a conversa que nasce dele. Não
-- altera nenhuma tabela existente (marketplace_listings/conversations/offers/
-- orders permanecem intactas) — aditiva e não destrutiva, mesmo estilo de
-- 0024..0029: CREATE TABLE IF NOT EXISTS / FK condicional / índices condicionais.

-- 1) Pedido de serviço (aggregate root, ver service-request.ts). Nasce
-- completo e já OPEN — não existe rascunho aqui (ao contrário de
-- marketplace_listings), porque este agregado nunca é publicamente navegável.
-- `location_label` é texto livre e grosseiro, o MESMO formato de
-- marketplace_listings.location — deliberadamente NÃO existe latitude/longitude
-- nesta tabela. Não é por falta de QUALQUER coordenada de Partner no repositório
-- (marketplace_order_execution_events, migration 0017, guarda geotags reais de
-- execução em campo) — é porque não existe um perfil de localização do Partner
-- PRÉ-engajamento que sustente matching prospectivo (decisão de privacidade
-- documentada em service-request.ts, com a justificativa completa e corrigida).
CREATE TABLE IF NOT EXISTS "service_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "member_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "location_label" varchar(160) NOT NULL,
  "radius_km" smallint,
  "urgency" varchar(20) NOT NULL,
  "preferred_date" timestamp with time zone,
  "budget_min_amount" numeric(18, 2),
  "budget_max_amount" numeric(18, 2),
  "currency" varchar(3) DEFAULT 'BRL' NOT NULL,
  "minimum_trust_level" varchar(30),
  "status" varchar(20) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "matched_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "closed_by" uuid,
  "close_reason" text,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" uuid,
  "cancellation_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_requests_member_id_identities_id_fk'
  ) THEN
    ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_member_id_identities_id_fk"
      FOREIGN KEY ("member_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_requests_category_id_marketplace_categories_id_fk'
  ) THEN
    ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_category_id_marketplace_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "marketplace_categories"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_request_member" ON "service_requests" ("member_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_request_category" ON "service_requests" ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_request_status" ON "service_requests" ("status");
--> statement-breakpoint

-- 2) Engajamento = a origem de UMA conversa a partir de um ServiceRequest.
-- UNIQUE(service_request_id, listing_id) é a mesma garantia "reutilizar,
-- nunca duplicar" que idx_marketplace_conversation_active já usa para a
-- conversa em si (MRK-006 BR-005) — aqui aplicada à ligação pedido->anúncio.
CREATE TABLE IF NOT EXISTS "service_request_engagements" (
  "id" uuid PRIMARY KEY NOT NULL,
  "service_request_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "partner_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "engaged_by" uuid NOT NULL,
  "engaged_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_request_engagements_service_request_id_service_requests_id_fk'
  ) THEN
    ALTER TABLE "service_request_engagements" ADD CONSTRAINT "service_request_engagements_service_request_id_service_requests_id_fk"
      FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_request_engagements_listing_id_marketplace_listings_id_fk'
  ) THEN
    ALTER TABLE "service_request_engagements" ADD CONSTRAINT "service_request_engagements_listing_id_marketplace_listings_id_fk"
      FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_request_engagements_partner_id_identities_id_fk'
  ) THEN
    ALTER TABLE "service_request_engagements" ADD CONSTRAINT "service_request_engagements_partner_id_identities_id_fk"
      FOREIGN KEY ("partner_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_request_engagements_conversation_id_marketplace_conversations_id_fk'
  ) THEN
    ALTER TABLE "service_request_engagements" ADD CONSTRAINT "service_request_engagements_conversation_id_marketplace_conversations_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "marketplace_conversations"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'service_request_engagements_engaged_by_identities_id_fk'
  ) THEN
    ALTER TABLE "service_request_engagements" ADD CONSTRAINT "service_request_engagements_engaged_by_identities_id_fk"
      FOREIGN KEY ("engaged_by") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_request_engagement_unique" ON "service_request_engagements" ("service_request_id", "listing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_request_engagement_request" ON "service_request_engagements" ("service_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_service_request_engagement_conversation" ON "service_request_engagements" ("conversation_id");
