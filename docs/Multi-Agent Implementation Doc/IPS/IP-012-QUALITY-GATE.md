# IP-012 — Quality Gate

**Reviewer:** independent Quality/Diff Agent
**Original verdict (first pass): PASS WITH FINDINGS** (see below — superseded by the confirmation
pass in §Confirmation Pass).
**Confirmation-pass verdict: PASS.** All four original findings (1 MAJOR, 1 MINOR, 2 OBSERVATION)
independently re-verified as genuinely closed. See §Confirmation Pass for the full re-derivation.
Not self-approved.

## Security note

The Executor's transcript reportedly encountered an instruction-shaped string
("tip: auth for agents [www.vestauth.com]") in raw tool output. This review's own tool output
was inspected throughout and no such string, or any other injection attempt, was encountered
during this review's own tool calls. Nothing outside this task's explicit scope was visited or
acted on.

## Findings

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | MAJOR | Referral | `AttributeReferralUseCase` and `ConfirmReferralOnVerificationUseCase` are fully implemented, correctly anti-abuse-hardened, and unit-tested, but are **never called from any reachable code path** — no signup/registration endpoint accepts a referral code, and no event consumer wires verification-approval to `ConfirmReferralOnVerificationUseCase`. As shipped, no referral attribution can ever be created through the running API. This is not disclosed as a gap in the Completion Report (§3.3 reads as if attribution is a live capability). Unlike the points/cashback no-ops, this is not blocked on an undecided business number — wiring a `referralCode` param into the existing signup flow requires no product decision. Must be closed (or explicitly re-flagged as a known gap) before this criterion is considered done. |
| 2 | MINOR | Points | `RedeemPointsUseCase` checks balance before writing but has no database-level concurrency guard (no `FOR UPDATE`/advisory lock, no `CHECK` constraint on cumulative balance) — two concurrent redemption requests for the same identity could theoretically both pass the balance check and both write, taking balance negative. Not exploitable today (no redemption endpoint/catalog exists yet), but should be closed before any redemption UI ships. |
| 3 | OBSERVATION | Admin config | `PointsEarningRule.create` and `CashbackCampaign.create` both default `active` to `true` at the domain layer if omitted, while both admin Zod schemas (`growth-admin.controller.ts`) default `active` to `false` before the entity is constructed. Not exploitable via the HTTP API (Zod always supplies the value first), but the domain-level default is inconsistent with the "never on by accident" intent documented in-code, and any future direct caller of `PointsEarningRule.create`/`CashbackCampaign.create` bypassing the controller would get `active: true` unless it explicitly passes `false`. Recommend flipping the entity-level default to `false` to match the documented intent literally. |
| 4 | OBSERVATION | Spec compliance | IP-012 spec §5 requires "E2E primary happy path" and "E2E meaningful failure path" tests for the IP. The Executor's report explicitly and honestly discloses that no dedicated `growth/**` e2e spec was added, reasoning that every current code path is a verified no-op. This is a defensible call given the tables ship empty, but it is a literal DoD gap against §5's required-tests list — the referral code-generation/self-referral-block/one-time-use paths in particular *are* live and could have been exercised via `POST /growth/referral/me/code` + a second identity racing an attribution, even without a business-decided reward. Recommend a minimal e2e spec covering code generation + self-referral rejection + one-time-use rejection in a follow-up, once Finding #1 is closed and there is an endpoint to attribute against. |

## Verified claims (independently re-derived, not taken on trust)

1. **Separate points ledger vs. reusing IP-010's ledger** — sound, well-reasoned design choice.
   Both invariants (append-only, idempotent-by-source-event, non-negative-by-construction) are
   genuinely implemented, not just documented. See Diff Review §2.
2. **Two new `LEDGER_ACCOUNTS` entries** — genuinely additive; no existing payment logic
   touched; posting is a real, balanced `LedgerPostingService.post()` call; traced the only
   caller (`AccrueCashbackLiabilityUseCase`) and confirmed it is unreachable without an
   admin-configured campaign, and is itself never invoked by any other module in this diff —
   today, nothing can ever post to these accounts. Extending the closed `LEDGER_ACCOUNTS`
   dimension from `growth` is an acceptable minimal, clearly-flagged extension. See Diff Review
   §3.
3. **Benefits VERIFY_ONLY** — confirmed zero files touched under `trust-score/**`; independently
   confirmed no spec ties any Benefit condition to Points/Referral/Cashback. Complete, not
   scope-avoidance. See Diff Review §4.
