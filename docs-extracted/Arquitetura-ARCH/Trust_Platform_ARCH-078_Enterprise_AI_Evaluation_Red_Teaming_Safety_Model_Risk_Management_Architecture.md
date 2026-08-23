Trust Platform
ARCH-078 — Enterprise AI Evaluation, Red Teaming, Safety & Model Risk Management Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-078
	
Document Name
	Enterprise AI Evaluation, Red Teaming, Safety & Model Risk Management Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform AI Governance / Security / AI Platform / Risk
	
Applies To
	AI model evaluation, Agent evaluation, red teaming, safety testing, model risk, release gates, monitoring and AI Buyer autonomy expansion
	
Depends On
	ENG-000, ARCH-041, ARCH-053, ARCH-065, ARCH-073, ARCH-076, ARCH-077
	
1. Objetivo
Definir o framework enterprise para avaliar modelos, Agents e AI capabilities antes e depois de produção, incluindo quality, safety, security, robustness, red teaming, model risk e gates para expansão de autonomia.
2. Princípios
AI capabilities require evidence before production.
Evaluation is continuous, not a one-time certification.
Risk classification determines test depth.
Adversarial testing is required for high-impact capabilities.
Safety and quality are separate dimensions.
Production monitoring feeds evaluation.
Autonomy increases only when evidence supports it.
Evaluation datasets and results are versioned.
3. Evaluation Lifecycle
Define Risk → Build Dataset → Evaluate → Red Team → Approve → Release → Monitor → Re-evaluate
4. AI Risk Classification
Tier
	Impact
	Controle
	
Low
	Informational
	Standard evaluation
	
Medium
	Operational assistance
	Expanded evaluation
	
High
	Material business action
	Red team + approval
	
Critical
	High-impact/autonomous
	Executive/governance gate
	
5. Evaluation Dimensions
Accuracy.
Relevance.
Groundedness.
Consistency.
Safety.
Security.
Robustness.
Latency.
Cost.
6. Dataset Governance
Dataset ID.
Version.
Owner.
Source.
Representativeness.
Sensitive-data handling.
Evaluation split.
7. Golden Dataset
Representative tasks.
Expected outcomes.
Edge cases.
Policy cases.
Failure cases.
Adversarial cases.
8. Regression Evaluation
Model change.
Prompt change.
Tool change.
Policy change.
Retrieval change.
Agent workflow change.
9. Red Teaming
Prompt injection.
Data exfiltration.
Privilege escalation.
Tool abuse.
Policy bypass.
Hallucination exploitation.
Manipulation.
10. Agent Safety Testing
Unsafe action.
Unauthorized action.
Repeated action loop.
Excessive spend.
Approval bypass.
Cross-tenant attempt.
11. Tool Safety
Tool allowlist.
Parameter validation.
Transaction limits.
Side-effect classification.
Idempotency.
Kill switch.
12. Model Risk
Model/provider risk.
Data risk.
Decision risk.
Operational risk.
Concentration risk.
Change risk.
13. Model Risk Register
Risk ID.
Capability.
Model.
Risk owner.
Controls.
Residual risk.
Review date.
14. Release Gates
Evaluation Pass → Safety Pass → Security Pass → Governance Approval → Release
15. Canary / Shadow Mode
Shadow execution.
Limited cohort.
Bounded traffic.
Outcome comparison.
Rollback.
16. Production Monitoring
Quality drift.
Safety incidents.
Policy violations.
Tool failures.
Human overrides.
Cost drift.
17. Drift
Data drift.
Behavior drift.
Model drift.
Provider drift.
Workflow drift.
18. Incident & Model Rollback
Model disable.
Capability disable.
Tool disable.
Fallback model.
Human-only mode.
Post-incident evaluation.
19. AI Buyer Evaluation
O AI Buyer terá avaliação específica por workflow, categoria de procurement e autonomy tier. Não será suficiente demonstrar que o Agent consegue executar uma ação; será necessário demonstrar que ele executa corretamente, dentro das policies e com risco aceitável.
Recommendation quality.
Supplier selection quality.
Policy compliance.
Price anomaly handling.
Approval compliance.
Tool correctness.
Human override rate.
Exception handling.
20. AI Buyer Autonomy Gate
A0→A1: Recommendation quality.
A1→A2: Bounded execution reliability.
A2→A3: Risk and exception performance.
A3→A4: Governance approval + sustained evidence.
21. Evaluation Evidence
Dataset version.
Model version.
Prompt version.
Tool version.
Policy version.
Evaluation result.
Approver.
Timestamp.
22. Human Review
High-risk cases.
Ambiguous cases.
Novel cases.
Policy conflicts.
Evaluation failures.
23. AI Safety Controls
Content safety.
Action safety.
Data safety.
Tool safety.
Identity safety.
Financial safety.
24. Security Integration
Threat model.
Red team findings.
Security controls.
Vulnerability remediation.
Incident response.
25. Governance
AI risk owner.
Evaluation owner.
Model owner.
Product owner.
Security reviewer.
Approval authority.
26. Testing
Golden set.
Regression.
Red team.
Load.
Failure injection.
Tool abuse.
Cross-tenant isolation.
27. Anti-Patterns Proibidos
Production release based only on demo quality.
Autonomy expansion without new evidence.
Red teaming only after incident.
Evaluation dataset without versioning.
AI Buyer judged only by cost savings.
Model replacement without regression evaluation.
28. Definition of Done
Risk tiers defined.
Evaluation framework defined.
Dataset governance defined.
Red teaming defined.
Release gates defined.
Monitoring defined.
Model risk register defined.
AI Buyer autonomy gates defined.
29. Decisão Arquitetural
A Trust Platform adotará evaluation-driven AI governance. Toda capability relevante terá risk classification, evaluation evidence, release gate e production monitoring. Mudanças de model, prompt, tool, retrieval ou policy poderão disparar nova avaliação.
30. Relação com AI Buyer
O AI Buyer terá autonomia progressiva condicionada a evidência. Cada avanço de A0 até A4 exigirá métricas e controles adicionais. Falhas relevantes poderão reduzir o autonomy tier ou colocar o sistema em human-only mode.
31. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-041 — AI Agent Runtime, Tool Gateway & Agent Governance Architecture
ARCH-053 — Testing Strategy, Quality Engineering & AI Evaluation Architecture
ARCH-065 — Enterprise Governance, Risk Management & Decision Rights Architecture
ARCH-073 — Enterprise Authorization, Delegation, Service-to-Service Identity & Workload Security Architecture
ARCH-076 — Enterprise Search, Retrieval, Knowledge & Semantic Intelligence Architecture
ARCH-077 — Enterprise AI Model Gateway, Model Routing, Provider Abstraction & LLM Operations Architecture
32. Princípio Fundamental
Autonomia deve ser conquistada por evidência: quanto maior o impacto de uma capability, maior deve ser a qualidade, profundidade e continuidade das avaliações necessárias para mantê-la habilitada.
