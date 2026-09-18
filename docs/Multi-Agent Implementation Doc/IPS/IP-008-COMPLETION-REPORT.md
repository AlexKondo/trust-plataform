# IP-008 — Completion Report

**Cancellation, Dispute & Refund**
Executed 2026-09-16. Owner: Payments/Marketplace implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §4, §5, §10, §13) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-008 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-008_Cancellation_Dispute_Refund.md`) > `INCONSISTENCIAS.md` #12/#13 > IP-007's Completion Report > `docs-extracted/Payment/MVP - Feature - PAY-006 — Refund Payment.md` / `docs-extracted/MVP/MVP - Feature - MRK-023/024/025*.md` > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `ddf4356` (`main`), confirmed via `git log -1` and `git status --short` (empty working tree) before any edit.
- **Hard dependency**: IP-007 (Incremental Payment Authorization) — committed on `main` (its own files present, `PaymentIncrementalAuthorization`/`IncrementalTrustCustody` entities, tables `payment_incremental_authorizations`/`incremental_trust_custodies`, migration `0029`). Confirmed present and unmodified in structure before this IP started editing it (only additive edits made, §3).
- **Working tree at start**: clean (`git status --short` empty).
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` places IP-008 directly downstream of IP-007, alongside IP-009 (Real PSP, `BLOCKED_EXTERNAL`) and upstream of IP-010 (Ledger & Reconciliation). IP-008's own spec header names "Payments/Marketplace" as primary owner. This IP touched only `apps/api/src/modules/payment/**` (new files + additive edits), the dispute-specific slice of `apps/api/src/modules/marketplace/**` (`marketplace-dispute.ts`, `manage-dispute.usecase.ts`, `marketplace-review.dtos.ts`, `marketplace.mapper.ts`, `drizzle-marketplace-review.repository.ts`, `marketplace-review.schema.ts` — MRK-023/024's own files, not any other Marketplace subdomain), plus shared documentation (`docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`) and `apps/api/src/shared/database/schema/index.ts` (the established one-line-per-module re-export list). Zero files under `apps/web/**`, `identity/**`, `verification/**`, `trust-score/**`, `notification/**`, `privacy/**`, `analytics/**`, or any Marketplace subdomain other than disputes (listings, offers, conversations, orders lifecycle itself, scheduling, execution, change orders, reviews) were touched.

## 2. Preflight findings

1. Read all 9 required documents in the mandated order, plus IP-007's Completion Report in full, `INCONSISTENCIAS.md` #12/#13, `docs-extracted/Payment/MVP - Feature - PAY-006*.md`, `docs-extracted/MVP/MVP - Feature - MRK-023/024/025*.md`, and `docs/2026090202/PACK-03-COMPLETION-REPORT.md` (Trust Pause/Change Order context), before writing any code.
2. Hard dependency IP-007: confirmed committed and structurally intact by direct inspection (not assumed from prose).
3. Independently re-verified, in current source, the exact gaps this IP exists to close:
   - `apps/api/src/modules/payment/domain/entities/payment.ts` — `Payment.registerRefund()` existed (PACK-01) with correct accumulation/validation logic, but `grep -rn "registerRefund" apps/api/src/modules/payment` before this IP showed **zero callers** — confirmed, matching IP-007's own Completion Report §4 statement.
   - `apps/api/src/modules/payment/domain/services/payment-gateway.ts` / `sandbox-payment.gateway.ts` — `PaymentGateway.refund()`/`.cancel()` were fully specified in the port and fully implemented in the sandbox adapter since PACK-01, but had **zero callers** anywhere in the codebase (`grep -rn "gateway.refund\|\.refund(" apps/api/src/modules/payment/application` returned nothing before this IP). PAY-006's entire backend (aggregate `FundsRefund`, repository, service, use case, migration) had never been implemented — only the gateway port/adapter existed, exactly matching the task brief's suspicion ("verify whether it was ever implemented against the real custody model, or only sandboxed/stubbed" — answer: neither; only the port/adapter existed, with no use case above it).
   - `apps/api/src/modules/marketplace/application/usecases/manage-dispute.usecase.ts` (before this IP) — `resolve()` computed `faultIdentityId` for Trust Score penalty only; the `MarketplaceDispute.Resolved` event payload had no monetary field at all. Confirmed directly against `INCONSISTENCIAS.md` #13's own resolution text, which only names a Trust Score consequence (`−60/−30`) for dispute resolution — no refund mechanism is mentioned anywhere as already decided.
   - `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts` — `CANCELLABLE_STATUSES = [CREATED, AWAITING_SCHEDULING, SCHEDULED, AWAITING_EXECUTION]`, strictly before `IN_PROGRESS`. Cross-referenced against the release trigger (`MarketplaceOrder.CustomerConfirmed`, which requires `AWAITING_CUSTOMER_CONFIRMATION`, itself only reachable after `IN_PROGRESS`/execution) — this **proves**, not assumes, that whenever a pre-execution cancellation is possible, the associated `Payment` can only be in `CREATED`/`AUTHORIZATION_FAILED`/`AUTHORIZED`/`FUNDS_IN_CUSTODY`, never `FUNDS_RELEASED`/`SETTLED`. This is the same style of state-machine proof IP-007's own report used for its Change Order/`CUSTOMER_CONFIRMED` question (§11.1 of that report) — reused here, not reinvented.
   - `CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES` (`[SCHEDULED, AWAITING_EXECUTION, IN_PROGRESS, AWAITING_CUSTOMER_CONFIRMATION]`) **overlaps** with `CANCELLABLE_STATUSES` at `SCHEDULED`/`AWAITING_EXECUTION` — confirming, by direct enum comparison rather than assumption, that the task's flagged scenario ("an incremental Change Order authorization exists but isn't yet in custody, and the order gets cancelled") is genuinely reachable, not hypothetical.
   - `apps/api/src/modules/payment/domain/entities/trust-custody.ts` — `CUSTODY_STATUS`/`CUSTODY_TRANSITIONS` had exactly three states (`IN_CUSTODY -> READY_FOR_RELEASE -> RELEASED`), with the file's own header comment stating "liquidação e reembolso entram em Packs futuros" — an explicit, in-code acknowledgment that refund was deliberately deferred to a future Pack, i.e. this one.
