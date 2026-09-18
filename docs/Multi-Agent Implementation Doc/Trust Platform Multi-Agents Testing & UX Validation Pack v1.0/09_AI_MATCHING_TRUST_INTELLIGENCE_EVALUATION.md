# 09 — AI, Matching & Trust Intelligence Evaluation

Evaluate AI-assisted matching, estimates/budget assistance, recommendations and Trust Signals using a versioned golden evaluation set. Metrics: task correctness, constraint adherence, ranking relevance, groundedness to supplied facts, consistency, abstention/degradation on missing/stale data, latency and explainability appropriate to the decision.

Guardrails: AI may not fabricate availability, price, identity, completion evidence or payment state; may not infer fraud automatically from a Trust Signal; must not bypass policy/authorization; high-impact actions remain governed by approved workflow. Test prompt injection/tool misuse where AI can consume user/provider content. Record model/service version and evaluation dataset version.
