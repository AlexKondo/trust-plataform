Trust Platform
ARCH-023 — Secrets Management & Key Management Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-023
	
Document Name
	Secrets Management & Key Management Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Security
	
Applies To
	Secrets, API credentials, certificates, encryption keys e credenciais de serviços
	
Depends On
	ENG-000, ARCH-005, ARCH-006, ARCH-011, ARCH-013, ARCH-016, ARCH-019
	
1. Objetivo
Definir a arquitetura para criação, armazenamento, distribuição, rotação, revogação, uso e auditoria de secrets e cryptographic keys, reduzindo o risco de exposição de credenciais e protegendo dados e operações críticas.
2. Princípios
Secrets never in source code.
Secrets never in container images.
Least Privilege.
Short-lived credentials when possible.
Automatic rotation where practical.
Separation of duties.
Key usage is auditable.
Production keys are isolated.
Loss of a secret must be recoverable.
3. Secret vs Key
Objeto
	Exemplo
	Tratamento
	
Secret
	API key, password, OAuth client secret
	Secret Manager
	
Certificate
	TLS certificate/private key
	Certificate/Key management
	
Encryption Key
	KMS key
	KMS/HSM
	
Signing Key
	Webhook/event signing key
	KMS/HSM/secure key store
	
4. Architecture
Application → Identity/IAM → Secret Manager / KMS → Provider / Resource
Aplicações deverão obter secrets em runtime através de identidade de serviço autorizada.
5. Secret Manager
A plataforma deverá utilizar um Secret Manager gerenciado ou equivalente.
Versioning.
Access policy.
Rotation.
Audit.
Environment isolation.
Expiration metadata.
6. Secret Lifecycle
Create → Store → Use → Rotate → Revoke → Destroy
Owner.
Purpose.
Environment.
CreatedAt.
Expiration.
Rotation policy.
7. Access Control
Service identity.
Role/scopes.
Environment boundary.
Resource-specific permission.
Just-in-time access for privileged operations when possible.
8. Environment Isolation
Development secrets isolated.
Staging secrets isolated.
Production secrets isolated.
No automatic copying between environments.
9. Rotation
Secrets deverão possuir rotação conforme risco e capacidade do provider.
Automatic rotation where supported.
Dual-key overlap during rotation.
Validation after rotation.
Rollback/recovery plan.
Alert before expiration.
10. Short-Lived Credentials
Prefer temporary credentials.
Token exchange.
Workload identity.
OIDC federation where appropriate.
Minimize static credentials.
11. Certificates
Automated issuance when possible.
Expiration monitoring.
Renewal before expiration.
Private key protection.
Revocation support.
12. Encryption at Rest
Dados e arquivos classificados conforme ARCH-008/016 deverão utilizar encryption at rest quando aplicável.
Managed KMS.
Envelope encryption.
Key rotation.
Access audit.
13. Key Management
Cryptographic keys deverão possuir lifecycle próprio.
Key ID.
Algorithm.
Purpose.
Owner.
Environment.
Status.
Creation date.
Rotation date.
14. Key Hierarchy
Root/Platform Key → Key Encryption Key → Data/Signing Keys
A hierarquia exata dependerá do KMS/HSM utilizado.
15. Encryption Context
Quando suportado, encryption context deverá ser usado para limitar o uso de chaves ao contexto esperado.
Organization/Tenant context when appropriate.
Resource purpose.
Environment.
Service.
16. Signing
Webhook signatures.
Event signatures where required.
Document/evidence signatures.
Key rotation with overlapping verification keys.
17. Secret Distribution
Runtime retrieval.
Mounted secret/identity integration when appropriate.
Never log secret values.
Never expose secrets to clients.
18. Logging & Audit
O sistema deverá registrar uso administrativo e eventos de lifecycle sem registrar o valor secreto.
Who accessed.
What secret/key.
When.
Purpose/context.
Operation.
Result.
19. Detection & Leak Prevention
Secret scanning in repositories.
CI checks.
Log redaction.
Pattern detection.
Credential exposure alerts.
Emergency revocation procedure.
20. Incident Response
Detect → Revoke → Rotate → Contain → Validate → Investigate
Immediate credential revocation when compromise suspected.
Rotate dependent credentials.
Preserve audit evidence.
Assess blast radius.
Review access history.
21. Backup & Recovery
Secrets e keys não deverão depender de backup manual.
Provider-managed durability.
Recovery procedure.
Key recovery controls.
Emergency access process.
22. Multi-Tenant Considerations
Tenant-specific keys when required.
Tenant-aware encryption context.
Cross-tenant key access prohibited by default.
Enterprise dedicated keys as optional capability.
23. AI Considerations
AI Agents nunca deverão receber secrets diretamente quando uma scoped tool ou token temporário puder ser utilizado.
Agent receives capability, not raw credential.
Tool gateway manages provider authentication.
Short-lived tokens preferred.
Secret values excluded from prompts and model context.
24. Testing
Rotation tests.
Revocation tests.
Access denial tests.
Environment isolation tests.
Secret scanning.
Certificate renewal tests.
Recovery tests.
25. Anti-Patterns Proibidos
Secret in Git.
Secret in Docker image.
Secret in frontend code.
Long-lived credential without justification.
Shared admin credential.
Key used for multiple unrelated purposes without governance.
Logging secret values.
AI model receiving raw credentials.
26. Definition of Done
Secret Manager configured.
IAM policies defined.
Rotation policy defined.
Audit enabled.
Environment isolation validated.
Secret scanning enabled.
Emergency revocation runbook available.
Key lifecycle documented.
27. Decisão Arquitetural
A Trust Platform adotará Secret Manager e KMS/HSM como mecanismos centrais para secrets e chaves, privilegiando credenciais temporárias, rotação automática, least privilege, isolamento por ambiente e auditoria. Agentes e aplicações deverão receber capacidades controladas, não credenciais administrativas brutas.
28. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-008 — Data Architecture & Governance
ARCH-011 — Deployment & Infrastructure Architecture
ARCH-013 — Disaster Recovery & Business Continuity
ARCH-016 — File & Document Management Architecture
ARCH-019 — Rate Limiting, Quotas & Abuse Prevention
29. Princípio Fundamental
Uma credencial que pode ser evitada deve ser evitada; uma credencial necessária deve ser temporária, limitada e auditável.