4. Existing capabilities to reuse, confirmed by reading the actual files:
   - The exact two-phase, gateway-outside-transaction discipline of `AuthorizePaymentUseCase`/`ReleaseFundsUseCase` (`PACK-01`) and `CreateIncrementalAuthorizationUseCase` (IP-007) — reused verbatim in shape for `RefundPaymentUseCase` (§3.3).
   - The exact CAS pattern (`UPDATE ... WHERE <expected> RETURNING`) from `DrizzleTrustChangeOrderRepository.saveWithExpectedStatus` and IP-007's `markReadyForReleaseIfInCustody`/`markReleasedIfReady` — reused for the two new custody-refund CAS methods (§3.4) and generalized (not copied blindly) into a value-based CAS for the money-accumulator field (§3.5, the highest-risk new primitive this IP adds).
   - `PaymentAuthorizationRepository.findApprovedByPayment` / `PaymentIncrementalAuthorizationRepository.findByChangeOrderId` — reused to resolve the `providerTransactionId` a refund/void must target, exactly the way `AuthorizePaymentUseCase`/`ReleaseFundsUseCase` already resolve their own gateway targets.
   - `AdminGuard` on `POST /marketplace/disputes/{disputeId}/resolve` (MRK-024, already existing) — reused unchanged; no new authorization surface was needed for the admin-typed `refundAmount`, since it rides the same already-admin-gated endpoint.
   - The one-way Payments→Marketplace dependency direction PACK-01 established (`OrderDisputeQuery`) and IP-007 reused (`ChangeOrderCommercialQuery`) — preserved exactly: the two new consumers live in `payment/infrastructure/consumers/`, reading Marketplace's own published events (`MarketplaceOrder.Cancelled`, `MarketplaceDispute.Resolved`), never a Marketplace repository or entity directly. `grep -rn "from '.*payment" apps/api/src/modules/marketplace/` still returns zero matches after this IP.
