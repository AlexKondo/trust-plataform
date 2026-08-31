TRUST PLATFORM
PACK-01
Payment Custody & Release
Implementation Specification • Version 1.0 • Status: READY FOR IMPLEMENTATION
Objective
	Implement Trust Custody after payment authorization and release eligibility after customer acceptance of completed service.
	
Current baseline
	PAY-001 and PAY-002 already implemented; PACK-00 v1.1 implemented and closed.
	
Implements now
	PAY-003 Hold Funds + PAY-004 Release Funds, reconciled against current product flow.
	
Product decision
	Funds enter Trust Custody at contracting, before service execution; release occurs only after service completion is confirmed by the customer and release policy allows it.
	
Payment provider
	Sandbox only in this Pack. No real-money provider integration.
	
Out of scope
	Settlement, split/platform fee, refund, ledger, financial cases, reconciliation, real provider, PCI implementation.
	
Release gate
	All existing tests remain green; PACK-01 acceptance tests pass; Kondo reviews implementation diff.
	

1. Purpose of This Pack
PACK-01 implements the next incremental financial protection capability of the Trust Platform. It does not redesign Payments. It extends the already implemented Payment creation and authorization flow with a domain-level Trust Custody and a controlled release process.
The Pack also resolves a semantic ambiguity in the historical PAY specifications: confirmation of contracting and confirmation of completed service are different business facts and must never share the same meaning.
2. Source Reconciliation and Authority
Source
	Use in PACK-01
	Disposition
	
PACK-00 v1.1
	Canonical engineering baseline
	Authoritative
	
Current implemented PAY-001/PAY-002 code + tests
	Existing behavior to preserve unless explicitly changed here
	Authoritative baseline
	
PAY-001 historical spec
	Payment creation intent and domain model
	Reference; historical CustomerConfirmed trigger is not authoritative
	
PAY-002 historical spec
	Authorization contract and Payment.Authorized event
	Reference aligned with current implementation
	
PAY-003 historical spec
	Custody intent
	Reconciled and superseded by this Pack for implementation
	
PAY-004 historical spec
	Release intent
	Reconciled and superseded by this Pack for implementation
	
Implementation precedence: PACK-01 > implemented PACK-00 > current implemented code/tests > historical PAY/ARCH documents.
3. Canonical Business Flow
CONTRACTING
Offer accepted / order committed
    → Payment created
    → Payment authorized
    → Payment.Authorized
    → Trust Custody created
    → Payment = FUNDS_IN_CUSTODY
    → TrustCustody = IN_CUSTODY

SERVICE EXECUTION
Service starts
    → service is performed
    → service is completed
    → customer confirms/accepts completed service
    → MarketplaceOrder.CustomerConfirmed

RELEASE
MarketplaceOrder.CustomerConfirmed
    → release policy evaluation
    → if allowed: TrustCustody = READY_FOR_RELEASE
    → sandbox PaymentGateway.release(...)
    → if gateway confirms:
         TrustCustody = RELEASED
         Payment = FUNDS_RELEASED
         Funds.Released
    → actual settlement to provider is FUTURE scope
