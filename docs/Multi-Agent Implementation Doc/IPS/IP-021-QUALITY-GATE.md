# IP-021 — Quality Gate

**Privacy, LGPD & Data Lifecycle**
Independent Quality/Diff Agent. All commands re-run from scratch on this machine, against `main` @ `dff3ab8` + this IP's uncommitted working tree. No shared/production Supabase touched — DB-dependent tests ran only against the disposable embedded Postgres started by `node test/e2e-local.mjs`.

## 1. Static checks

| Check | Command | Result |
|---|---|---|
| API typecheck | `npx tsc -p tsconfig.json --noEmit` (apps/api) | **0 errors** |
| Web typecheck | `npx tsc -p tsconfig.json --noEmit` (apps/web) | **0 errors** |
| Lint | `npx eslint .` (root) | **0 errors, 0 warnings** |
| API build | `npx tsc -p tsconfig.build.json` (apps/api) | **Done, clean** |
| Web build | `npx next build` (apps/web) | **26 routes, all ✓** (matches claimed unchanged count) |

## 2. Unit/domain suite

`npx vitest run` (apps/api, no `TEST_DATABASE_URL` — e2e specs skip via `describe.runIf`):

```
Test Files  56 passed | 26 skipped (82)
     Tests  464 passed | 114 skipped (578)
```
**Exact match to the Completion Report's claimed 464/464 (114 skipped, no failures).**

## 3. Full e2e suite

`node test/e2e-local.mjs --no-file-parallelism` (apps/api, embedded disposable Postgres):

**First run:**
```
Test Files  1 failed | 81 passed (82)
     Tests  1 failed | 577 passed (578)
Duration    626.65s (~10.4 min)
```
The single failure was `test/integration/ip-002-i18n.e2e.spec.ts` — `waitForScore` polling timeout (`Score não chegou a 25`), a file this IP never touches and which was among the report's own list of transient-timeout files on its first run. All 6 of this IP's own e2e tests (`ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts`) passed on the first attempt.

