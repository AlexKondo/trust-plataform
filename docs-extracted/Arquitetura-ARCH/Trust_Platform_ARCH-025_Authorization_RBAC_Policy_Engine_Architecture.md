Trust Platform
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-025
	
Document Name
	Authorization, RBAC & Policy Engine Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Security
	
Applies To
	APIs, serviços, organizações, recursos, workflows, integrações e AI Agents
	
Depends On
	ENG-000, ARCH-005, ARCH-018, ARCH-024, ARCH-019, ARCH-021, ARCH-023
	
1. Objetivo
Definir como a Trust Platform tomará decisões de autorização, combinando RBAC, contexto de organização, atributos e políticas para controlar acesso a recursos e ações de forma consistente, auditável e escalável.
2. Princípios
Default Deny.
Authorization is enforced server-side.
Least Privilege.
Authentication does not imply authorization.
Policy decisions are explicit and explainable.
Tenant boundary is part of authorization.
High-risk actions require stronger policy.
AI Agents use explicit scopes and policies.
3. Authentication vs Authorization
Who are you? → Authentication
What may you do? → Authorization
Identidade fornece contexto; autorização determina acesso.
4. Authorization Model
A arquitetura combinará RBAC com atributos e políticas contextuais quando necessário.
RBAC — role-based access.
ABAC — attribute-based conditions.
Resource ownership.
Tenant context.
Risk context.
Policy conditions.
5. RBAC
Role
	Exemplo
	Escopo
	
Organization Admin
	Administrador do cliente
	Organization
	
Buyer
	Usuário de compras
	Organization + procurement
	
Seller
	Fornecedor
	Organization + selling
	
Finance Operator
	Operação financeira
	Scoped finance
	
Compliance Operator
	Compliance
	Scoped cross-domain
	
Platform Operator
	Operação Trust
	Platform controlled
	
6. Permission Model
Permissões deverão ser granulares o suficiente para evitar roles excessivamente poderosas.
Resource.
Action.
Scope.
Conditions.
Exemplo: payment:approve dentro de uma organização e somente abaixo de determinado limite.
7. Resource Authorization
Can user access resource?
Does user belong to owner organization?
Is resource status compatible?
Is action permitted?
Are contextual conditions satisfied?
8. Tenant Authorization
Toda autorização deverá considerar tenant context quando o recurso pertencer a uma organização.
Validate membership.
Validate organization status.
Validate resource ownership.
Explicit cross-tenant permission only.
9. ABAC / Policy Conditions
Atributos poderão complementar RBAC.
Transaction amount.
Resource status.
Organization.
User role.
Risk level.
Time.
Geography when legally appropriate.
Approval state.
10. Policy Engine
A plataforma poderá utilizar um Policy Decision Point centralizado para políticas complexas, mantendo regras simples próximas ao domínio.
Subject + Action + Resource + Context → Policy Decision → Allow / Deny / Step-Up
11. Policy Enforcement
API Gateway for coarse controls.
Application service for business authorization.
Domain for ownership/business invariants.
Workflow for approval transitions.
Data layer as defense-in-depth.
12. Policy Decision Types
Allow.
Deny.
Require MFA/Step-Up.
Require Approval.
Allow with constraints.
Escalate.
13. High-Risk Actions
Payment approval.
Change payout account.
Refund above threshold.
User privilege elevation.
Bulk export.
Cross-tenant access.
AI execution of sensitive tool.
14. Segregation of Duties
Ações críticas poderão exigir que diferentes pessoas/roles executem etapas distintas.
Requester ≠ Approver.
Creator ≠ Reviewer where required.
Operator ≠ Auditor.
AI Agent ≠ final approver for high-risk actions unless explicitly governed and legally/operationally approved.
15. Approval Policies
Policies poderão determinar thresholds e quantidade de approvers.
Amount threshold.
Risk tier.
Organization policy.
Transaction type.
Dual approval.
16. AI Agent Authorization
AI Agents deverão utilizar autorização explícita e limitada.
Agent identity.
Delegated scopes.
Tool allowlist.
Tenant context.
Budget.
Risk policy.
Approval gate.
O Agent deverá receber apenas as ferramentas necessárias para sua tarefa.
17. Policy Versioning
Policy ID.
Version.
Owner.
Effective date.
Status.
Change reason.
Approval.
Decisões críticas deverão ser reproduzíveis a partir da versão da policy aplicada.
18. Policy Evaluation
Deterministic when possible.
Low latency.
Cache safe decisions only when context permits.
Fail closed for critical authorization.
Explain decision reason internally.
19. Authorization Cache
Decisões poderão ser cacheadas somente quando invalidação e contexto forem seguros.
Tenant-aware key.
Permission version.
Short TTL.
Invalidate on role/membership change.
20. Cross-Tenant Access
Explicit policy.
Elevated scope.
Audit.
Reason.
Time-bound access when possible.
21. Delegation
Usuários poderão delegar permissões somente quando permitido pela policy.
Delegator.
Delegatee.
Scope.
Start/end.
Revocation.
Audit.
22. Emergency / Break-Glass Access
Restricted roles.
Justification required.
Time-bound.
Enhanced audit.
Post-incident review.
23. Audit
Subject.
Action.
Resource.
Decision.
Policy version.
Tenant.
Context.
Timestamp.
Reason for elevated access.
24. Testing
Positive authorization tests.
Negative tests.
Cross-tenant denial.
Privilege escalation tests.
Policy regression.
Approval threshold tests.
AI tool authorization tests.
25. Observability
Allow/deny rate.
Policy latency.
Denied action categories.
Step-up rate.
Break-glass usage.
Cross-tenant attempts.
Policy evaluation errors.
26. Failure Modes
Policy engine unavailable → fail closed for critical actions.
Policy cache stale → invalidate/re-evaluate when required.
Unknown policy version → deny or safe fallback.
Authorization dependency unavailable → do not silently grant access.
27. Anti-Patterns Proibidos
Authorization only in frontend.
Role 'Admin' used everywhere.
Tenant authorization omitted.
AI Agent with wildcard permissions.
Policy decision without audit for critical action.
Authorization fail-open for financial/security actions.
Hardcoded business approval rules scattered across services.
28. Definition of Done
RBAC model defined.
Permission model defined.
Tenant enforcement defined.
Policy conditions defined.
High-risk action policies defined.
AI Agent scopes defined.
Audit implemented.
Negative authorization tests implemented.
29. Decisão Arquitetural
A Trust Platform adotará RBAC como base, complementado por ABAC/policies contextuais quando necessário. Autorização será server-side, tenant-aware, default-deny e auditável. Políticas críticas serão versionadas e deverão permitir reconstrução da decisão aplicada.
30. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-018 — Multi-Tenancy Architecture
ARCH-019 — Rate Limiting, Quotas & Abuse Prevention
ARCH-021 — Workflow & Process Orchestration Architecture
ARCH-023 — Secrets Management & Key Management Architecture
ARCH-024 — Identity, Authentication & Session Architecture
ARCH-006 — Audit & Compliance
31. Princípio Fundamental
Nenhum usuário, serviço ou AI Agent deve ter acesso porque pode; deve ter acesso somente porque uma policy explicitamente permite.
