# IP-010 — Diff Review

**Ledger, Settlement & Reconciliation**
Reviewer: independent Quality/Diff Agent. Baseline SHA: `312e9f8` (`main`). Executor artifact reviewed: `IP-010-COMPLETION-REPORT.md`.

## 0. Priority-one finding: the admitted missing e2e run

The Executor's report explicitly disclosed it did **not** run the Postgres-backed suite this session, leaving `drizzle-ledger.repository.ts` with zero live-SQL coverage. This reviewer:

1. Checked for stray `postgres.exe` processes / locked `.pgdata-e2e` — none found, clean start.
2. Ran the **full** `pnpm test:e2e --no-file-parallelism` from clean state (bounded, ~25 min, completed on its own — no hang).
   - Result: **4 files / 13 tests failed**, all in `test/integration/pack-00.e2e.spec.ts` (`Test timed out in 60000ms`) — a pre-existing embedded-Postgres-under-load timeout flake, unrelated to IP-010 (no ledger code, no payment code in that file; same class of failure the program has hit before on this harness under Windows). Everything else, **113/117 files, 745/758 tests, passed**, including full regression of PACK-00..03 and all hard dependencies (module0, pay-001/002, ip-007, ip-008 e2e specs all green).
3. Because **no ledger-specific integration/e2e test exists anywhere in the diff** (confirmed by `grep -i ledger` over the e2e run output — zero hits), running the existing suite by itself does not exercise `drizzle-ledger.repository.ts` at all. To close this gap the reviewer wrote a new throwaway integration test, `apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts`, and ran it against real embedded Postgres via `pnpm test:e2e -- test/integration/ip-010-ledger-repository.e2e.spec.ts`. It proves, against genuine SQL (not fakes):
   - The unique index `(source_event_id, account, direction)` genuinely deduplicates under **three concurrent** `postGroup()` calls for the identical posting group — exactly 2 rows persist, not 6, and the sum is correct (12345, not 24690/37035). This is the real-concurrency proof the fakes-only unit test (§3.3 of the report) could not provide.
   - `numeric(18,0)` round-trips a large cents value (999999999) through Drizzle's string-based numeric handling with no precision loss.
   - **Both new tests passed.** Full suite re-run (with this file added) again showed only pre-existing, unrelated timeout flakes (`pack-00`/`ntf-001`, embedded-Postgres checkpoint pressure), never anything involving `ledger_entries` or the ledger module.

**Verdict on this item: the missing e2e run was a real process violation (should have been run), but re-running it — plus the new targeted repository test the Checker wrote — reveals no actual persistence bug.** This converges to **MAJOR, not blocking**: the gap is now closed by this review's added coverage, and nothing it surfaced invalidates the money-moving logic.

## 1. Sign convention re-derivation (independent, first-principles)

Traced by hand, ignoring code comments:

- **(a) `Payment.Authorized` → hold in custody**: money leaves the buyer's funding-transit account and enters Trust custody. Expected: `CUSTODY_HELD` up, `MEMBER_FUNDING_CLEARING` down. Code (`post-ledger-on-payment-authorized.consumer.ts`): debit `CUSTODY_HELD` / credit `MEMBER_FUNDING_CLEARING`. Under the stated asset convention (debit increases an asset-style account), this is correct.
- **(b) `Funds.Released` → release to Partner**: money leaves custody, becomes payable/paid to the partner. Expected: `CUSTODY_HELD` down, `PARTNER_PAYABLE` up. Code: debit `PARTNER_PAYABLE` / credit `CUSTODY_HELD` — correct.
- Refund: debit `REFUND_ISSUED` / credit `CUSTODY_HELD` — consistent with the same convention.

All three consumers use the *same* `debitAccount`/`creditAccount` shape via `buildBalancedPosting`, so the convention cannot silently diverge between them. **The sign-convention bug the report says it caught and fixed appears genuinely fixed** — re-derivation from first principles matches the current code, not just the code's own comments/tests (checked the domain-lifecycle test in `ledger-entry.spec.ts` independently too: hold 10000 → release 6000 → refund 4000 nets `CUSTODY_HELD` to exactly 0, which is the physically correct outcome).

## 2. Idempotency — concurrency test added

