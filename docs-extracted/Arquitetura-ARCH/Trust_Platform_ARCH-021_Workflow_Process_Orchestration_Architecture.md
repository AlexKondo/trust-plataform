Trust Platform
ARCH-021 — Workflow & Process Orchestration Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-021
	
Document Name
	Workflow & Process Orchestration Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Workflows de negócio, approvals, processos assíncronos, jobs e futuras automações
	
Depends On
	ENG-000, ARCH-001, ARCH-002, ARCH-005, ARCH-006, ARCH-007, ARCH-009, ARCH-010, ARCH-013, ARCH-014
	
1. Objetivo
Definir como processos de negócio de longa duração, workflows, approvals e orquestrações serão modelados, executados, pausados, retomados, compensados e auditados, mantendo separação entre regras de negócio, eventos e infraestrutura de execução.
2. Princípios
Workflow is explicit state, not hidden code.
Domain owns business state; orchestrator owns process state.
Long-running processes must be resumable.
Idempotency is mandatory for retried steps.
Human approvals are first-class states.
Failures must be recoverable.
Every critical transition is auditable.
AI agents may participate only through controlled capabilities.
3. Workflow vs Domain Logic
O domínio define o significado da operação; o workflow define a sequência e coordenação entre participantes.
Domain rule: 'payment requires authorization'.
Workflow: create payment → authorize → execute → reconcile → notify.
Workflow must not duplicate core financial rules.
4. Workflow Architecture
Trigger/Event → Workflow Instance → State → Task/Action → Event → Next State
Workflows poderão ser event-driven e/ou timer-driven.
5. Workflow Definition
Cada workflow deverá possuir definição versionada.
Workflow ID.
Version.
Owner.
Trigger.
States.
Transitions.
Actions.
Timeouts.
Retry policy.
Compensation.
Approval requirements.
6. Workflow Instance
workflowInstanceId.
workflowDefinitionVersion.
businessReference.
tenant/organization context.
currentState.
status.
startedAt.
updatedAt.
correlationId.
7. State Model
Pending → Running → Waiting → Completed
                  ↘ Failed / Compensating / Cancelled
Estados deverão ser explícitos e persistidos para workflows long-running.
8. Tasks & Actions
Uma task representa uma unidade de trabalho do workflow.
Action type.
Input.
Output.
Owner.
Timeout.
Retry policy.
Idempotency key.
Result.
9. Human Approval
Approvals serão modeladas como estados explícitos, não como bloqueios invisíveis.
Approver identity.
Required role.
Decision.
Reason.
Timestamp.
Delegation when permitted.
Audit event.
10. Timeouts & SLAs
Task timeout.
Workflow timeout.
Approval timeout.
Escalation timer.
Business SLA.
Timeouts não devem automaticamente significar falha; o comportamento deve ser definido pelo workflow.
11. Retry
Exponential backoff.
Maximum attempts.
Retryable vs permanent errors.
Idempotent action.
Dead-letter or failed state.
12. Compensation
Quando transações distribuídas não puderem ser atomicamente revertidas, workflows poderão executar ações compensatórias.
Step A → Step B → Step C fails → Compensate B → Compensate A
Compensation não deve ser confundida com rollback de banco.
13. Saga Pattern
Workflows distribuídos de longa duração poderão utilizar Saga orchestration quando a consistência exigir coordenação entre múltiplos domínios.
Local transaction per service.
Published event.
Next action.
Compensation on failure.
14. Event-Driven Integration
Domain events trigger workflows.
Workflow actions emit events.
Correlation ID propagated.
Event idempotency.
Replay considerations.
15. Scheduled Workflows
Timers.
Due dates.
Recurring jobs.
Delayed actions.
Reminder/escalation workflows.
Scheduler failure deverá ser observável e recuperável.
16. Workflow Persistence
O estado de workflows long-running deverá ser persistido de forma durável.
State snapshot.
Transition history.
Task status.
Retry count.
Pending timers.
Correlation metadata.
17. Concurrency
Optimistic locking.
Idempotency.
Distributed locks only when justified.
Duplicate event protection.
Explicit conflict resolution.
18. Cancellation
Workflows deverão definir se podem ser cancelados e quais efeitos a ação produz.
User cancellation.
System cancellation.
Timeout cancellation.
Compensation before termination when required.
Audit cancellation.
19. Recovery
Resume from persisted state.
Retry failed task.
Manual intervention.
Compensation.
Dead-letter recovery.
Replay events where safe.
20. Workflow Versioning
Novas versões não deverão alterar silenciosamente instâncias em andamento.
New instances use new version.
Existing instances continue under original version unless migration is explicitly supported.
Migration must be auditable.
21. Observability
Workflow duration.
State transitions.
Task latency.
Failure rate.
Retry count.
Approval wait time.
Stuck workflows.
Queue lag.
22. Audit & Compliance
Critical transitions audited.
Human decisions audited.
Configuration version referenced.
Workflow definition version referenced.
Actor/agent identified.
Business reference preserved.
23. AI & Agent Participation
AI poderá participar como decision-support ou executor controlado.
Agent identity.
Tool allowlist.
Risk policy.
Approval gate.
Output validation.
Audit.
Execution budget.
AI não poderá alterar o estado de um workflow crítico fora das transições autorizadas.
24. Financial Workflows
Workflows financeiros deverão possuir controles reforçados.
Idempotency.
Ledger authority remains in Payments/Finance domain.
Approval gates.
Reconciliation.
Compensation policy.
Unknown external outcomes handled explicitly.
25. Anti-Patterns Proibidos
Workflow state somente em memória.
Long-running process sem persistência.
Retry de ação não idempotente.
Approval escondido em código.
Workflow duplicando regras de domínio.
Versão alterada silenciosamente.
Agent executando ação fora do workflow policy.
26. Definition of Done
Workflow definition versionada.
State model definido.
Persistence implementada.
Retry/idempotency definidos.
Timeouts definidos.
Approval model definido quando aplicável.
Compensation definida quando necessária.
Observabilidade implementada.
Audit implementado para transições críticas.
27. Decisão Arquitetural
A Trust Platform adotará workflow orchestration explícita para processos de longa duração e coordenação entre domínios. O estado do processo será persistente, versionado e auditável, com idempotência, retries, compensação e approvals como capacidades nativas.
28. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-007 — AI Integration Architecture
ARCH-009 — API Architecture & Standards
ARCH-010 — Integration Architecture & External Systems
ARCH-013 — Disaster Recovery & Business Continuity
ARCH-014 — Configuration & Feature Flag Management
29. Princípio Fundamental
Processos complexos devem ser explícitos, persistentes, recuperáveis e auditáveis — nunca uma sequência invisível de chamadas.
