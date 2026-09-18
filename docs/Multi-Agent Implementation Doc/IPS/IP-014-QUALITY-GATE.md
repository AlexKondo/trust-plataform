# IP-014 — Quality Gate

**Reviewer:** independent Quality/Diff Agent.
**Scope:** IP-014 — Safety, Abuse & Fraud Controls, re-verified independently of `IP-014-COMPLETION-REPORT.md` and the prior two implementing-agent sessions.

## Verdict: **PASS**

## Basis

Full detail in `IP-014-DIFF-REVIEW.md`. Summary:

1. **Working tree**: coherent, matches the report's claimed file footprint exactly (`git status --short` / `git diff --stat` independently reproduced). No signs of contamination from the stuck-agent → successor-agent handoff. No stray `postgres.exe` processes or locked `.pgdata-e2e` directory were present when this review began.

2. **`RateLimitService`**: read in full, confirmed to count `audit_logs` rows scoped by `identityId` + `operation` + a bounded time window, using pre-existing indexes (`idx_audit_log_identity`, `idx_audit_log_operation`) — sound design, does not degrade as `audit_logs` grows. Applied at exactly the 5 claimed call sites (verified by direct read of each).

3. **Rate-limiter e2e gap**: confirmed real (the report's own flagged concern) — `test/setup-env.ts` sets the limit to 100000 for every existing e2e run, so no prior test ever proved a real HTTP 429. Judged MAJOR, not MINOR, given "rate limits canonical" is an explicit §6 acceptance criterion. **Closed by this review**: added `apps/api/test/integration/ip-014-rate-limit.e2e.spec.ts` (test-only change, no production code touched), which overrides the limit to 2 for its own isolated app instance (via a pre-import `process.env` override + dynamic `import()`, safe under Vitest's per-file module isolation) and proves: 2 successful Change Order creations → 3rd returns real `429`/`SENSITIVE_ACTION_RATE_LIMIT_EXCEEDED` → a different Identity is unaffected (per-identity scoping). This test required two rounds of debugging before passing (see Test Execution History below) — both bugs were in the new test itself, not in production code.

4. **`RiskFlagService`**: `AdminGuard` gating confirmed. Single-decision enforcement confirmed as a real, race-safe DB constraint (conditional `UPDATE ... WHERE status='OPEN'`, not a check-then-write). Explainability confirmed (`reason` + `signal` both stored/returned, not a boolean).

5. **Suspicious-Change-Order detector**: confirmed deterministic (plain numeric comparisons, no ML), confirmed never blocks (flag raised inside the same transaction as change-order creation; response is always 201). Threshold defaults (5 count / 50% ratio) judged a safe, conservative, config-driven extension point — correctly not escalated as a Conflict per §8 (no money/access/Trust-Score effect depends on the value).

6. **Scope completeness**: cross-checked against spec §1. MFA/step-up and referral-abuse hooks correctly N/A (no baseline infra exists). Evidence/upload abuse limits verified as a genuine combination of pre-existing size caps (VRF-002) + this IP's new frequency caps — not a gap. Review-abuse detection and broader account-abuse signals are genuinely deferred; defensible for Release-1 given structural mitigants (one review per real completed transaction), logged as follow-up items, not blocking.

7. **Immutable investigation trail**: confirmed — risk-flag raises/reviews and rate-limit denials all write to the existing append-only `audit_logs` (DB trigger-enforced, independently observed rejecting UPDATE/DELETE in the e2e Postgres log). No new mutable log was introduced.

## Test re-run (from scratch, independently executed)

| Command | Result |
|---|---|
| `pnpm --filter api typecheck` (repo: `pnpm -r typecheck`) | PASS |
| `pnpm lint` (`eslint .`) | PASS |
| `pnpm -r build` (`apps/api` tsc + `apps/web` next build) | PASS |
| `pnpm test` (unit, apps/api) | **574 passed, 135 skipped, 0 failed** (73 files; skip count is +1 vs. the report's 134 because the new e2e-only spec file adds one more `describe.runIf`-skipped entry when run without `TEST_DATABASE_URL` — expected, not a discrepancy) |
| `pnpm test:e2e --no-file-parallelism` (apps/api, embedded disposable Postgres) — 3rd and final run, after fixing the new e2e test's two bugs | **106/106 files passed, 709/709 tests passed, 0 failed**, duration 749.31s |

### Test execution history (transparency)

- Run 1 (before adding the new e2e test): 707/708 tests, 104/105 files — 1 failure, `ip-002-i18n.e2e.spec.ts` timing flake, matching the report's own finding exactly.
- Run 2 (with the new rate-limit e2e test, first draft): 2 failures — the pre-existing `ip-002-i18n` flake (did not recur further) plus a bug in the new test itself (missing `waitForBronze` step before listing creation, copied incompletely from the reference spec). Fixed.
- Run 3: 1 failure — a second bug in the new test (`additionalMinutes: 15` is not a multiple of the frozen contract billing increment, which the domain entity's `validateMinutes` rejects with a 422; the reference spec's value of 30 is correct). Fixed.
- Run 4 (final): **all green, 709/709, 106/106 files**, including both the previously-flaky `ip-002-i18n` (passed clean twice in a row, confirming flakiness rather than regression) and the new rate-limit e2e test.

No stray `postgres.exe` processes or locked `.pgdata-e2e` directories were left behind after any of the runs in this review; teardown was verified clean each time. No shared/production Supabase was touched at any point (all runs used the disposable embedded-Postgres harness via `pnpm test:e2e`).

## Findings (see `IP-014-DIFF-REVIEW.md` §8 for full table)

| Finding | Severity | Status |
|---|---|---|
| Rate-limiter had zero e2e/HTTP-level proof of 429 | MAJOR | CLOSED (new e2e test added, now passing) |
| Composite `(identity_id, operation, occurred_at)` index would be marginally more efficient | OBSERVATION | Not blocking |
| Change-order suspicion thresholds chosen without recorded product decision | OBSERVATION | Safe default; log for later product review |
| Review-abuse detection deferred | MINOR | Defensible for Release-1; log as follow-up |
| Broader account-abuse signals deferred | MINOR | Defensible for Release-1 |
| MFA/step-up, referral-abuse hooks | OBSERVATION | Correctly N/A |

No CRITICAL or BLOCKING findings.

## Conditions for PASS

None outstanding — the one MAJOR finding was closed within this review by adding real test coverage (no production code was modified). All commands were re-run from scratch after the fix, ending in a fully green suite.

## Sign-off

**PASS.** Recommend merge. No unresolved blocking conflict. No self-approval was performed — this is an independent verification pass by a separate agent session with no authority to merge.
