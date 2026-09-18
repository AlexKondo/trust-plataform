# IP-010 — Quality Gate

**Ledger, Settlement & Reconciliation**
Reviewer: independent Quality/Diff Agent. See `IP-010-DIFF-REVIEW.md` for full detail.

## Verdict: **FAIL** (fix cycle required before merge)

## Why not PASS

The ledger's core invariants — genuine double-entry, balanced-or-rejected postings, correct sign convention (re-derived independently from first principles, not just re-reading the code's own comments), idempotent posting under real concurrency (now proven against real Postgres, not just fakes), and `admin/ledger/balances` as a pure derivation of the ledger — are all **genuinely correct** and well-tested. Scope discipline is clean (additive migration, `payment/**`-only diff, zero touch of unrelated modules). The PSP-reconciliation scoping decision (documented in the report rather than filed as a separate Conflict Escalation artifact) is judged correct and proportionate given IP-009's already-adjudicated `BLOCKED_EXTERNAL` status.

However, `LedgerReconciliationService.reconcilePayment` — the function directly implementing the spec's acceptance criterion "reconciliation detects... mismatched transactions" and backing the admin-facing `GET /admin/ledger/reconcile/:paymentId` endpoint — contains a real double-counting bug (`ledgerOutstandingCents` subtracts `refundIssued` twice: once implicitly via `custodyHeld+partnerPayable`, once explicitly). This causes a false-positive `MISMATCH` on essentially any refunded payment, regardless of whether custody was released to a partner. The completion report's own test proves the numbers but mischaracterizes the result as an intentional, disclosed semantic limitation ("the ledger correctly knows something the domain doesn't") rather than what independent hand-derivation shows it to be: an arithmetic bug. Shipping this as-is means the one reconciliation surface this IP delivers would be unreliable — noisy to the point of being ignorable — for a materially common case (any payment with a refund).

Per the program rule that a failing/incorrect behavior is not waived by code inspection when it can be executed, and given this is money/ledger domain code requiring the highest rigor, this is judged **BLOCKING**, not a disclosed limitation to accept as-is.

## Priority-one item resolution: real-Postgres e2e run

Run per the urgent instruction from a clean state (no stray `postgres.exe`/`.pgdata-e2e`): `pnpm test:e2e --no-file-parallelism` completed on its own (no hang), 113/117 files and 745/758 tests passed; the only failures (4 files/13 tests, all in `pack-00.e2e.spec.ts`) are pre-existing embedded-Postgres timeout flakes unrelated to `payment/**`. Because no ledger-specific integration test existed anywhere in the diff, a new throwaway test (`apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts`) was written and run against real Postgres to close the gap: it proves the unique-index dedupe holds under genuine concurrent inserts (not just an in-memory fake) and that `numeric(18,0)` round-trips large cent values without precision loss. Both new tests passed.

**Conclusion: the missing e2e run itself, now that it has been run, reveals no persistence/SQL bug.** In isolation this finding converges from BLOCKING to MAJOR (should have been run per process, but the underlying code is proven correct). It does **not** by itself justify FAIL — F1 (the reconciliation formula bug) is what does.

## Findings (severity)

- **F1 — BLOCKING**: `LedgerReconciliationService.reconcilePayment` double-subtracts refunds, producing false-positive `MISMATCH` for essentially any refunded payment. Fix: drop the `− refundIssued` term from `ledgerOutstandingCents` (it is already netted into `custodyHeld + partnerPayable`); update/relabel the "MISMATCH esperado após liberação parcial" test to assert `OK`; add a case with refund-and-no-release to prove the fix, since that combination is the one that currently breaks silently even without any partner release involved. Re-verify the genuine-drift test case still correctly reports MISMATCH (it does, by hand-derivation, since it has no refund activity).
- **F2 — MAJOR, non-blocking**: mandatory Postgres e2e suite not run this session by the Executor; closed by this review (full run + new targeted repository test), no bug found.
- **F3 — OBSERVATION**: `TRUST_FEE_EARNED`/`PSP_FEE` accounts unused, correctly scoped out and disclosed.
- **F4 — MINOR**: refund consumer always credits `CUSTODY_HELD` regardless of prior release state; consistent with (currently buggy) reconciliation formula's blind spot; should be re-examined once F1 is fixed, since the fixed formula may change what "correct" looks like here.
- **F5 — not a defect**: PSP three-way reconciliation correctly left unwired; escalation-in-report (rather than separate artifact) judged appropriate.

