-- IP-011 — Trust Signals & Reputation Completion.
-- Aditiva e não destrutiva: CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN
-- IF NOT EXISTS, índices condicionais, FK guardada por DO $$ ... information_schema —
-- mesmo estilo de 0024..0038. Nenhum ALTER destrutivo, nenhum DROP.
-- NÃO toca em `trust_scores`/`trust_events`/`trust_score_rules` (TP-001/003:
-- só o Trust Engine altera Score/Level; este pacote só observa).

-- 1) Trust Signal registry (typed/versioned/audited, observational only —
-- never read by the score engine). See
-- apps/api/src/modules/trust-score/domain/services/trust-signal-registry.ts
CREATE TABLE IF NOT EXISTS "trust_signals" (
  "id" uuid PRIMARY KEY NOT NULL,
  "trust_passport_id" uuid NOT NULL,
  "identity_id" uuid NOT NULL,
  "signal_type" varchar(80) NOT NULL,
  "signal_version" varchar(10) NOT NULL DEFAULT '1',
  "source_event_id" uuid NOT NULL,
  "source_event_name" varchar(120) NOT NULL,
  "payload" jsonb NOT NULL,
  "visibility" varchar(10) NOT NULL DEFAULT 'PRIVATE',
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'trust_signals_trust_passport_id_trust_passports_id_fk'
  ) THEN
    ALTER TABLE "trust_signals" ADD CONSTRAINT "trust_signals_trust_passport_id_trust_passports_id_fk"
      FOREIGN KEY ("trust_passport_id") REFERENCES "trust_passports"("id") ON DELETE restrict ON UPDATE restrict;
  END IF;
END $$;
--> statement-breakpoint
-- Idempotência: o mesmo evento de origem nunca gera dois sinais (mesmo
-- padrão de `idx_trust_event_source` em trust_events).
CREATE UNIQUE INDEX IF NOT EXISTS "idx_trust_signal_source" ON "trust_signals" ("source_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_signal_passport" ON "trust_signals" ("trust_passport_id", "occurred_at");
--> statement-breakpoint

-- 2) Visibility policy (TRS-016) ganha um toggle para sinais PUBLIC no
-- perfil compartilhado. Aditiva: default true preserva o comportamento
-- atual (nada muda para passports existentes até o dono desativar).
ALTER TABLE "trust_visibility_policies" ADD COLUMN IF NOT EXISTS "show_signals" boolean DEFAULT true NOT NULL;
