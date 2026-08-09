-- Seed de benefícios (TRS-010/011): elegibilidade JSON sobre {score, level}.
INSERT INTO trust_benefits (id, name, description, eligibility, active) VALUES
  (gen_random_uuid(), 'Selo Verificado no Marketplace', 'Seu perfil exibe o selo de conta verificada nas buscas e anúncios.', '[{"field":"score","op":"gte","value":100}]', true),
  (gen_random_uuid(), 'Destaque nas buscas', 'Anúncios com prioridade de exibição nos resultados do marketplace.', '[{"field":"level","op":"in","value":["GOLD","PLATINUM"]}]', true),
  (gen_random_uuid(), 'Limite ampliado de anúncios', 'Publique mais anúncios simultâneos no marketplace.', '[{"field":"level","op":"in","value":["SILVER","GOLD","PLATINUM"]}]', true);