## Test evidence

- `pnpm exec vitest run` (unit/application, no DB): 83 files / 619 tests passed, 34/139 skipped — matches report.
- `pnpm exec tsc --noEmit`: 0 errors. `pnpm exec eslint src test`: 0 errors/warnings.
- `pnpm test:e2e --no-file-parallelism` (full, real Postgres): 113/117 files, 745/758 tests passed; 4 files/13 tests failed, pre-existing unrelated timeout flakes.
- New Checker-authored `ip-010-ledger-repository.e2e.spec.ts` (real Postgres): 2/2 passed (concurrent unique-index dedupe, numeric precision round-trip).

## Required for re-submission

1. Fix F1 in `ledger-reconciliation.service.ts` and its spec (formula + at least one added test case covering refund-without-release).
2. Re-run unit suite + the full `pnpm test:e2e --no-file-parallelism` (now cheap to justify since this review proved it isn't a hang risk on a clean environment) and attach fresh numbers.
3. Optionally fold the Checker-authored `ip-010-ledger-repository.e2e.spec.ts` into the Executor's own test list in an updated completion report (recommended — it is the only real-Postgres coverage the ledger repository has).

No other blocking issues found. Not self-approved; not merged to `main`.

---

## Confirmation pass — updated verdict: **PASS**

Reviewer: independent Quality/Diff Agent (confirmation pass, fresh independent read + full re-run; see `IP-010-DIFF-REVIEW.md` §11-13 for full detail).

**F1 disposition**: confirmed genuinely fixed. `ledgerOutstandingCents` is now `custodyHeld + partnerPayable` with the erroneous `− refundIssued` term removed. Independently re-derived from first principles (not copied from the report): since refunds only ever credit `CUSTODY_HELD` and never touch `PARTNER_PAYABLE`, `custodyHeld + partnerPayable == amountCents − refundIssued` holds algebraically for any ordering of release/refund events. Verified the negative-per-payment-`CUSTODY_HELD` edge case (refund after release exceeding what's still held) does not violate `assertBalanced()` (a per-posting-group structural check, unaffected by cross-entry running totals) or the `GET /admin/ledger/balances` global sum. F4's "always credit `CUSTODY_HELD`" reasoning in the refund consumer re-confirmed sound for the same reason.

**Regression coverage re-verified**: the rewritten `ledger-reconciliation.service.spec.ts` (6 tests) now asserts `OK` for the partial-release+refund case (previously false `MISMATCH`), adds the minimal-repro refund-with-zero-release case (also now `OK`), and — critically — **leaves the genuine-drift `MISMATCH` test intact and passing**, so the fix eliminates false positives without blunting true-positive detection. This was confirmed both by reading the test file and by re-running it.

**Test re-run (this pass, fresh from clean state, no stray `postgres.exe`/`.pgdata-e2e`)**:
- `pnpm typecheck`: 0 errors. `pnpm lint`: 0 errors/warnings. `pnpm -r build`: clean.
- `pnpm exec vitest run`: 83 files / 620 tests passed, 35/141 skipped (118/761 total) — matches claim exactly.
- `pnpm test:e2e --no-file-parallelism` (full, real Postgres): 117/118 files, 760/761 tests passed — matches claim exactly. Sole failure: `ip-002-i18n.e2e.spec.ts` (`waitForScore` timeout under embedded-Postgres checkpoint load), the same known-unrelated flake class already on record from both the original review and the report's own fix-cycle run. Zero failures in any `payment/**` or ledger spec.
- Reviewer-authored `ip-010-ledger-repository.e2e.spec.ts` confirmed present, unmodified, and passing (both concurrent-dedupe and numeric round-trip assertions) as part of the same full e2e run.

**Scope check**: `git diff --stat 312e9f8` / `git status --short` shows exactly the original IP-010 file set plus the prior review's integration test — nothing extraneous.

### Final verdict: **PASS**

The one BLOCKING finding from the first pass (F1) is resolved and independently re-derived as correct, with no new problems introduced — genuine-discrepancy detection is confirmed intact, not just false-positive suppression. All other findings (F2 process gap, F3/F5 observations, F4 minor) remain closed/accepted per the original review. Not self-approved; cleared for merge to `main` by this reviewer's own analysis, subject to normal program merge process.
