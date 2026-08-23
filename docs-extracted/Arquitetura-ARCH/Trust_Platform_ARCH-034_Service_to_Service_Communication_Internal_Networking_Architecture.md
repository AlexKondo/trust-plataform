Trust Platform
ARCH-034 — Service-to-Service Communication & Internal Networking Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-034
	
Document Name
	Service-to-Service Communication & Internal Networking Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Platform & Security
	
Applies To
	Comunicação entre microservices, workers, internal APIs, events, service mesh/networking e workload identity
	
Depends On
	ENG-000, ARCH-001, ARCH-009, ARCH-010, ARCH-011, ARCH-023, ARCH-024, ARCH-025, ARCH-029, ARCH-031, ARCH-033
	
1. Objetivo
Definir como os componentes internos da Trust Platform se comunicam com segurança, confiabilidade e rastreabilidade, estabelecendo padrões para synchronous APIs, asynchronous events, service identity, networking, timeouts e proteção contra falhas em cascata.
2. Princípios
Internal traffic is not automatically trusted.
Every workload has an identity.
Prefer asynchronous communication for decoupling.
Use synchronous calls for immediate responses.
Timeout every remote dependency.
Keep service contracts explicit.
Do not create distributed transactions unnecessarily.
Service communication must be observable.
3. Communication Patterns
Pattern
	Quando usar
	Exemplo
	
Synchronous API
	Immediate response needed
	Order query
	
Async Event
	Loose coupling
	PaymentCompleted
	
Queue/Job
	Background processing
	Notification
	
Streaming
	Continuous/high-volume flow
	Telemetry
	
4. Internal Architecture
Service → Identity → Internal Network → Service/API or Event Broker → Consumer
5. Service Identity
Unique workload identity.
Short-lived credentials.
Audience-restricted tokens.
Least privilege.
Secret Manager/KMS integration.
6. Internal Authentication
mTLS where justified.
OAuth/service tokens where appropriate.
Workload identity.
Never rely solely on network location.
7. Internal Authorization
Service-to-service scopes.
Resource permissions.
Tenant context propagation.
Explicit allowlist.
Default deny.
8. Network Segmentation
Public vs private subnets.
Application tiers.
Data tiers.
Restricted admin plane.
Egress controls.
9. Service Discovery
DNS/service registry.
Health-aware routing.
No hardcoded IPs.
Stable logical service names.
10. Synchronous APIs
Explicit contract.
Timeout.
Request ID/correlation ID.
Idempotency for retryable commands.
Versioning.
Error contract.
11. Async Events
Eventos seguem ARCH-001.
Event schema.
Producer ownership.
Consumer ownership.
Correlation/causation IDs.
Idempotent consumption.
Replay/DLQ.
12. Event vs API
API for query/command requiring immediate result.
Event for notification of state change.
Do not use events as hidden RPC.
Do not use synchronous chains for long-running workflows.
13. Timeout & Retry
Per-call timeout.
Bounded retries.
Exponential backoff + jitter.
Idempotency.
Circuit breaker for unstable dependencies.
14. Cascading Failure Protection
Bulkheads.
Concurrency limits.
Connection pool limits.
Timeouts.
Circuit breakers.
Backpressure.
15. Internal API Gateway / Service Mesh
Service mesh ou internal gateway poderá ser utilizado quando o número de serviços justificar padronização centralizada de mTLS, telemetry e traffic policy.
Do not introduce mesh complexity prematurely.
Use only where operational benefit exceeds complexity.
Business authorization remains in services/policy layer.
16. Data Ownership
Cada domínio é autoridade sobre seu estado.
No direct writes to another service's database.
Use APIs/events.
Shared read models only by explicit architecture.
Database ownership enforced.
17. Distributed Transactions
Avoid 2PC by default.
Use Saga/workflow where appropriate.
Compensation.
Idempotency.
Reconciliation.
18. Tenant Context
Explicit tenant context.
Validate at each trust boundary.
Do not trust client-supplied tenant ID.
Prevent cross-tenant propagation.
19. Observability
Trace ID.
Correlation ID.
Service name/version.
Latency.
Error rate.
Dependency health.
Network failures.
20. Security Monitoring
Unexpected service calls.
Denied service authorization.
Unusual traffic.
Cross-tenant attempts.
Credential anomalies.
21. Partner/Internal Boundary
Partner systems são tratados como external dependencies mesmo quando conectados por private networking.
Explicit authentication.
Contract.
Rate limit.
Timeout.
Audit.
22. AI Agent Communication
Agent uses approved tool interfaces.
Tool Gateway mediates external calls.
Agent identity propagated.
Tool scopes enforced.
High-risk calls require approval.
AI Agents não terão acesso direto a bancos ou redes internas sem uma capability explicitamente autorizada.
23. Performance
Connection pooling.
Keep-alive.
Compression when useful.
Payload minimization.
Caching where safe.
Async decoupling.
24. Failure Handling
Unknown outcome handling.
Fallback where safe.
Queue for deferred work.
Reconciliation for external operations.
Alert on dependency degradation.
25. Testing
Contract tests.
mTLS/authentication tests.
Authorization tests.
Timeout tests.
Circuit breaker tests.
Network failure injection.
Cross-tenant tests.
26. Anti-Patterns Proibidos
Shared service credentials.
Internal network equals trusted.
Direct database writes across domains.
Infinite synchronous chains.
No timeout.
Unbounded retry.
AI Agent with unrestricted internal network access.
27. Definition of Done
Communication pattern selected.
Service identity defined.
Network boundary defined.
Contract/versioning defined.
Timeout/retry defined.
Observability implemented.
Failure behavior tested.
Tenant boundary validated.
28. Decisão Arquitetural
A Trust Platform utilizará uma combinação de synchronous APIs e asynchronous events/queues, com workload identity, private networking, explicit service authorization, timeout/retry controls e observabilidade distribuída. A comunicação interna será tratada como uma trust boundary e não como uma zona implicitamente confiável.
29. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-009 — API Architecture & Standards
ARCH-010 — Integration Architecture & External Systems
ARCH-021 — Workflow & Process Orchestration Architecture
ARCH-023 — Secrets Management & Key Management Architecture
ARCH-024 — Identity, Authentication & Session Architecture
ARCH-025 — Authorization, RBAC & Policy Engine Architecture
ARCH-029 — Error Handling, Resilience & Fault Tolerance Architecture
ARCH-031 — Infrastructure, Deployment & Environment Architecture
ARCH-033 — API Gateway, Edge Security & Traffic Management Architecture
30. Princípio Fundamental
Dentro da Trust, cada serviço é um sistema confiável apenas na medida em que sua identidade, autorização e comunicação possam ser verificadas.
