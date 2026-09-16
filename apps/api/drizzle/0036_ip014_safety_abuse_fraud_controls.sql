-- IP-014 — Safety, Abuse & Fraud Controls.
-- Migration aditiva (mesmo estilo de 0024..0035): CREATE TABLE IF NOT EXISTS,
-- índices condicionais, nenhuma tabela existente é alterada. O rate limit
-- canônico (RateLimitService) reaproveita `audit_logs` e não precisa de
-- tabela nova — a única tabela nova aqui é a fila de risk flags do admin.

CREATE TABLE IF NOT EXISTS "risk_flags" (
  "id" uuid PRIMARY KEY NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" varchar(120) NOT NULL,
  "subject_identity_id" uuid,
  "signal" varchar(80) NOT NULL,
  "reason" text NOT NULL,
  "severity" varchar(20) DEFAULT 'MEDIUM' NOT NULL,
  "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
  "metadata" jsonb,
  "raised_at" timestamp with time zone NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_risk_flag_entity" ON "risk_flags" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_risk_flag_status" ON "risk_flags" ("status", "raised_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_risk_flag_subject" ON "risk_flags" ("subject_identity_id");
