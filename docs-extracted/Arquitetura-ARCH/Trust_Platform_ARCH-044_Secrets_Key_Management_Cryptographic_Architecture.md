Trust Platform
ARCH-044 — Secrets Management, Key Management & Cryptographic Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-044
	
Document Name
	Secrets Management, Key Management & Cryptographic Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Security
	
Applies To
	Application secrets, API credentials, encryption keys, certificates, signing keys, token secrets and cryptographic operations
	
Depends On
	ENG-000, ARCH-005, ARCH-023, ARCH-024, ARCH-031, ARCH-032, ARCH-033, ARCH-034, ARCH-041, ARCH-043
	
1. Objetivo
Definir como secrets, encryption keys, certificates e outros materiais criptográficos serão armazenados, utilizados, rotacionados, revogados e auditados, reduzindo exposição e evitando credenciais permanentes espalhadas pela plataforma.
2. Princípios
Secrets never live in source control.
Use managed secret/key services where possible.
Least privilege.
Short-lived credentials preferred.
Keys and secrets have owners and lifecycle.
Cryptographic operations should be centralized when appropriate.
Rotation must be designed, not improvised.
Access is auditable.
3. Secret vs Key vs Certificate
Tipo
	Uso
	Exemplo
	
Secret
	Credential/token/password
	DB password
	
Encryption Key
	Encrypt/decrypt data
	DEK/KEK
	
Signing Key
	Digital signature
	Artifact signing
	
Certificate
	Identity/public key
	TLS certificate
	
4. Secret Storage
Central Secret Manager.
Encrypted at rest.
Access via workload identity.
No secrets in application config files.
No secrets in logs.
5. Secret Injection
Runtime injection.
Short-lived access.
Environment-scoped.
Service-scoped.
Do not expose secrets to model prompts.
6. Secret Lifecycle
Create → Store → Use → Rotate → Revoke → Retire
Owner.
Purpose.
Scope.
Expiration.
Rotation method.
7. Rotation
Automated where possible.
Dual credential overlap for zero-downtime rotation.
Rotation monitoring.
Failure alert.
Emergency rotation.
8. Revocation
Immediate revoke for compromise.
Disable credential.
Invalidate sessions/tokens where relevant.
Audit event.
Incident linkage.
9. Workload Identity
Prefer workload identity over static credentials.
Short-lived tokens.
Audience restriction.
Least privilege.
Environment binding.
10. Database Credentials
Managed identity where available.
Dynamic credentials where justified.
Separate roles.
No shared admin credentials.
11. API Provider Credentials
Provider-specific secret.
Environment scoped.
Tenant separation where needed.
Rotation.
Usage monitoring.
12. TLS Certificates
Automated issuance/renewal.
Expiration monitoring.
Private key protection.
Revocation process.
mTLS certificates managed separately where appropriate.
13. Key Hierarchy
KMS/Root Protection → KEK → DEK → Data
A implementação concreta poderá variar conforme cloud/provider, mas key separation e lifecycle devem permanecer explícitos.
14. Encryption at Rest
Managed encryption by default.
Customer-managed keys where required.
Separate keys by environment.
Dedicated keys for high-isolation tenants where justified.
15. Encryption in Transit
TLS for external traffic.
TLS/mTLS for sensitive internal traffic where justified.
Modern protocol configuration.
Certificate monitoring.
16. Application-Level Encryption
Application-level encryption poderá ser usada para campos altamente sensíveis quando storage-level encryption não for suficiente.
Key separation.
Access control.
Rotation strategy.
Search/index implications considered.
17. Hashing
Password hashing with modern adaptive algorithms.
Integrity hashes/checksums.
No reversible encryption for passwords.
18. Digital Signatures
Artifact signing.
Evidence integrity.
Webhook/signature validation where applicable.
Private signing keys isolated.
19. Cryptographic Algorithms
Use modern, vetted algorithms.
Do not invent cryptography.
Algorithm selection documented.
Deprecate weak algorithms.
Central security review for exceptions.
20. Key Rotation
Rotation schedule by key class.
Automatic where feasible.
Backward compatibility during transition.
Historical decryption where legally/business required.
21. Multi-Tenant Keys
Shared keys for standard tenants when risk permits.
Dedicated keys for enterprise/restricted tiers where justified.
Tenant key mapping audited.
No cross-tenant key access.
22. AI & Cryptographic Material
AI models never receive raw secrets by default.
Tool Gateway handles credentials.
Agent context contains references, not secrets.
Secret retrieval requires authorized workload/tool.
23. Key Access for AI Buyer
O futuro AI Buyer poderá executar tools que usam credentials internas, porém as credenciais permanecerão fora do Agent Runtime. O Tool Gateway/Service executará a operação usando sua própria authorized identity.
24. Logging & Monitoring
Secret access events.
Key usage anomalies.
Certificate expiry.
Rotation failures.
Unauthorized access.
No secret values in logs.
25. Backup & Recovery
Key backup/recovery where supported.
Recovery authorization.
Separate recovery controls.
Documented loss scenarios.
26. Emergency Response
Compromised secret rotation.
Certificate emergency renewal.
Key disablement.
Provider credential revocation.
Incident response integration.
27. Testing
Secret rotation.
Revocation.
Certificate renewal.
Key access policy.
Backup/recovery.
AI secret isolation.
Logging leakage tests.
28. Anti-Patterns Proibidos
Secrets in Git.
Secrets in Docker images.
Secrets in logs.
Hardcoded API keys.
Shared root/admin credentials.
AI model receiving raw credentials.
Manual key rotation with no audit.
29. Definition of Done
Secret Manager defined.
Workload identity defined.
Key hierarchy defined.
Rotation defined.
Certificate lifecycle defined.
Access audit defined.
AI credential boundary defined.
Recovery tested.
30. Decisão Arquitetural
A Trust Platform utilizará Secret Manager/KMS gerenciados, workload identities e credenciais de curta duração sempre que possível. Secrets e cryptographic keys permanecerão fora de source code, Feature Flags e AI model context. O acesso será least-privilege, auditável e sujeito a lifecycle/rotation.
31. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-023 — Secrets Management & Key Management Architecture
ARCH-024 — Identity, Authentication & Session Architecture
ARCH-031 — Infrastructure, Deployment & Environment Architecture
ARCH-032 — CI/CD & Software Delivery Architecture
ARCH-033 — API Gateway, Edge Security & Traffic Management Architecture
ARCH-034 — Service-to-Service Communication & Internal Networking Architecture
ARCH-041 — AI Agent Runtime, Tool Gateway & Agent Governance Architecture
ARCH-043 — Configuration, Feature Flags & Runtime Control Architecture
32. Princípio Fundamental
Segredos devem ser invisíveis ao código, chaves devem ter ciclo de vida e nenhuma IA deve receber privilégios criptográficos que não seriam concedidos a um serviço tradicional.
