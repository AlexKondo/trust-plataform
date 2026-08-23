Trust Platform
ARCH-072 — Enterprise Identity Federation, B2B SSO & Workforce Lifecycle Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-072
	
Document Name
	Enterprise Identity Federation, B2B SSO & Workforce Lifecycle Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Identity / Security / Platform Engineering
	
Applies To
	Enterprise SSO, identity federation, workforce/customer user lifecycle, provisioning, deprovisioning, SCIM, MFA, identity assurance and B2B access
	
Depends On
	ENG-000, ARCH-018, ARCH-021, ARCH-022, ARCH-025, ARCH-055, ARCH-065, ARCH-071
	
1. Objetivo
Definir como identidades enterprise serão federadas, autenticadas, provisionadas e desprovisionadas na Trust Platform, suportando B2B SSO e workforce lifecycle sem misturar identidade do cliente com autorização interna da plataforma.
2. Princípios
Federated identity is preferred for enterprise users.
Authentication and authorization are separate decisions.
Customer IdP remains authoritative for workforce identity where federated.
Platform remains authoritative for platform authorization.
Deprovisioning must propagate quickly.
Tenant context is mandatory.
Privileged access requires stronger assurance.
AI agents are not human identities.
3. Identity Flow
Customer IdP → Federation → Trust Identity → Tenant Context → Authorization → Audit
4. Federation Protocols
Protocolo
	Uso
	Exemplo
	
OIDC
	Modern authentication
	Web SSO
	
SAML 2.0
	Enterprise federation
	B2B SSO
	
SCIM
	Lifecycle provisioning
	User/group sync
	
OAuth 2.x
	Delegated API access
	Integration
	
5. Tenant Identity Boundary
Tenant ID resolved from federation configuration.
User identity scoped to tenant.
Cross-tenant access denied by default.
Group/role mapping tenant-specific.
6. Authentication
SSO.
MFA.
Passwordless where supported.
Step-up authentication.
Session management.
7. Identity Assurance
Identity provider trust.
MFA state.
Authentication method.
Device/context signals where appropriate.
Privileged assurance.
8. Group & Role Mapping
IdP group.
Platform role.
Tenant scope.
Entitlement scope.
Approval role.
9. SCIM Provisioning
Create.
Update.
Deactivate.
Group membership.
Attribute sync.
Reconciliation.
10. Workforce Lifecycle
Joiner → Mover → Leaver
11. Joiner
Provision user.
Map role.
Apply tenant.
Apply entitlements.
Require MFA.
Audit.
12. Mover
Role change.
Department change.
Tenant scope change where permitted.
Entitlement recalculation.
Remove obsolete access.
13. Leaver
Deactivate.
Revoke sessions.
Revoke tokens.
Remove privileged access.
Audit.
14. Privileged Identity
Separate privileged role.
Step-up MFA.
Just-in-time access.
Approval.
Session audit.
15. B2B External Users
Customer-managed identities.
Tenant invitation/federation.
Scoped roles.
Lifecycle controlled.
Audit.
16. Service Identities
Workload identity.
API client.
Integration identity.
Agent identity.
Non-human classification.
17. AI Agent Identity
AI Agents não serão representados como humanos. Cada Agent/Agent instance deverá possuir identidade não-humana, tenant context e policy scope próprios.
Agent ID.
Tenant.
Capability scope.
Tool scope.
Budget.
Autonomy tier.
18. AI Buyer Identity
O AI Buyer deverá possuir identidade própria e auditável, separada da identidade do usuário que iniciou ou aprovou uma operação.
Initiating human actor.
Agent identity.
Approving human actor.
Service/tool identity.
19. Delegation
Human delegates bounded authority to Agent.
Delegation scope explicit.
Expiry.
Revocation.
Audit.
20. Session Management
Session lifetime.
Refresh token control.
Revocation.
Concurrent sessions.
Risk-based step-up.
21. Identity Events
Login.
Logout.
Provision.
Deprovision.
Role change.
MFA change.
Federation change.
22. Audit
Identity event.
Authentication method.
Actor.
Tenant.
Role.
Decision.
23. Identity Security
Credential protection.
Token validation.
Replay protection.
Federation trust.
Suspicious login detection.
24. Federation Failure
Graceful failure.
No insecure bypass.
Emergency admin path separately governed.
Customer communication.
25. Customer IdP Changes
Certificate rotation.
Metadata change.
Claim mapping.
Domain change.
Emergency disable.
26. Testing
SSO.
MFA.
SCIM.
Joiner/mover/leaver.
Role mapping.
Tenant isolation.
Federation failure.
AI identity.
27. Anti-Patterns Proibidos
Authentication treated as authorization.
Shared human accounts.
Permanent privileged access.
AI Agent using human credentials.
Leaver retaining active session.
Cross-tenant group mapping without explicit policy.
28. Definition of Done
Federation protocols defined.
Tenant identity boundary defined.
SSO/MFA defined.
SCIM lifecycle defined.
Privileged identity defined.
Non-human identity defined.
AI Buyer identity defined.
Audit/testing defined.
29. Decisão Arquitetural
A Trust Platform suportará enterprise federation via OIDC/SAML e lifecycle provisioning via SCIM, mantendo separação entre authentication e authorization. Tenant context será obrigatório e non-human identities terão modelo próprio.
30. Relação com AI Buyer
O AI Buyer terá identidade não-humana própria. Toda operação relevante registrará separadamente o usuário iniciador, o Agent que executou, o humano que aprovou quando aplicável e a identidade do Tool/Service utilizado. O Agent nunca herdará implicitamente credenciais humanas.
31. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-018 — Multi-Tenancy Architecture
ARCH-021 — Authentication, Identity & Session Architecture
ARCH-022 — Enterprise SSO, Federation & SCIM Architecture
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
ARCH-055 — Platform Administration, Tenant Management & Enterprise Control Plane Architecture
ARCH-065 — Enterprise Governance, Risk Management & Decision Rights Architecture
ARCH-071 — Enterprise Records Management, Retention, Legal Hold & Information Lifecycle Architecture
32. Princípio Fundamental
Identidade responde 'quem é'; autorização responde 'o que pode fazer'; delegation responde 'em nome de quem'; auditoria responde 'o que realmente aconteceu'.