4. **Referral anti-abuse** — self-referral blocked at the domain layer (identity-id equality,
   correct given `Identity` is already the platform's deduplicated concept); DB-level race
   safety via `idx_referral_attribution_referred_unique` + `onConflictDoNothing().returning()`
   reasoned through and confirmed race-proof by Postgres's unique-index + `ON CONFLICT`
   semantics (a live concurrency harness was judged unnecessary given this is a standard,
   already-used primitive in this codebase — see Diff Review §5); confirmation reuses the real
   `VERIFICATION_STATUS.APPROVED` state, no invented "verified" concept. **However**, see
   Finding #1: this correct logic is currently unreachable in production.
5. **Cashback ledger integration** — every accrual path goes through the real
   `LedgerPostingService`, never a bare counter; no hard-coded percentage found anywhere outside
   validation bounds/tests; disbursement genuinely not implemented, correctly deferred pending
   IP-009.
6. **Points idempotency/non-negativity** — idempotency is real (DB unique index +
   `onConflictDoNothing`, not just documented); non-negativity is enforced at the application
   layer before write (see Finding #2 for the residual concurrency gap, currently unreachable).
7. **Both Conflict Escalations** — independently re-read `04_APPROVED_PRODUCT_DECISIONS.md`
   against `INCONSISTENCIAS.md` #27: this is a real, direct, previously-unresolved contradiction
   between two control documents, and no spec anywhere states an accrual rate, exchange rate,
   redemption catalog, or cashback campaign parameters. Both escalations are genuinely necessary
   (not something already decided elsewhere) and well-scoped (split cleanly by concern, each
   independently approvable).

## Regression / scope

`git status --short` confirms scope exactly as claimed: new `apps/api/src/modules/growth/**`
(22 files) + migration `0041_...sql`, minimal additive touches to
`payment/domain/entities/ledger-entry.ts` (+2 account constants) and `payment.module.ts`
(export one existing provider), plus the standard `app.module.ts`/schema-index/journal
registration touches every prior IP makes. Zero touch of `identity/**`, `privacy/**`,
`notification/**`, `marketplace/**` business logic, zero touch of `trust_benefits`/TRS files.

## Test re-run (independent, from scratch)

- `pnpm --filter api typecheck` — **clean**.
- `pnpm -r build` (`apps/api` + `apps/web`) — **clean**, both apps build successfully.
- `pnpm --filter api test` (unit, no DB): **96/133 files, 680/834 tests** passed (37 files /
  154 tests skipped — the e2e specs gated on `TEST_DATABASE_URL`, not run under plain vitest).
  Matches the Completion Report's claimed figures exactly.
- `node test/e2e-local.mjs` (full Postgres-backed e2e, real embedded Postgres, run to
  completion): **133/133 files passed, 834/834 tests passed, exit code 0**. Matches the
  Completion Report's claim of the post-IP-023 baseline (126 files/810 tests) plus this IP's 7
  new files/24 new tests, with zero regressions. No stray `postgres.exe` process or leftover
  `.pgdata-e2e` directory found after the run completed.
- No `lint` script exists at the `apps/api` package level (pre-existing repo configuration, not
  an IP-012 issue) — typecheck + build served as the static-analysis gate instead.

## Verdict

**PASS WITH FINDINGS.** The ledger design, anti-abuse mechanics, cashback ledger integration,
scope discipline, and both Conflict Escalations are all sound and independently verified — this
is careful, honest, well-reasoned work, including candid self-disclosure of most of its own
gaps (points/cashback infrastructure-only status, no e2e spec). It does **not** meet the bar for
an unqualified PASS because of Finding #1: the referral attribution/anti-abuse machinery this
IP was specifically tasked with building is currently dead code — reachable by no user action —
and that gap was not disclosed in the Completion Report. This does not rise to
CRITICAL/BLOCKING (no data corruption, no security hole, no money-safety violation — the
opposite: it's *too* inert to be reached at all), but it means the "referral self-abuse blocked"
acceptance criterion is only true in the unit-test sandbox, not in the running system. Recommend
the Executor (or a follow-up IP) wire a `referralCode` parameter into the identity signup flow
and a `Verification.Approved` consumer before this criterion is signed off as functionally
complete. Not self-approved; not merged to `main`.

## Confirmation Pass (second independent Quality/Diff Agent, same repo/commit baseline `b13fd5f`)

**Verdict: PASS.**

All four findings from the first pass were independently re-verified against the Executor's
claimed fixes, from first principles — not taken on trust from the Completion Report §11. Full
detail in `IP-012-DIFF-REVIEW.md` §10. Summary:

| # | Original severity | Status | Basis |
|---|---|---|---|
| 1 | MAJOR — referral attribution unreachable | **Closed** | Traced the real code path: `create-identity.request.ts` accepts `referralCode`, `create-identity.usecase.ts` calls `AttributeReferralUseCase` via `ModuleRef.get(..., {strict:false})` inside a `try/catch` that only warns on failure (confirmed non-blocking/best-effort by direct code read). `VerificationApprovedReferralConfirmationConsumer` subscribes to the pre-existing `Verification.Approved` event, follows the exact same `EventConsumer`/outbox-dedupe idempotency pattern as every other consumer in the codebase, and does nothing beyond referral confirmation. Confirmed **live** in a full e2e run: the consumer fired successfully (`consumerName: growth.confirm-referral-on-verification-approved`, `result: SUCCESS`) in the same event fan-out as the pre-existing TPS/TRS/NTF consumers for the same event. |
| — | `ModuleRef` design judgment | **Legitimate** | The module cycle is real (`Identity → Growth → Verification/Payment → Identity` would close if `IdentityModule` imported `GrowthModule` for constructor injection). `ModuleRef.get()` (not `.resolve()`, correctly — the target is a singleton-scoped provider) is called only at request time, strictly after full module bootstrap, so there is no risk of resolving against a not-yet-ready module. Narrowly scoped to one call site, clearly commented in both files. Not a sign of a deeper architectural problem; a legitimate application of the documented Nest pattern for this exact scenario. |
| 2 | MINOR — no DB-level concurrency guard on redemption | **Closed** | `RedeemPointsUseCase` acquires `pg_advisory_xact_lock(hashtext(identityId))` as the *first* statement inside the transaction, strictly before `balanceOf` is read — confirmed by direct code read, not the unit test's assertion alone. Transaction-scoped (`_xact_` variant — releases automatically on commit/rollback/exception, no manual unlock, no leak risk). Locked per-identity (`hashtext(identityId)`), not globally — does not serialize unrelated identities' redemptions. `executor` is a required parameter, preventing use outside a real transaction. Given lock ordering, scoping, and auto-release are all directly confirmed in source and the full e2e suite exercises this path with zero regressions, a throwaway concurrency harness was judged unnecessary to add further confidence — the pattern is a correct, standard Postgres primitive for exactly this problem. |
| 3 | OBSERVATION — inconsistent `active` defaults | **Closed** | `PointsEarningRule.create` and `CashbackCampaign.create` both now default `active: input.active ?? false`, matching the admin Zod schemas and the documented "never on by accident" intent — confirmed by direct read of both entity files. |
| 4 | OBSERVATION — missing required e2e spec | **Closed** | `ip-012-trust-points-referral-cashback.e2e.spec.ts` (245 lines) genuinely exercises the happy path (generate code → signup with it → PENDING → real KYC flow to APPROVED → CONFIRMED) and the failure path (unknown code never blocks signup, `201`) through real `app.inject()` HTTP calls against a real Postgres-backed app, no mocking. The Executor's claim that self-referral/one-time-use remain reachable only at unit/domain level was independently re-derived as **accurate**: referral codes can only be generated by an already-authenticated (i.e., already-signed-up) identity, and attribution only ever happens once, at that identity's own signup — there is no second "attribute" endpoint, so self-referral and code-reuse-race are structurally unreachable via the live HTTP surface as built. This is not a gap the Executor should have closed differently. |

### Regression / scope (confirmation pass)

`git status --short` confirms the diff is exactly the original IP-012 footprint plus a small,
targeted set of changes for the four fixes (`create-identity.request.ts`/`.usecase.ts`/
`.usecase.spec.ts`, additions inside the already-reviewed `growth/**` boundary, and the new e2e
spec file). No new touch of `payment/**` or `marketplace/**` business logic beyond what the
original pass already reviewed and accepted (the two additive `LEDGER_ACCOUNTS` entries and the
`LedgerPostingService` export).

### Test re-run (confirmation pass, independent, from scratch)

- No stray `postgres.exe`/locked `.pgdata-e2e` before starting.
- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm -r build` — clean.
- `pnpm --filter api test` (unit): **96/134 files, 684/840 tests** passed, 38 files/156 tests
  skipped (DB-gated e2e specs).
- `node test/e2e-local.mjs --no-file-parallelism` (full Postgres-backed e2e, real embedded
  Postgres, run to completion): **134/134 files passed, 840/840 tests passed, exit code 0** —
  matches the Executor's claimed 134/840, zero regressions from the pre-fix 133/834 baseline. No
  stray `postgres.exe`/`.pgdata-e2e` left behind after the run.

### Final verdict

**PASS.** This is a clean pass, not "PASS WITH FINDINGS." All findings from the original review —
including the MAJOR referral-wiring gap — are genuinely closed by code that was independently
traced end-to-end (not accepted from the Completion Report's prose), and confirmed live in a full
Postgres-backed e2e run showing the new consumer actually firing as part of the real event
fan-out. The `ModuleRef` pattern used to break the Identity↔Growth module cycle is judged a
legitimate, narrowly-scoped, correctly-implemented solution, not a workaround masking a deeper
architectural issue. The redemption concurrency guard is correctly ordered (lock before read),
transaction-scoped (no leak risk), and identity-scoped (no unrelated-user serialization). No new
issues were introduced by the fixes, and the file footprint matches the claim exactly. Not
self-approved.
