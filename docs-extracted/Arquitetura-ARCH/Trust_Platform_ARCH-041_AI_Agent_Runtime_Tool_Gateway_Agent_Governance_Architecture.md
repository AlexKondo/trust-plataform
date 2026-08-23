Trust Platform
ARCH-041 — AI Agent Runtime, Tool Gateway & Agent Governance Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-041
	
Document Name
	AI Agent Runtime, Tool Gateway & Agent Governance Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / AI Platform / Security
	
Applies To
	AI agents, model providers, tools, agent workflows, approvals, memory/context, execution policies and autonomous actions
	
Depends On
	ENG-000, ARCH-007, ARCH-023, ARCH-024, ARCH-025, ARCH-026, ARCH-027, ARCH-028, ARCH-029, ARCH-034, ARCH-039, ARCH-040
	
1. Objetivo
Definir a arquitetura de runtime e governança para AI Agents da Trust Platform, estabelecendo uma fronteira segura entre modelos de IA e sistemas transacionais, com identidade, tools, policies, approvals, observabilidade e limites de autonomia.
2. Princípios
Agents are bounded actors, not unrestricted system users.
Models do not receive direct database/network access by default.
Every agent has an explicit identity.
Every tool is a governed capability.
Policy enforcement happens outside the model.
High-risk actions require stronger controls.
Agent execution is observable and auditable.
Autonomy is granted by risk tier, not by model capability.
3. Agent Architecture
User/System → Agent Runtime → Policy → Tool Gateway → Authorized Tool → Domain Service
4. Agent Identity
Agent ID.
Agent type/version.
Owning product/domain.
Tenant context.
Execution identity.
Environment.
Risk tier.
5. Agent Runtime
Session/execution state.
Model invocation.
Context assembly.
Tool selection.
Policy checks.
Approval wait.
Result handling.
Termination.
6. Agent Execution State
Execution ID.
Parent workflow ID.
Agent version.
Policy version.
Current step.
Tool calls.
Approval state.
Budget usage.
Outcome.
7. Tool Gateway
O Tool Gateway é a principal fronteira entre o Agent e capacidades externas.
Authenticate agent.
Authorize tool.
Validate parameters.
Apply policy.
Apply rate/usage limits.
Require approval.
Log execution.
Return controlled result.
8. Tool Definition
Campo
	Objetivo
	Exemplo
	
Tool ID
	Unique capability
	create_purchase_order
	
Version
	Contract version
	v2
	
Risk
	Risk classification
	High
	
Scope
	Allowed context
	Tenant + procurement
	
Input schema
	Parameter validation
	JSON Schema
	
Approval
	Human control
	Required > threshold
	
9. Tool Risk Classification
Tier
	Característica
	Controle
	
Low
	Read-only/non-impacting
	Automated
	
Medium
	Operational change
	Policy + limits
	
High
	Financial/irreversible
	Approval/strong controls
	
Critical
	Material external impact
	Explicit human authorization
	
10. Tool Authorization
Agent identity.
Tenant.
Tool.
Resource.
Action.
Risk.
Policy.
Approval state.
11. Parameter Validation
Schema validation.
Type validation.
Range limits.
Allowlisted values.
Resource ownership.
No arbitrary command execution.
12. Agent Policies
Allowed tools.
Denied tools.
Transaction limits.
Time limits.
Concurrency.
Budget.
Approval thresholds.
Tenant scope.
13. Autonomy Tiers
Tier
	Autonomia
	Controle
	
A0
	Assist only
	Human executes
	
A1
	Recommend
	Human approves
	
A2
	Execute low-risk
	Policy constrained
	
A3
	Execute bounded workflows
	Policy + monitoring
	
A4
	High autonomy
	Explicit governance; only where authorized
	
