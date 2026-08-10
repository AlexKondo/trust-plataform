-- INCONSISTENCIAS #13: o marketplace passa a alimentar o Trust Score (TRS-009).
-- Serviço entregue e confirmado pelo cliente é o sinal mais forte de confiança
-- do produto — vale mais que qualquer verificação isolada e, ao contrário
-- delas, repete a cada transação (sem max_occurrences).
INSERT INTO trust_score_rules (id, event_name, description, points, conditions, max_occurrences, active) VALUES
  (gen_random_uuid(), 'MarketplaceOrder.CustomerConfirmed', 'Serviço concluído e confirmado pelo cliente', 40, '[]', NULL, true),
  (gen_random_uuid(), 'MarketplaceOrder.Cancelled', 'Pedido cancelado (penalidade para quem cancelou)', -20, '[]', NULL, true);
