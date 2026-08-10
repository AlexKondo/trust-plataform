-- Fecha a INCONSISTENCIAS #13: a avaliação da transação e o desfecho da disputa
-- entram no Trust Score (TRS-009). As condições são mutuamente exclusivas
-- porque o motor aplica a PRIMEIRA regra que casa (trust-score-engine.matchRule).
--
-- Nota alta pesa menos que o serviço confirmado (+40): confirmar é o fato
-- objetivo (o serviço aconteceu), a nota é a opinião sobre ele.
INSERT INTO trust_score_rules (id, event_name, description, points, conditions, max_occurrences, active) VALUES
  (gen_random_uuid(), 'MarketplaceReview.Created', 'Avaliação positiva recebida (4-5 estrelas)', 30, '[{"field":"overallScore","op":"gte","value":4}]', NULL, true),
  (gen_random_uuid(), 'MarketplaceReview.Created', 'Avaliação neutra recebida (3 estrelas)', 5, '[{"field":"overallScore","op":"eq","value":3}]', NULL, true),
  (gen_random_uuid(), 'MarketplaceReview.Created', 'Avaliação negativa recebida (1-2 estrelas)', -30, '[{"field":"overallScore","op":"lte","value":2}]', NULL, true),
  (gen_random_uuid(), 'MarketplaceDispute.Resolved', 'Disputa julgada procedente contra o participante', -60, '[{"field":"decisionType","op":"eq","value":"UPHELD"}]', NULL, true),
  (gen_random_uuid(), 'MarketplaceDispute.Resolved', 'Disputa julgada parcialmente procedente', -30, '[{"field":"decisionType","op":"eq","value":"PARTIALLY_UPHELD"}]', NULL, true);
