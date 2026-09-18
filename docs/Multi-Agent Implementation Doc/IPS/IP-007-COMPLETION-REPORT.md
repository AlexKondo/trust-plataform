# IP-007 — Completion Report

**Incremental Payment Authorization**
Executed 2026-09-15. Owner: Payments implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §4, §5, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-007 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-007_Incremental_Payment_Authorization.md`) > IP-000/IP-001/IP-002's Completion Reports > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `3ec7426` (`main`, matching IP-002's own final state — `git log -1` confirmed identical before any edit).
- **Hard dependency**: IP-000, status APPROVED (per its own Completion Report and Quality Gate). IP-001 and IP-002 are also both APPROVED and already committed to `main` (`4685b1a`, `3ec7426`) — this IP started from a genuinely clean working tree on top of both, not from their uncommitted state (unlike IP-001/IP-002, which ran concurrently on an uncommitted tree; by the time this agent started, both had already landed on `main`).
- **Working tree at start**: `git status --short` showed exactly one pre-existing, unrelated line — `M .claude/settings.local.json` (adds three tool-permission entries: `git add *`, a scoped `git commit` with a specific author identity, `git reset *`). This predates this agent's work, is local tooling configuration (not source code, not part of any IP's diff), and was left untouched — it is not part of this report's diff and is called out here only for transparency per the task's "confirm the working tree is clean" instruction. No other file was modified or untracked at start.
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` lists IP-007's only hard dependency as IP-000, "Parallelizable after deps: yes", release class `BLOCKING-FIN`. Wave 2 groups IP-007 alongside IP-003/013/020/021 "where file ownership is isolated" — this IP touched only `apps/api/src/modules/payment/**` (new files + additive edits) plus two new read-only cross-module files under `apps/api/src/modules/payment/infrastructure/marketplace/**` (the established Payments→Marketplace read-port pattern, see §2/§3) and doc files (`docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`). Zero files under `apps/api/src/modules/marketplace/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` were touched — no collision with any other IP's owned domain.

## 2. Preflight findings

1. Read all 9 required documents in the mandated order, plus IP-000's, IP-001's and IP-002's Completion Reports in full (their §3.5/§9/§14, §12, and general structure/rigor respectively), before writing any code.
2. Hard dependency IP-000: APPROVED — confirmed by reading its Completion Report directly, not assumed.
3. Independently re-verified, in current source (not from prose), the exact gap this IP exists to close:
   - `apps/api/src/modules/payment/domain/entities/payment.ts` — `Payment.amountCents` is set once in `create()` and never mutated by any method (grepped every method of the class: `markAuthorized`/`markInCustody`/`markReleased`/`markSettled`/`registerRefund`/`cancel` all leave `amountCents` untouched; `registerRefund` only ever *decreases* `refundableCents`, never increases `amountCents`).
   - `apps/api/src/modules/payment/domain/entities/trust-custody.ts` — `trustCustodies` table (`payment.schema.ts`) carries `UNIQUE(payment_id)` (`idx_trust_custody_payment`), confirming "one custody row per payment, forever" as a DB-level, not just application-level, invariant that this IP must not violate.
   - `grep -rn "TrustChangeOrder\|changeOrder" apps/api/src/modules/payment` — **zero matches** before this IP, confirming IP-000 §9's finding still holds at this exact baseline.
   - `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts` — `CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES = [SCHEDULED, AWAITING_EXECUTION, IN_PROGRESS, AWAITING_CUSTOMER_CONFIRMATION]` and `ORDER_TRANSITIONS` both confirm, directly in code, that **a Change Order can only be created/submitted/approved strictly *before* the order reaches `CUSTOMER_CONFIRMED`** (that status is not in the eligible list, and the transition graph has no path back into an eligible status from `CUSTOMER_CONFIRMED`). This is the fact that resolved a candidate escalation trigger (§11.1 below) without needing to stop and ask.
   - `apps/api/src/modules/marketplace/application/usecases/manage-change-order.usecase.ts` — `cancel()` has no `outboxService.enqueue` call at all (only audit), and `TrustChangeOrder.expire()` is never invoked by any use case (`EXPIRED` is a **read-time derived** presentation via `effectiveStatus()`/`isExpiredAt()`, never a persisted transition) — confirmed by reading the full file and grepping for `.expire(`. This means, by construction, only `TrustChangeOrder.Approved` is ever published for a decided/withdrawn change order; `Rejected`/`Cancelled`/`Expired` publish either a different event (`Rejected`) or nothing at all (`Cancelled`, `Expired`). The negative test (§5, §10) proves this empirically as well, not just by code reading.
4. Existing capabilities to reuse, confirmed by reading the actual files (not assumed from names):
   - The exact CAS pattern (conditional `UPDATE ... WHERE <expected-state> RETURNING`) already exists in `drizzle-trust-change-order.repository.ts` (`saveWithExpectedStatus`, PACK-03) and was generalized by IP-001 into `drizzle-service-execution.repository.ts` (`closePauseIfOpen`). Reused verbatim in shape for the two new CAS methods this IP adds (§3.5).
   - The exact one-way, read-only cross-module query pattern (Payments → Marketplace) already exists: `OrderDisputeQuery` (abstract port in `payment/domain/services/`) + `MarketplaceOrderDisputeQuery` (adapter in `payment/infrastructure/marketplace/`, injecting a Marketplace repository directly). Reused verbatim in shape for the new `ChangeOrderCommercialQuery` port (§3.2) — confirmed `MarketplaceModule` already exports `TrustChangeOrderRepository` and `PaymentModule` already imports `MarketplaceModule`, so no new module wiring direction was introduced.
   - The exact idempotency-then-gateway-then-transaction shape of `AuthorizePaymentUseCase` (defense 1: idempotency-key lookup before touching the gateway; gateway call *outside* any transaction; persistence *inside* one transaction afterward) — reused for `CreateIncrementalAuthorizationUseCase` (§3.3).
   - The exact two-phase release shape of `ReleaseFundsUseCase.prepare`/`finalize` — reused, not reinvented, for incremental tranches (§3.6).
   - `SandboxPaymentGateway.authorize()`/`.release()` — reused as-is, with zero interface change. The mandate's "reuse the sandbox port's shape rather than inventing a different sandbox contract" was satisfied by construction: the incremental authorization flow calls the exact same `PaymentGateway.authorize()` method with the delta's own `amountCents`, and the exact same `PaymentGateway.release()` for each tranche's release, with no new gateway method, no new request/response shape, and no code change to `sandbox-payment.gateway.ts` at all.
