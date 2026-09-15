-- IP-002 — Internationalization & Localization Foundation.
-- Aditiva e não destrutiva, no mesmo estilo idempotente de 0024..0027:
-- ADD COLUMN IF NOT EXISTS + CHECK condicional. Reexecutável.

-- 1) Preferência de locale do usuário (identities). Default PT-BR (produto).
--    O CHECK espelha `SUPPORTED_LOCALES` do código (apps/api/src/shared/i18n/locale.ts);
--    ampliar o catálogo de idiomas exige uma migration aditiva futura que troque
--    o CHECK — não é um limite estrutural, só o registro atual do que é suportado.
ALTER TABLE "identities"
  ADD COLUMN IF NOT EXISTS "preferred_locale" varchar(10) NOT NULL DEFAULT 'pt-BR';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'identities_preferred_locale_supported'
  ) THEN
    ALTER TABLE "identities" ADD CONSTRAINT "identities_preferred_locale_supported"
      CHECK ("preferred_locale" IN ('pt-BR', 'en-US'));
  END IF;
END $$;
--> statement-breakpoint

-- 2) Locale resolvido do destinatário no momento em que a notificação nasce
--    (notifications). O corpo/título continuam só em PT-BR neste release — o
--    catálogo de mensagens do NTF-001 é conteúdo já existente e fora do escopo
--    desta fundação (IP-002 §4) — mas o mecanismo de RESOLUÇÃO fica pronto e
--    gravado por notificação, para renderização localizada entrar depois sem
--    precisar de outra migration.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "locale" varchar(10) NOT NULL DEFAULT 'pt-BR';