The claimed "same sourceEventId 3× → 2 rows" was previously only proven against an in-memory fake (`ledger-posting.service.spec.ts`) that does not simulate a real unique-constraint race. §0 above covers the new real-Postgres concurrency test that closes this gap. **Confirmed for real**, not just against fakes.

## 3. Reconciliation scope decision (§5 of the report)

- The domain-vs-ledger reconciliation (`LedgerReconciliationService`, `GET /admin/ledger/reconcile/:paymentId`) is genuinely built and tested (see caveat in §4 below — one of its own test cases is actually proving a bug, not a feature).
- The PSP-transaction-vs-ledger three-way reconciliation is genuinely left unimplemented (`PspTransactionReconciler` is an abstract class with no concrete adapter, not wired into `PaymentModule`, and `SandboxPaymentGateway` synthetic data is never fabricated into it). Verified by reading the file and confirming no consumer of `PspTransactionReconciler` exists anywhere in the diff.
- **Judgment on the escalation-artifact question**: documenting this in the completion report §5 instead of filing a separate `IP-010-CONFLICT-ESCALATION-*.md` is acceptable here. This is not a mid-implementation blocker requiring a program stop — it is a scoping fact fully determined during preflight by a hard, already-adjudicated upstream fact (IP-009 `BLOCKED_EXTERNAL`, itself already the subject of its own completion/diff-review artifacts). Re-litigating the same external blocker with a second escalation artifact per downstream IP would be process overhead without new information. The report's own recommendation ("IP-010 cannot be marked 100% against its own acceptance criteria until IP-009 is unblocked") is the right call and is accepted as a disclosed partial/VERIFY_ONLY-adjacent completion for that one acceptance criterion specifically ("reconciliation detects missing/duplicate/mismatched **PSP** transactions").

## 4. MISMATCH-after-partial-release — this is a bug, not a disclosed limitation

The report frames the "MISMATCH after partial release" test (`ledger-reconciliation.service.spec.ts`, case 2) as a legitimate, disclosed semantic divergence: `Payment.refundableCents` is a domain cap that doesn't know where the money physically sits, while the ledger does. **Independent re-derivation shows this framing is wrong — the test is asserting a real double-counting bug in `LedgerReconciliationService.reconcilePayment`.**

By construction, `custodyHeld + partnerPayable` is *already* net of all refunds: every refund posting credits `CUSTODY_HELD` (never `PARTNER_PAYABLE`), so `custodyHeld + partnerPayable == originalAmountCents − refundIssued` holds as an algebraic invariant for every sequence of hold/release/refund postings (confirmed against the exact numbers in the test: `2000 + 6000 = 8000 = 10000 − 2000`). The service then computes:

```
ledgerOutstandingCents = custodyHeld + partnerPayable − refundIssued
                        = (amount − refundIssued) − refundIssued
                        = amount − 2 × refundIssued
```

i.e. `refundIssued` is subtracted **twice** — once implicitly (baked into `custodyHeld+partnerPayable` already) and once explicitly in the formula. In the test this produces `6000` against a correct expectation of `8000` (`= domainRefundableCents`), which is presented as proof of a "real, meaningful discrepancy." It is not: the discrepancy is an artifact of the formula, not of any physical fact about where the money is. **Any payment that is ever refunded at all — even with zero release to a partner — will spuriously MISMATCH** (e.g. hold 10000, refund 2000, no release at all: `custodyHeld=8000, partnerPayable=0, refundIssued=2000` → `outstanding = 8000+0−2000 = 6000`, vs `domainRefundableCents = 10000−2000 = 8000` → false MISMATCH). This is a materially different and more serious bug than the report's own framing suggests: it would flood `GET /admin/ledger/reconcile/:paymentId` with false-positive mismatches on essentially every refunded payment in production, undermining the entire admin discrepancy surface's credibility (an admin who sees "everything with a refund is broken" will learn to ignore the endpoint, defeating its purpose).

**Correct formula** (not applied — flagged for the fix cycle): `ledgerOutstandingCents = custodyHeld + partnerPayable` (drop the `− refundIssued` term; it is already netted in). This makes the "OK" case and the "partial release" case both correctly resolve to `OK`, and the reviewer confirmed by hand-computation that the genuine-drift test case (§case 3, ledger says `7000` vs domain `10000` with no refund) is unaffected by this fix (still correctly MISMATCHes by `3000`, since `refundIssued=0` there).