5. Exact gaps to implement — enumerated in §3 below.
6. Owned files / collision hotspots: all of `apps/api/src/modules/payment/**` (this IP's exclusive domain per the Manifest — Payments is IP-007's primary owner). Two files read (never write) a Marketplace repository (`infrastructure/marketplace/change-order-commercial.query.ts`), exactly mirroring the pre-existing `MarketplaceOrderDisputeQuery` precedent — this is not "modifying Marketplace's owned files," it is Payments' own infrastructure layer, in Payments' own directory, reading Marketplace's already-exported repository, the identical pattern PACK-01 itself established and that no other active IP claims. `docs/openapi.yaml`/`docs/event-catalog.md`/`CLAUDE.md` are shared documentation files (Manifest §5 collision hotspot) — edited only in the sections that describe this IP's own new/changed contracts (`/payments/*` paths, the new event types, and a new dedicated CLAUDE.md section after IP-002's), never touching PACK-01..03/IP-001/IP-002's own sections except where a **one-line cross-reference note** was added to the pre-existing Service Summary description to prevent a reviewer from thinking that endpoint was silently changed (see §7).
7. Baseline tests run before implementation: `pnpm typecheck` (0 errors) and `pnpm lint` (0 errors) — matched IP-002's own reported clean starting point exactly. The full `pnpm test:e2e` baseline was not re-run a fourth time before starting (IP-000/001/002 all already independently reproduced a clean, green baseline on this exact lineage within the same day); instead this agent's own post-implementation full run (§10.3) is the authoritative before/after comparison, and it is a superset (65 pre-existing files + 1 new file) run against the *same* migrated schema, so any baseline regression would surface there.
8. No conflict found requiring escalation before implementation — see §11.1 for the one candidate trigger this preflight resolved in-repo rather than escalating, and why that resolution is safe (not a guess).

## 3. Implemented

### 3.1 Design decision: two new tables, not two new rows in existing PACK-01 tables

Per the mandate's item 2, the two concrete alternatives were: (a) extend `TrustCustody`/`trust_custodies` to hold "tranches", or (b) a new `TrustCustody`-shaped table per incremental authorization. **Chose (b)**, for a reason that is not stylistic but a hard DB constraint: `trust_custodies` carries `UNIQUE(payment_id)` (`idx_trust_custody_payment`, migration 0025) — the PACK-01 §6.2 invariant "a Payment has at most one custody, ever." Reusing that table for a second (incremental) row per payment would require either dropping/altering that unique index (a destructive change to a PACK-01 closed-baseline invariant, explicitly forbidden by the Manifest's stop conditions) or reinterpreting what the index means (silently weakening a documented financial guarantee). Two new tables were added instead:

- `payment_incremental_authorizations` — mirrors `payment_authorizations`' shape (provider id, idempotency key, provider transaction id, amount, status, sanitized gateway response), but is **1:1 with a Change Order** (`UNIQUE(change_order_id)`) rather than an append-only attempt log. This is a deliberate, explained divergence from `PaymentAuthorization`'s own "one new row per attempt" design (§3.3, second paragraph) — not an oversight.
- `incremental_trust_custodies` — mirrors `trust_custodies`' shape and state machine (`IN_CUSTODY -> READY_FOR_RELEASE -> RELEASED`, reusing the exact `CUSTODY_STATUS`/`CUSTODY_TRANSITIONS` constants exported by `trust-custody.ts` — one source of vocabulary, not a parallel enum), with `UNIQUE(change_order_id)` and `UNIQUE(incremental_authorization_id)` playing the same "at most one, ever" role that `UNIQUE(payment_id)` plays for the original.

Both tables carry `payment_id`/`order_id` (denormalized from the authorization/change-order chain) so that "all tranches for this order/payment" is a single indexed query (`idx_incremental_trust_custody_order`, `idx_incremental_trust_custody_payment`), not a join through multiple tables — this is what makes the release flow (§3.6) and the custody summary (§3.7) tractable.

New files: `apps/api/src/modules/payment/domain/entities/payment-incremental-authorization.ts`, `apps/api/src/modules/payment/domain/entities/incremental-trust-custody.ts` (+ their `.spec.ts`).

### 3.2 New cross-module read port: `ChangeOrderCommercialQuery`

`apps/api/src/modules/payment/domain/services/change-order-commercial.query.ts` (port) + `apps/api/src/modules/payment/infrastructure/marketplace/change-order-commercial.query.ts` (adapter, `MarketplaceChangeOrderCommercialQuery`, injecting `TrustChangeOrderRepository`). Two methods:
- `findApprovedById(changeOrderId)` — re-fetches the change order from its own repository and returns `null` unless it is genuinely `APPROVED`, with the **frozen** `changeGrossAmount` converted to cents. The incremental-authorization use case never trusts the triggering event's payload for the amount that becomes money — same discipline `HoldFundsUseCase` already applies by re-fetching `Payment` instead of trusting `Payment.Authorized`'s payload amount.
- `sumApprovedGrossCentsByOrder(orderId)` — sums `changeGrossAmount` across every `APPROVED` change order for an order, used only by the custody summary (§3.7), not by the authorization flow itself (which resolves one specific change order, not a sum).

This is the one and only new dependency in the Payments → Marketplace direction — the direction PACK-01 already established (`OrderDisputeQuery`) and documented as the only direction allowed ("o Marketplace continua sem conhecer Payments"). Verified: `grep -rn "from '.*payment" apps/api/src/modules/marketplace/` still returns zero matches after this IP — Marketplace has zero awareness that Payments exists, before and after.

### 3.3 `CreateIncrementalAuthorizationUseCase` + its consumer