Canonical semantic decision: MarketplaceOrder.CustomerConfirmed represents customer confirmation/acceptance of completed service. It must not be used as the semantic trigger for creating a Payment.
4. Scope
4.1 Included
Consume Payment.Authorized and create one TrustCustody per Payment.
Persist custody ownership and financial snapshot.
Transition Payment from AUTHORIZED to FUNDS_IN_CUSTODY.
Publish TrustCustody.Created and Funds.Held using the PACK-00 canonical event envelope.
Consume MarketplaceOrder.CustomerConfirmed as the service-completion acceptance trigger for release evaluation.
Evaluate release through a deterministic TrustReleasePolicyService.
Transition eligible custody from IN_CUSTODY to READY_FOR_RELEASE before any gateway side effect.
Invoke the existing PaymentGateway through the sandbox adapter using an idempotent release operation.
On confirmed release, transition TrustCustody to RELEASED and Payment to FUNDS_RELEASED.
Publish Funds.ReadyForRelease and Funds.Released.
Audit policy decisions, custody creation, release attempts, success and failure.
Implement migration, unit tests, integration tests and end-to-end regression tests.
4.2 Explicitly Out of Scope
Actual bank settlement to the service provider.
Platform fee, commission, split or the current 10% technical seed as a business rule.
Refunds or reversals.
Financial ledger.
Financial case management.
Financial reconciliation.
Real payment provider selection or integration.
PCI DSS scope implementation, card data handling or storage.
Automatic KYC.
Payment frontend or /payments page.
Automatic timeout-based release.
Enterprise tenancy.
Changes to Trust Score rules unless already-existing consumers react to the new events without code changes.
5. Preflight Checks Before Coding
Claude must verify these conditions against the current code before modifying files:
1. PAY-001 is already triggered by the current contracting/offer-acceptance flow and does not rely on MarketplaceOrder.CustomerConfirmed to create Payment. If CustomerConfirmed still creates Payment in current code, STOP and report the exact consumer/file before implementing release.
2. PAY-002 ends a successful authorization with Payment status AUTHORIZED and publishes Payment.Authorized.
3. PaymentGateway is behind a port/adapter boundary and the sandbox adapter can be extended without leaking provider details into the domain.
4. MarketplaceOrder.CustomerConfirmed currently represents, or can unambiguously represent, customer acceptance of completed service.
5. Existing order/dispute access APIs can determine whether an order has an open dispute.
If any preflight check fails, only the affected change is blocked. Claude must report the conflict; it must not reinterpret the business flow by assumption.
6. Domain Model
6.1 TrustCustody Aggregate
Field
	Required
	Rule
	
id
	Yes
	Platform UUID/ID convention.
	
paymentId
	Yes
	References the Payment; exactly one custody per Payment.
	
orderId
	Yes
	Marketplace Order associated with the Payment.
	
buyerId
	Yes
	Snapshot from Payment/domain relation.
	
sellerId
	Yes
	Snapshot from Payment/domain relation.
	
amount
	Yes
	Same minor-unit representation/type used by Payment. Do not introduce floating point or a second money convention.
	
currency
	Yes
	Same ISO currency representation used by Payment.
	
status
	Yes
	IN_CUSTODY | READY_FOR_RELEASE | RELEASED.
	
startedAt
	Yes
	UTC timestamp when custody begins.
	
releasedAt
	No
	UTC timestamp set only after gateway confirms release.
	
createdAt
	Yes
	UTC.
	
updatedAt
	Yes
	UTC.
	
6.2 Invariants
One Payment may have at most one TrustCustody.
A custody may be created only from a Payment in AUTHORIZED state.
Custody amount/currency/buyer/seller/order must match the Payment snapshot used for creation.
A RELEASED custody is terminal in PACK-01.
A Payment may move to FUNDS_IN_CUSTODY only in the same domain transaction that creates the custody and outbox events.
A Payment may move to FUNDS_RELEASED only after the release gateway confirms success.
The platform must never mark funds RELEASED based only on policy approval or only on an incoming marketplace event.
7. State Machines
7.1 Payment
CREATED
  → AUTHORIZED
  → FUNDS_IN_CUSTODY
  → FUNDS_RELEASED

PACK-01 does not add settlement/refund terminal states.
From
	To
	Trigger
	Allowed?
	
AUTHORIZED
	FUNDS_IN_CUSTODY
	Successful HoldFundsUseCase
	Yes
	
FUNDS_IN_CUSTODY
	FUNDS_RELEASED
	Confirmed release by sandbox gateway
	Yes
	
CREATED
	FUNDS_IN_CUSTODY
	Any
	No
	
AUTHORIZED
	FUNDS_RELEASED
	Any
	No
	
FUNDS_IN_CUSTODY
	AUTHORIZED
	Any
	No
	
7.2 TrustCustody
IN_CUSTODY → READY_FOR_RELEASE → RELEASED
From
	To
	Condition
	
—
	IN_CUSTODY
	Payment is AUTHORIZED and no custody exists.
	
IN_CUSTODY
	READY_FOR_RELEASE
	CustomerConfirmed received and release policy returns ALLOW.
	
READY_FOR_RELEASE
	RELEASED
	PaymentGateway.release confirms success.
	
