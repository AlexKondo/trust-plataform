-- Seed do catálogo de badges (TRS-012/013). Critérios JSON sobre {score, level}.
INSERT INTO trust_badges (id, code, name, description, badge_type, criteria, active) VALUES
  (gen_random_uuid(), 'TRUSTED_MEMBER', 'Membro Confiável', 'Conta ativada e com pontuação inicial construída.', 'PERMANENT', '[{"field":"score","op":"gte","value":25}]', true),
  (gen_random_uuid(), 'IDENTITY_STRONG', 'Identidade Fortalecida', 'Alcançou 150+ pontos de confiança com verificações.', 'PERMANENT', '[{"field":"score","op":"gte","value":150}]', true),
  (gen_random_uuid(), 'SILVER_TIER', 'Nível Prata', 'Atingiu o nível PRATA de confiança.', 'PERMANENT', '[{"field":"level","op":"in","value":["SILVER","GOLD","PLATINUM"]}]', true),
  (gen_random_uuid(), 'GOLD_TIER', 'Nível Ouro', 'Atingiu o nível OURO de confiança.', 'PERMANENT', '[{"field":"level","op":"in","value":["GOLD","PLATINUM"]}]', true),
  (gen_random_uuid(), 'TOP_TRUST', 'Confiança Máxima', 'Mantém o nível PLATINA — o mais alto da plataforma.', 'DYNAMIC', '[{"field":"level","op":"eq","value":"PLATINUM"}]', true);
