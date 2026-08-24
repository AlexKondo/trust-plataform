TRUST PLATFORM
PACK-00
Foundation Reconciliation & Engineering Baseline
Implementation Specification • Version 1.1 • Status: READY FOR IMPLEMENTATION
Purpose
	Reconcile the current Trust foundation before the next incremental implementation phase.
	
Product baseline
	B2C-first, identity-centric Trust Platform connecting customers and service providers.
	
Tenancy decision
	No enterprise Organization/Tenant boundary in the current MVP. Do not retrofit tenant_id into current tables.
	
Architecture references reviewed
	ARCH-001, ARCH-002, ARCH-009, ARCH-018, ARCH-042 and the 88-document architecture analysis.
	
Implementation approach
	Incremental. Implement only the changes explicitly required by this Pack.
	
Release gate
	Existing automated tests must remain green and all PACK-00 acceptance tests must pass.
	

1. Implementation Objective
PACK-00 establishes the minimum canonical engineering baseline required before continuing the Trust Platform incrementally. It does not introduce new product features. Its purpose is to remove the concrete inconsistencies already identified between the historical architecture documents and the current implementation, while preventing future enterprise architecture from being implemented prematurely.
2. Scope
Canonicalize the Domain Event envelope.
Add aggregateType and aggregateId to all newly created domain events, using strict validation for new writes.
Standardize eventType as the canonical event-name field for new writes; keep a temporary tolerant legacy-read path for persisted eventName records when necessary.
Canonicalize the API error body with requestId and correlationId, preserving the current request tracing model.
Keep correlationId available in the response header where already supported.
Record the current ownership/tenancy decision: B2C-first and identity-centric, without enterprise tenancy in the MVP.
Establish documentation precedence for Claude AI and future implementation packs.
Define migration, backward-compatibility and testing requirements for the above changes.
3. Explicitly Out of Scope
Adding tenant_id or organization_id to all existing tables.
Organization membership, enterprise SSO, SCIM or corporate federation.
Dedicated database/schema/environment per enterprise customer.
Kafka migration or replacement of pg-boss solely to match historical architecture examples.
Kubernetes, SIEM, data warehouse, multi-region, public SDK, AI agent marketplace or enterprise control plane.
Redesign of Trust Score, Trust Payment, Trust Coin, Trust Economy or other product modules not required by these foundation fixes.
Rewriting or reconciling all historical ARCH documents.
4. Product & Ownership Baseline
The current Trust MVP is B2C-first and identity-centric. The primary actors are customers and service providers. Resources are owned and authorized according to their actual domain relationships and identity ownership, not according to an artificial enterprise tenant.
Trust Platform
  └─ Identity
      ├─ Profile
      ├─ Marketplace / service participation
      ├─ Journey / transaction participation
      ├─ Payment relationships
      ├─ Reviews / Trust Events
      └─ Trust Score / reputation
Future B2B/enterprise support may introduce Organization and Membership as additional concepts. Current code must not be designed in a way that deliberately prevents this future extension, but no enterprise tenancy infrastructure shall be built until a future approved Implementation Pack requires it.
5. Canonical Domain Event Contract
All new inter-domain Domain Events must use the following envelope. Existing producers and consumers affected by the migration must be updated together. Domain Events represent facts that have already occurred, not commands.
Field
	Type
	Required
	Rule
	
eventId
	UUID
	Yes
	Unique publication identifier; used for deduplication.
	
eventType
	String
	Yes
	Canonical logical event name. Use business language.
	
eventVersion
	String
	Yes
	Canonical format for current implementation: "major.minor" (e.g. "1.0").
	
occurredAt
	Timestamp
	Yes
	ISO 8601 UTC timestamp.
	
producer
	String
	Yes
	Publishing component/service. Preserve current producer IDs; new IDs use stable kebab-case service identifiers.
	
aggregateType
	String
	Yes
	Type of aggregate responsible for the fact.
	
aggregateId
	UUID/String
	Yes
	Identifier of the aggregate responsible for the fact.
	
correlationId
	UUID/String
	Yes
	Business-flow correlation identifier.
	
causationId
	UUID/String
	No
	Identifier of the event/command that caused this event, when applicable.
	
payload
	Object
	Yes
	Minimum stable business payload required by consumers.
	