This is the single most important domain finding of this review — see Quality Gate for severity.

## 5. Financial reports derive from ledger

`GET /admin/ledger/balances` (`ledger-admin.controller.ts`) calls `LedgerRepository.totalsByAccount()`, which is a pure `GROUP BY account` sum over `ledger_entries` rows (`drizzle-ledger.repository.ts`) — confirmed no other table is read. Genuine.

## 6. Balanced posting / rejection of unbalanced groups

`assertBalanced()` throws `LedgerValidationException` for a non-zero signed sum, called unconditionally inside `LedgerPostingService.post()` before every write; `buildBalancedPosting()` is the only construction path used by all three consumers (confirmed no consumer builds a `LedgerEntry` manually — `grep -rn "LedgerEntry.create" infrastructure/consumers` returns nothing). `ledger-entry.spec.ts` already has a direct "rejects an unbalanced group" test (`assertBalanced([debit])` throws) — did not need to add a new one.

## 7. Regression / scope check

`git diff --stat 312e9f8` confirms: `apps/api/drizzle/meta/_journal.json`, `apps/api/src/modules/payment/domain/exceptions/payment.exceptions.ts`, `apps/api/src/modules/payment/payment.module.ts`, `apps/api/src/shared/database/schema/index.ts`, `docs/openapi.yaml` modified (all additive), plus the new files listed in the report §8. **Zero touch** of `identity/**`, `privacy/**`, `notification/**`, `marketplace/**` domain logic (only `IdentityModule` imported unmodified for `AdminGuard`, same pattern as `AnalyticsModule` — confirmed).

## 8. Test re-run summary

- `pnpm exec tsc --noEmit` (apps/api): 0 errors.
- `pnpm exec eslint src test`: 0 errors/warnings.
- `pnpm exec vitest run` (no `TEST_DATABASE_URL`): **83 files passed / 34 skipped (117), 619 tests passed / 139 skipped (758)** — matches report exactly.
- `pnpm test:e2e --no-file-parallelism` (full, real Postgres): **113/117 files, 745/758 tests passed**; 4 files / 13 tests failed, all pre-existing infra timeout flakes in `pack-00.e2e.spec.ts`, unrelated to `payment/**`.
- Targeted new test `ip-010-ledger-repository.e2e.spec.ts` (added by this review, real Postgres): **2/2 tests passed** (concurrent-dedupe, numeric round-trip). Re-run of the full suite with this file included: 116/118 files, 753/760 tests passed, 2 unrelated pre-existing flakes (`pack-00`, `ntf-001`, both `Test timed out`/embedded-Postgres checkpoint pressure under Windows).

## 9. Files touched (this review, in addition to the Executor's diff)

- New: `apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts` (throwaway-but-real integration test, real-Postgres concurrency + numeric precision proof).
- New: this file and `IP-010-QUALITY-GATE.md`.
- No production code modified by this review.

## 10. Findings summary

