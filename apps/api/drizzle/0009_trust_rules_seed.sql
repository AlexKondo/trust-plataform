-- Seed das regras do Trust Engine (P4/P5 aprovados pelo founder em 2026-08-09).
-- Níveis (TRS-008): dados ajustáveis por API admin sem mudança de código.
INSERT INTO trust_level_rules (id, level, min_score, max_score, rank, active) VALUES
  (gen_random_uuid(), 'UNVERIFIED', 0, 0, 0, true),
  (gen_random_uuid(), 'BRONZE', 1, 249, 1, true),
  (gen_random_uuid(), 'SILVER', 250, 499, 2, true),
  (gen_random_uuid(), 'GOLD', 500, 749, 3, true),
  (gen_random_uuid(), 'PLATINUM', 750, 1000, 4, true);
--> statement-breakpoint
-- Pontuação (TRS-009): condições JSON [{field, op, value}] com semântica AND.
INSERT INTO trust_score_rules (id, event_name, description, points, conditions, max_occurrences, active) VALUES
  (gen_random_uuid(), 'TrustPassport.Created', 'Conta ativada (e-mail confirmado)', 25, '[]', 1, true),
  (gen_random_uuid(), 'Verification.Approved', 'Documento de identidade verificado', 150, '[{"field":"type","op":"eq","value":"DOCUMENT"}]', 1, true),
  (gen_random_uuid(), 'Verification.Approved', 'Biometria verificada', 150, '[{"field":"type","op":"eq","value":"BIOMETRIC"}]', 1, true),
  (gen_random_uuid(), 'Verification.Approved', 'Endereço verificado', 100, '[{"field":"type","op":"eq","value":"ADDRESS"}]', 1, true),
  (gen_random_uuid(), 'Verification.Approved', 'Conta bancária verificada', 100, '[{"field":"type","op":"eq","value":"BANK_ACCOUNT"}]', 1, true),
  (gen_random_uuid(), 'Verification.Approved', 'Empresa verificada', 100, '[{"field":"type","op":"eq","value":"BUSINESS"}]', 1, true),
  (gen_random_uuid(), 'Verification.Rejected', 'Verificação rejeitada (penalidade)', -50, '[]', NULL, true);
