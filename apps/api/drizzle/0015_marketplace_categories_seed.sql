-- Seed do catálogo de categorias do Marketplace (MRK-001/003/004).
-- `minimum_trust_level` é o porteiro do MRK-003 BR-005: categorias que envolvem
-- entrar na casa do cliente exigem SILVER (250 pts = documento + endereço
-- verificados); as demais pedem apenas conta ativada (BRONZE = 25 pts).
INSERT INTO marketplace_categories (id, code, name, description, minimum_trust_level, minimum_score, active) VALUES
  (gen_random_uuid(), 'HOME_REPAIRS', 'Reparos e Manutenção', 'Pequenos reparos, montagem de móveis, pintura e manutenção geral.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'ELECTRICAL', 'Elétrica', 'Instalações e reparos elétricos residenciais e comerciais.', 'SILVER', 0, true),
  (gen_random_uuid(), 'PLUMBING', 'Hidráulica', 'Encanamento, vazamentos, caixas d''água e instalações hidráulicas.', 'SILVER', 0, true),
  (gen_random_uuid(), 'CLEANING', 'Limpeza e Diarista', 'Faxina, limpeza pós-obra, passadoria e organização.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'CARE', 'Cuidados Pessoais', 'Cuidado de crianças, idosos e pessoas com necessidades especiais.', 'SILVER', 0, true),
  (gen_random_uuid(), 'BEAUTY', 'Beleza e Bem-estar', 'Cabelo, estética, manicure, massagem e serviços de bem-estar.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'TUTORING', 'Aulas e Reforço', 'Aulas particulares, reforço escolar, idiomas e música.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'TECH', 'Tecnologia', 'Suporte de informática, redes, desenvolvimento e design.', NULL, 0, true),
  (gen_random_uuid(), 'EVENTS', 'Eventos e Festas', 'Buffet, fotografia, decoração, som e organização de eventos.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'TRANSPORT', 'Fretes e Mudanças', 'Transporte de cargas, mudanças e entregas locais.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'AUTO', 'Automotivo', 'Mecânica, funilaria, estética automotiva e socorro.', 'BRONZE', 0, true),
  (gen_random_uuid(), 'PRODUCTS', 'Produtos', 'Venda de produtos novos e usados entre membros da plataforma.', NULL, 0, true);