5.1 Naming
Entity.Event
Examples: Payment.Authorized | TrustCustody.Created | FinancialCase.Opened
The canonical write field is eventType. The logical eventType for the current Trust implementation uses two segments: Entity.Event. This matches the 37 events already implemented and the existing validator. Bounded context remains represented by domain ownership/producer and is not added as a third eventType segment in PACK-00. If backward compatibility is required, legacy persisted eventName values may be read temporarily, but all new writes must emit eventType.
5.2 Aggregate identity
aggregateType and aggregateId are mandatory because they identify the aggregate responsible for the published fact and allow event history to be correlated per aggregate. Example: aggregateType = Payment and aggregateId = the Payment identifier.
5.3 Event invariants
Consumers remain idempotent; duplicate delivery must not create duplicate financial or operational effects.
Outbox Pattern (or equivalent transactional mechanism) remains required when state change and event publication must remain consistent.
No global ordering assumption. When aggregate ordering matters, use aggregateId partitioning, sequence or an equivalent mechanism.
Retry with backoff and a DLQ/equivalent recovery path remain required for non-processable events.
Sensitive data and secrets must not be added to event payloads.
6. Canonical API Error Contract
All API errors exposed through the Trust API layer must use the following body:
PACK-00 v1.1 decision: do not introduce OpenTelemetry tracing in this Pack. The current requestId remains the technical per-request identifier. The public error contract uses requestId + correlationId. A future observability Pack may add a distinct traceId without renaming requestId.
details contract: preserve the existing optional array Array<{ path: string; message: string }>. Do not change it to an object in PACK-00.
{
  "code": "STABLE_MACHINE_READABLE_CODE",
  "message": "Safe human-readable message",
  "details": [
    {"path": "fieldName", "message": "Validation message"}
  ],
  "requestId": "request-id",
  "correlationId": "correlation-id"
}
code is stable and machine-readable.
message is safe for exposure and must not leak internal secrets.
details contains validation/business context only when safe and useful.
requestId is present in the JSON body and carries the current per-request technical identifier already used by RequestContext.
correlationId is present in the JSON body and remains in the existing response header.
Business errors and technical errors must remain distinguishable.
Existing API versioning (/api/v1/{resource}) remains unchanged.
7. Tenancy Decision for the Current MVP
ARCH-018 and ARCH-042 are not implementation requirements for the current MVP. Their Organization/Tenant model is classified as future enterprise architecture.
Do not add tenant_id to the current ~25 tables as part of PACK-00.
Do not create Organization/Tenant merely to satisfy the historical ADRs.
Continue enforcing authorization through authenticated identity and domain resource ownership.
Do not assume all data is public or globally accessible; ownership and authorization remain mandatory.
Future enterprise support may introduce Organization → Membership → Identity through a dedicated future Implementation Pack and migration plan.
8. Messaging Infrastructure Decision
PACK-00 does not require Kafka or another dedicated broker. The existing pg-boss implementation may remain as long as it satisfies the required messaging abstraction and behavior: durable processing as applicable, idempotency, retry, failure recovery/DLQ-equivalent, observability and domain decoupling. Domain code must not be unnecessarily coupled to pg-boss-specific implementation details.
9. Documentation Authority for Claude AI
For implementation decisions, use the following precedence:
Priority
	Source
	Rule
	
1
	Current READY FOR IMPLEMENTATION Pack
	Authoritative for the scope of the current increment.
	
2
	Previous IMPLEMENTED Packs
	Authoritative for already implemented canonical decisions.
	
3
	Current code + automated tests
	Baseline where not contradicted by an authoritative Pack.
	
4
	Historical ARCH/TP documents
	Reference only; not authoritative for implementation.
	
Mandatory Claude rule: Never resolve a contradiction between authoritative sources by assumption. Stop the affected implementation and report the conflict. Do not implement a historical ARCH requirement merely because it is marked Approved.
10. Required Code Changes
Area
	Required change
	
Event envelope factory
	Update createEventEnvelope (or equivalent) to emit eventType, aggregateType and aggregateId according to the canonical contract.
	
Event producers
	Every producer must provide the correct aggregateType and aggregateId.
	
Event consumers
	Use eventType for current/new records. Legacy persisted eventName may be accepted only by an isolated tolerant read compatibility path.
	
Outbox persistence
	Migrate the outbox representation for canonical new writes without rewriting unverifiable historical aggregate identity. Preserve legacy-read compatibility.
	
Error middleware/handler
	Add requestId and correlationId to the JSON error body. Preserve details?: Array<{path, message}> and existing safe error semantics.
	
API response headers
	Preserve x-correlation-id or equivalent current correlation header behavior.
	
Tenancy
	No schema retrofit for tenant_id/organization_id in this Pack.
	