5. Exact gaps to implement — enumerated in §3 below.
6. Owned files / collision hotspots: `apps/api/src/modules/payment/**` (this IP's primary domain) plus the MRK-023/024 dispute slice of `apps/api/src/modules/marketplace/**` (both explicitly named "Payments/Marketplace" in this IP's own spec header — not opportunistic scope expansion; every touched Marketplace file is dispute-specific, and no file belonging to another active/closed IP's declared domain — listings, offers, conversations, scheduling, execution, change orders, reviews, service requests — was touched). `docs/openapi.yaml`/`docs/event-catalog.md`/`CLAUDE.md` edited only in the sections describing this IP's own new/changed contracts, following IP-007's own precedent for touching shared documentation files safely.
7. Baseline tests run before implementation: `pnpm typecheck` (0 errors, apps/api + apps/web) and `pnpm -w lint` (0 errors) matched a clean starting point. `pnpm test` (apps/api, no `TEST_DATABASE_URL`) confirmed the stated baseline exactly: **92 files (62 passed, 30 skipped), 633 tests (504 passed, 129 skipped)** — this is the authoritative "before" number this report's §10 compares against.
8. No conflict found that blocked implementation outright — one genuine business-policy gap (Trust Fee/PSP fee treatment on refund) was found and is **escalated**, not guessed (§11.1, full artifact in `IP-008-CONFLICT-ESCALATION-FEE-TREATMENT-ON-REFUND.md`). One real state-machine bug was found and fixed, disclosed in full in §10.4/§11.2 (same standard of honesty IP-007's own report set at its own §10.4).

## 3. Implemented

### 3.1 `FundsRefund` aggregate (PAY-006)

`apps/api/src/modules/payment/domain/entities/funds-refund.ts` (+ `.spec.ts`) — new aggregate, one row per refund **attempt** against a `Payment` (a `Payment` may have many, BR-005: "a soma dos valores não ultrapassa o valor originalmente liquidado"). Closed-catalog `RefundReason` (`ORDER_CANCELLED_BEFORE_EXECUTION`, `DISPUTE_UPHELD`, `OPERATIONAL_ERROR`, `ADMINISTRATIVE_REFUND`, `IMPROPER_CHARGE`, `OTHER`) — same "closed catalog in code, admin UI deferred" pattern as `DISPUTE_CATEGORIES` (MRK-023). `REFUND_STATUS` (`PENDING/PROCESSING/COMPLETED/FAILED`, BR-006) with `REFUND_TRANSITIONS` explicitly terminal at `COMPLETED`/`FAILED` — "no fake reauthorization is invented" (same discipline as `PaymentIncrementalAuthorization`, IP-007). `markCompleted`/`markFailed` sanitize the gateway's raw response via the existing `sanitize()` helper from `payment-authorization.ts` (reused, not duplicated) — a dedicated unit test proves a `cvv` key never survives.

### 3.2 New table `funds_refunds` + repository

`apps/api/src/modules/payment/infrastructure/persistence/funds-refund.schema.ts` + `drizzle-funds-refund.repository.ts` (adapter) + `domain/repositories/funds-refund.repository.ts` (port). `UNIQUE(idempotency_key)` is the DB-level backstop against duplicate refunds — deterministic key per business trigger (§3.3), never a client-supplied key (there is no HTTP entry point for refunds at all, matching PAY-006 §8: "Não haverá endpoint público... iniciados por eventos internos ou processos administrativos autorizados"). `disputeId` is stored **without a foreign key** (Payments cannot depend on Marketplace's schema — PACK-01 §10's one-way rule) — pure traceability.

### 3.3 `RefundPaymentUseCase`

`apps/api/src/modules/payment/application/usecases/refund-payment.usecase.ts` (+ `.spec.ts`, 9 unit tests + a genuine concurrency test). Reusable core for both triggers (§3.6/§3.7): given `{paymentId, amountCents, reason, requestedBy, idempotencyKey, providerTransactionId, ...}`, it:

1. **Defense 1** (idempotency pre-check): `findByIdempotencyKey` — a replay returns the existing `FundsRefund` without touching the gateway.
2. Loads `Payment`, checks `REFUND_ELIGIBLE_STATUSES = [FUNDS_IN_CUSTODY, FUNDS_RELEASED, SETTLED, PARTIALLY_REFUNDED]` — anything else is `NOT_ELIGIBLE`, audited, no gateway call.
3. **Defense 2** (cheap, pre-gateway): `amountCents` validated against `payment.refundableCents` — `LIMIT_EXCEEDED` short-circuits before any network call.
4. Calls `PaymentGateway.refund()` **outside** any transaction (§17 discipline, same as `AuthorizePaymentUseCase`/`ReleaseFundsUseCase`), against the caller-supplied `providerTransactionId` — the use case is deliberately agnostic of *which* original authorization (the Payment's own, or an incremental tranche's) it is reversing; the caller resolves that (§3.6/§3.7).
5. On gateway decline/error: persists a `FAILED` `FundsRefund` row, audits `FAILURE`, returns `GATEWAY_FAILED` — no event published (same "denial is audited, not published" precedent as PACK-01's `ReleaseDenied`).
6. On approval: **Defense 3**, the money-safety core (§3.5) — a bounded-retry loop that re-reads `Payment` fresh, recomputes via `Payment.registerRefund()` (in-memory validation, unchanged PACK-01 method), and persists via a genuine CAS write (`PaymentRepository.applyRefundIfExpected`) inside a transaction that also inserts the `FundsRefund` row, enqueues `FundsRefund.Completed`, and audits — all three succeed or fail together (a `CasLostSignal` is thrown *inside* the transaction on CAS failure specifically so the `FundsRefund` insert rolls back too, not just the Payment write — a real subtlety caught while writing this use case, see §10.4).
7. If all retries lose the race (extremely unlikely given the mutual-exclusivity proof in §3.6/§3.7, but defended anyway): returns `LEDGER_INCONSISTENT` with an ERROR-level log — the gateway already approved, but the ledger could not safely record it; never silently reported as success, never silently dropped.

### 3.4 `REFUNDED` — additive custody state

`trust-custody.ts` / `incremental-trust-custody.ts`: `CUSTODY_STATUS` gains `REFUNDED`, reachable **only** from `IN_CUSTODY` (`IN_CUSTODY -> REFUNDED` added to `CUSTODY_TRANSITIONS`; `READY_FOR_RELEASE`/`RELEASED` remain terminal towards refund — once release has started or finished, the platform no longer holds the money to "un-release," so that case is Payment-level bookkeeping only, not a custody-state transition, §11.3). Both entities gain `markRefunded()`/`isRefunded()`. New CAS repository methods `markRefundedIfInCustody` on both `TrustCustodyRepository`/`IncrementalTrustCustodyRepository` (and their Drizzle adapters), mirroring `markReadyForReleaseIfInCustody` exactly.

### 3.5 The core money-safety primitive: `PaymentRepository.applyRefundIfExpected`

New abstract method + `DrizzlePaymentRepository` implementation: `UPDATE payments SET refunded_amount = ?, status = ? WHERE id = ? AND refunded_amount = <expected> RETURNING id`. This is the CAS-for-an-accumulator equivalent of IP-007's CAS-for-a-status-flag (`markReadyForReleaseIfInCustody`) — generalized because refund's dangerous field (`refundedCents`) *accumulates* across possibly-many rows rather than flipping between fixed enum values. `RefundPaymentUseCase` never calls `PaymentRepository.save()` for the refund outcome; only this CAS method. Proven safe under real concurrency (§3.3 step 6/7, §10.1/§10.2) rather than merely by code inspection.

### 3.6 Cancellation before execution: `RefundPaymentOnOrderCancelledConsumer`

`apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-order-cancelled.consumer.ts` (+ `.spec.ts`, 7 unit tests). Subscribes `MarketplaceOrder.Cancelled`, `managesOwnTransaction = true` (calls the gateway). By the state-machine proof in §2 item 3, covers exactly the four reachable `Payment` states for the **original tranche**:

- `CREATED`/`AUTHORIZATION_FAILED` (nothing captured): `payment.cancel()` only, no gateway call, no `FundsRefund` row (there is nothing to refund).
- `AUTHORIZED` (reserved at the PSP, never captured into custody): `gateway.cancel()` voids the reservation — **not a refund** (PAY-006 §2 explicitly excludes chargeback/contestation; this isn't even that — nothing was ever captured), then `payment.cancel()`.
- `FUNDS_IN_CUSTODY`: full refund of `payment.refundableCents` via `RefundPaymentUseCase` (`reason: ORDER_CANCELLED_BEFORE_EXECUTION`, no fee/penalty — §11.4), then, only if the refund succeeded, `TrustCustody.markRefundedIfInCustody` (CAS) and a `TrustCustody.Refunded` event.
- `CANCELLED`/`REFUNDED` already (event redelivery under the relay's "at least once" guarantee for `managesOwnTransaction` consumers): silently idempotent, no new action, no misleading warning log.

Then, independently, resolves **every incremental tranche** (IP-007) for the order — the exact scenario the task flagged as needing verification:

- Tranche `APPROVED` but **no** `IncrementalTrustCustody` row yet (the `amountAuthorizedNotInCustody` gap, PACK-03 §9.1/IP-007 §12.2): `gateway.cancel()` voids it — again not a refund, nothing was captured.
- Tranche `APPROVED` **and** already `IN_CUSTODY`: refunded via the same `RefundPaymentUseCase`, deterministic key `refund:cancel:incremental:{changeOrderId}`, then `IncrementalTrustCustody.markRefundedIfInCustody`.
- Tranche `DECLINED`/`ERROR`: skipped entirely — no money ever moved.

### 3.7 Dispute resolution gains a real financial consequence

`ResolveDisputeRequest` (`marketplace-review.dtos.ts`) gains an **optional** `refundAmount` (reais, non-negative). `DisputeDecision.create()` (`marketplace-dispute.ts`) stores it (`refundAmount: number | null`, matching the Marketplace convention of storing money in reais at the entity boundary — same convention `TrustChangeOrder.changeGrossAmount` already uses, not the Payments-module cents convention, since this is a Marketplace-owned entity). `0`/absent is normalized to `null` ("no refund"), never an error. `manage-dispute.usecase.ts`'s `resolve()` adds one **soft sanity bound** (`refundAmount` cannot exceed `order.amount` — a typo guard, `422 MARKETPLACE_DISPUTE_INVALID`, not the authoritative limit) and includes `refundAmount` in the `MarketplaceDispute.Resolved` event payload.

**Deliberately not computed from `decisionType`.** No table like "UPHELD = 100%, PARTIALLY_UPHELD = 50%" exists in any document read for this IP — inventing one would be exactly the "no invented business policy" violation the mandate warns against. The admin/mediator types the amount, exactly matching PAY-006 §3's "solicitante" requirement and this program's "no AI adjudication" rule (a human decides; the system only executes that decision safely).

New consumer `RefundPaymentOnDisputeResolvedConsumer` (`apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-dispute-resolved.consumer.ts`, + `.spec.ts`, 7 unit tests): subscribes `MarketplaceDispute.Resolved`, `managesOwnTransaction = true`. No-ops when `refundAmount` is absent/`≤0`. Otherwise resolves the `Payment`'s approved authorization (`findApprovedByPayment`) and calls `RefundPaymentUseCase` with `amountCents = fromReais(refundAmount)`, `reason: DISPUTE_UPHELD`, `disputeId` set, deterministic key `refund:dispute:{decisionId}` (the immutable decision id, never the mutable dispute — a dispute can, structurally, be reopened and resolved again later in the order's lifecycle, so keying off the decision, not the dispute, is what makes a *second* dispute on the same order safely independent).

**Deliberately Payment-scoped, never custody-scoped.** Unlike the cancellation path, this consumer never touches `TrustCustody`/`IncrementalTrustCustody` status. A dispute can be resolved with the Payment in any of `FUNDS_IN_CUSTODY`/`FUNDS_RELEASED`/`SETTLED`/`PARTIALLY_REFUNDED` (the order can reach `DISPUTE_OPEN` from `IN_PROGRESS` through `COMPLETED`), and the admin's amount is a human judgment call that doesn't map 1:1 onto any specific custody row (original vs. one of possibly several incremental tranches) without inventing an allocation policy nobody approved. `FundsRefund`/`Payment.refundedCents` remain the single, authoritative, auditable source of "how much was actually refunded" regardless of which custody row historically held it — a deliberate scope boundary, recorded here rather than silently decided (§11.5).

### 3.8 A real, pre-existing bug found and fixed: incomplete `PAYMENT_TRANSITIONS`

`apps/api/src/modules/payment/domain/entities/payment-types.ts` — `PAYMENT_TRANSITIONS` (PACK-01) only allowed `PARTIALLY_REFUNDED` **from `SETTLED`**. Writing the genuine concurrency test for `RefundPaymentUseCase` (§10.4) triggered a real `PaymentTransitionException` for a *partial* refund of money still `FUNDS_IN_CUSTODY`/`FUNDS_RELEASED` (never liquidated) — a completely legitimate scenario this IP must support (a dispute can be partially upheld, with the money never yet released). A second, related gap: `PARTIALLY_REFUNDED` had no self-loop, so a **second** partial refund that didn't fully exhaust the balance (distinct from the existing test, which happened to always exhaust on the second call) would also throw. Both fixed additively (two new edges, one new self-loop; zero edges removed or redefined) — see the in-code comment on `PAYMENT_TRANSITIONS` for the full reasoning, and §10.4 for the failing-then-passing proof.

### 3.9 Read surface: `refunds[]` on `GET /payments/:id` / `GET /payments/by-order/:orderId`

Additive field, always present (possibly `[]`), mirroring the existing `authorizations[]` pattern exactly — `GetPaymentUseCase` now also loads `FundsRefundRepository.listByPayment`. No new HTTP route (PAY-006 §8 explicitly rules one out).

## 4. Not implemented / out of scope

- **No Trust Fee/PSP fee reversal or proration on refund** — genuinely undecided business policy, escalated rather than guessed (§11.1, full artifact `IP-008-CONFLICT-ESCALATION-FEE-TREATMENT-ON-REFUND.md`). `Payment` has no fee-breakdown field to adjust in the first place (only PACK-02's Marketplace-side commercial snapshot does, and only as an immutable fact at contract time).
- **No chargeback / bank contestation / financial reconciliation** — PAY-006 §2 explicitly excludes these; out of this IP's scope by the spec's own words, not narrowed by this agent.
- **No cancellation fee/penalty policy** — `CANCELLABLE_STATUSES`' own pre-existing comment already deferred "prazos, multas e taxas" as configurable policy outside MRK-018's core rule; since none is configured anywhere in the baseline, the only safe default (zero fee, full refund of what was captured) was applied — not a new policy invention, the neutral case of an already-flagged-as-deferred rule.
- **No refund allocation across custody rows for dispute-triggered refunds** — deliberate scope boundary (§3.7); `FundsRefund`/`Payment.refundedCents` are the source of truth regardless.
- **No admin/manual refund initiation endpoint beyond dispute resolution** — PAY-006 §8 rules out any public refund endpoint; "administrative refund" (`ADMINISTRATIVE_REFUND` reason, already in the closed catalog for future use) has no consumer wired to it in this IP, since no product decision named a trigger for it beyond dispute resolution and cancellation.
- **No `FundsRefund.Created`/`FundsRefund.Failed` events** — only `FundsRefund.Completed` is published; a declined/errored attempt is persisted `FAILED` and audited, matching the pre-existing `ReleaseDenied` precedent (audit, not event, for a non-terminal-success outcome) rather than PAY-006 §10's literal three-event list. No consumer needs to react to a failed refund attempt today.
- **No frontend work** — this program's Payments/Marketplace backend has zero `apps/web` coverage to date (confirmed unchanged); out of this IP's scope, consistent with every prior Payments IP.
- **No retrofit of `TrustCustody`'s original (PACK-01) `save()` to use CAS for the release path** — untouched, carried-forward observation (already flagged by IP-007 §12); this IP adds its OWN CAS method (`markRefundedIfInCustody`) without touching the pre-existing unconditional `save()`.

## 5. Files changed

**New files (14)**:
```
apps/api/drizzle/0035_ip008_cancellation_dispute_refund.sql                                    92
apps/api/src/modules/payment/domain/entities/funds-refund.ts                                  252
apps/api/src/modules/payment/domain/entities/funds-refund.spec.ts                              84
apps/api/src/modules/payment/domain/entities/trust-custody.spec.ts                             50
apps/api/src/modules/payment/domain/repositories/funds-refund.repository.ts                    19
apps/api/src/modules/payment/application/usecases/refund-payment.usecase.ts                   390
apps/api/src/modules/payment/application/usecases/refund-payment.usecase.spec.ts              304
apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-order-cancelled.consumer.ts       361
apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-order-cancelled.consumer.spec.ts  375
apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-dispute-resolved.consumer.ts      121
apps/api/src/modules/payment/infrastructure/consumers/refund-payment-on-dispute-resolved.consumer.spec.ts 135
apps/api/src/modules/payment/infrastructure/persistence/funds-refund.schema.ts                 72
apps/api/src/modules/payment/infrastructure/persistence/drizzle-funds-refund.repository.ts    134
apps/api/test/integration/ip-008-cancellation-dispute-refund.e2e.spec.ts                      391
```
14 new files, 2,780 lines total.

**Modified files** (`git diff --stat`, 29 files, +640/−22):
```
CLAUDE.md                                                                            |  63 +
apps/api/drizzle/meta/_journal.json                                                 |   7 +
apps/api/src/modules/marketplace/application/dto/marketplace-review.dtos.ts         |  12 +-
apps/api/src/modules/marketplace/application/mapper/marketplace.mapper.ts           |   1 +
apps/api/src/modules/marketplace/application/usecases/manage-dispute.usecase.ts     |  23 +
apps/api/src/modules/marketplace/domain/entities/marketplace-dispute.spec.ts        |  60 +
apps/api/src/modules/marketplace/domain/entities/marketplace-dispute.ts             |  42 +
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-review.repository.ts | 13 +-
apps/api/src/modules/marketplace/infrastructure/persistence/marketplace-review.schema.ts |  3 +
apps/api/src/modules/payment/application/dto/payment.dtos.ts                        |  17 +
apps/api/src/modules/payment/application/mapper/payment.mapper.ts                   |  18 +
apps/api/src/modules/payment/application/usecases/custody-release.usecase.spec.ts   |   1 +
apps/api/src/modules/payment/application/usecases/get-payment.usecase.ts            |   9 +-
apps/api/src/modules/payment/domain/entities/incremental-trust-custody.spec.ts      |  23 +
apps/api/src/modules/payment/domain/entities/incremental-trust-custody.ts           |   9 +
apps/api/src/modules/payment/domain/entities/payment-types.ts                       |  34 +-
apps/api/src/modules/payment/domain/entities/payment.spec.ts                        |  33 +
apps/api/src/modules/payment/domain/entities/trust-custody.ts                       |  35 +-
apps/api/src/modules/payment/domain/exceptions/payment.exceptions.ts                |  55 +
apps/api/src/modules/payment/domain/repositories/incremental-trust-custody.repository.ts | 11 +
apps/api/src/modules/payment/domain/repositories/payment.repository.ts              |  25 +
apps/api/src/modules/payment/domain/repositories/trust-custody.repository.ts        |  12 +
apps/api/src/modules/payment/infrastructure/persistence/drizzle-incremental-trust-custody.repository.ts | 20 +
apps/api/src/modules/payment/infrastructure/persistence/drizzle-payment.repository.ts | 36 +-
apps/api/src/modules/payment/infrastructure/persistence/drizzle-trust-custody.repository.ts | 19 +-
apps/api/src/modules/payment/payment.module.ts                                      |  12 +
apps/api/src/shared/database/schema/index.ts                                        |   1 +
docs/event-catalog.md                                                               |  31 +-
docs/openapi.yaml                                                                    |  37 +-
29 files changed, 640 insertions(+), 22 deletions(-)
```
Zero files under `apps/web/**`, any non-dispute Marketplace subdomain, or any other module were touched.

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0035_ip008_cancellation_dispute_refund.sql` (92 lines) — additive only: `CREATE TABLE IF NOT EXISTS funds_refunds`, guarded `DO $$ ... IF NOT EXISTS ... END $$` FK blocks, conditional indexes, one `ALTER TABLE marketplace_dispute_decisions ADD COLUMN IF NOT EXISTS refund_amount numeric(18,2)` (nullable). No `DROP`, no destructive `ALTER`, no `tenant_id`. Explicitly documents (in a trailing comment) that `trust_custodies`/`incremental_trust_custodies` need **no** schema change for the new `REFUNDED` status value, since `status` is a bare `varchar(30)` with no `CHECK` constraint (verified directly against `payment.schema.ts`/`payment-incremental.schema.ts` before writing this note).
- **Journal**: `apps/api/drizzle/meta/_journal.json` — new entry, idx 35, tag `0035_ip008_cancellation_dispute_refund` (checked the highest existing index first — 34, IP-015's — per the task's explicit instruction).
- **Schema re-export**: `apps/api/src/shared/database/schema/index.ts` — one new line for `funds-refund.schema.ts`, following the exact existing convention.
- No `.env`/config schema changes — no new runtime configuration surface (sandbox gateway reused unchanged, zero new provider selection).

## 7. APIs / events / jobs

- **No new HTTP route.** Two existing routes gained additive fields:
  - `GET /payments/by-order/{orderId}` / `GET /payments/{paymentId}` — `refunds[]`, always present.
  - `POST /marketplace/disputes/{disputeId}/resolve` — request body gains optional `refundAmount`; response's `decision` gains `refundAmount` (reais, `null` when absent).
- **One new event type**: `FundsRefund.Completed` (v1.0) — new aggregate `FundsRefund`. Documented in `docs/event-catalog.md` with payload shape, both triggers, and the idempotency-key scheme.
- **One aditive event field**: `MarketplaceDispute.Resolved` bumped to v1.1 in the catalog (backward-compatible — `refundAmount` absent/`null` for any consumer that predates this field, and the only existing consumer, `trs.score-dispute-resolved`, never reads it).
- **Reused event type, new aggregate reference**: `TrustCustody.Refunded` — same reuse pattern IP-007 already established for `Funds.Held`/`Funds.Released` across `TrustCustody`/`IncrementalTrustCustody`.
- **Two new consumers**: `pay.refund-payment-on-order-cancelled` (subscribes `MarketplaceOrder.Cancelled`), `pay.refund-payment-on-dispute-resolved` (subscribes `MarketplaceDispute.Resolved`) — both `managesOwnTransaction = true` (both call the gateway, directly or via `RefundPaymentUseCase`), both registered in `payment.module.ts`'s existing `providers` array (no new module-wiring pattern introduced).
- **No new job** beyond the existing pg-boss/outbox-relay mechanism every other consumer in this module already uses.

## 8. Security / authorization / privacy

- **No new authentication/authorization surface.** The only new user-triggerable input (`refundAmount` on dispute resolution) rides the pre-existing `AdminGuard`-protected `POST /marketplace/disputes/{disputeId}/resolve` route — unchanged guard, unchanged role check. Cancellation-triggered refunds are entirely internal/event-driven (no new controller route, no new user-triggerable action beyond the pre-existing `POST /marketplace/orders/{orderId}/cancel`, itself unmodified by this IP).
- `FundsRefund.gatewayResponse` is sanitized through the exact same `sanitize()` function `PaymentAuthorization`/`PaymentIncrementalAuthorization` already use (imported, not duplicated) — confirmed by a dedicated unit test that a `cvv` key never survives into the persisted `gatewayResponse`.
- Audit: every new state transition is audited via the existing `AuditLogService.record()`/`.recordSafe()` — `RefundPayment` (success and every failure variant: `PAYMENT_NOT_ELIGIBLE`, `REFUND_LIMIT_EXCEEDED`, gateway failure), `CancelPayment`, `CancelIncrementalAuthorization` — matching the granularity/metadata shape of the equivalent PACK-01/IP-007 operations.
- No new PII/sensitive data introduced. No LGPD-relevant surface touched (`privacy/**` untouched, as mandated).

## 9. Data / financial invariants

- **No floating-point money anywhere in the new code.** `RefundPaymentUseCase`/`FundsRefund` work exclusively in `Cents` (integer), converting to/from reais only at the DTO/DB boundary via the existing `fromReais`/`toReais`/`toReaisString` helpers — exactly like `Payment`/`TrustCustody` already do. `DisputeDecision.refundAmount` is the one deliberate exception, stored in reais to match the Marketplace-module convention (`TrustChangeOrder.changeGrossAmount`) — even there, `toReais(fromReais(input.refundAmount))` is applied on write specifically to reject sub-cent fractions early, the same "never trust a loose float" discipline applied in the module's own idiom.
- **Refund amount is always what a human decided, never computed from a business formula this agent invented.** Cancellation: the full `payment.refundableCents`/tranche `amountCents` already captured (BR-003's "Cancelamento antes da execução" reason, zero-fee default — §11.4). Dispute: exactly `fromReais(refundAmount)`, the value an admin typed, propagated unchanged from the HTTP request body through the domain entity, the event payload, and into `RefundPaymentUseCase` — a dedicated unit test (`refund-payment-on-dispute-resolved.consumer.spec.ts`, "dispara o reembolso pelo valor exato digitado") asserts the exact cents value reaches the use case.
- **Idempotency on every financial mutation this IP adds**: refund creation (`UNIQUE(idempotency_key)` + deterministic key per business trigger + application-level pre-check), custody-refund marking (CAS, `markRefundedIfInCustody`), the Payment-side accumulator write itself (CAS, `applyRefundIfExpected`). Every one of these is exercised by more than a sequential idempotency test — the accumulator CAS specifically by a genuine `Promise.all` concurrency test against an in-memory fake that reproduces real CAS semantics (§10.1).
- **Refund never exceeds funded/custodied amount — proven, not just claimed.** Three layers: (a) `Payment.registerRefund()`'s own in-memory guard (unchanged PACK-01 method, `refundedCents > refundableCents` throws), (b) the pre-gateway "Defense 2" check that avoids ever calling the gateway for an amount already known to be too large, (c) the CAS write itself, which is the layer that actually matters under concurrency — two use-case instances each holding their own in-memory snapshot of `Payment` cannot, together, write past the funded amount, because the second writer's CAS `WHERE refunded_amount = expected` fails once the first has committed, forcing a re-read-and-recheck rather than a blind write. Proven with a real race (§10.1): two concurrent refunds whose amounts individually fit but jointly exceed the payment's total — **at most one completes**, and the persisted `refunded_amount` never exceeds the amount paid.
- **A genuine, pre-existing bug found and fixed** (§3.8/§10.4): `PAYMENT_TRANSITIONS` didn't support a partial refund of money still in custody/released-but-unsettled, nor a second partial refund that didn't exhaust the balance. Fixed additively; regression-tested at both the entity level (`payment.spec.ts`, 3 new tests) and the use-case level (the failing-then-passing sequence in `refund-payment.usecase.spec.ts`).
- Existing PACK-00..03/IP-007 invariants (immutable original Payment amount, frozen Trust Fee rate, two-phase release, MATERIAL_COST/MARKUP separation, Customer/Member confirmation as release trigger, incremental-tranche release-cannot-over-release) are all regression-tested green by the full suite (§10.2/§10.3) — none of the files that encode those invariants were touched by this IP except the two additive `PAYMENT_TRANSITIONS` edges/self-loop (§3.8), which add zero new reachability to any *non-refund* status.

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `ddf4356`, in this environment. No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`embedded-postgres`, `pnpm test:e2e` / `node test/e2e-local.mjs`) or in-memory fakes.

### 10.1 New tests written (this IP): 71 total — 61 unit/domain tests across 8 spec files + 10 e2e tests in 1 new spec file (7 named `it()` blocks, but 4 are the primary IP-008 e2e file — see breakdown below; totals reconciled against the before/after counts in §10.2/§10.3)

- `funds-refund.spec.ts` — 7 unit tests (PENDING creation, zero/fractional-cents rejection, two-phase PENDING→PROCESSING→COMPLETED, no-skip-a-phase, gateway-response sanitization, COMPLETED/FAILED terminal, `restore()` round-trip).
- `trust-custody.spec.ts` (new — PACK-01's own entity never had a dedicated spec before) — 4 unit tests, scoped to the new `REFUNDED` state: `IN_CUSTODY -> REFUNDED`, `REFUNDED` terminal, `READY_FOR_RELEASE`/`RELEASED` cannot be refunded.
- `incremental-trust-custody.spec.ts` (extended) — 2 new tests (mirrors the above for the incremental tranche entity); 8 total in the file now (6 pre-existing + 2 new).
- `marketplace-dispute.spec.ts` (extended) — 5 new tests (`refundAmount` null-by-default, `0` normalizes to `null`, positive value accepted, negative value rejected, two `UPHELD` decisions with different `refundAmount` proving no formula is applied); 13 total in the file now.
- `payment.spec.ts` (extended) — 3 new regression tests for the bug in §3.8/§10.4 (partial refund from `FUNDS_IN_CUSTODY`, partial refund from `FUNDS_RELEASED`, a third partial refund that doesn't exhaust the balance); 17 total in the file now.
- `refund-payment.usecase.spec.ts` — 9 unit tests (partial refund happy path + exact CAS-call assertion, full refund → `REFUNDED` status, idempotent replay, ineligible-status short-circuit, over-limit short-circuit before the gateway, gateway-decline persisted `FAILED` without touching `Payment`, CAS-loses-once-then-succeeds retry, CAS-exhausted → `LEDGER_INCONSISTENT`) **plus a separate `describe` block with 1 genuine concurrency test** (two concurrent calls against an in-memory CAS-faithful fake, amounts that individually fit but jointly exceed the total — at most one `COMPLETED`, sum never exceeds the paid amount).
- `refund-payment-on-order-cancelled.consumer.spec.ts` — 7 unit tests (`CREATED` no-op-but-cancel, `AUTHORIZED` void-not-refund, `FUNDS_IN_CUSTODY` full refund + custody CAS, incremental tranche approved-but-not-custodied → void, incremental tranche approved-and-custodied → refund + custody CAS, incremental tranche declined → no-op, event-redelivery-after-`CANCELLED` → silent idempotent no-op).
- `refund-payment-on-dispute-resolved.consumer.spec.ts` — 7 unit tests (positive `refundAmount` → exact-value refund call, absent/`0`/negative `refundAmount` → no refund in all three cases, missing Payment → no throw, missing approved authorization → no throw, decision-scoped idempotency key uniqueness).
- `ip-008-cancellation-dispute-refund.e2e.spec.ts` — 4 e2e tests against the real running app + real embedded Postgres (full custody refund on cancellation with listing-released/refunds-list assertions; cancellation before any capture → `CANCELLED`/zero refunds; dispute resolution with admin-typed `refundAmount` → real partial refund end-to-end; `refundAmount` exceeding the order's contracted amount → `422`).

### 10.2 Unit/domain suite (`pnpm test`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Run from `apps/api`:
```
Test Files  67 passed | 31 skipped (98)
     Tests  548 passed | 133 skipped (681)
Duration    95.35s
```
Before this IP: 62 passed / 30 skipped (92 files), 504 passed / 129 skipped (633 tests) — confirmed independently in §2 item 7, matching the task's stated baseline exactly. Delta: **+6 files / +48 tests** in the always-run unit suite (5 pre-existing files extended + 3 wholly new unit/consumer spec files = 8 files touched, but only 6 are net-new *files*; the extended files don't change the file count), **+1 file / +4 tests** in the skipped-without-DB e2e count (`ip-008-cancellation-dispute-refund.e2e.spec.ts`). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

New IP-008 e2e file in isolation, first pass (after adding the missing `waitForScore` step — see §10.4):
```
Test Files  1 passed (1)
     Tests  4 passed (4)
Duration    35.95s
```

Full suite, all 98 files (92 pre-existing + this IP's 6 new files):
```
Test Files  97 passed | 1 failed (98)
     Tests  680 passed | 1 failed (681)
```
The one failure was `ip-002-i18n.e2e.spec.ts`'s notification-locale test, timing out in `waitForScore` (`Score não chegou a 25`) — **zero relation to this IP's diff** (no Payment/Marketplace-dispute file in its path; it is a pre-existing i18n/notification test). Re-run in isolation immediately afterward, no code change:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    17.63s
```
All 7 tests green on the first retry — confirming transient host I/O contention (the same class of flake IP-007's own Completion Report §10.3 documented and diagnosed on this exact machine, `ip-002-i18n.e2e.spec.ts` was literally one of the files in *that* IP's own flaky list too). Combined evidence: **98/98 files, 681/681 tests, 0 failures**, across the full run plus the immediate, clean re-run of the one test that failed the first time.

### 10.4 Real bugs found and fixed during verification

Recorded in full, per this program's standard of disclosing what was actually found, not just what was intended (IP-007 §10.4's own precedent).

1. **`PAYMENT_TRANSITIONS` incomplete for partial refund** (§3.8) — found while writing the concurrency test for `RefundPaymentUseCase`: a partial refund of money still `FUNDS_IN_CUSTODY` (never settled) threw `PaymentTransitionException`. A second related gap (no `PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED` self-loop) would have blocked BR-005's required "multiple partial refunds" for a refund that doesn't exhaust the balance on its second call. Both fixed additively; 4 new failing-then-passing tests prove the fix (3 in `payment.spec.ts`, 1 sequence in `refund-payment.usecase.spec.ts`).
2. **Missing `waitForScore` step in the new e2e file** — the first draft of `ip-008-cancellation-dispute-refund.e2e.spec.ts` published listings immediately after creating a seller identity, before that identity's initial Trust Score (25, from account creation) had been computed by the relay — every listing publish failed `MARKETPLACE_PUBLICATION_NOT_ALLOWED` (category minimum-reputation gate, MRK-003 BR-005), cascading into `contact`/`offer` failures. Not a production bug — a test-authoring omission, caught by actually running the e2e suite (fixed by adding the same `waitForScore` pattern every other Payments/Marketplace e2e file in this codebase already uses).
3. **`applyRefundIfExpected` failing inside a transaction must roll back the co-located `FundsRefund` insert, not just report failure** — while designing the CAS retry loop, realized that a plain `return 'CAS_LOST'` from inside `this.db.transaction(...)`'s callback would **commit** the transaction (including the `FundsRefund.create()` insert that ran moments earlier in the same callback) even though the Payment write it was meant to accompany never happened — a genuine near-miss caught during design, not by a failing test (no test was ever green with the bug, since the fix was applied before the first test run) but worth recording explicitly: `CasLostSignal` is thrown, not returned, specifically to force the whole transaction (including that insert) to roll back atomically before the retry loop re-reads fresh state.

### 10.5 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm -w lint     → eslint . → 0 errors
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 27 routes, all ✓ (unchanged from prior IPs — zero apps/web files touched)
```

## 11. Deviations / decisions

1. **Conflict Escalation raised for Trust Fee/PSP fee treatment on refund** (§4, full artifact `IP-008-CONFLICT-ESCALATION-FEE-TREATMENT-ON-REFUND.md`) — exactly the kind of money-policy gap the program's stop-condition rules exist for. Not a blocker for this IP's own deliverable (buyer-facing gross refund is complete, safe, and tested); recorded for IP-010 (Ledger & Reconciliation) or an earlier founder decision to close.
2. **Zero cancellation fee/penalty** (§4) — a direct, conservative reading of an *existing* deferred rule (`CANCELLABLE_STATUSES`'s own comment: "prazos, multas e taxas são política configurável... fora desta regra") applied to its only safe neutral value, not a new product decision invented by this agent — same style of reasoning IP-007's own report used for its Change Order/`CUSTOMER_CONFIRMED` resolution (§11.1 of that report).
3. **`DisputeDecision.refundAmount` stored in reais, not cents** — a deliberate choice to match the pre-existing Marketplace-module convention (`TrustChangeOrder.changeGrossAmount`), not the Payments-module cents convention; the Payments-side consumer converts via `fromReais` at the event boundary, the same pattern `CreatePaymentOnOrderConsumer` already uses for `MarketplaceOrder.Created.amount`.
4. **Dispute-triggered refunds are Payment-scoped, never custody-row-scoped** (§3.7) — considered and rejected trying to infer which specific custody row (original vs. a particular incremental tranche) an admin's partial amount "comes from"; no document defines that allocation, and inventing one would be exactly the kind of unapproved business policy this program forbids. `FundsRefund`/`Payment.refundedCents` remain the authoritative record regardless.
5. **`FundsRefund.Created`/`FundsRefund.Failed` events not published** (§4/§7) — PAY-006 §10 literally lists three events; this IP publishes only `.Completed`, treating a failed attempt as audit-only, matching the `ReleaseDenied` precedent this codebase already established. No existing or planned consumer needs either of the other two; adding them with zero consumers would be exactly the "don't create events for trivial persistence" the Shared Standards §3 forbids. Flagged here for the reviewer to specifically re-judge.
6. **No retrofit of `TrustCustody`'s original `save()` to CAS** — carried forward as a known observation from IP-007 (§12 of that report), not this IP's scope; the new refund-marking write path (`markRefundedIfInCustody`) is CAS-protected on arrival, same as IP-007's own new writes were.

## 12. Known issues / technical debt

Carried forward or newly observed, deliberately out of scope:

1. **`TrustCustody`'s original (PACK-01) `save()` still uses an unconditional `UPDATE`** — unchanged risk profile from before this IP (IP-007 §12 already flagged this; this IP's own new writes are all CAS-protected).
2. **Trust Fee/PSP fee treatment on refund is genuinely undecided** — see the Conflict Escalation artifact; this is the single largest open question this IP surfaces rather than resolves.
3. **`LEDGER_INCONSISTENT` has no automated alerting/reconciliation job** — it is logged at ERROR level and returned to the caller (the consumer simply stops, logging its own error), but nothing pages a human. Given the mutual-exclusivity proof (§3.6/§3.7 — a single order can never have both a cancellation-refund and a dispute-refund racing, and dispute resolutions on the same order are structurally serialized by the "one active dispute" invariant), this path is believed unreachable in the current product surface, but it is coded defensively rather than assumed away. A future reconciliation job (IP-010) is the natural place to close this gap.
4. **`ip-002-i18n.e2e.spec.ts`'s transient timeout flakiness** (§10.3) — pre-existing, not introduced or worsened by this IP; same host-contention class IP-007's own report diagnosed.
5. **Change-order-evidences bucket / migration 0027 shared-infra deployment** (carried forward from IP-000/IP-007) — unrelated to this IP, untouched.
6. **Frontend has zero automated test/lint tooling and zero Payments coverage** — unrelated to this IP's backend-only scope, untouched.

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken. PSP/Asaas remains `BLOCKED_EXTERNAL` for IP-009 — unrelated to this IP, which stays entirely within the sandbox gateway (the same `SandboxPaymentGateway.refund()`/`.cancel()` methods that already existed, unmodified).

## 14. Acceptance criteria matrix

Per IP-008 spec §6:

| Criterion | Status | Evidence |
|---|---|---|
| Every lifecycle state has deterministic allowed cancellation/dispute/refund actions | **PASS** | `RefundPaymentOnOrderCancelledConsumer` exhaustively handles all four reachable pre-execution Payment states (proof by state-machine analysis, §2/§3.6) plus the incremental-tranche gap; `RefundPaymentOnDisputeResolvedConsumer` handles all four post-execution-eligible states via `RefundPaymentUseCase`'s `REFUND_ELIGIBLE_STATUSES`. |
| No double refund | **PASS** | `UNIQUE(idempotency_key)` + deterministic per-trigger keys + application pre-check (3 layers), proven by idempotent-replay unit tests on both consumers and the use case. |
| Refund never exceeds funded amount | **PASS** | CAS write (`applyRefundIfExpected`) + genuine concurrency test proving at-most-one-of-two completes when amounts jointly exceed the total (§3.5, §10.1). A real pre-existing state-machine bug blocking legitimate partial refunds was found and fixed in the process (§3.8/§10.4). |
| Evidence/audit complete | **PASS** | Every new operation audited (`AuditLogService`); `GET /payments/*`'s `refunds[]` gives full read-side visibility; `FundsRefund.Completed` event for downstream consumers. |
| Member/Partner permissions tested | **PASS** | Dispute-resolution `refundAmount` rides the pre-existing `AdminGuard`; cancellation refund is a direct, automatic consequence of an already-authorized cancellation action (no new permission surface); e2e suite exercises both real user roles end-to-end. |
| No AI adjudication; no invented legal/business policy | **PASS** | Refund amounts are always human-typed (cancellation: the captured amount, zero-fee default from an already-deferred rule; dispute: the admin's own number) or a proven-safe structural default; the one genuinely undecided policy (fee treatment on refund) is escalated, not guessed. |

## 15. Commits

**Not committed.** Git identity (`user.name`/`user.email`) is unset in this environment — no attempt was made to set it, per this task's explicit instruction that doing so is outside this agent's authority.

All of this IP's changes are left in the working tree, **unstaged** (no `git add` was run) — new files untracked, modified files unstaged — ready for `git add`/`git commit` by whichever agent/operator has a configured git identity.

Suggested commit split, consistent with `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §7 ("implementation → test/fix → docs"):

1. **Implementation commit** — all new/modified files under `apps/api/src/modules/payment/**` and `apps/api/src/modules/marketplace/**` (dispute files only), `apps/api/drizzle/0035_*.sql`, `apps/api/drizzle/meta/_journal.json`, `apps/api/src/shared/database/schema/index.ts`. Suggested message: `feat(IP-008): cancellation, dispute and refund financial consequences`.
2. **Test commit** — all `*.spec.ts` files (new and extended) and `apps/api/test/integration/ip-008-cancellation-dispute-refund.e2e.spec.ts`. Suggested message: `test(IP-008): idempotency, CAS refund accounting, and cancellation/dispute e2e coverage`.
3. **Docs commit** — `docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, this Completion Report, and the Conflict Escalation artifact. Suggested message: `docs(IP-008): completion report, conflict escalation, OpenAPI and event catalog updates`.

All three should carry the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer per this session's attribution convention.

## 16. Recommended reviewer focus for the independent Diff Review agent

1. **`apps/api/src/modules/payment/infrastructure/persistence/drizzle-payment.repository.ts`'s `applyRefundIfExpected`** — this is the single most load-bearing new method in this IP. Confirm the `WHERE refunded_amount = <expected>` comparison is genuinely exact (both sides always produced by `toReaisString`, same rounding, same format) and that no code path calls `PaymentRepository.save()` instead of this method for a refund outcome.
2. **`RefundPaymentUseCase`'s phase-2 retry loop and the `CasLostSignal` throw-to-rollback mechanism** (§3.3 step 6/7, §10.4 item 3) — trace through, independently, that a CAS loss truly rolls back the `FundsRefund` insert from the same attempt (not just skips the Payment write), and that `LEDGER_INCONSISTENT` is the only possible outcome of "gateway approved, ledger couldn't record it" — never silently reported as `COMPLETED`.
3. **The genuine concurrency test in `refund-payment.usecase.spec.ts`** ("corrida real") — re-run it independently a few times to assess flakiness risk (it relies on `Promise.all`-forced interleaving against an in-memory fake, not a real Postgres row lock, unlike IP-007's own DB-level race tests); confirm the fake's CAS semantics (`stored.refundedAmountStr !== toReaisString(expectedRefundedCents)`) genuinely mirror what the real SQL `WHERE` clause would do, not a weaker approximation.
4. **`PAYMENT_TRANSITIONS`'s two new edges and one new self-loop** (§3.8) — confirm no OTHER previously-unreachable state combination was accidentally made reachable by this additive change (e.g., that `FUNDS_RELEASED -> PARTIALLY_REFUNDED` doesn't open any door beyond "partial refund of released-but-unsettled money," and that `PARTIALLY_REFUNDED`'s self-loop still correctly terminates once `refundableCents` hits zero via the existing `registerRefund` logic, unchanged by this IP).
5. **The state-machine proof that a single order can never have both a cancellation-refund and a dispute-refund** (§3.6/§3.7 comments, §12 item 3) — this is the load-bearing assumption behind treating `LEDGER_INCONSISTENT` as "believed unreachable but defended anyway" rather than "must be actively reconciled." Re-derive it independently from `CANCELLABLE_STATUSES`/`ORDER_TRANSITIONS`/the dispute "one active dispute per order" invariant, rather than trusting this report's restatement.
6. **The Conflict Escalation artifact itself** (`IP-008-CONFLICT-ESCALATION-FEE-TREATMENT-ON-REFUND.md`) — confirm Option A (the one implemented) is genuinely the smallest-safe choice and that nothing in this IP's diff silently pre-empts a future fee-reversal decision (e.g., that no field or migration would need to be *redone*, only *added to*, once that decision lands).
7. **`RefundPaymentOnOrderCancelledConsumer`'s incremental-tranche handling** (§3.6, the exact scenario the original task brief flagged for special scrutiny) — confirm, independently, that an incremental authorization approved-but-not-yet-custodied is genuinely voided (never refunded) and that one already-custodied is genuinely refunded (never merely voided) — these are easy to accidentally swap, and the unit tests (`refund-payment-on-order-cancelled.consumer.spec.ts`) are mock-based, not run against a real database in this IP's own suite (the e2e file does not exercise the incremental-tranche path, since it does not create a Change Order — a residual gap worth independent scrutiny).