**Targeted re-run of the failed file in isolation** (`node test/e2e-local.mjs --no-file-parallelism test/integration/ip-002-i18n.e2e.spec.ts`):
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    20.81s
```
All 7 tests pass cleanly in 17.5s once not competing with 81 other files for embedded-Postgres I/O — confirms transient host contention, not a regression, exactly the pattern the Completion Report itself documented (independently reproduced with a different specific failure count — 1 file this run vs. 4 in the report's own run — which is expected variance for a contention-based flake, not a discrepancy to worry about).

**Net result: 82/82 files, 578/578 tests green**, reconciled across the two runs — matches the Completion Report's claimed 82/82 files, 578/578 tests.

## 4. Targeted verification / re-derivation performed by this reviewer

- `git status --short` / `git diff --stat` reproduced independently — exact match to Completion Report §5; **confirmed zero diff under `apps/api/src/modules/payment/**`, `marketplace/**`, `verification/**`.**
- Read `Identity.anonymize()` and `TrustPassport.anonymizeProfile()` line-by-line — matches claims exactly, no financial/audit field touched.
- Grep-falsification of "no denormalized PII in financial/audit/execution tables" across `payment.schema.ts`, `payment-incremental.schema.ts`, `audit-logs.ts`, `marketplace-order.schema.ts` (incl. execution events), `marketplace-commercial-snapshot.schema.ts`, `trust-change-order.schema.ts`, `service-execution.schema.ts` — claim holds (one `address` column found, correctly pre-classified as GPS-derived `LOCATION_PRECISE`, not identity PII).
- Read `PrivacyController`/`GetPrivacyRequestsUseCase` — confirmed strict JWT-only ownership scoping, explicit 403 on cross-identity access; no IDOR.
- Grepped every `identityRepository.save()` call site (9) — confirmed the `email` field addition to the update-set clause is a provable no-op for all callers except `anonymize()`.
- **Wrote and ran a throwaway concurrency test** (`vi.spyOn` on `DeletionEligibilityService.checkEligibility`, deterministically injecting a concurrent `AcceptOfferUseCase.execute()` between the real eligibility read and the anonymization transaction) against the real embedded Postgres. **Result: the deletion COMPLETED (identity anonymized) despite a newly-created, non-terminal order existing for the same identity** — empirically confirms the TOCTOU gap the Completion Report itself flagged as "untested" is in fact real and reproducible. Test file fully reverted afterward (line count and content confirmed identical to the pre-test 275-line file); no production code or committed test was modified.
- Read the Conflict Escalation artifact and cross-checked against `04_APPROVED_PRODUCT_DECISIONS.md` — confirmed no existing decision resolves the KYC-evidence-retention question; escalation is genuine and well-scoped, not a disguised implementation gap.

## 5. Findings

See `IP-021-DIFF-REVIEW.md` §10 for the full table. Summary:

- **BLOCKING** — `RequestDataDeletionUseCase`'s eligibility check happens outside the anonymization transaction and is never re-verified inside it; empirically proven exploitable (a concurrently-created non-terminal order is not caught, and the identity is anonymized anyway). This is an irreversible operation with a proven safety-invariant bypass, not a theoretical edge case.
- MINOR / OBSERVATION — see Diff Review; none block merge on their own (pre-existing/out-of-ownership audit gap correctly reported not fixed; KYC evidence retention correctly escalated; deliberate MVP scope reductions reasonably justified).

## 6. Verdict (original pass)

**FAIL** (blocked on the TOCTOU finding).

Everything else in this IP — data classification accuracy, anonymization correctness, financial/audit isolation (independently grep-falsified), IDOR protection, migration safety, i18n discipline, test coverage for every other claimed scenario, and the Conflict Escalation's legitimacy — is verified and sound. This is not a "start over" verdict: the fix is narrow and well-understood (re-run `DeletionEligibilityService.checkEligibility` using the transaction's own executor immediately before mutating `identities`/`trust_passports`, aborting the transaction if the identity is no longer eligible — the same "last read before the write counts" discipline this codebase's own CAS methods already follow). Recommend: apply the fix, add a regression test covering exactly the race reproduced during this review (a concurrent order-creation between eligibility-check and transaction-commit must result in `REJECTED`, not `COMPLETED`), and resubmit for a fast re-review limited to that change.

---

## 7. Confirmation pass — re-run from scratch, fix independently verified

Independent Quality/Diff Agent (confirmation pass). Same baseline (`main` @ `dff3ab8` + uncommitted working tree, now including the fix). No shared/production Supabase touched. Full detail in `IP-021-DIFF-REVIEW.md` §12; summary here.

### 7.1 Static checks (re-run)

| Check | Result |
|---|---|
| API typecheck | **0 errors** |
| Web typecheck | **0 errors** |
| Lint (root eslint) | **0 errors, 0 warnings** |
| `pnpm -r build` | **Both apps clean** (26 web routes, unchanged) |

### 7.2 Unit/domain suite (re-run)

```
Test Files  56 passed | 26 skipped (82)
     Tests  465 passed | 115 skipped (580)
```
Exact match to the Completion Report's post-fix claim.

### 7.3 Targeted e2e — `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts`

**7/7 pass**, including the TOCTOU regression test (confirmed twice: standalone, and again after the revert experiment below).

### 7.4 Full e2e suite

First attempt: 3 files / 8 tests failed — all pure `waitForScore` 60s timeouts in `ip-002-i18n.e2e.spec.ts`, `mrk-023-025.e2e.spec.ts`, `ntf-001.e2e.spec.ts`, none touched by this IP. Re-ran those 3 files in isolation: **3/3 files, 14/14 tests pass** in 87s. **Net: 82/82 files, 580/580 tests green** — matches the Completion Report's post-fix claim exactly. (Two earlier attempts failed to even start the embedded Postgres due to an orphaned process from a prior invocation in this same review session holding a shared-memory segment; killed and retried successfully — a review-session artifact, not a code defect.)

### 7.5 Gold-standard regression-test verification — revert and confirm failure

Temporarily reverted `request-data-deletion.usecase.ts` to the pre-fix design (eligibility check via a separate, non-transactional read, before the Trust Passport lookup and before `db.transaction()` opens — reconstructed from the original Diff Review's own description of the bug), ran the IP-021 e2e file in isolation:

- **Against the reverted (pre-fix) code**: 6/7 pass, **1 fails — the TOCTOU regression test**, actual result `status: "COMPLETED"` where `"REJECTED"` was expected. This directly reproduces the original BLOCKING finding.
- Restored the fix exactly (confirmed byte-identical to the pre-revert version by re-reading the file). Re-ran: **7/7 pass again.**

This is empirical proof, not inference, that the new regression test is real and would have caught the original bug.

### 7.6 Code-level fix verification

- `checkEligibility(identityId, tx)` confirmed as the literal first statement inside `db.transaction(async (tx) => {...})` in `request-data-deletion.usecase.ts`; traced the control flow directly — no path reaches `identity.anonymize(...)` without passing through a passing check first.
- `DrizzleMarketplaceOrderRepository.listForParticipant` and `DrizzleServiceRequestRepository.findByOwner` read directly: both use `const target = executor ?? this.db` and query through `target` — executor forwarding is real, not cosmetic.
- New unit test (`deletion-eligibility.service.spec.ts`) uses a `Symbol('tx')` sentinel to assert the executor reaches all 4 downstream repository calls — genuine propagation test.
- Minor nit found: the Completion Report undercounts other call sites for `listForParticipant`/`findByOwner` (it claims exactly one each; grep found a second each — `manage-order.usecase.ts`, `get-service-request.usecase.ts`). Harmless since `executor` is an optional trailing parameter (confirmed by the clean typecheck/build), but a documentation-accuracy inaccuracy worth noting.

### 7.7 Residual-window claim

Independently judged accurate and honestly scoped: the remaining gap (between the in-transaction `checkEligibility` read and the `identity.anonymize` write, same connection, no I/O in between, READ COMMITTED) is a microsecond-scale window that would require cross-module pessimistic locking or shared `SERIALIZABLE` isolation with `marketplace`'s `AcceptOfferUseCase` to close fully — legitimately out of this fix's ownership boundary and disproportionate for an MVP engineering safety rail. Not overclaimed as "fully solved" anywhere in the Completion Report.

### 7.8 Footprint / regression check

`git status --short` / `git diff --stat` — exact match to Completion Report §5 (original footprint + the fix's 4 additional `marketplace/**` repository files). **Zero touch of `payment/**` or `verification/**`, confirmed again after the fix.**

## 8. Final verdict

**PASS.**

The BLOCKING TOCTOU finding from the original pass is fixed, independently re-verified at the code level, and empirically proven via a revert-and-confirm-fails experiment (not just re-reading the diff). The regression test is real. The residual-window disclosure is honest and adequately narrow for this MVP's engineering safety rail. Full suite reconciles to 82/82 files, 580/580 tests green; unit suite 465/465; targeted e2e 7/7. Zero regressions, zero scope creep into `payment/**`/`verification/**`. This IP is cleared to merge.
