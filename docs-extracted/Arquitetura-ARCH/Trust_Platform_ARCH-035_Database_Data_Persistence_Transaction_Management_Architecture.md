Trust Platform
ARCH-035 — Database, Data Persistence & Transaction Management Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-035
	
Document Name
	Database, Data Persistence & Transaction Management Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Data
	
Applies To
	Transactional databases, read models, persistence, transactions, migrations, replication e data integrity
	
Depends On
	ENG-000, ARCH-008, ARCH-013, ARCH-016, ARCH-018, ARCH-021, ARCH-029, ARCH-030, ARCH-034
	
1. Objetivo
Definir os padrões para persistência de dados transacionais da Trust Platform, incluindo ownership, modelagem, transações, concorrência, consistência, migrations, replication, backups e acesso seguro aos dados.
2. Princípios
Data has a clear owner.
Transactional integrity over convenience.
Database boundaries follow domain ownership.
Consistency requirements are explicit.
Schema changes are versioned.
No direct cross-domain writes.
Backups and restore are part of design.
Financial data requires stronger integrity controls.
3. Persistence Model
Store
	Uso
	Exemplo
	
Transactional DB
	System of record
	Orders, payments
	
Read Model
	Optimized query
	Search/reporting view
	
Object Storage
	Files/evidence
	Documents
	
Cache
	Performance
	Session/read cache
	
Event Store/Broker
	Integration/history
	Domain events
	
4. Domain Ownership
Each domain owns its transactional state.
Other domains access via API/events.
Shared database only by explicit architectural exception.
Ownership documented.
5. Transaction Model
Command → Validate → Transaction → Commit → Publish Event
O commit transacional deverá ser separado de efeitos externos quando necessário.
6. ACID
Atomicity for business invariants.
Consistency.
Isolation appropriate to workload.
Durability.
Nem todo fluxo exige transação longa; transações deverão ser curtas e focadas.
7. Transaction Boundaries
Define transaction at domain boundary.
Avoid remote calls inside DB transaction.
Avoid long-running transactions.
Use outbox for reliable event publication.
8. Outbox Pattern
Para eventos derivados de mudanças transacionais, utilizar Transactional Outbox quando necessário para evitar dual-write inconsistency.
DB Transaction → State + Outbox → Publisher → Event Broker
9. Idempotency
Idempotency keys for commands.
Unique business constraints.
Duplicate detection.
Safe retries.
10. Concurrency Control
Optimistic locking.
Pessimistic locking only when justified.
Version columns.
Unique constraints.
Conflict handling.
11. Isolation Levels
Isolation level deverá ser escolhido conforme risco de inconsistência e custo de locking.
Default database isolation unless business requires stronger.
Serializable only where justified.
Document exceptions.
12. Financial Transactions
Strong integrity constraints.
Idempotency.
Immutable financial records where applicable.
Reconciliation.
No destructive update of financial history without governed correction mechanism.
13. Ledger / Financial Record
Quando houver ledger, ele deverá funcionar como registro financeiro autoritativo para a capacidade correspondente.
Append-oriented entries.
Reference to source transaction.
Currency/amount precision.
Audit trail.
Reconciliation.
14. Database Schema
Versioned schema.
Explicit indexes.
Constraints.
Foreign keys where appropriate.
Data classification metadata where useful.
15. Migrations
Migration versioning.
Expand/contract.
Backward compatibility.
Pre-production testing.
Rollback or forward-fix.
16. Read Models & CQRS
CQRS poderá ser usado quando read/write workloads e modelos forem significativamente diferentes.
Transactional model remains authoritative.
Read model derived.
Rebuild capability.
Eventual consistency explicitly communicated.
17. Eventual Consistency
Use only where business permits.
Expose freshness/status when relevant.
Reconciliation/rebuild.
Do not use eventual consistency for invariants requiring atomic decision.
18. Replication
Read replicas for scale.
Primary/standby for HA.
Cross-region replication where justified.
Replication lag monitored.
19. Backup & Recovery
Point-in-time recovery.
Snapshots.
Restore tests.
Encryption.
Retention.
See ARCH-030.
20. Data Deletion
Policy-driven deletion.
Soft delete only when justified.
Hard delete where required.
Derived/read model propagation.
Backup retention considered.
21. Performance
Index review.
Query budgets.
Connection pooling.
Pagination.
Batch operations.
Partitioning when justified.
22. Sharding & Partitioning
Sharding não será adotado prematuramente.
Prefer vertical/domain separation first.
Partition by natural high-volume key where justified.
Tenant partitioning only with clear scale need.
Operational complexity documented.
23. Multi-Tenant Data
Tenant ID/context where shared storage.
Row-level isolation when appropriate.
Dedicated databases for higher isolation tiers when justified.
Cross-tenant queries restricted.
24. Database Security
Private network.
Workload identity/managed identity.
Least privilege DB roles.
Encryption at rest.
Audit privileged access.
No shared admin credentials.
25. Access Patterns
Service-owned repositories/data access layer.
Parameterized queries.
No arbitrary SQL from user input.
Controlled admin access.
26. Observability
Query latency.
Connection saturation.
Lock contention.
Replication lag.
Error rate.
Storage growth.
Slow query monitoring.
27. AI & Data Access
AI accesses data through authorized services/tools.
No unrestricted database credentials.
Tenant context enforced.
Purpose limitation.
Read/write tools explicitly scoped.
Sensitive writes require approval where appropriate.
28. Testing
Transaction tests.
Concurrency tests.
Migration tests.
Failover tests.
Restore tests.
Replication lag tests.
Tenant isolation tests.
29. Anti-Patterns Proibidos
Shared database with uncontrolled cross-domain writes.
Remote API call inside long DB transaction.
Dual-write without outbox/transactional strategy.
Unversioned schema changes.
Financial record overwritten destructively.
AI Agent with direct unrestricted DB access.
30. Definition of Done
Data owner defined.
Transactional boundary defined.
Schema versioning defined.
Concurrency strategy defined.
Backup/recovery defined.
Security roles defined.
Observability defined.
Migration tested.
31. Decisão Arquitetural
A Trust Platform adotará persistência orientada a domínio, com transactional databases como system of record, read models derivados quando necessário, Outbox para integração confiável, idempotency e controle explícito de concorrência. Dados financeiros terão requisitos reforçados de integridade e reconciliação. Acesso de AI será sempre mediado por serviços/tools autorizados.
32. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-008 — Data Architecture & Governance
ARCH-013 — Disaster Recovery & Business Continuity
ARCH-016 — File & Document Management Architecture
ARCH-018 — Multi-Tenancy Architecture
ARCH-021 — Workflow & Process Orchestration Architecture
ARCH-029 — Error Handling, Resilience & Fault Tolerance Architecture
ARCH-030 — Disaster Recovery, Backup & Business Continuity Architecture
ARCH-034 — Service-to-Service Communication & Internal Networking Architecture
33. Princípio Fundamental
O banco pertence ao domínio; a integridade pertence ao negócio; e nenhum atalho de persistência deve quebrar essa fronteira.