8. PAY-003 — Hold Funds / Start Trust Custody
8.1 Trigger
The canonical trigger is the Domain Event:
Payment.Authorized
The custody consumer must be idempotent according to PACK-00. Duplicate delivery may not create another custody or reapply a financial state transition.
8.2 HoldFundsUseCase
1. Load Payment using aggregateId/paymentId from Payment.Authorized.
2. Validate Payment exists and status is AUTHORIZED.
3. Check whether TrustCustody already exists by paymentId.
4. If custody already exists with the same Payment and consistent snapshot, treat duplicate processing idempotently and return existing result/no-op.
5. Create TrustCustody with status IN_CUSTODY and financial snapshot copied from Payment.
6. Update Payment to FUNDS_IN_CUSTODY.
7. Persist custody + Payment state change + outbox events in one database transaction.
8. Publish TrustCustody.Created and Funds.Held through outbox using canonical event envelope.
9. Write immutable audit entries with correlationId/request context available.
8.3 Required Events
Event
	aggregateType
	aggregateId
	Meaning
	
TrustCustody.Created
	TrustCustody
	custody.id
	Custody aggregate was created.
	
Funds.Held
	TrustCustody
	custody.id
	Authorized funds entered Trust domain custody state.
	
These events are distinct facts. TrustCustody.Created announces aggregate creation; Funds.Held announces the relevant financial state.
9. Release Trigger and Semantic Boundary
MarketplaceOrder.CustomerConfirmed is reserved in PACK-01 for customer confirmation/acceptance of completed service. This event is the release-eligibility trigger, not a Payment creation trigger.
The release consumer must correlate the order to the existing TrustCustody through orderId/payment relationship.
9.1 Duplicate event behavior
If no custody exists: do not create one from CustomerConfirmed; report/log a consistency error and do not release anything.
If custody is IN_CUSTODY: evaluate policy.
If custody is READY_FOR_RELEASE: do not re-run policy side effects unnecessarily; continue/retry the idempotent gateway release path.
If custody is RELEASED: no-op and record idempotent consumption.
10. TrustReleasePolicyService
PACK-01 requires a deterministic minimum release policy so Claude does not invent business rules. The policy returns ALLOW or DENY plus machine-readable reasons.
Rule
	ALLOW requirement
	
Custody status
	TrustCustody.status == IN_CUSTODY
	
Payment status
	Payment.status == FUNDS_IN_CUSTODY
	
Order identity
	CustomerConfirmed.orderId matches custody.orderId
	
Customer acceptance
	The triggering event is the valid customer completion confirmation for that order
	
Open dispute
	No OPEN/active Marketplace dispute exists for the order
	
Financial snapshot
	Payment and custody amount/currency/order/buyer/seller remain consistent
	
PACK-01 does not implement time-based auto-release, category-specific retention windows, configurable release delays or automatic release after silence.
10.1 Policy denial
No gateway operation is called.
Custody remains IN_CUSTODY.
Payment remains FUNDS_IN_CUSTODY.
No Funds.ReadyForRelease or Funds.Released event is emitted.
The denial and reason are audited.
A duplicate CustomerConfirmed may be re-evaluated only if relevant domain state has changed; otherwise idempotent no-op is preferred.
11. PAY-004 — Release Funds
11.1 Safe release sequence
1. Consume MarketplaceOrder.CustomerConfirmed.
2. Load TrustCustody by orderId and load its Payment.
3. Evaluate TrustReleasePolicyService.
4. If DENY: stop with no financial state change and audit reason.
5. If ALLOW: atomically transition TrustCustody IN_CUSTODY → READY_FOR_RELEASE and publish Funds.ReadyForRelease.
6. After the database transaction commits, call PaymentGateway.release using a deterministic idempotency key derived from custodyId.
7. If the sandbox gateway confirms success: atomically transition TrustCustody READY_FOR_RELEASE → RELEASED, set releasedAt, transition Payment FUNDS_IN_CUSTODY → FUNDS_RELEASED, emit Funds.Released and audit success.
8. If gateway call fails/transiently errors: keep TrustCustody in READY_FOR_RELEASE, keep Payment in FUNDS_IN_CUSTODY, record/audit the failed attempt and allow safe retry with the same idempotency key.
9. Never mark RELEASED before gateway confirmation.
11.2 Idempotency key
release:{trustCustodyId}
An equivalent deterministic key is acceptable if it is stable per custody release and follows the project's existing idempotency conventions.
11.3 Release failure semantics
PACK-01 intentionally does not add RELEASE_FAILED as a new domain state. A failed external attempt leaves the custody READY_FOR_RELEASE so the same release can be retried safely. Failure details belong to the gateway attempt/audit/operational logs, not to a falsely terminal custody state.
12. PaymentGateway / Sandbox Contract
The current gateway abstraction must remain provider-independent. PACK-01 may extend the existing PaymentGateway port with a release operation if it does not already exist.
Operation
	Input minimum
	Output minimum
	
