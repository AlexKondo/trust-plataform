Trust Platform
ARCH-039 — Workflow, Approval & Human-in-the-Loop Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-039
	
Document Name
	Workflow, Approval & Human-in-the-Loop Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Product & Risk
	
Applies To
	Workflows, approvals, escalations, human decisions, AI-assisted decisions, segregation of duties
	
Depends On
	ENG-000, ARCH-006, ARCH-007, ARCH-021, ARCH-025, ARCH-026, ARCH-028, ARCH-029, ARCH-038
	
1. Objetivo
Definir a arquitetura para execução de processos long-running, aprovações humanas, escalations e pontos de controle humano, incluindo workflows assistidos por AI e futura execução agentic.
2. Princípios
Workflow state is explicit and durable.
Approvals are first-class business objects.
Human decisions are auditable.
AI assists; authority remains governed.
Separation of duties for high-risk actions.
Timeouts and escalations are explicit.
Resumability is mandatory for long-running processes.
Approval context must be preserved.
3. Workflow Lifecycle
Create → Validate → Execute → Wait/Approve → Resume → Complete / Fail / Cancel
4. Workflow State
Workflow ID.
Definition/version.
Current state.
Variables/context.
Owner.
StartedAt.
UpdatedAt.
Deadline/SLA.
Correlation ID.
5. Workflow Definition
Versioned workflow definition.
Explicit states.
Transitions.
Conditions.
Tasks.
Timeouts.
Compensation.
Escalation.
6. Approval as a First-Class Object
Campo
	Objetivo
	Exemplo
	
Approval ID
	Unique decision reference
	APR-123
	
Approver
	Decision authority
	User/Role
	
Scope
	What is approved
	Purchase
	
Decision
	Outcome
	Approve/Reject
	
Context
	Evidence shown
	Amount + supplier
	
Policy
	Rule used
	Approval Policy v4
	
Timestamp
	When decided
	UTC timestamp
	
7. Approval Rules
Role-based.
Amount-based.
Risk-based.
Category-based.
Segregation-of-duties.
Multi-level.
Conditional.
8. Approval Context
O aprovador deverá receber contexto suficiente para tomar uma decisão informada, sem receber dados desnecessários.
Business object.
Amount/risk.
Supporting documents.
Policy/rule.
Previous decisions.
AI recommendation if applicable.
Decision consequences.
9. Human-in-the-Loop Levels
Nível
	Modelo
	Exemplo
	
Human-in-the-loop
	Human must approve
	Payment exception
	
Human-on-the-loop
	Human supervises
	Low-risk AI automation
	
Human-out-of-the-loop
	No human per transaction
	Only explicitly authorized low-risk automation
	
10. AI Recommendation
AI recommendation is clearly labeled.
Human sees rationale/evidence.
AI does not impersonate approver.
Final authority is explicit.
Recommendation and decision separately audited.
11. AI Agent Approval Boundary
AI Agents poderão executar tarefas somente dentro de policies e tool scopes autorizados. Ações de maior risco poderão exigir human approval antes da execução.
Agent proposes.
Policy evaluates.
Human approves when required.
Agent executes.
Result audited.
12. Approval Delegation
Temporary delegation.
Effective period.
Scope.
Delegator.
Delegate.
Audit.
13. Escalation
SLA deadline.
Reminder.
Escalate to manager.
Escalate to backup.
Critical escalation.
14. Timeout
Task timeout.
Approval timeout.
Workflow timeout.
Escalation timeout.
Cancellation policy.
15. Reassignment
Approver unavailable.
Role change.
Delegation.
Explicit reassignment audit.
16. Separation of Duties
Requester cannot approve own high-risk request.
Creator cannot finalize controlled financial operation.
Admin cannot silently approve own privileged action.
Rules enforced by policy engine.
17. Multi-Level Approval
Sequential.
Parallel.
Quorum.
Conditional branches.
18. Approval Evidence
Decision.
Approver identity.
Role.
Timestamp.
Policy version.
Context hash/reference.
Supporting evidence.
19. Change of Context
Se material facts mudarem após a aprovação, a plataforma poderá invalidar ou exigir nova aprovação.
Amount changed.
Supplier changed.
Risk changed.
Policy changed.
Material document changed.
20. Cancellation & Rejection
Reason.
Actor.
Timestamp.
Next state.
Notification.
21. Compensation
Workflows com efeitos parciais deverão possuir compensation actions quando aplicável.
Reverse.
Refund.
Cancel.
Release reservation.
Manual recovery.
22. Observability
Workflow duration.
Approval wait time.
SLA breach.
Escalation count.
Rejection rate.
Human intervention rate.
AI recommendation acceptance rate.
23. Audit
Workflow version.
State transitions.
Approval decisions.
Delegations.
Escalations.
AI recommendations.
Policy version.
Execution result.
24. Notification Integration
ARCH-038 deverá ser usado para reminders, approvals e escalations.
Approval requested.
Reminder.
Escalation.
Approved/rejected.
Workflow failed.
25. SLA Integration
Deadline tracking.
Warning threshold.
Breach event.
Escalation.
Operational KPI.
26. Security
Approver authorization checked at decision time.
Tenant isolation.
Anti-self-approval.
Session/authentication assurance.
Privileged approval controls.
27. AI Safety
AI cannot fabricate approval.
AI cannot alter human decision.
AI cannot bypass required approval.
Agent must stop on denied approval.
Approval token is scoped and non-transferable.
28. Testing
Approval policy tests.
Self-approval prevention.
Delegation tests.
Timeout/escalation.
Context-change reapproval.
Agent approval boundary.
Replay/resume tests.
29. Anti-Patterns Proibidos
Approval stored only as boolean.
Approval without identity.
Approval without context.
AI marking its own action as human-approved.
Workflow state only in memory.
Silent reassignment.
Bypass of SoD.
30. Definition of Done
Workflow state model defined.
Approval object defined.
Policy integration defined.
Escalation defined.
Delegation defined.
Audit defined.
AI boundary defined.
Resume/recovery tested.
31. Decisão Arquitetural
A Trust Platform tratará workflows e approvals como objetos persistentes, versionados e auditáveis. Human-in-the-loop será um mecanismo arquitetural explícito para controlar ações de maior risco, especialmente quando AI estiver envolvida. A autoridade de decisão nunca será inferida da recomendação de uma IA.
32. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-006 — Approval & Workflow Architecture
ARCH-007 — AI Integration Architecture
ARCH-021 — Workflow & Process Orchestration Architecture
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
ARCH-026 — Audit, Compliance & Regulatory Evidence Architecture
ARCH-028 — Observability, Monitoring & Alerting Architecture
ARCH-029 — Error Handling, Resilience & Fault Tolerance Architecture
ARCH-038 — Notification & Communication Architecture
33. Princípio Fundamental
Uma recomendação de IA pode informar uma decisão; somente uma autoridade autorizada pode concedê-la quando a política exigir aprovação humana.