| # | Finding | Severity |
|---|---|---|
| F1 | `LedgerReconciliationService.reconcilePayment` double-subtracts `refundIssued` in `ledgerOutstandingCents`, causing spurious `MISMATCH` on essentially any refunded payment (with or without partner release). Mischaracterized in the completion report as a disclosed semantic limitation rather than a bug. | **MAJOR** (not money-moving/ledger-integrity — read path only, no funds at risk — but breaks the admin discrepancy surface's core promise) |
| F2 | Postgres-backed repository/e2e suite was not run this session despite being mandatory (§5/§7 of spec, program-wide rule). Re-running it (plus a new targeted concurrency/precision test written by this review) revealed no actual persistence bug. | MAJOR-converges-to-non-blocking (violation of process, but code proven fine) |
| F3 | `TRUST_FEE_EARNED`/`PSP_FEE` accounts defined but unused — honestly disclosed, out of scope, no realized-fee domain event exists yet. | OBSERVATION |
| F4 | Refund consumer always credits `CUSTODY_HELD` even when custody was already released — honestly disclosed, consistent with (buggy) reconciliation formula's own blind spot; will need revisiting alongside F1's fix. | MINOR |
| F5 | No PSP three-way reconciliation — correctly scoped out given IP-009 `BLOCKED_EXTERNAL`, not fabricated against sandbox data. | OBSERVATION, not a defect |

## 11. Confirmation pass (fix cycle) — independent re-verification of F1

Reviewer: independent Quality/Diff Agent (confirmation pass, same role, fresh read). Baseline: `main` at `312e9f8`, Executor's fix cycle per `IP-010-COMPLETION-REPORT.md` §9.

**F1 fix, read in full**: `LedgerReconciliationService.reconcilePayment` (`apps/api/src/modules/payment/application/services/ledger-reconciliation.service.ts`) now computes `ledgerOutstandingCents = custodyHeld + partnerPayable` (line 76) — the `− refundIssued` term is genuinely gone, not merely renamed or hidden in a helper. Confirmed by direct read, not by trusting the report's prose.

**Independent algebraic re-derivation** (redone from scratch, not copied from the original review or the report):

- Every posting in the diff is built exclusively through `buildBalancedPosting()` (confirmed again: `grep -rn "LedgerEntry.create" infrastructure/consumers` still empty, only three consumers exist, unchanged since the original pass).
- `Payment.Authorized`: debit `CUSTODY_HELD`, credit `MEMBER_FUNDING_CLEARING` → `CUSTODY_HELD += amount`.
- `Funds.Released`: debit `PARTNER_PAYABLE`, credit `CUSTODY_HELD` → `CUSTODY_HELD -= released`, `PARTNER_PAYABLE += released`.
- `FundsRefund.Completed`: debit `REFUND_ISSUED`, credit `CUSTODY_HELD` → `CUSTODY_HELD -= refunded`, `PARTNER_PAYABLE` untouched (confirmed: `post-ledger-on-refund-completed.consumer.ts` never references `PARTNER_PAYABLE`).
- Sum: `CUSTODY_HELD + PARTNER_PAYABLE = (amount − released − refunded) + released = amount − refunded` — holds for **any** ordering of release/refund events, since `PARTNER_PAYABLE` only ever accumulates `released` and refunds never touch it. This is exactly `domainRefundableCents` by definition (`amountCents − refundedCents`). So `custodyHeld + partnerPayable` is correct and sufficient on its own; re-subtracting `refundIssued` was double-counting. **Independently re-confirmed correct**, matching the report's own derivation and the original review's F1 finding — no daylight between the three derivations.
- **Case (a) refund before any release**: `CUSTODY_HELD` decreases by the refund, stays ≥ 0 as long as refund ≤ original hold (enforced elsewhere by `Payment.refundableCents` domain invariant) — no issue.
- **Case (b) refund after a release**: `CUSTODY_HELD` for that one payment can go negative (e.g. hold 10000 → release 6000 → refund 4000 → `CUSTODY_HELD = 10000 − 6000 − 4000 = 0`; a larger refund scenario, e.g. hold 10000 → release 8000 → refund 5000 (dispute-driven, exceeding what's still physically held) → `CUSTODY_HELD = 10000 − 8000 − 5000 = −3000`). Checked this against `assertBalanced()` (`ledger-entry.ts`): it validates that a single *posting group's* signed sum is zero (debit leg + credit leg cancel), which is a per-transaction structural check entirely independent of any account's running total across a payment's history. A negative per-payment `CUSTODY_HELD` balance cannot violate it — confirmed by reading `assertBalanced()`'s implementation, it never inspects cross-entry running sums at all. Also checked `GET /admin/ledger/balances` (`totalsByAccount()`): it's a `GROUP BY account` sum across *all* payments, so one payment's negative `CUSTODY_HELD` simply nets against others' positive balances in the global total — no invariant elsewhere assumes per-payment non-negativity. The report's claim holds.

**F4 re-check**: `post-ledger-on-refund-completed.consumer.ts`'s comment block (lines 9-29) states the consumer always credits `CUSTODY_HELD` regardless of release state, and that this is safe because `custodyHeld + partnerPayable == amountCents − refundIssued` holds regardless of ordering (proven above) — a post-release refund only drives that one payment's `CUSTODY_HELD` reading negative, which is a valid signed balance, not corruption. This reasoning is sound and matches the independent re-derivation above; no gap found.

**Regression tests, read in full** (`ledger-reconciliation.service.spec.ts`, 6 tests):
1. Simple hold → `OK` (unchanged from original).
2. Partial release (6000) + partial refund (2000) → **now asserts `OK`** with `ledgerOutstandingCents = 8000`, exactly the case the original review proved was a false `MISMATCH` under the old formula. Confirmed the old `MISMATCH`/`6000` expectation is gone, not just relabeled.
3. **New**: partial refund (2000) with **zero** partner release → `OK`, `ledgerOutstandingCents = 8000` — this is the minimal-repro case from the original review's F1 write-up (hold 10000, refund 2000, no release), confirmed present and passing.
4. Genuine drift (ledger says `CUSTODY_HELD=7000` vs domain expects `10000`, no refund involved) → still asserts `MISMATCH`, `discrepancyCents = 3000`. This is the test that proves the fix did not blunt real-discrepancy detection; confirmed it was left untouched and still passes. Ran it in isolation mentally against the fixed formula: `7000 + 0 = 7000`, `domainRefundableCents = 10000`, discrepancy `3000` ≠ 0 → `MISMATCH`, correct.
5. `NO_LEDGER_ACTIVITY` and 6. not-found-returns-null — both unchanged, still pass.

No missing case: both directions (false-positive elimination, true-positive preservation) are independently covered and were re-run (see §12 below), not just read.

**Kept integration test**: `apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts` is present, untouched (it is a new file with no prior git history to diff against — confirmed unmodified by content re-read against the original review's description: same two assertions, concurrent 3-way dedupe and `numeric(18,0)` round-trip). Re-run against real embedded Postgres in this pass (see §12) — both assertions passed again.

## 12. Confirmation-pass test re-run (this agent, fresh from clean state)

Checked for stray `postgres.exe`/locked `.pgdata-e2e` before starting — none found, clean start.

- `pnpm typecheck` (workspace, both `apps/api` and `apps/web`): 0 errors.
- `pnpm lint` (`eslint .`): 0 errors/warnings.
- `pnpm -r build`: both projects build clean (`apps/web` static export completes, `apps/api` unaffected by build step beyond typecheck).
- `pnpm exec vitest run` (apps/api, unit, no `TEST_DATABASE_URL`): **83 files passed / 35 skipped (118), 620 tests passed / 141 skipped (761)** — matches the report's claimed numbers exactly. `ledger-reconciliation.service.spec.ts` itself: 6/6 passed, confirming both the false-positive fix and the true-positive (genuine-drift) case in the same run.
- `pnpm test:e2e --no-file-parallelism` (full, real embedded Postgres, from clean state): **117/118 files, 760/761 tests passed.** The single failure is `test/integration/ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO...") — `Error: Score não chegou a 25` from a `waitForScore` polling helper timeout, an async Trust Score eventual-consistency flake under embedded-Postgres checkpoint load (Postgres log in the same run shows a ~266s checkpoint stall right around the failure window). This is the same class of pre-existing, unrelated flake already documented for `pack-00.e2e.spec.ts` in the original review and for this exact `ip-002-i18n` case in the completion report's own fix-cycle run — not new, not ledger/payment-related (no `payment/**`, no `ledger_entries` reference anywhere in the failure). Matches the report's claimed 117/118, 760/761 exactly.
- No ledger- or payment-module failures anywhere in either run.

**Regression/scope check**: `git status --short` / `git diff --stat 312e9f8` shows exactly the original IP-010 diff (4 modified files: `_journal.json`, `payment.exceptions.ts`, `payment.module.ts`, `schema/index.ts`, `openapi.yaml`) plus the new files listed in the original review's §9 and the report's §8, plus the reviewer-authored `ip-010-ledger-repository.e2e.spec.ts`. Nothing extraneous (the only incidental diff, `apps/web/tsconfig.tsbuildinfo`, is a local build artifact from this session's own `pnpm typecheck` run, not part of the reviewed change set).

## 13. Confirmation-pass verdict

**F1 fix independently confirmed correct** — the formula, the algebraic invariant, both directions of the negative-`CUSTODY_HELD` edge case, and F4's related reasoning all re-derive cleanly from first principles, matching the report's account with no gaps found. **Genuine-drift detection is confirmed intact** — the fix did not blunt the reconciliation endpoint's ability to catch real discrepancies (test case 4 above, both read and re-run). Full regression (unit + e2e) reproduces the report's claimed numbers exactly, with the sole e2e failure being the same pre-existing, unrelated `ip-002-i18n` flake already on record. File set is exactly the expected diff plus prior/current review artifacts.

**Verdict: PASS.**