release
	paymentId, custodyId, amount, currency, idempotencyKey, correlation context
	success/failure, provider/sandbox transaction reference, timestamp, safe metadata
	
The sandbox must be deterministic and testable.
The domain must not import pg-boss, Render, Supabase Storage or provider-specific SDKs.
No card PAN/CVV or other regulated payment credentials are introduced.
A real provider may later map 'custody/release' to provider-specific capture/split/escrow semantics through an adapter without changing the domain states defined here.
13. Database Changes
13.1 New table: trust_custodies
Column
	Rule
	
id
	Primary key; current platform ID convention.
	
payment_id
	FK/payment reference; NOT NULL; UNIQUE.
	
order_id
	FK/order reference; NOT NULL; indexed.
	
buyer_id
	NOT NULL; same identity type used by Payment.
	
seller_id
	NOT NULL; same identity type used by Payment.
	
amount
	Same database type/semantics as payments.amount; minor units; NOT NULL.
	
currency
	Same type/semantics as payments.currency; NOT NULL.
	
status
	IN_CUSTODY | READY_FOR_RELEASE | RELEASED.
	
started_at
	UTC; NOT NULL.
	
released_at
	UTC; NULL until RELEASED.
	
created_at
	UTC; NOT NULL.
	
updated_at
	UTC; NOT NULL.
	
13.2 Constraints / indexes
PK(id).
UNIQUE(payment_id).
Index(order_id).
Index(status).
Optional compound index only if justified by actual release-consumer query plan; do not add speculative indexes.
Migration must be additive and non-destructive.
13.3 Payment schema
Do not create a second money model. Only add/extend Payment status values required by PACK-01 if they are not already present: FUNDS_IN_CUSTODY and FUNDS_RELEASED.
14. Repositories and Application Services
Component
	Required behavior
	
TrustCustodyRepository
	save, findById, findByPaymentId, findByOrderId, existsByPaymentId; transaction-aware according to current repository pattern.
	
TrustCustodyService / HoldFundsUseCase
	Eligibility, uniqueness, custody creation, Payment state transition, outbox/audit.
	
TrustReleasePolicyService
	Deterministic ALLOW/DENY + reasons using rules in §10.
	
FundsReleaseService / ReleaseFundsUseCase
	READY_FOR_RELEASE transition, gateway release, success finalization, retry-safe failure behavior.
	
PaymentAuthorizedConsumer
	Consumes Payment.Authorized idempotently and starts custody.
	
CustomerConfirmed release consumer
	Consumes MarketplaceOrder.CustomerConfirmed idempotently and starts release evaluation.
	
15. API
No new public REST endpoint is required in PACK-01. Custody creation and release are internal event-driven operations.
Do not create a public 'release funds' endpoint in this Pack.
Do not create /payments frontend routes.
If an internal/admin diagnostic endpoint already exists, do not expand it unless required for tests and consistent with current API conventions.
16. Canonical Events
Producer
	Event
	Aggregate
	Required consumer/use
	
Payments
	Payment.Authorized
	Payment
	Triggers custody creation.
	
Trust Custody
	TrustCustody.Created
	TrustCustody
	Custody creation fact.
	
Trust Custody
	Funds.Held
	TrustCustody
	Funds now protected in custody state.
	
Marketplace
	MarketplaceOrder.CustomerConfirmed
	MarketplaceOrder
	Triggers release eligibility after completed-service acceptance.
	
