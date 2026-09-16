-- IP-021 — Privacy, LGPD & Data Lifecycle.
-- Fecha o gap autorreportado pela reconciliação de baseline
-- (IP-000-COMPLETION-REPORT.md §14, linha IP-021): "Only Trust Passport
-- visibility toggles (profile-display consent, not consent capture) and the
-- generic audit log exist; no data inventory, consent capture, export,
-- deletion, or retention workflow." Esta migration cria SÓ a fundação de
-- persistência necessária: aditiva e não destrutiva, mesmo estilo de
-- 0024..0031 (CREATE TABLE IF NOT EXISTS / FK condicional / índices
-- condicionais). Nenhuma tabela existente é alterada.

-- 1) Consentimento/versão de documento legal (shared kernel — mesmo nível de
-- audit_logs: infraestrutura transversal, não regra de negócio de um módulo
-- específico). Um consentimento é um FATO — nunca é reescrito ou apagado
-- (UNIQUE por identidade+documento+versão evita duplicidade do mesmo aceite,
-- mas aceitar uma versão NOVA do mesmo documento é sempre uma linha nova).
CREATE TABLE IF NOT EXISTS "legal_consents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "identity_id" uuid NOT NULL,
  "document_type" varchar(30) NOT NULL,
  "document_version" varchar(20) NOT NULL,
  "locale" varchar(10) NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'legal_consents_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_identity_id_identities_id_fk"
      FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_legal_consent_unique"
  ON "legal_consents" ("identity_id", "document_type", "document_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_legal_consent_identity" ON "legal_consents" ("identity_id", "accepted_at");
--> statement-breakpoint

-- 2) Solicitação de privacidade (DATA_EXPORT | DATA_DELETION) — o workflow de
-- acesso/exclusão exigido pelo objetivo desta IP. REQUESTED -> PROCESSING ->
-- COMPLETED|REJECTED. O conteúdo exportado NÃO é persistido aqui de
-- propósito (privacy-by-design: reduzir cópias de PII em repouso) — só os
-- metadados do pedido + um resumo de contagens não-sensível.
CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "identity_id" uuid NOT NULL,
  "type" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "requested_at" timestamp with time zone NOT NULL,
  "processed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "rejection_reason" varchar(60),
  "result_summary" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'privacy_requests_identity_id_identities_id_fk'
  ) THEN
    ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_identity_id_identities_id_fk"
      FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'privacy_requests_type_supported'
  ) THEN
    ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_type_supported"
      CHECK ("type" IN ('DATA_EXPORT', 'DATA_DELETION'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'privacy_requests_status_supported'
  ) THEN
    ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_status_supported"
      CHECK ("status" IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_privacy_request_identity" ON "privacy_requests" ("identity_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_privacy_request_status" ON "privacy_requests" ("status");
