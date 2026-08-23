Trust Platform
ARCH-018 — Multi-Tenancy Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-018
	
Document Name
	Multi-Tenancy Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Usuários, organizações, sellers, buyers, operadores e dados multi-organização
	
Depends On
	ENG-000, ARCH-005, ARCH-008, ARCH-009, ARCH-015, ARCH-017
	
1. Objetivo
Definir como a Trust Platform suportará múltiplas organizações, usuários e contextos de tenancy, garantindo isolamento de dados, autorização, escalabilidade e flexibilidade para diferentes modelos comerciais sem duplicar a plataforma.
2. Princípios
Tenant isolation by default.
Authorization before data access.
Organization is a business boundary, not merely a database field.
Cross-tenant access is explicit and auditable.
Data ownership remains with the domain.
Scale independently where necessary.
Privacy and security by design.
3. Tenant Model
A unidade de tenancy inicial será a Organization/Tenant. Um usuário poderá pertencer a uma ou mais organizações.
User → Membership → Organization/Tenant → Domain Resources
4. Actors
Individual User.
Organization Admin.
Organization Member.
Buyer.
Seller.
Platform Operator.
Support/Compliance Operator.
AI Agent acting on behalf of an authorized context.
5. Membership
A relação User ↔ Organization deverá possuir entidade própria.
membershipId.
userId.
organizationId.
role.
status.
createdAt.
permissions/scopes quando aplicável.
6. Tenant Identification
As APIs e serviços deverão receber o contexto de organização de forma segura.
Derivar tenant context da identidade autenticada quando possível.
Não confiar apenas em tenantId fornecido pelo cliente.
Validar membership e permission.
Propagar tenant context para serviços e eventos.
7. Data Isolation
Estratégia
	Uso
	Decisão inicial
	
Shared DB + tenantId
	Alta eficiência/custo
	Permitido com controles rigorosos
	
Schema per tenant
	Isolamento maior
	Somente quando necessário
	
Database per tenant
	Máximo isolamento
	Para casos especiais/enterprise
	
A estratégia padrão inicial será shared infrastructure com isolamento lógico forte e evolução para isolamento físico quando requisitos justificarem.
8. Tenant-Aware Database Access
Repositories devem exigir tenant context quando aplicável.
Queries devem aplicar tenant filter.
Automated tests contra cross-tenant leakage.
Database constraints/policies quando tecnicamente apropriado.
Administrative bypass somente através de controles explícitos.
9. Cross-Tenant Operations
Acesso entre organizações deverá ser exceção explícita.
Platform-level operations.
Shared marketplace scenarios.
Support with authorized access.
Compliance investigations.
Partner relationships.
Toda operação cross-tenant deverá possuir autorização e auditoria adequadas.
10. Marketplace Context
A Trust poderá operar como marketplace multi-organização, permitindo que uma organização compre de outra.
Buyer organization.
Seller organization.
Transaction context.
Visibility rules.
Commercial permissions.
11. Financial Context
Dados financeiros deverão respeitar ownership e tenancy.
Payment belongs to transaction/domain context.
Financial data access requires explicit authorization.
Platform operators receive minimum required visibility.
Cross-tenant financial aggregation requires authorized reporting context.
12. Search Isolation
Índices deverão aplicar tenant/security filters quando os dados não forem públicos.
Tenant-aware indexing.
Security trimming.
Cross-tenant search only for authorized platform roles.
13. Cache Isolation
Cache keys deverão incorporar tenant context quando necessário.
tenantId.
userId where required.
Resource scope.
Permission-sensitive variants.
14. Events & Tenant Context
Eventos relevantes deverão carregar contexto de organização quando necessário para processamento seguro.
organizationId.
actor context when appropriate.
resource ownership.
correlationId.
Não incluir dados pessoais desnecessários apenas para facilitar roteamento.
15. API Authorization
Authentication identifies user/service.
Membership identifies organizational context.
RBAC/ABAC determines permission.
Domain enforces resource ownership.
Audit records sensitive cross-tenant access.
16. Tenant Lifecycle
Created → Active → Suspended → Archived → Deleted
Suspension must block appropriate operations.
Financial obligations may require preservation.
Deletion subject to retention/legal requirements.
17. Enterprise Isolation
Clientes enterprise poderão exigir isolamento adicional.
Dedicated database.
Dedicated region.
Dedicated encryption key.
Dedicated infrastructure.
Custom retention.
Essas capacidades deverão ser extensões da arquitetura, não forks do produto.
18. Tenant Configuration
Configurações específicas por organização deverão utilizar ARCH-014.
Feature flags.
Business parameters.
Notification preferences.
Integration settings.
Limits/quotas.
19. Quotas & Limits
API rate limits.
Storage quota.
Transaction limits.
User/member limits.
AI usage/cost limits.
Search limits.
Quotas deverão ser observáveis e configuráveis por tier quando aplicável.
20. Observability
Metrics by tenant where appropriate.
Tenant-level error rates.
Quota usage.
Cross-tenant access events.
Security anomalies.
Evitar cardinalidade excessiva em métricas; tenant-level observability deverá ser usada de forma controlada.
21. Security & Privacy
Default deny.
Least privilege.
Tenant-aware authorization.
Encryption.
Auditability.
PII minimization.
22. Testing
Cross-tenant access denial tests.
Tenant context propagation tests.
Search isolation tests.
Cache isolation tests.
Event context tests.
Administrative bypass tests.
23. AI & Tenancy
AI Agents deverão operar dentro de um tenant context explícito.
Agent identity.
Organization context.
Tool scopes.
Resource authorization.
No cross-tenant retrieval by default.
Audit of cross-tenant operations.
24. Anti-Patterns Proibidos
Confiar no tenantId enviado pelo frontend.
Query sem tenant filter.
Cache compartilhado sem tenant isolation.
Search sem security trimming.
Agent com acesso global por padrão.
Cross-tenant operation sem audit trail.
25. Definition of Done
Tenant model definido.
Membership implementado.
Tenant context propagado.
Data isolation testada.
Authorization testada.
Search/cache isolation implementadas.
Cross-tenant workflow definido.
AI tenancy controls definidos.
Audit trail implementado.
26. Decisão Arquitetural
A Trust Platform adotará Organization/Tenant como boundary de negócio e segurança. O padrão inicial será isolamento lógico forte sobre infraestrutura compartilhada, com mecanismos preparados para isolamento físico por cliente quando requisitos enterprise, regulatórios ou de risco justificarem.
27. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-008 — Data Architecture & Governance
ARCH-009 — API Architecture & Standards
ARCH-015 — Search Architecture & Indexing
ARCH-017 — Caching & Performance Architecture
ARCH-014 — Configuration & Feature Flag Management
ARCH-007 — AI Integration Architecture
28. Princípio Fundamental
Tenant isolation não é apenas uma condição do banco; é uma propriedade de toda a arquitetura.