Trust Custody
	Funds.ReadyForRelease
	TrustCustody
	Policy approved; release execution may proceed.
	
Trust Custody
	Funds.Released
	TrustCustody
	Gateway confirmed release; payment/custody state updated.
	
Every new event must comply with PACK-00 event envelope: eventType, eventVersion, occurredAt, producer, aggregateType, aggregateId, correlationId and payload; causationId when applicable.
17. Transaction and Outbox Boundaries
Operation
	Single DB transaction must include
	
Hold
	Create TrustCustody + update Payment to FUNDS_IN_CUSTODY + audit/outbox writes as supported by current pattern.
	
Prepare release
	IN_CUSTODY → READY_FOR_RELEASE + Funds.ReadyForRelease outbox/audit.
	
Finalize release
	READY_FOR_RELEASE → RELEASED + releasedAt + Payment → FUNDS_RELEASED + Funds.Released outbox/audit.
	
The external gateway call must not be wrapped inside a database transaction that remains open while waiting for the external dependency.
18. Error and Exception Semantics
Condition
	Behavior
	
Payment not AUTHORIZED on hold
	Reject/no-op according to consumer contract; do not create custody.
	
Custody already exists
	Idempotent return/no-op when consistent; conflict only if data is inconsistent.
	
CustomerConfirmed but no custody
	Consistency error; no release; log/audit and surface to operational monitoring.
	
Release policy DENY
	No financial state change; audit policy reason.
	
Gateway unavailable/failure
	Custody stays READY_FOR_RELEASE; Payment stays FUNDS_IN_CUSTODY; retry safely.
	
Duplicate CustomerConfirmed
	No duplicate release; use event idempotency + release idempotency key.
	
Duplicate gateway success response
	Must not produce duplicate Funds.Released or duplicate state transition.
	
Any API-visible error created by supporting flows must follow PACK-00 requestId/correlationId error conventions.
19. Audit & Logging
Custody ID, Payment ID, Order ID, buyerId, sellerId.
Amount and currency using the current safe money representation.
Previous and new status.
Policy decision and machine-readable denial reason when applicable.
Gateway/sandbox operation result and external reference when safe.
eventId, correlationId and requestId where available.
Idempotency key for release operation.
Timestamps.
Never log secrets or regulated payment credentials.
20. Required Tests
20.1 Unit tests
Hold succeeds only from Payment AUTHORIZED.
Duplicate Payment.Authorized does not create a second custody.
Custody snapshot equals Payment/order/buyer/seller/amount/currency.
Payment transitions to FUNDS_IN_CUSTODY.
TrustCustody.Created and Funds.Held use correct aggregateType/aggregateId.
Release policy ALLOW on valid customer-confirmed completion with no open dispute.
Release policy DENY when dispute is open.
Release policy DENY for wrong custody/payment/order state.
READY_FOR_RELEASE is persisted before gateway release.
Gateway success finalizes custody/payment and emits Funds.Released exactly once.
Gateway failure leaves custody READY_FOR_RELEASE and payment FUNDS_IN_CUSTODY.
Retry uses the same deterministic release idempotency key.
Duplicate CustomerConfirmed cannot duplicate release.
20.2 Integration tests
Payment.Authorized → TrustCustody created → Payment FUNDS_IN_CUSTODY → events published.
MarketplaceOrder.CustomerConfirmed → policy → READY_FOR_RELEASE → sandbox release → RELEASED/FUNDS_RELEASED.
Open dispute blocks release and no gateway call occurs.
Outbox rollback consistency for hold transaction.
Outbox/event envelope remains PACK-00 compliant.
Legacy event compatibility from PACK-00 remains green.
All existing 52 suites / 320 tests (or the current higher count) remain green.
20.3 End-to-end regression
Offer accepted / order committed
→ Payment exists
→ Payment authorized
→ Custody exists before service completion
→ Customer confirms completed service
→ Release policy allows
→ Sandbox confirms release
→ Custody RELEASED
→ Payment FUNDS_RELEASED
→ no settlement/split is executed
21. Acceptance Criteria
PASS — Every successfully authorized Payment creates exactly one TrustCustody.
PASS — Custody is created before service completion confirmation is required for release.
PASS — Payment becomes FUNDS_IN_CUSTODY only when custody is created successfully.
PASS — MarketplaceOrder.CustomerConfirmed is treated as completed-service acceptance for release and is not used by PACK-01 to create Payment.
PASS — An open dispute prevents release.
PASS — Eligible custody transitions to READY_FOR_RELEASE before the external release call.
PASS — Gateway failure cannot mark custody/payment as released.
PASS — Successful sandbox release transitions custody to RELEASED and Payment to FUNDS_RELEASED.
PASS — TrustCustody.Created, Funds.Held, Funds.ReadyForRelease and Funds.Released are published with correct canonical event envelopes.
PASS — Duplicate events/retries cannot create duplicate custody or duplicate release.
PASS — No real provider, settlement, split, fee, refund, ledger or reconciliation is implemented.
PASS — All existing and new automated tests pass.
22. Definition of Done
Preflight checks completed with no unresolved blocker.
TrustCustody migration applied in development.
PAY-003 and PAY-004 implementation complete according to this Pack.
Required consumers, services, repository changes and gateway sandbox behavior implemented.
All canonical events verified against PACK-00.
Unit/integration/e2e tests green.
No unrelated Payments blocks (settlement/refund/ledger/reconciliation) introduced.
Claude produces PACK-01 Completion Report with files changed, migration, APIs/events, tests, deviations, known issues and implementation commit.
Kondo reviews the diff and confirms scope.
23. Claude AI Implementation Instructions
Implement PACK-01 only.