11. Migration & Backward Compatibility
Validation split: new event writes are validated strictly against the canonical envelope; legacy persisted events are read through a tolerant compatibility path. The tolerant reader may accept missing aggregateType/aggregateId and legacy eventName only for historical records. It must never be used to validate new writes.
Create the smallest safe database migration needed for the outbox/event representation actually used by the codebase.
Existing persisted events must remain readable during the transition.
Do not fabricate aggregateType/aggregateId for historical events when the value cannot be derived safely.
If legacy rows use eventName, the reader may temporarily accept eventName while all new writes use eventType.
Compatibility code must be isolated and documented so it can be removed after the migration window.
No destructive migration is allowed without explicit review.
The migration must be idempotent or safely guarded according to the migration framework used by the project.
12. Required Tests
All existing automated test suites must remain green.
Strict event-write envelope unit test validates all mandatory fields and rejects new writes missing aggregateType/aggregateId.
Event naming test confirms new events use eventType and not eventName as the canonical write field.
Aggregate test confirms the correct aggregateType and aggregateId for representative Payment and Marketplace events.
Consumer idempotency regression tests remain green.
Legacy-read compatibility test confirms historical persisted events remain readable when they use eventName or lack aggregateType/aggregateId, without allowing those omissions on new writes.
API error contract test validates code, message, details, requestId and correlationId in the response body.
Request/correlation test validates that body requestId and correlationId match the existing RequestContext and response headers.
Ownership/authorization regression tests confirm that authenticated identity and domain resource ownership still deny unauthorized third-party access.
No test should be added for enterprise tenant isolation in PACK-00 because enterprise tenancy is explicitly out of scope.
13. Acceptance Criteria
PASS — All newly emitted Domain Events follow the canonical envelope.
PASS — aggregateType and aggregateId are present and semantically correct.
PASS — eventType is the canonical event-name field for new writes.
PASS — Existing persisted events remain readable through the migration/compatibility strategy.
PASS — API error bodies contain requestId and correlationId.
PASS — Existing correlation header behavior remains operational.
PASS — No tenant_id/organization_id retrofit is introduced.
PASS — pg-boss remains acceptable without architectural replacement if the required behavior is preserved.
PASS — Historical ARCH documents are not used as direct implementation requirements.
PASS — All existing automated suites and new PACK-00 tests pass.
14. Definition of Done
Migration reviewed and applied successfully in the development environment.
Event producers and affected consumers updated.
Canonical error middleware/handler updated.
No unintended tenancy schema changes.
Automated tests pass.
No unresolved authoritative-document conflict remains.
Kondo reviews the implementation diff and confirms no unrelated feature scope was introduced.
Implementation commit/reference is recorded in this Pack when completed.
15. Instructions to Claude AI
Implement PACK-00 v1.1 only.

Canonical decisions for this Pack:
- Error body uses requestId + correlationId. Do NOT introduce OpenTelemetry or invent traceId.
- details remains the existing optional array of {path, message}.
- eventType naming uses two segments: Entity.Event.
- eventVersion for current implementation uses string major.minor, e.g. "1.0".
- New event writes are strict; historical event reads are tolerant through an isolated compatibility path.
- Do not add tenant_id or Organization/Tenant infrastructure.
- Do not replace pg-boss merely because historical ADRs mention other brokers.
- Preserve current producer identifiers; do not mass-rename producers in this Pack.

Do not redesign unrelated Trust modules.
Preserve existing behavior unless this Pack explicitly changes it.
Implement the required envelope migration across all affected producers/consumers; do not treat the 55 producers / 14 consumers as optional.

Keep all existing tests green and add the PACK-00 tests.

If the current code makes any remaining requirement ambiguous or unsafe to implement,
STOP that affected change and report:
1. the exact conflict,
2. affected files/components,
3. the minimum decision required.

Do not resolve architectural conflicts by assumption.
16. Historical Architecture Disposition
Document
	Disposition for current implementation
	Reason
	
ARCH-001
	Reference / retained principle
	EDA principles remain valid; broker technology is abstracted.
	
ARCH-002
	Canonicalized by PACK-00
	Event contract adopted with explicit migration rules.
	
ARCH-009
	Canonicalized by PACK-00
	Error body contract adopted.
	
ARCH-018
	Future enterprise reference
	Organization/Tenant boundary is not part of current B2C MVP.
	
ARCH-042
	Future enterprise reference
	Enterprise tenant isolation is deferred.
	
16.1 PACK-00 v1.1 Decisions after Code Review
requestId is canonical for current API error bodies; traceId is deferred until a future tracing/OTel implementation.
details remains the existing optional array of {path, message}.
eventType uses two-segment Entity.Event naming.
New writes are strict; historical reads are tolerant and isolated.
Ownership/authorization regression replaces the invalid 'tenancy removal' regression test.
eventVersion is standardized to string "major.minor" for the current implementation.
Current producer IDs are preserved; no producer mass-renaming is part of PACK-00.
17. Pack Status
STATUS: READY FOR IMPLEMENTATION
PACK-00 v1.1 incorporates the code-review decisions reported in REVISAO-PACK-00 and is complete for the foundation reconciliation described above. It may be provided to Kondo/Claude for incremental implementation. If implementation reveals a new concrete code-level conflict not covered here, only the affected change must pause and be reported.
END OF PACK-00
