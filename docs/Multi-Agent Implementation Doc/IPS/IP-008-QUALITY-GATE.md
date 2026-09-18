# IP-008 — Quality Gate

**Cancellation, Dispute & Refund**
Evaluated 2026-09-16, independent Quality/Diff Agent. See `IP-008-DIFF-REVIEW.md` for the full, file-by-file independent review this gate is based on.

## 1. Gate inputs

| Requirement | Status |
|---|---|
| Completion Report exists | ✅ `IP-008-COMPLETION-REPORT.md` |
| Conflict Escalation artifact reviewed and judged well-scoped | ✅ `IP-008-CONFLICT-ESCALATION-FEE-TREATMENT-ON-REFUND.md` — safe by construction (§8 of Diff Review) |
| Diff Review completed independently | ✅ `IP-008-DIFF-REVIEW.md` |
| Full diff read (production files + relevant tests) | ✅ every changed file in `apps/api/src/modules/payment/**` and the dispute slice of `marketplace/**` read in full |
| Scope matches declared ownership | ✅ confirmed via `git diff --stat`; zero touch of `identity/**`, `privacy/**`, `notification/**`, `analytics/**`, `apps/web/**` |

## 2. Tests re-run from scratch (this session, independently)

| Command | Result |
|---|---|
| `pnpm typecheck` | apps/api: Done · apps/web: Done — **0 errors** |
| `pnpm -w lint` | eslint . — **0 errors** |
| `pnpm -r build` | apps/api `tsc -p tsconfig.build.json`: Done · apps/web `next build`: 27 routes, all ✓ |
| `pnpm test` (unit, apps/api) | **67 passed \| 31 skipped (98 files)**, **548 passed \| 133 skipped (681 tests)** — matches Completion Report §10.2 exactly |
| `node test/e2e-local.mjs --no-file-parallelism` (full suite, embedded disposable Postgres) | **97 passed \| 1 failed (98 files)**, **680 passed \| 1 failed (681 tests)**, duration 782s |
| Isolated re-run of the one failing file | `test/integration/ip-002-i18n.e2e.spec.ts` — **7/7 passed** on immediate retry, no code change |
| IP-008's own e2e file, in the full run | **4/4 passed** (`ip-008-cancellation-dispute-refund.e2e.spec.ts`, 36.8s) |

The single failure in the full run was `ip-002-i18n.e2e.spec.ts`'s notification-locale test (timeout). Independently confirmed this is transient host I/O contention, not a regression: (a) the test has no dependency on any Payment/Marketplace-dispute file — it exercises identity locale resolution and notification rendering only; (b) re-run in isolation immediately afterward, with no code change, it passed 7/7 including the previously-timed-out case, in 19s total; (c) this exact test/failure class was already independently documented as flaky-under-contention in both IP-002's and IP-007's own Completion Reports on this machine. **Zero failures attributable to this IP's diff, across the full suite.**

### 2.1 Independent concurrency verification (beyond the required commands)

Per this program's own precedent of catching money-safety bugs only through execution (IP-003, IP-021), a standalone, throwaway script (not committed) was written and run against a **separate, real, disposable embedded Postgres instance** to verify `DrizzlePaymentRepository.applyRefundIfExpected`'s exact SQL shape under genuine concurrent writers — not the repo's own in-memory-fake race test, an independent one:

- Two truly concurrent connections attempting R$60.00 refunds each against a R$100.00 payment, `refunded_amount` starting at `0.00`.
- **11/11 rounds**: exactly one writer completed per round; `refunded_amount` never exceeded `100.00` in any round.

This corroborates, empirically and independently, that the CAS primitive this IP's entire money-safety argument rests on is genuinely correct under real database concurrency, not merely correct in an in-memory approximation.

