Trust Platform
ARCH-026 — Audit, Compliance & Regulatory Evidence Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-026
	
Document Name
	Audit, Compliance & Regulatory Evidence Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Security / Compliance
	
Applies To
	Eventos de auditoria, decisões de autorização, operações financeiras, documentos e evidências regulatórias
	
Depends On
	ENG-000, ARCH-005, ARCH-006, ARCH-008, ARCH-016, ARCH-024, ARCH-025
	
1. Objetivo
Definir uma arquitetura de auditoria e evidências que permita reconstruir eventos relevantes da Trust Platform, demonstrar quem fez o quê, quando, em qual contexto e sob qual policy, preservando integridade, rastreabilidade, retenção e acesso controlado.
2. Princípios
Auditability by Design.
Evidence must be tamper-evident.
Record facts, not unnecessary personal data.
Critical decisions must be reconstructable.
Audit storage is separate from operational state.
Retention is policy-driven.
Privileged access is itself auditable.
Compliance evidence must be exportable.
3. Audit vs Application Logs
Tipo
	Finalidade
	Exemplo
	
Application Log
	Diagnóstico técnico
	Stack trace
	
Operational Metric
	Performance/health
	Latency p95
	
Audit Event
	Ação relevante
	Payment approved
	
Compliance Evidence
	Prova formal
	Approval + policy version + document
	
4. Audit Event Model
Eventos de auditoria deverão possuir estrutura padronizada.
auditEventId.
eventType.
timestamp.
actorId.
actorType.
organizationId when applicable.
action.
resourceType.
resourceId.
outcome.
policyVersion when applicable.
correlationId.
metadata.
5. Actor Types
Human User.
Service.
Operator.
System.
AI Agent.
Atores automatizados não deverão aparecer como usuários humanos.
6. Critical Events
Authentication/security events.
Authorization decisions.
Privilege changes.
Payment initiation/approval.
Refund.
Settlement.
Account changes.
Document access.
Policy changes.
Configuration changes.
AI tool execution.
Break-glass access.
7. Financial Evidence
Operações financeiras deverão manter evidência suficiente para reconstrução e reconciliação.
Transaction ID.
Actor.
Authorization.
Policy version.
Amount/currency.
External provider reference.
Outcome.
Correlation ID.
Timestamp.
8. Policy Evidence
Para decisões críticas, registrar a policy e contexto suficientes para reproduzir a decisão.
Policy ID/version.
Subject.
Action.
Resource.
Relevant attributes.
Decision.
Approval reference.
9. Tamper Evidence
Append-only storage where appropriate.
Integrity checksum/hash.
Immutable storage for high-value evidence.
Restricted deletion.
Access audit.
10. Immutability
Evidências regulatórias ou de disputa poderão utilizar storage imutável e retention lock.
No overwrite.
Controlled retention.
Legal Hold.
Cryptographic integrity.
11. Data Minimization
Do not store passwords/secrets.
Do not copy entire documents unnecessarily.
Prefer identifiers over raw PII.
Mask sensitive values.
Purpose-based metadata.
12. Retention
Retention deverá ser definida por categoria, obrigação legal, risco e necessidade operacional.
Retention policy.
Retention class.
Expiration.
Legal Hold.
Deletion eligibility.
13. Legal Hold
Quando houver investigação, disputa ou obrigação legal, os registros aplicáveis poderão ser colocados em Legal Hold para impedir exclusão automática.
14. Audit Access
Least privilege.
Compliance roles.
Support access restricted.
Sensitive evidence access logged.
Exports require authorization.
15. Audit Export
Time range.
Organization.
Resource.
Actor.
Event type.
Correlation ID.
Evidence package.
Export deverá preservar integridade e metadados relevantes.
16. Evidence Package
Event + Related Events + Documents + Policy + Approvals + Integrity Metadata
Packages poderão ser gerados para incidentes, auditorias ou disputas.
17. Correlation & Traceability
correlationId.
causationId when applicable.
transactionId.
workflowInstanceId.
requestId.
Esses identificadores permitem conectar API request, workflow, eventos, pagamentos e notificações.
18. AI Audit
Ações de AI deverão ser auditáveis em nível suficiente para reconstruir a execução.
Agent ID.
Model/provider.
Policy version.
Tools invoked.
Tool inputs/outputs subject to privacy policy.
Approval.
Outcome.
Cost/usage where relevant.
19. Compliance Automation
A arquitetura poderá alimentar controles automatizados.
Evidence collection.
Policy checks.
Retention enforcement.
Access review.
Compliance reporting.
20. Access Reviews
Periodic role review.
Privileged access review.
Inactive account review.
Agent scope review.
Service credential review.
21. Audit Integrity Monitoring
Missing sequence detection where applicable.
Unexpected deletion.
Integrity verification.
Storage health.
Unauthorized access.
22. Failure & Recovery
Audit pipeline failure must not block normal business unnecessarily, except where compliance policy requires fail-closed behavior.
Durable queue.
Retry.
DLQ.
Recovery/replay.
Audit backlog monitoring.
23. Testing
Event generation.
Actor attribution.
Tenant attribution.
Policy version capture.
Immutability.
Retention.
Export.
Recovery.
24. Anti-Patterns Proibidos
Audit event without actor.
Critical action without correlation.
Mutable audit records.
Audit logs containing secrets.
Deleting evidence to hide operational errors.
AI actions indistinguishable from human actions.
Compliance evidence dependent only on application logs.
25. Definition of Done
Audit event schema defined.
Critical events mapped.
Retention policies defined.
Immutable evidence strategy defined.
Access controls defined.
Export mechanism defined.
Integrity monitoring defined.
AI audit model defined.
Recovery procedure defined.
26. Decisão Arquitetural
A Trust Platform adotará uma camada de Audit & Compliance Evidence separada dos logs operacionais, com eventos estruturados, append-only/tamper-evident storage quando necessário, retention policy, Legal Hold, exportação controlada e rastreabilidade ponta a ponta. Ações de AI serão identificadas como ações de agentes, nunca mascaradas como ações humanas.
27. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-008 — Data Architecture & Governance
ARCH-016 — File & Document Management Architecture
ARCH-024 — Identity, Authentication & Session Architecture
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
ARCH-021 — Workflow & Process Orchestration Architecture
28. Princípio Fundamental
Se uma decisão é crítica, a Trust deve conseguir explicar posteriormente quem a tomou, sob qual regra, com qual contexto e qual foi o resultado.