14. Human Approval
Approval required by policy.
Approval context preserved.
Approval token scoped.
Approval cannot be transferred silently.
Agent stops if approval denied/expired.
15. Context Management
Minimum necessary context.
Tenant-aware retrieval.
Source references.
Context size budget.
Freshness requirements.
Sensitive data filtering.
16. Memory
Separate working context from durable business data.
Memory has owner and retention.
No implicit cross-tenant memory.
User-controlled data where applicable.
Audit sensitive memory access.
17. Retrieval
Authorized retrieval only.
Security trimming.
Source provenance.
Freshness metadata.
No unrestricted vector/database access.
18. Tool Results
Structured result.
Source/reference.
Timestamp.
Status.
Sensitive fields minimized.
Untrusted external content clearly bounded.
19. Prompt & Instruction Security
System policy outside user-controlled content.
Treat retrieved content as untrusted instructions.
Tool authorization cannot be overridden by prompt text.
Prompt injection detection/mitigation.
Separate data from executable instructions.
20. Agent-to-Agent Communication
Explicit agent identity.
Capability boundaries.
Delegation policy.
Tenant propagation.
Traceability.
No implicit trust between agents.
21. External Actions
Tool Gateway.
Policy evaluation.
Idempotency.
Approval where required.
Audit.
Reconciliation for unknown outcomes.
22. Financial Actions
Strong policy controls.
Amount limits.
Idempotency.
Human approval thresholds.
Ledger/reconciliation.
No direct payment provider credentials in model context.
23. Agent Budgets
Token budget.
Time budget.
Tool-call budget.
Financial/action budget.
Per-tenant quota.
Kill switch.
24. Termination Conditions
Task completed.
Policy denial.
Budget exhausted.
Timeout.
Repeated tool failure.
Safety block.
Human cancellation.
25. Observability
Agent execution ID.
Model/provider.
Latency.
Token usage.
Cost.
Tool calls.
Policy decisions.
Approval events.
Outcome.
Fallback.
26. Audit
Agent identity/version.
Policy version.
Tools invoked.
Inputs/parameter references.
Approvals.
Outputs/results references.
Execution timestamps.
Final outcome.
Sensitive prompts/responses should be minimized or protected according to ARCH-027 and ARCH-026.
27. Security
Workload identity.
Least privilege.
Tool allowlists.
Network restrictions.
Secret isolation.
Tenant isolation.
Runtime monitoring.
28. Failure & Recovery
Provider timeout.
Tool failure.
Partial execution.
Unknown external outcome.
Resume from durable state.
Retry only safe operations.
Human recovery path.
29. Evaluation & Testing
Tool permission tests.
Policy tests.
Prompt injection tests.
Tenant isolation tests.
Approval boundary tests.
Budget tests.
Failure injection.
Agent behavior regression.
30. Agent Lifecycle
Design → Register → Risk Review → Test → Approve → Deploy → Monitor → Review → Retire
Versioning.
Owner.
Risk classification.
Allowed tools.
Policy.
Evaluation evidence.
Retirement date.
31. Change Management
Model changes.
Prompt changes.
Tool changes.
Policy changes.
Autonomy changes.
Mudanças que alterem capacidade ou risco deverão passar por avaliação apropriada antes da ativação.
32. Anti-Patterns Proibidos
Agent with unrestricted DB access.
Agent with unrestricted network access.
Model decides its own authorization.
Agent changes its own policy.
Human approval simulated by AI.
Unbounded autonomous loops.
Secrets placed in prompts/context.
33. Definition of Done
Agent identity defined.
Risk tier defined.
Tool registry defined.
Tool Gateway enforced.
Policy controls defined.
Approval boundary defined.
Budgets defined.
Observability/audit defined.
Failure recovery tested.
34. Decisão Arquitetural
A Trust Platform adotará AI Agents como atores governados e limitados. Todo acesso operacional ocorrerá por Tool Gateway, com identidade, autorização, policy evaluation, limites de orçamento e, quando necessário, aprovação humana. O modelo nunca será a autoridade final para autorizar sua própria ação.
35. Relação com o AI Buyer
O futuro AI Buyer deverá ser implementado sobre esta arquitetura, utilizando os mesmos mecanismos de Agent Identity, Tool Gateway, Policy Engine, Workflow/Approval, Audit, Observability e Tenant Isolation. A arquitetura suporta autonomia futura sem incorporá-la ao MVP atual.
36. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-007 — AI Integration Architecture
ARCH-023 — Secrets Management & Key Management Architecture
ARCH-024 — Identity, Authentication & Session Architecture
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
ARCH-026 — Audit, Compliance & Regulatory Evidence Architecture
ARCH-027 — Data Privacy, LGPD & Data Protection Architecture
ARCH-028 — Observability, Monitoring & Alerting Architecture
ARCH-029 — Error Handling, Resilience & Fault Tolerance Architecture
ARCH-034 — Service-to-Service Communication & Internal Networking Architecture
ARCH-039 — Workflow, Approval & Human-in-the-Loop Architecture
ARCH-040 — Rules Engine, Policy Evaluation & Decision Management Architecture
37. Princípio Fundamental
AI Agents não são usuários com privilégios especiais; são atores digitais governados por identidade, policy, capabilities, limites e auditoria.