## 3. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | MINOR | `RefundNotAllowedException`, `RefundLimitExceededException`, `RefundFailedException` (`payment.exceptions.ts`) are declared but never thrown anywhere and never referenced in `openapi.yaml`. Dead code; harmless (the actual design correctly uses typed outcomes, not exceptions, since refunds have no HTTP entry point) but could mislead a future reader. |
| 2 | MINOR | `ManageDisputeUseCase` has zero dedicated unit test file (pre-existing gap, not introduced by this IP), and this IP's new `refundAmount` sanity-bound logic (`422 MARKETPLACE_DISPUTE_INVALID`) landed there with only e2e coverage (1 test). A unit test would give faster, more precise boundary coverage. |
| 3 | MINOR | The incremental-tranche void-vs-refund branch in `RefundPaymentOnOrderCancelledConsumer` is unit-tested only (with genuinely discriminating assertions), not exercised in the e2e suite — no Change Order is created in `ip-008-cancellation-dispute-refund.e2e.spec.ts`. Recommend a follow-up e2e test; not a blocker given the underlying CAS method is structurally identical to IP-007's own, already e2e-race-proven, methods. |

No CRITICAL, BLOCKING, or MAJOR findings. No confirmed double-refund or over-refund path exists anywhere in the reviewed diff.

## 4. Judgment on the items flagged for "highest scrutiny"

- **CAS correctness (`applyRefundIfExpected`)**: correct. Proven both by code reading (exact `UPDATE ... WHERE id = ? AND refunded_amount = ?` on a `numeric(18,2)` column, both sides of the comparison built by the same `toReaisString()` helper) and by an independent real-Postgres concurrency test (11/11 rounds correct), in addition to the repo's own existing in-memory-fake race test, which was traced by hand and confirmed logically sound.
- **`CasLostSignal` throw-to-rollback**: correct. Thrown (not returned) specifically to force the whole transaction — including the co-located `FundsRefund` insert — to roll back on a lost CAS race; bounded retry (`MAX_CAS_ATTEMPTS = 3`); exhaustion surfaces as `LEDGER_INCONSISTENT`, never silent success.
- **Two new consumers**: both independently re-derived as correct, including the incremental-tranche void-vs-refund distinction (structurally impossible to swap, unit-tested with discriminating assertions) and the "never computed from `decisionType`" claim for dispute refunds (independently traced end to end from HTTP body → domain entity → event payload → consumer → use case, confirmed no formula exists anywhere in the path).
- **Cancellation-vs-dispute-refund mutual exclusivity**: independently re-derived from `ORDER_TRANSITIONS` (not accepted from the report). `CANCELLED`'s reachable source states and `DISPUTE_OPEN`'s reachable source states are disjoint; a single-valued order status column cannot satisfy both preconditions simultaneously. Holds structurally, no race window found.
- **Fee-treatment escalation**: judged safe by construction — refund amount is always bounded by `payment.refundableCents` (money actually captured), so gross-only refund can never cause the platform to pay out more than it received, regardless of how the fee-bearing question is eventually resolved. Escalation is genuine and correctly scoped.

## 5. Constraints compliance

- No production code was modified during this review; only two new documentation artifacts (this file and `IP-008-DIFF-REVIEW.md`) were created, plus a throwaway verification script that was run outside the repository's tracked test suite and deleted before completing this review (`git status --short` confirms no stray files remain).
- No shared/production Supabase instance was touched — all DB-dependent tests ran against the repo's own disposable embedded Postgres (`test:e2e`) or a separate, independently-managed disposable embedded Postgres instance (the throwaway concurrency verification), both local and ephemeral.
- `.claude/settings.local.json` and all permission/config files were not read, touched, or referenced.
- This review does not self-approve on behalf of the implementer; it is submitted as an independent Quality Gate finding for the Integrator/Architecture Agent's final merge decision.

## 6. Verdict

**PASS.**

IP-008 may proceed to merge per `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §4, subject to the Integrator confirming dependency-graph validity and resolving the (already-clean) shared-file diffs in `docs/openapi.yaml`/`docs/event-catalog.md`/`CLAUDE.md`. The three MINOR findings above are recorded for optional follow-up and do not block merge.