`apps/api/src/modules/payment/application/usecases/create-incremental-authorization.usecase.ts` + `apps/api/src/modules/payment/infrastructure/consumers/create-incremental-authorization.consumer.ts` (`CreateIncrementalAuthorizationOnChangeOrderApprovedConsumer`, `eventType: 'TrustChangeOrder.Approved'`, `managesOwnTransaction = true` — same reason as `FinalizeReleaseConsumer`: it calls an external gateway, so it cannot hold the relay's transaction open).

Flow: idempotent replay check (`findByChangeOrderId`) → re-fetch the approved change order via the new port → re-fetch `Payment` by `orderId` → **new eligibility guard** (see below) → call `PaymentGateway.authorize()` with the change order's frozen `changeGrossAmountCents` → persist the authorization (`UNIQUE(change_order_id)` + `UNIQUE(idempotency_key)`, `.onConflictDoNothing()` with **no target**, see the bug found and fixed in §10.4) → publish `PaymentIncrementalAuthorization.Approved`/`.Failed` → **only if approved**, in the same transaction, create the `IncrementalTrustCustody` row, publish `TrustCustody.Created`/`Funds.Held` (reused event types, new `aggregateType`), and audit `HoldIncrementalFunds`.

**Deliberate divergence from the PAY-002/PAY-003 event split**: the original flow splits "authorize" (user-triggered, `AuthorizePaymentUseCase`) from "hold" (`Payment.Authorized` → `HoldFundsOnAuthorizedConsumer`) into two events/consumers because there is a real user action (the buyer clicking "pay") between them. Here, the entire flow is automatic — `TrustChangeOrder.Approved` is the only trigger, there is no intermediate user action — so authorizing and custodying happen in the same use case, same transaction, avoiding an extra outbox round-trip and a window where an approved-but-not-yet-held authorization could be observed. This is recorded as a deliberate architectural choice, not an oversight of the "canonical" PAY-002/003 shape.

**New eligibility guard (a deviation beyond the spec's literal ask, justified in §11.2)**: `PAYMENT_ELIGIBLE_FOR_INCREMENTAL_AUTHORIZATION = [AUTHORIZED, FUNDS_IN_CUSTODY, FUNDS_RELEASED, SETTLED]`. Discovered during implementation that the current MVP does **not** actually require a Payment to be authorized before an order can be scheduled/started (PACK-03's own `hourlyContractInProgress()` test helper never authorizes payment at all) — meaning a Change Order could, in the current baseline, be approved on an order whose Payment is still `CREATED` (nobody has paid anything yet) or has failed/been cancelled/refunded. Authorizing an *incremental* charge in that situation would be financially nonsensical (there is no successfully-used payment method to add to). The guard makes this `SKIPPED { reason: 'PAYMENT_NOT_ELIGIBLE' }` instead of silently calling the gateway — a conservative safety net directly in the spirit of "no fake PSP reauthorization is invented here," not a new product decision (it changes no money amount, just refuses to act on an obviously-wrong precondition).

**Idempotency, defense in depth (Shared Standards §5/§11)**: (1) deterministic key `incrementalAuthorizationIdempotencyKey(changeOrderId) = `incremental-auth:${changeOrderId}``; (2) application-level `findByChangeOrderId` pre-check; (3) `UNIQUE(change_order_id)` **and** `UNIQUE(idempotency_key)` at the DB level (belt-and-suspenders, matching `payment_authorizations`' own precedent of a unique idempotency key) — see §10.4 for the real bug this combination caused and how it was fixed.

### 3.4 `PaymentGateway` — reused with zero interface change

Confirmed directly, not assumed: `sandbox-payment.gateway.ts` was **not modified** (`git diff` shows it in neither the modified nor untracked list). The incremental authorization calls `gateway.authorize({ paymentId, amountCents: <delta>, currency, paymentMethodToken: null, idempotencyKey, correlationId })` — the exact same method signature `AuthorizePaymentUseCase` already uses for the original amount. The deterministic decline/error convention (`.13`/`.99` cents) applies unchanged and was used directly to exercise the DECLINED path in tests (§5), with no gateway code change required. This resolves the "reuse the port's shape rather than inventing a different sandbox contract" mandate literally, not just in spirit.

### 3.5 CAS repositories for the new tables

`DrizzleIncrementalTrustCustodyRepository` adds two methods with no read-then-write in between, following IP-001's `closePauseIfOpen` precedent exactly:
- `markReadyForReleaseIfInCustody(id, now, tx)` — `UPDATE incremental_trust_custodies SET status='READY_FOR_RELEASE' WHERE id=? AND status='IN_CUSTODY' RETURNING id`.
- `markReleasedIfReady(id, releasedAt, tx)` — `UPDATE ... SET status='RELEASED', released_at=? WHERE id=? AND status='READY_FOR_RELEASE' RETURNING id`.

Both return `boolean` (row updated or not), and the calling code (§3.6) never proceeds to publish an event/audit entry unless the CAS write actually won. This is strictly stronger than what the *original* `TrustCustody`'s own `save()` does today (an unconditional `UPDATE ... WHERE id=?`, with no expected-state guard) — a deliberate choice for the new code, not a retrofit of PACK-01's own file (which is out of this IP's scope; see §4).

### 3.6 `ReleaseFundsUseCase` extended to release ALL tranches

- `prepare(input, tx)`: unchanged in every existing branch's core logic (same queries, same `evaluateRelease` call, same audit/event calls, same early returns) — **the diff is additive only**: a new private `prepareIncrementalTranches(input, tx)` is called once at the top, and its result (`undefined` when the order has zero incremental tranches — the overwhelming majority of orders) is spread into every one of the five existing return statements as an optional `incremental` field. Every existing unit test for this method still asserts `toEqual` against the *exact same* object shape it did before this IP (§10.1) — verified by running them, not by inspection.
  - `prepareIncrementalTranches` iterates every non-released, non-ready tranche for the order independently, evaluates each with the new `evaluateIncrementalRelease` policy function (§3.6.1), and — only on `allowed: true` — performs the CAS write, publishes `Funds.ReadyForRelease` (reused type, `aggregateType: 'IncrementalTrustCustody'`), and audits `PrepareIncrementalRelease`. A denied tranche is recorded in the summary with its own reasons and audited as `ReleaseIncrementalDenied`; it never blocks another tranche (each is independent).
- `finalize(custodyId, correlationId)`: the existing body was extracted verbatim into a new private `finalizeOriginal(custody, correlationId)` (same statements, same order, same audit/event payloads — a pure extraction, confirmed by diff). The public `finalize()` now tries `custodyRepository.findById` first (unchanged behavior/cost for every existing original-tranche call site) and, only if that misses, tries `incrementalCustodyRepository.findById` and dispatches to the new `finalizeIncremental(tranche, correlationId)`.
  - `finalizeIncremental` mirrors the two-phase discipline exactly (gateway call *outside* any transaction; `RELEASED` only ever persisted after `outcome === 'APPROVED'`) but writes via the CAS method from §3.5 instead of an unconditional `save()`, inside a single transaction that also enqueues `Funds.Released` (reused type) and the `ReleaseIncrementalFunds` audit entry — all three (CAS write, event, audit) succeed or fail together. **It never calls `payment.transitionTo(FUNDS_RELEASED)`** — that transition already happened (or will happen) exactly once, driven by the *original* tranche's own `finalizeOriginal`; `PAYMENT_TRANSITIONS` has no `FUNDS_RELEASED -> FUNDS_RELEASED` entry, so a second call would throw. This is a deliberate, documented simplification (§11.3): `Payment.status` continues to describe only the original amount's lifecycle, exactly as before this IP; "is everything released" is answered by the custody summary (§3.7), not by `Payment.status`.

#### 3.6.1 New policy function: `evaluateIncrementalRelease`

Added to the existing `trust-release-policy.service.ts` (additive function, zero change to the existing `evaluateRelease`/`snapshotMatches` — confirmed by diff and by the untouched PACK-01 release-policy unit tests still passing, §10.1). A genuinely new function was needed, not a parameterized reuse of `evaluateRelease`, because `snapshotMatches` hard-requires `custody.amountCents === payment.amountCents` — true by construction for the original custody (it *is* the Payment's amount) but false *by design* for every incremental tranche (it is only ever the Change Order's delta, almost always smaller than the whole Payment). Reusing `evaluateRelease` unchanged would make every incremental tranche fail with `SNAPSHOT_MISMATCH` unconditionally. `evaluateIncrementalRelease` replaces the value-equality check with a *belonging* check (same `paymentId`/`buyerId`/`sellerId`/`currency`, positive amount) and additionally tolerates `Payment.status === FUNDS_RELEASED` (not just `FUNDS_IN_CUSTODY`) — because by the time a tranche is evaluated, the original tranche processed in the very same `prepare()` call may have already been marked ready, and a later `prepare()` retry could see the Payment already `FUNDS_RELEASED` from a completed `finalizeOriginal`; that must not spuriously deny an otherwise-healthy incremental tranche.

### 3.7 Custody-mismatch summary — the queryable/computable requirement

`apps/api/src/modules/payment/domain/services/payment-custody-summary.service.ts` (pure function, `calculatePaymentCustodySummary`) computes, from data the caller fetches:
- `totalCommerciallyAuthorizedCents` = `payment.amountCents` + Σ `changeGrossAmount` of every **approved** Change Order for the order (via `ChangeOrderCommercialQuery.sumApprovedGrossCentsByOrder`).
- `totalHeldCents` = original custody's amount (if any custody row exists) + Σ every incremental tranche's amount (regardless of the tranche's current status — a `RELEASED` tranche was still, factually, captured into custody at some point; it just isn't with the platform anymore).
- `amountAuthorizedNotInCustodyCents` = the difference, floored at 0.
- `incrementalTranches[]` — one entry per incremental authorization attempt (approved or not), with its own `authorizationStatus` and `custodyStatus` (`null` when the gateway declined/errored and no custody row was ever created) — this is what makes a *declined* Change Order's gap visible per-tranche, not just as one aggregate number.

Wired into `GetPaymentUseCase.get()` (used by both `GET /payments/:id` and `GET /payments/by-order/:orderId`) as an **additive, optional** `custodySummary` field — only computed (4 extra queries) when at least one incremental authorization exists for the payment, so the overwhelming majority of payments (no Change Order ever approved) pay zero extra query cost and get a response byte-identical to before this IP.

**Deliberate scope boundary**: the Marketplace `Service Summary` endpoint (`GET /marketplace/orders/{orderId}/service-summary`, PACK-03, `authorized-commercial.service.ts`) was **not modified**. It continues to compute `amountInCustody`/`amountAuthorizedNotInCustody` as a purely commercial calculation with no knowledge of the Payment module's actual custody state (as it always has). Wiring it to reflect real per-tranche capture state would require introducing a Marketplace → Payments read dependency — the *reverse* of the one-way direction PACK-01 established and that this IP's own new port (§3.2) deliberately preserves. That is a materially bigger architectural change than this IP's acceptance criteria require ("custody mismatch is explicit" is satisfied by the new `custodySummary` field, which is the actually-accurate source), so it was left alone and the openapi.yaml description for that endpoint now says so explicitly (§7), rather than silently leaving a stale-looking discrepancy for a future reader to puzzle over.

### 3.8 Migration

`apps/api/drizzle/0029_ip007_incremental_payment_authorization.sql` (172 lines) — additive only, same style as 0025/0026/0027/0028 (`CREATE TABLE IF NOT EXISTS`, guarded `DO $$ ... IF NOT EXISTS ... END $$` FK blocks, conditional unique/plain indexes, no `DROP`, no destructive `ALTER`, no `tenant_id`). Two tables (§3.1). Journal updated (`apps/api/drizzle/meta/_journal.json`, idx 29, tag `0029_ip007_incremental_payment_authorization`) — checked the highest existing index first (28, IP-002's) per the task's explicit instruction.

## 4. Not implemented / out of scope

Per the IP-007 spec's explicit Out of Scope (§4) and this program's non-negotiable constraints:
- **No real Asaas/PSP call anywhere** — the incremental authorization flow calls the same sandbox gateway the original authorization already used; zero new external integration code.
- **No fake PSP "reauthorization" trickery** — a declined/errored incremental authorization is recorded as a terminal fact (no automatic retry loop invented); a future retry mechanism, if ever needed, is out of this IP's scope.
- **No mutation of the original `Payment.amountCents` or its status machine** — confirmed by diff: `payment.ts`/`payment-types.ts` are untouched. The only Payment-adjacent state change from this IP is reading `Payment` (never writing it) inside `CreateIncrementalAuthorizationUseCase` and `evaluateIncrementalRelease`.
- **No settlement/refund implementation** — `Payment.registerRefund()` still has zero callers (confirmed unchanged); IP-008's scope.
- **No retrofit of `TrustCustody`'s own `save()` to use CAS** — that is PACK-01 closed-baseline code, not named in this IP's scope; the new CAS discipline applies only to the new tables this IP owns (§3.5). Recorded as a known-issue-adjacent observation in §12, not silently fixed.
- **No change to the Marketplace `Service Summary` endpoint or `authorized-commercial.service.ts`** — see §3.7's explicit scope-boundary reasoning.
- **No frontend work** — IP-000 §3.7 confirmed PACK-01/02/03 have zero `apps/web` coverage; this IP is backend-only, consistent with that baseline and with no `apps/web` file being named anywhere in the mandate.
- **No new HTTP route** — the mandate explicitly said a new route was not mandated; the existing `GET /payments/by-order/:orderId` and `GET /payments/:id` were extended additively instead (§3.7).
- **No automatic retry/reconciliation job for a Change Order approved before its incremental authorization consumer has run** by the time `MarketplaceOrder.CustomerConfirmed` fires — see §11.4 for the full reasoning on why this residual eventual-consistency window is accepted, not solved, in this IP.

## 5. Files changed

**New files (19)**:
```
apps/api/drizzle/0029_ip007_incremental_payment_authorization.sql                                172
apps/api/src/modules/payment/domain/entities/payment-incremental-authorization.ts                179
apps/api/src/modules/payment/domain/entities/payment-incremental-authorization.spec.ts            88
apps/api/src/modules/payment/domain/entities/incremental-trust-custody.ts                        176
apps/api/src/modules/payment/domain/entities/incremental-trust-custody.spec.ts                    59
apps/api/src/modules/payment/domain/repositories/payment-incremental-authorization.repository.ts  26
apps/api/src/modules/payment/domain/repositories/incremental-trust-custody.repository.ts          44
apps/api/src/modules/payment/domain/services/change-order-commercial.query.ts                     39
apps/api/src/modules/payment/domain/services/payment-custody-summary.service.ts                   98
apps/api/src/modules/payment/domain/services/payment-custody-summary.service.spec.ts             162
apps/api/src/modules/payment/domain/services/trust-release-policy.incremental.spec.ts            113
apps/api/src/modules/payment/application/usecases/create-incremental-authorization.usecase.ts    375
apps/api/src/modules/payment/application/usecases/create-incremental-authorization.usecase.spec.ts 236
apps/api/src/modules/payment/infrastructure/consumers/create-incremental-authorization.consumer.ts 46
apps/api/src/modules/payment/infrastructure/marketplace/change-order-commercial.query.ts          41
apps/api/src/modules/payment/infrastructure/persistence/payment-incremental.schema.ts             121
apps/api/src/modules/payment/infrastructure/persistence/drizzle-payment-incremental-authorization.repository.ts 119
apps/api/src/modules/payment/infrastructure/persistence/drizzle-incremental-trust-custody.repository.ts 152
apps/api/test/integration/ip-007-incremental-payment-authorization.e2e.spec.ts                   534
```
19 new files, 2,780 lines total (`wc -l` sum), including the e2e spec.

**Modified files** (`git diff --stat`, excluding the incidental `apps/web/tsconfig.tsbuildinfo` build-cache regeneration, reverted per §11.5, and excluding the pre-existing unrelated `.claude/settings.local.json` line, §1):
```
 apps/api/drizzle/meta/_journal.json                                          |   7 +
 apps/api/src/modules/payment/application/dto/payment.dtos.ts                 |  28 ++
 apps/api/src/modules/payment/application/mapper/payment.mapper.ts            |  25 +-
 apps/api/src/modules/payment/application/usecases/custody-release.usecase.spec.ts | 22 ++
 apps/api/src/modules/payment/application/usecases/get-payment.usecase.ts     |  41 ++-
 apps/api/src/modules/payment/application/usecases/release-funds.usecase.ts   | 377 ++++++++++++++++++++-
 apps/api/src/modules/payment/domain/services/trust-release-policy.service.ts |  73 ++++
 apps/api/src/modules/payment/payment.module.ts                               |  22 ++
 apps/api/src/shared/database/schema/index.ts                                 |   1 +
 docs/event-catalog.md                                                        |  19 +-
 docs/openapi.yaml                                                            |  45 ++-
 CLAUDE.md                                                                    (+24, new section)
 11 files changed (+ CLAUDE.md), 639 insertions(+), 21 deletions(-) in the 11 measured files
```
Zero files under `apps/web/**`, `apps/api/src/modules/marketplace/**`, `apps/api/src/modules/identity/**`, or any other module were touched.

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0029_ip007_incremental_payment_authorization.sql` (§3.8). Additive only. Not applied to any shared/prod environment — exercised only against the disposable embedded Postgres (`pnpm test:e2e`) and the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.
- **Journal**: `apps/api/drizzle/meta/_journal.json` — new entry, idx 29, tag `0029_ip007_incremental_payment_authorization`, following the exact same shape as entries 25–28.
- No `.env`/config schema changes — no new runtime configuration surface was needed (the sandbox gateway is reused unchanged; there is no provider selection to configure).

## 7. APIs / events / jobs

- **No new HTTP route.** Two existing routes gained an **additive, optional** response field:
  - `GET /payments/by-order/{orderId}` and `GET /payments/{paymentId}` — `custodySummary` (§3.7), present only when the payment has at least one incremental authorization. Documented in `docs/openapi.yaml` with a full example.
  - `GET /marketplace/orders/{orderId}/service-summary` — **no field change**, but its `docs/openapi.yaml` description gained one clarifying paragraph pointing at the new `custodySummary` as the accurate source for actual custody state (§3.7) — this is a documentation-only edit, zero code/contract change to that endpoint.
- **Two new event types**: `PaymentIncrementalAuthorization.Approved` (v1.0), `PaymentIncrementalAuthorization.Failed` (v1.0) — new aggregate, documented in `docs/event-catalog.md` with payload shape, trigger, idempotency guarantee, and an explicit note on why `Rejected`/`Cancelled`/`Expired` never trigger this path.
- **Reused event types, new aggregate**: `TrustCustody.Created`, `Funds.Held`, `Funds.ReadyForRelease`, `Funds.Released` are now also published with `aggregateType: 'IncrementalTrustCustody'` (instead of `'TrustCustody'`) for incremental tranches. Confirmed safe to reuse: `grep` across `apps/api/src/modules/notification/domain/notification-rules.ts` shows zero rules subscribed to any of these four event types, so no existing consumer's cardinality assumption is at risk. Documented explicitly in `docs/event-catalog.md` for all four.
- **One new consumer**: `pay.create-incremental-authorization-on-change-order-approved`, subscribed to `TrustChangeOrder.Approved`, `managesOwnTransaction = true` (§3.3). No existing consumer's registration, `consumerName`, or dedupe semantics changed.
- **No new job** beyond the existing pg-boss/outbox-relay mechanism already used by every other consumer in this module.

## 8. Security / authorization / privacy

- No new authentication/authorization surface was introduced by this IP — the entire flow is internal/event-driven (no new controller route, no new user-triggerable action). The only user-facing change is the additive `custodySummary` read field on two *already-authorized* routes (`payment.assertParticipant(identityId)` still gates both, unchanged).
- `PaymentIncrementalAuthorization`'s `gatewayResponse` is sanitized through the exact same `sanitize()` function `PaymentAuthorization` already uses (imported, not duplicated) — confirmed by a dedicated unit test (§10.1) that a `cvv` key never survives into the persisted `gatewayResponse`.
- Audit: every new state transition is audited via the existing `AuditLogService.record()` — `CreateIncrementalPaymentAuthorization`, `HoldIncrementalFunds`, `PrepareIncrementalRelease`, `ReleaseIncrementalDenied`, `ReleaseIncrementalFunds` (success and failure variants) — matching the granularity and metadata shape of the equivalent PACK-01 operations (`AuthorizePayment`, `HoldFunds`, `PrepareRelease`, `ReleaseDenied`, `ReleaseFunds`).
- No new PII/sensitive data introduced. No LGPD-relevant surface touched.

## 9. Data / financial invariants

- **No floating-point money anywhere in the new code** — every new entity/service works exclusively in `Cents` (integer), converting to/from reais only at the DTO/DB boundary via the existing `fromReais`/`toReais`/`toReaisString` helpers, exactly like `Payment`/`TrustCustody`/`TrustChangeOrder` already do. Verified: `assertCents` is invoked by `IncrementalTrustCustody.create()`; a dedicated unit test proves a non-integer `amountCents` throws.
- **The incremental amount is always the frozen `changeGrossAmount`, never re-entered** — `CreateIncrementalAuthorizationUseCase` takes the amount exclusively from `ChangeOrderCommercialQuery.findApprovedById()`'s cents-converted `changeGrossAmountCents`, never from the triggering event's payload and never from any request body (there is no request body — this flow has no HTTP entry point). A dedicated unit test (`create-incremental-authorization.usecase.spec.ts`, "usa SEMPRE o valor congelado") asserts the exact cents value reaches both the gateway call and the persisted authorization/custody rows.
- **Original `Payment.amountCents` is provably unchanged** — `payment.ts` has zero diff; every new code path only *reads* `Payment` (never calls any of its mutating methods except the pre-existing `transitionTo` inside the *unchanged* `finalizeOriginal`).
- **Idempotency on every financial mutation this IP adds**: incremental authorization (`UNIQUE(change_order_id)` + deterministic idempotency key), incremental custody creation (`UNIQUE(change_order_id)`/`UNIQUE(incremental_authorization_id)`), incremental release phase 1 and phase 2 (CAS `UPDATE ... WHERE <expected> RETURNING`, §3.5). Every one of these four is exercised by a genuine concurrency test, not just a sequential idempotency test (§10.1, §10.3).
- **Release cannot over-release**: proven three ways — (a) each tranche has its own row and its own terminal `RELEASED` state, so there is structurally nothing to "double count"; (b) the CAS write means only one of two concurrent `finalize()` calls for the *same* tranche ever proceeds to enqueue `Funds.Released`/audit (proven by a real two-way `Promise.all` race in the e2e suite, §10.3); (c) `Payment.status` is only ever driven by the original tranche, so a second `FUNDS_RELEASED` transition is structurally impossible (`PAYMENT_TRANSITIONS` has no such edge) rather than merely avoided by convention.
- **Custody mismatch is genuinely queryable, not reverse-engineered**: `calculatePaymentCustodySummary` is a pure, independently unit-tested function (4 tests covering: no Change Order at all; an approved-and-captured tranche closing the gap to zero; the exact PACK-03 §9.1 gap scenario — commercially approved but gateway-declined, gap stays open and visible; no original custody yet). Wired to a real HTTP response and exercised end-to-end in the e2e suite (§10.3).
- Existing PACK-00..03 invariants (immutable original Payment amount, frozen Trust Fee rate, two-phase release, MATERIAL_COST/MARKUP separation, Customer/Member confirmation as release trigger) are all regression-tested green by the full suite (§10.3) — none of the files that encode those invariants were touched by this IP.

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `3ec7426`, in this environment (`pnpm` directly usable here — no `corepack`/`npx` workaround was needed, unlike IP-000/001/002's environment). No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`embedded-postgres`, `pnpm test:e2e`) or the ephemeral `TEST_DATABASE_URL` used by `pnpm test`.

### 10.1 New tests written (this IP): 37 total — 31 unit tests across 5 new spec files + 6 e2e tests in 1 new spec file (§10.2/§10.3 have the exact before/after file and test counts)

- `payment-incremental-authorization.spec.ts` — 6 unit tests (frozen-amount-not-gateway-amount on approve and on decline, ERROR path, gateway-response sanitization, `authorizedAt` only on approval, `restore()` round-trip).
- `incremental-trust-custody.spec.ts` — 6 unit tests (create defaults, two-phase transition, no-skip-a-phase, terminal state, non-integer cents rejected, `restore()` round-trip).
- `trust-release-policy.incremental.spec.ts` — 7 unit tests (allow; deny-not-in-custody; deny-dispute; deny-order-mismatch; deny-wrong-payment/belonging-not-equality; **allow even when Payment already `FUNDS_RELEASED`**; accumulates all reasons).
- `payment-custody-summary.service.spec.ts` — 4 unit tests (no change orders; approved-and-captured closes the gap; **the exact PACK-03 §9.1 scenario**, approved-but-declined leaves the gap open and visible per-tranche; no original custody yet).
- `create-incremental-authorization.usecase.spec.ts` — 8 unit tests (approve-and-custody with frozen amount; idempotent replay never re-calls the gateway; change-order-not-approved skip; payment-not-found skip; payment-not-eligible skip; declined outcome creates no custody/no custody event; **concurrent-create race → SKIPPED, zero duplicate event/custody**; all three eligible Payment statuses accepted).
- `custody-release.usecase.spec.ts` (existing file) — 21 pre-existing tests all still pass unchanged (constructor signature updated with a no-op `IncrementalTrustCustodyRepository` mock, §3.6); no new test added here (the new incremental-release behavior is covered by the new e2e race test instead, since it is inherently a multi-tranche/DB-level concern).
- `ip-007-incremental-payment-authorization.e2e.spec.ts` — 6 e2e tests (§10.3).

### 10.2 Unit/domain suite (`pnpm test`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Run from `apps/api`:
```
Test Files  48 passed | 23 skipped (71)
     Tests  408 passed | 99 skipped (507)
Duration    71.55s
```
Before this IP (IP-002's own reported final state): 43 passed / 22 skipped (65 files), 377 passed / 93 skipped (470 tests). Delta: **+5 files / +31 tests** in the always-run unit suite (exactly the 5 new unit spec files above, 6+6+7+4+8=31), **+1 file / +6 tests** in the skipped-without-DB e2e count (the new `ip-007-*.e2e.spec.ts`, 6 test cases). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Full e2e suite (`pnpm test:e2e --no-file-parallelism`, embedded disposable Postgres)

First, the new file in isolation, twice (once mid-development to catch the real bug in §10.4, once after the fix, both shown for honesty about the process):
```
(before the onConflictDoNothing fix)
Test Files  1 failed (1)
     Tests  1 failed | 5 passed (6)
 × corrida: duas entregas concorrentes do MESMO TrustChangeOrder.Approved autorizam o delta só uma vez
   → PostgresError: duplicate key value violates unique constraint "idx_payment_incremental_authorization_idempotency"

(after the fix)
Test Files  1 passed (1)
     Tests  6 passed (6)
Duration    53.64s
```

Full suite, all 71 files (65 pre-existing + this IP's 6 new ones — 5 unit spec files + 1 e2e spec file, §10.1 — run with the DB present so every previously-skipped e2e test body actually executes — hence 507, not 470, matching §10.2's total exactly):
```
Test Files  68 passed | 3 failed (71)
     Tests  502 passed | 5 failed (507)
Duration    783.84s (13.1 min)
```
The 5 failures were **all** `Error: Test timed out in 60000ms` (or, for one, `waitForScore`'s own timeout wrapper) in **`ntf-001.e2e.spec.ts`** (3 tests), **`ip-002-i18n.e2e.spec.ts`** (1 test) and **`mrk-023-025.e2e.spec.ts`** (1 test) — **zero failures in any Payment-module file, and zero in this IP's own `ip-007-incremental-payment-authorization.e2e.spec.ts`**, which is in the 68-passed set with all 6 of its tests green. The embedded Postgres's own log for this run shows the same class of transient host contention IP-002's Completion Report §10.3/§10.5 already documented and diagnosed on this exact machine: a single WAL checkpoint took **244.587s** to write (`checkpoint complete: wrote 2256 buffers ... write=244.587 s`), more than four times the 60s test timeout, entirely capable of starving unrelated concurrent requests without any application-level bug.

Per IP-002's own recommended-reviewer-focus precedent ("re-run before concluding anything is broken"), the exact 3 failed files were re-run together, immediately afterward, alongside this IP's own e2e file for good measure:
```
Test Files  4 passed (4)
     Tests  20 passed (20)
Duration    154.11s
```
All 20 tests green on the first retry, no code change in between — confirming the 5 failures were transient host I/O contention, not a regression introduced by this IP. Combined evidence: **71/71 files, 507/507 tests, 0 failures**, across the full run plus the immediate, clean re-run of every test that failed the first time.

### 10.4 Real bug found and fixed during e2e verification: `onConflictDoNothing` target mismatch

Recorded in full, per this program's standard of disclosing what was actually found, not just what was intended (mirroring IP-002 §10.5's own precedent).

**Symptom**: the new "corrida: duas entregas concorrentes..." e2e test failed with a raw, uncaught `PostgresError: duplicate key value violates unique constraint "idx_payment_incremental_authorization_idempotency"` propagating out of `CreateIncrementalAuthorizationUseCase.execute()` — not a clean `SKIPPED`/`ALREADY_PROCESSED` outcome.

**Root cause**: `payment_incremental_authorizations` has **two** independent unique constraints (`change_order_id` and `idempotency_key`) — by design, since `idempotency_key` mirrors `payment_authorizations`' own precedent. `idempotency_key` is deterministically derived from `change_order_id` (`incremental-auth:{changeOrderId}`), so the two constraints always collide together in a race. The repository's `create()` used `.onConflictDoNothing({ target: paymentIncrementalAuthorizations.changeOrderId })` — Postgres's `ON CONFLICT (column) DO NOTHING` only suppresses a conflict on the *named* constraint; when both callers in the race reached the INSERT, Postgres correctly diagnosed a conflict on the *other* unique index (`idempotency_key`, not the named `change_order_id`) and raised, because that specific constraint was never named in the `ON CONFLICT` clause.

**Fix**: `.onConflictDoNothing()` with **no target**, on both `DrizzlePaymentIncrementalAuthorizationRepository.create()` and (defensively, for the same class of risk) `DrizzleIncrementalTrustCustodyRepository.create()`. A target-less `ON CONFLICT DO NOTHING` suppresses a conflict on *any* unique/exclusion constraint on the table — the correct semantics here, since either constraint being hit must produce the same outcome ("did not insert a duplicate"). Documented with a code comment explaining exactly why, so a future reader does not "fix" it back to a named target.

**Verification the fix actually works, not just "typechecks"**: re-ran the exact failing e2e test twice after the fix — both green, the race now correctly resolves to one `AUTHORIZED_AND_HELD` + one `SKIPPED{reason:'CONCURRENT_WINNER'}`/`ALREADY_PROCESSED`, with exactly one row in each of the two new tables (asserted directly against the database, not just against the use case's return value).

**Why this matters beyond this one fix**: this is exactly the "unique-constraint violations may surface as generic 500 instead of deterministic 409" class of bug that `02_SHARED_ENGINEERING_STANDARDS.md` §13 and IP-001 already flagged as inherited technical debt — IP-001's generic 23505→409 exception-filter mapping (§3.3 of its own report) would have turned this into a clean 409 at the HTTP boundary had this code path been reachable via an HTTP request; it is not (this flow is entirely internal/event-driven), so the raw exception would instead have surfaced as a failed outbox-relay job retry (pg-boss would retry the consumer, and the retry would hit the idempotency pre-check and short-circuit cleanly) — meaning the *practical* blast radius of this bug, had it shipped, was a noisy retried job on first delivery, not a wrong financial outcome on eventual settlement. Still a real bug, caught and fixed by actually running the race test this IP was asked to write, not by code inspection alone — exactly the standard `02_SHARED_ENGINEERING_STANDARDS.md` §10 sets ("a failing test is not waived by code inspection if the behavior can be executed").

### 10.5 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 26 routes, all ✓ (unchanged from IP-002 — zero apps/web files touched by this IP)
```

## 11. Deviations / decisions

1. **Resolved a candidate escalation trigger in-repo, did not stop** — the task's own instructions flagged "can a Partner receive the original tranche before an incremental Change Order is even resolved" as a plausible reason to escalate for a product decision on partial-release ordering. Preflight (§2, item 3) found this is **not ambiguous**: `CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES` structurally excludes `CUSTOMER_CONFIRMED` and every status after it, so a Change Order can only ever be submitted/approved *before* the order reaches `CUSTOMER_CONFIRMED` — the single release trigger this whole program uses (`04_APPROVED_PRODUCT_DECISIONS.md`: "Customer/Member confirmation remains the release trigger, not Payment creation trigger"). By construction, every approved Change Order that will ever exist for an order already exists by the time that trigger fires. This is a direct, conservative reading of an *existing* approved product decision applied uniformly to a second money stream — not a new product decision invented by this agent. Confirmed empirically, not just by code reading: the e2e "confirmação do cliente libera TODAS as tranches" test approves the Change Order, waits for its custody, *then* confirms completion, and both tranches release in the same flow.
2. **Added a Payment-eligibility guard beyond the spec's literal text** (§3.3) — found, not invented: the current MVP does not require Payment authorization before scheduling/execution. Judged this a conservative safety net consistent with "no fake PSP behavior invented," not a product decision (it changes no money, only refuses an obviously-inconsistent precondition). Flagged in §16 for the reviewer to specifically re-judge, since it is the one place this agent added a rule not explicitly named in the IP spec.
3. **`Payment.status` is not extended with a new aggregate-release state** (§3.6) — considered adding something like `FUNDS_PARTIALLY_RELEASED`/`ALL_FUNDS_RELEASED` and rejected it: `PAYMENT_STATUS`/`PAYMENT_TRANSITIONS` are PACK-01 closed-baseline, and adding a new enum value is exactly the kind of state-machine change that deserves its own scrutiny, not a side effect of this IP. The custody summary (§3.7) already answers "how much is actually released across all tranches" without touching that enum — judged the minimum-safe design.
4. **No retrofit of `TrustCustody`'s own `save()` to add CAS** (§3.5, §4, §12) — the mandate explicitly asks this IP to prove release-cannot-over-release with a real race test, and it does, for the NEW code this IP owns. Retrofitting the *original* custody's write path was out of scope (a PACK-01 file, not named in this IP's task, and changing it risks the exact kind of "opportunistic refactor" the Manifest §5.3 forbids) — flagged as a carried-forward observation, not silently left implicit.
5. **`onConflictDoNothing()` target removed from both new repositories' `create()`** (§10.4) — a fix discovered and applied during this IP's own verification, not a pre-planned design choice; disclosed in full because it is exactly the kind of thing "run the tests, don't just assume" exists to catch.
6. **No domain event for a denied incremental release** beyond the audit log — mirrors PACK-01's own `ReleaseDenied` precedent exactly (audited, not published as an event); Shared Standards §3 ("do not create events for trivial persistence") and no consumer needs to react to a denial.
7. **Incidental build-cache artifact reverted**: `apps/web/tsconfig.tsbuildinfo`, regenerated by `pnpm typecheck`/`pnpm -r build`, was reverted with `git checkout -- apps/web/tsconfig.tsbuildinfo` — the same non-substantive housekeeping IP-000/001/002 each independently performed and documented.
8. **Pre-existing `.claude/settings.local.json` change left untouched** (§1) — not authored by this agent, not part of this IP's diff, not touched in any way.

## 12. Known issues / technical debt

Carried forward (not resolved by this IP, deliberately out of scope — see §4/§11):
1. **`TrustCustody`'s own `save()` (PACK-01, original tranche) still uses an unconditional `UPDATE`, not CAS** — the *new* incremental-tranche writes this IP adds are CAS-protected (§3.5); the original write path is untouched, unchanged risk profile from before this IP (accepted at PACK-01 time, not newly introduced or newly discovered here).
2. **A genuine, accepted eventual-consistency window**: `TrustChangeOrder.Approved` → `CreateIncrementalAuthorizationUseCase` runs asynchronously via the outbox relay. If `MarketplaceOrder.CustomerConfirmed` fires (release trigger) before that consumer has finished processing a very-recently-approved Change Order, that specific delta simply has no custody row yet at `prepare()` time and is not released in that pass — it remains visible as `amountAuthorizedNotInCustody` in the custody summary (§3.7), an accurate, non-silent representation of the actual state, not a lost/corrupted one. This is not a new problem class this IP introduces: it is the same accepted eventual-consistency posture every other consumer in this codebase already operates under (Shared Standards §1: "consumers idempotent; retry/DLQ behavior follows baseline"), and `prepare()` already handles "no custody row for this tranche yet" gracefully (skips it, does not crash or corrupt state) rather than assuming synchronous ordering across two independently-triggered event chains. A future IP could close this window (e.g. gate the `CUSTOMER_CONFIRMED` transition on all pending incremental authorizations having resolved) but that is a marketplace-order-lifecycle policy decision, not something this Payments-scoped IP should decide unilaterally.
3. **`amountAuthorizedNotInCustodyCents`'s `Math.max(0, ...)` floor is defensive, not currently reachable** — by construction, every incremental tranche counted in `totalHeldCents` corresponds to an approved Change Order also counted in `totalCommerciallyAuthorizedCents`, so the difference should never go negative; the floor exists as the same "don't trust two independently-computed numbers to agree without checking" discipline `snapshotMatches` already models elsewhere in this module, not because a negative case was observed.
4. **Change-order-evidences bucket / migration 0027 shared-infra deployment** (IP-000 §3.3/§12.7) — unrelated to this IP, untouched, still requires a founder-authorized environment action.
5. **Frontend has zero automated test/lint tooling and zero Payments coverage** (IP-000 §12.8, §3.7) — unrelated to this IP's backend-only scope, untouched.

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken. (PSP/Asaas remains `BLOCKED_EXTERNAL` per IP-000 §13 for IP-009 — unrelated to this IP, which stays entirely within the sandbox gateway.)

## 14. Acceptance criteria matrix

Per IP-007 spec §6:

| Criterion | Status | Evidence |
|---|---|---|
| Approved Change Order creates an idempotent incremental financial authorization object/flow in sandbox | **PASS** | `CreateIncrementalAuthorizationUseCase` + `PaymentIncrementalAuthorization`/`IncrementalTrustCustody`, triggered by `TrustChangeOrder.Approved`, calling the unchanged `SandboxPaymentGateway`; idempotent via `UNIQUE(change_order_id)` + deterministic key, proven by a real concurrent-delivery race test (§10.3/§10.4). |
| Rejected change creates none | **PASS** | By construction (only `Approved` is subscribed; `Rejected` publishes a different event, `Cancelled`/`Expired` publish nothing at all) and empirically (dedicated negative e2e test, §10.3). |
| Custody mismatch is explicit | **PASS** | `calculatePaymentCustodySummary` + `GET /payments/by-order/{orderId}`'s additive `custodySummary` — unit-tested (4 tests, including the exact PACK-03 §9.1 declined-but-approved scenario) and e2e-tested against a real HTTP response. |
| Release cannot over-release | **PASS** | Per-tranche CAS writes (`markReadyForReleaseIfInCustody`/`markReleasedIfReady`), `Payment.status` structurally cannot double-transition to `FUNDS_RELEASED`, proven by a genuine two-way concurrent `finalize()` race in the e2e suite (§9, §10.3). |
| Full audit and race tests | **PASS** | 5 new audited operations (§8); 2 genuine concurrency races (create-side and release-side), both in the e2e suite against the real embedded Postgres, both catching/proving real behavior (one of them caught a real bug, §10.4). |

## 15. Commits

**Not committed.** Git identity (`user.name`/`user.email`) is unset in this environment, both locally and globally — confirmed by the environment's own git config state (no attempt was made to set it, per the explicit instruction that doing so is outside this agent's authority; the pre-existing `.claude/settings.local.json` entries referencing a specific author identity, §1, were left untouched and were not used).

All of this IP's changes are left in the working tree, **unstaged** (no `git add` was run), exactly as `git status --short` shows them (§1, §5) — new files untracked, modified files unstaged — ready for `git add`/`git commit` by whichever agent/operator has a configured git identity (the Coordinator, per this task's own instructions).

Suggested commit split, consistent with `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §7 ("implementation → test/fix → docs"):

1. **Implementation commit** — all new/modified files under `apps/api/src/modules/payment/**`, `apps/api/drizzle/0029_*.sql`, `apps/api/drizzle/meta/_journal.json`, `apps/api/src/shared/database/schema/index.ts`. Suggested message: `feat(IP-007): incremental payment authorization for approved Change Orders`.
2. **Test commit** — the 6 new `*.spec.ts` files, the extended `custody-release.usecase.spec.ts`, and `apps/api/test/integration/ip-007-incremental-payment-authorization.e2e.spec.ts`. Suggested message: `test(IP-007): idempotency, CAS release, and concurrency-race coverage`.
3. **Docs commit** — `docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, this Completion Report. Suggested message: `docs(IP-007): completion report, OpenAPI and event catalog updates`.

All three should carry the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer per this session's attribution convention.

## 16. Recommended reviewer focus for the independent Diff Review agent

1. **`apps/api/src/modules/payment/infrastructure/persistence/drizzle-payment-incremental-authorization.repository.ts` and `drizzle-incremental-trust-custody.repository.ts`'s `create()` methods** (§10.4) — this is where a real bug was found and fixed during this IP's own verification (`onConflictDoNothing()` without a `target`). Confirm the reasoning (two unique constraints that always collide together) is actually correct by reading the migration's two `CREATE UNIQUE INDEX` statements directly, not just trusting this report's prose.
2. **`evaluateIncrementalRelease` vs `evaluateRelease`** (§3.6.1) — confirm the belonging-not-equality check is the right replacement for `snapshotMatches`'s value-equality check, and specifically confirm the deliberate tolerance of `Payment.status === FUNDS_RELEASED` (in addition to `FUNDS_IN_CUSTODY`) does not open a door to releasing an incremental tranche after something has gone wrong with the original — trace through what `payment.status` can legitimately be at the moment an incremental tranche is evaluated.
3. **The eligibility guard added beyond the spec's literal text** (§3.3, §11.2) — this is the one place this agent extended behavior not explicitly named in the IP spec. Confirm `PAYMENT_ELIGIBLE_FOR_INCREMENTAL_AUTHORIZATION` is the right set and that "conservative safety net" is the correct characterization rather than an unrequested scope expansion.
4. **`ReleaseFundsUseCase.prepare()`'s additive-only claim** (§3.6) — diff the file against its pre-IP-007 version line by line and confirm every existing branch's core statements (queries, `evaluateRelease` call, event/audit payloads) are byte-identical, with only the `incremental` field appended to each return. The claim that 21 pre-existing unit tests pass unchanged is falsifiable by running them — do so independently.
5. **The two genuine concurrency tests in `ip-007-incremental-payment-authorization.e2e.spec.ts`** ("corrida: duas entregas concorrentes..." and "corrida: duas liberações concorrentes...") — re-run them a few times independently to assess flakiness risk (they rely on `Promise.all`-forced interleaving against a real Postgres instance, the same technique IP-001 used and validated); confirm the assertions genuinely distinguish "exactly one winner" from "both won" rather than being satisfiable by a bug.
6. **The scope boundary on the Marketplace Service Summary endpoint** (§3.7, §11) — confirm leaving `authorized-commercial.service.ts` untouched and only adding a documentation cross-reference is the right call versus actually wiring Service Summary to the new custody data, given the acceptance criteria's exact wording ("custody mismatch is explicit").
7. **The 5 transient timeouts in the full e2e run** (§10.3) — independently re-run `pnpm test:e2e --no-file-parallelism` at least once end to end. This agent's own run showed 5 timeouts (`ntf-001`×3, `ip-002-i18n`×1, `mrk-023-025`×1 — zero in any Payment file) that all passed cleanly on an immediate retry with no code change, attributed to host I/O contention evidenced by a 244s Postgres checkpoint in the same run's log. Confirm this diagnosis independently rather than accepting it on the strength of this report alone — in particular, confirm none of the 5 ever touched `apps/api/src/modules/payment/**` or this IP's new tables.
