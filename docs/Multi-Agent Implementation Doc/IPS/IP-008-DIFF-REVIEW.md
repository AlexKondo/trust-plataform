# IP-008 — Independent Diff Review

**Cancellation, Dispute & Refund**
Reviewed 2026-09-16. Independent Quality/Diff Agent, isolated from implementation reasoning. Baseline SHA `ddf4356` (`main`). Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§5 Money) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §3 > IP-008 spec > IP-008 Completion Report > IP-008 Conflict Escalation artifact > IP-007 Completion Report.

Every production file changed by this IP was read in full. All claims in the Completion Report were independently re-derived from source, not trusted at face value. A genuine concurrency test was additionally written and run against a real, disposable embedded Postgres instance (separate from the repo's own suite) to verify the CAS primitive empirically, per this program's own precedent (IP-003/IP-021) of catching money-adjacent races only through execution, not code reading.

## 1. Scope / regression check

`git status --short` / `git diff --stat` confirm the diff is limited to:
- `apps/api/src/modules/payment/**` (new files + additive edits) — primary domain.
- The dispute-specific slice of `apps/api/src/modules/marketplace/**`: `marketplace-dispute.ts`, `manage-dispute.usecase.ts`, `marketplace-review.dtos.ts`, `marketplace.mapper.ts`, `drizzle-marketplace-review.repository.ts`, `marketplace-review.schema.ts`. No file belonging to listings, offers, conversations, order lifecycle itself, scheduling, execution, change orders, or reviews was touched.
- `docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, `apps/api/src/shared/database/schema/index.ts`, `apps/api/drizzle/0035_ip008_cancellation_dispute_refund.sql`, `apps/api/drizzle/meta/_journal.json`.
- `apps/web/tsconfig.tsbuildinfo` — an incidental build-cache regeneration, not a real change.

Independently confirmed **zero touch** of `identity/**`, `privacy/**`, `notification/**`, `analytics/**`, and `apps/web/**` (source). Verdict: **scope matches the IP's declared ownership exactly.**

## 2. `RefundPaymentUseCase` — full read

Read in full (`apps/api/src/modules/payment/application/usecases/refund-payment.usecase.ts`). Confirmed:
- `PaymentGateway.refund()` has existed on the port since PACK-01 with a full sandbox implementation and, before this IP, **zero callers**: `grep -rn "gateway.refund\|\.refund(" apps/api/src/modules/payment/application` (pre-IP baseline) returns nothing outside this new file. This claim is genuinely verifiable and true.
- Three defenses, all present and correctly ordered: (1) idempotency-key pre-check before any gateway call; (2) cheap in-memory `amountCents > payment.refundableCents` check before the gateway call; (3) the CAS write (§3 below) as the layer that actually matters under concurrency.
- Gateway call is outside any transaction; persistence of the outcome is inside one transaction, matching the established two-phase discipline of `AuthorizePaymentUseCase`/`ReleaseFundsUseCase`/`CreateIncrementalAuthorizationUseCase`.
- `grep -rn "registerRefund"` confirms the only caller of `Payment.registerRefund()` in the whole codebase is this use case's phase-2 retry loop, and the only writer of the refund accumulator is `PaymentRepository.applyRefundIfExpected` — `grep -rn "paymentRepository.save"` shows `save()` is used elsewhere only for non-refund transitions (`cancel()` in the cancellation consumer, `markAuthorized`/`markInCustody` etc. elsewhere), never for a refund outcome.

Verdict: **claims accurate.**

## 3. `applyRefundIfExpected` — the load-bearing CAS

Read `DrizzlePaymentRepository.applyRefundIfExpected` and the abstract port directly:

```ts
UPDATE payments
SET refunded_amount = ?, status = ?, updated_at = ?
WHERE id = ? AND refunded_amount = ?
RETURNING id
```

Both sides of the `refunded_amount` comparison are produced by the same `toReaisString()` helper (write path and the CAS `WHERE` value), so the string comparison is exact — no independent rounding paths that could silently desync. `refundedAmount` is `numeric(18,2)` NOT NULL; the domain never bypasses cents (`Cents` type, `assertCents`).

**Independent empirical verification (not just code reading).** The existing repo test (`refund-payment.usecase.spec.ts`, describe "corrida real") already exercises this via an in-memory fake with faithful CAS semantics; I traced its logic by hand and confirm it correctly reproduces a lost-race retry. Because the Completion Report itself (§16.3) flags this as *not* exercised against a real Postgres row lock, and because this program has twice before (IP-003, IP-021) only caught real races through execution, I additionally wrote and ran a standalone, throwaway script (not committed, not part of the repo) against a fresh, disposable embedded Postgres instance (separate port/data dir from the repo's own runner):

- Two genuinely concurrent client connections each attempted a R$60.00 refund against a R$100.00 payment with `refunded_amount = 0.00`, using the exact SQL shape above.
- Run 11 times (1 initial + 10 repeat rounds to check for flakiness).
- **Result: 11/11 rounds — exactly one writer completed each time, and `refunded_amount` never exceeded 100.00.** The loser's `applyRefundIfExpected` correctly returned zero affected rows on every round, forcing the application-level retry loop to re-read and re-evaluate (which, in this scenario, correctly resolved to `LEDGER_INCONSISTENT`/blocked-before-retry since the second write would have exceeded the balance).

Verdict: **the CAS is a real, correct compare-and-swap, proven under genuine concurrent Postgres writers, not merely asserted.** Reasoned through the cross-tranche question explicitly: `Payment.refundedCents`/`refundableCents` are computed against `Payment.amountCents`, which (per PACK-01/IP-007, unchanged by this IP) is set once at `Payment.create()` and never mutated — incremental tranches do **not** increase `amountCents`. This means the CAS ceiling is always the *original* Payment's contracted amount, and `RefundPaymentUseCase` is deliberately agnostic to which tranche (original or incremental) the money being refunded came from — it only enforces the Payment-wide ceiling, which is the correct, single source of truth for "how much has this buyer been refunded, total." No path was found where the sum of refunds across original + incremental tranches could exceed what was actually funded.

## 4. `CasLostSignal` throw-to-rollback

Read the retry loop end to end. `CasLostSignal` is a local class, thrown **inside** `this.db.transaction(async (tx) => {...})` specifically when `applyRefundIfExpected` returns `false`. This is correct: a `return` from inside a Drizzle transaction callback commits everything executed so far in that callback (including the `FundsRefund.create()` insert that ran moments earlier in the same attempt) — only a `throw` forces the whole transaction, insert included, to roll back. The `catch` block outside the transaction distinguishes `CasLostSignal` (retry, bounded at `MAX_CAS_ATTEMPTS = 3`) from any other error (re-thrown, not swallowed). On exhaustion, the outcome is `LEDGER_INCONSISTENT` with an ERROR-level log — never silently reported as `COMPLETED`, and never retried unboundedly. Verdict: **correct, matches the report's description exactly.**

## 5. Two new consumers

### 5.1 `RefundPaymentOnOrderCancelledConsumer`

Read in full, including its dedicated unit spec (7 tests). Confirmed the state-machine proof: `CANCELLABLE_STATUSES = [CREATED, AWAITING_SCHEDULING, SCHEDULED, AWAITING_EXECUTION]` (`marketplace-types.ts`), and `ORDER_TRANSITIONS` shows `CANCELLED` is reachable **only** from those four states — `IN_PROGRESS` and everything after it have no `CANCELLED` transition at all. This independently confirms the claim that a Payment can only be `CREATED`/`AUTHORIZATION_FAILED`/`AUTHORIZED`/`FUNDS_IN_CUSTODY` when this consumer runs, never `FUNDS_RELEASED`/`SETTLED`. All four branches are handled correctly (no-op-cancel, void-not-refund, full-refund-plus-custody-CAS, idempotent-on-redelivery). The incremental-tranche branch was read line by line: `!custody` (approved-but-not-custodied) → `gateway.cancel()`, never `RefundPaymentUseCase`; `custody.status === IN_CUSTODY` → `RefundPaymentUseCase` + `markRefundedIfInCustody`, never `gateway.cancel()`. The two branches are structurally impossible to swap (mutually exclusive `if`/early-`continue` shape), and the unit tests assert on the *distinguishing* details (`gateway.cancel` called vs. not; `refundPayment.execute` called with the incremental idempotency key vs. not) rather than superficial pass/fail.

### 5.2 `RefundPaymentOnDisputeResolvedConsumer`

Read in full. **Verified specifically, independently, that `refundAmount` never derives from `decisionType`**: the consumer reads `payload.refundAmount` directly off the event envelope and calls `fromReais(payload.refundAmount)` — no switch/lookup on `decisionType` anywhere in this file. Traced the value back through `manage-dispute.usecase.ts::resolve()` (`refundAmount: body.refundAmount` passed straight to `DisputeDecision.create()`) and `marketplace-dispute.ts::DisputeDecision.create()` (stores the input verbatim after a reais→cents→reais round-trip solely to reject sub-cent fractions — no formula, no decision-type branch). The unit spec's own assertion (`amountCents: 20050` for `refundAmount: 200.5`) and a dedicated entity-level test (two `UPHELD` decisions with different `refundAmount`, both accepted unchanged) corroborate this empirically, not just by reading intent comments. Verdict: **claim independently confirmed true.**

## 6. Cancellation-vs-dispute-refund mutual exclusivity

Independently re-derived (not accepted from the report) from `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts`:
- `CANCELLED` is reachable only from `{CREATED, AWAITING_SCHEDULING, SCHEDULED, AWAITING_EXECUTION}`.
- `DISPUTE_OPEN` is reachable only from `{IN_PROGRESS, AWAITING_CUSTOMER_CONFIRMATION, CUSTOMER_CONFIRMED, COMPLETED}`.

These two source-state sets are disjoint and jointly exhaustive of every state that can transition onward — a `MarketplaceOrder` has a single `status` column, so it can be in at most one status at any instant, and neither set's precondition can ever be true simultaneously with the other's. A dispute cannot be opened (let alone resolved) on an order that is, or ever was on this path, `CANCELLED`, and a cancellable order can never have reached `DISPUTE_OPEN`. This holds regardless of whether the underlying `order.save()` write path itself uses CAS or an unconditional `UPDATE` (a separate, pre-existing MRK-017 concern, out of this IP's scope) — the guarantee here is structural (disjoint domains of a single-valued field), not concurrency-control-dependent. **No race window found; the claim holds.**

## 7. `PAYMENT_TRANSITIONS` bugfix

Read the before/after diff directly (`payment-types.ts`) and the regression tests (`payment.spec.ts`, 3 new tests; `refund-payment.usecase.spec.ts`'s failing-then-passing sequence referenced in the report's own §10.4). Confirmed:
- The claimed bug was real: before this IP, `PARTIALLY_REFUNDED` was reachable only from `SETTLED`, so a partial refund of money still `FUNDS_IN_CUSTODY`/`FUNDS_RELEASED` would throw `PaymentTransitionException` inside `Payment.registerRefund()`.
- The fix is two new edges (`FUNDS_IN_CUSTODY -> PARTIALLY_REFUNDED`, `FUNDS_RELEASED -> PARTIALLY_REFUNDED`) plus one new self-loop (`PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED`) — purely additive; no edge was removed or redefined.
- Confirmed it does **not** newly allow over-refund: the transition table only gates *which status label* is reachable, never the *amount*. The amount ceiling is enforced independently and unconditionally by `Payment.registerRefund()`'s own `amountCents > this.refundableCents` guard (unchanged by this diff) and, at the persistence layer, by the CAS in §3. Verdict: **scoped correctly.**

## 8. Conflict Escalation — fee treatment on refund

Read the escalation artifact and the code it describes. The two open questions (Trust Fee proportional reversal; who bears the PSP fee on a refund) are genuinely undecided in every document available to this reviewer as well — no counter-evidence found. Judged the interim behavior (gross-only refund, no fee ledger touched) **safe by construction**: `RefundPaymentUseCase` only ever refunds up to `payment.refundableCents = amountCents - refundedCents`, a ceiling computed from money **actually captured**, entirely independent of however the eventual fee-bearing decision resolves. There is no code path where refunding gross-only could cause the platform to pay out more than it received — the fee question affects only who eventually *absorbs* a cost, not whether the refund amount itself can exceed funded money. Option A (do nothing, escalate) is the correct minimal-risk choice; Option B (add an unused config flag) would have been premature scope expansion, and Option C (block refunds entirely) would have been a strictly worse outcome for buyer protection. **Escalation is genuine, well-scoped, and does not block this IP.**

## 9. Incremental-tranche void-vs-refund — test coverage judgment

Confirmed the report's own admission is accurate: `refund-payment-on-order-cancelled.consumer.spec.ts` covers both incremental-tranche branches with unit tests that assert the *distinguishing* behavior (not merely "did not throw"), but `ip-008-cancellation-dispute-refund.e2e.spec.ts` never creates a Trust Change Order, so the incremental-tranche path is never exercised end-to-end against a real database. Given:
- the unit tests are genuinely discriminating (they assert `gateway.cancel` called XOR `refundPayment.execute` called, with the correct idempotency key in each branch), and
- the underlying CAS method (`markRefundedIfInCustody`) is structurally identical to IP-007's own `markReadyForReleaseIfInCustody`/`markReleasedIfReady`, which **were** already proven correct under real concurrent Postgres writers in IP-007's own e2e suite,

this is judged a **MINOR** gap, not MAJOR — real but bounded risk, not an unverified critical primitive. Recommend a follow-up e2e test (cancel an order with an approved Change Order both pre- and post-custody) before/alongside IP-009/IP-010, not as a blocker to this IP.

## 10. Additional findings from independent reading (not requested by the report, found during review)

- **MINOR — dead exception classes.** `RefundNotAllowedException`, `RefundLimitExceededException`, `RefundFailedException` (`payment.exceptions.ts`) are declared with full documentation but never thrown anywhere in the codebase (confirmed by repo-wide grep) and never referenced in `openapi.yaml`. Harmless — the actual design correctly uses typed outcomes (`RefundPaymentOutcome`) rather than exceptions, since there is no HTTP entry point for refunds — but the unused classes could mislead a future reader into thinking refund failures surface as these specific error codes. Recommend removing them or wiring a comment explaining they are reserved for a future HTTP surface.
- **MINOR — `ManageDisputeUseCase` has no dedicated unit test file.** This is a pre-existing gap from MRK-023/024 (confirmed: no such file exists in the working tree before or after this IP's diff), not introduced by IP-008. However, IP-008 added new money-adjacent logic into this untested use case (the `refundAmount` sanity bound, `422 MARKETPLACE_DISPUTE_INVALID`) with only e2e coverage (one test). A unit test would give faster, more precise coverage of boundary values (exact equality, fractional overshoot, `undefined` vs `0`) than the single e2e test can.

## 11. Verdict

No CRITICAL or BLOCKING findings. No confirmed double-refund or over-refund path — the reviewed logic is correct and was additionally proven under genuine concurrent Postgres writers, not just code inspection. Two MINOR findings recorded above, neither money-safety-relevant. Diff Review verdict: **APPROVED**.