Read and preserve the implemented PACK-00 baseline.
PAY-001 and PAY-002 are already implemented; do not rewrite them unless a concrete compatibility change is explicitly required here.

Canonical business decisions:
1. Funds enter Trust Custody after Payment.Authorized, before service execution is completed.
2. MarketplaceOrder.CustomerConfirmed means customer acceptance of completed service.
3. CustomerConfirmed triggers release eligibility, not Payment creation.
4. No open dispute may exist when release is allowed.
5. Release is two-phase:
   a) persist READY_FOR_RELEASE,
   b) call sandbox gateway idempotently,
   c) only after confirmed success persist RELEASED + Payment FUNDS_RELEASED.
6. Gateway failure leaves custody READY_FOR_RELEASE and Payment FUNDS_IN_CUSTODY for safe retry.
7. No real provider, settlement, split, platform fee, refund, ledger or reconciliation in this Pack.
8. Use the existing Payment money representation exactly; do not introduce DECIMAL/floating-point conventions if the current code stores minor units.
9. All new events must comply with PACK-00 canonical event envelope.

Before coding, execute the preflight checks in §5.
If current code contradicts a canonical decision and cannot be safely reconciled without changing already implemented product semantics:
STOP that affected item and report:
- exact conflict,
- affected file(s),
- current behavior,
- minimum decision required.

Do not resolve product semantics by assumption.

After implementation, produce:
PACK-01-COMPLETION-REPORT.md
containing:
- Implemented
- Files Changed
- Migrations
- APIs/Events
- Tests & Results
- Acceptance Criteria
- Deviations/Decisions
- Known Issues
- Remaining Work
- Commit

24. Consistency Gate
Check
	Result
	
PACK-00 engineering contracts preserved
	PASS
	
PAY-001/PAY-002 existing scope preserved
	PASS
	
PAY-003 custody trigger aligned to Payment.Authorized
	PASS
	
PAY-004 release separated from settlement
	PASS
	
Customer contracting vs completed-service confirmation semantics separated
	PASS
	
Money convention aligned to current implementation, not historical DECIMAL spec
	PASS
	
Real provider / PCI / split / fee deferred
	PASS
	
No unresolved product decision required for this Pack
	PASS
	
25. Pack Status
STATUS: READY FOR IMPLEMENTATION
PACK-01 is complete for the incremental implementation of Trust Custody and Release using the existing sandbox payment gateway. It supersedes PAY-003 and PAY-004 as the implementation authority for this phase and corrects the historical ambiguity around MarketplaceOrder.CustomerConfirmed.
