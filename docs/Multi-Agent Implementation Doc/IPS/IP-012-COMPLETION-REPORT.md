# IP-012 — Completion Report

**Trust Points, Benefits, Referral & Cashback**
Executed 2026-09-17. Owner: Trust/Growth implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` §5 (Money) > `04_APPROVED_PRODUCT_DECISIONS.md` (Growth/economy section) **in real, documented conflict with** `INCONSISTENCIAS.md` #27 (see §6) > IP-012 spec (`IPS/IP-012_Trust_Points_Benefits_Referral_Cashback.md`) > IP-010/IP-011 completion reports (hard dependencies) > real code/migrations/tests at the frozen baseline.

**Revision note (post-Quality-Gate):** an independent Diff Review/Quality Gate (`IP-012-DIFF-REVIEW.md`, `IP-012-QUALITY-GATE.md`, verdict **PASS WITH FINDINGS**) found that Referral attribution/confirmation, while correctly built and unit-tested, was **unreachable in production** (no signup endpoint, no verification-approval consumer) — a real functional gap, not an undecided business rule. This report and the diff were updated to close it (§3.3, §7, §12). The rest of the original review — the points-ledger design, the two new `LEDGER_ACCOUNTS` entries, Benefits VERIFY_ONLY, cashback ledger integration, and both Conflict Escalations — was independently re-derived and confirmed sound; those sections are unchanged from the original submission.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `b13fd5f` (`main`, tip after IP-023). Clean working tree.
- **Hard dependencies**: IP-011 (Trust Signals & Reputation Completion) — committed, `0039_ip011_...sql` present. IP-009 (Payment Gateway) — **BLOCKED_EXTERNAL**: only a fail-closed Asaas adapter skeleton exists (`apps/api/src/modules/payment/infrastructure/gateway/asaas-payment.gateway.ts`), confirmed by reading it; no real PSP call is possible. This directly bounds Cashback's scope (see §3.3, §6).
- **Baseline confirmed via the diff itself**: the full Postgres-backed e2e run after all IP-012 code was written came back **133/133 files, 834/834 tests** — exactly **126/126 files + 7 new / 810/810 tests + 24 new**, i.e. the documented post-IP-023 baseline (126 files / 810 tests) is reproduced exactly, plus this IP's own tests, with zero unrelated failures. (This IP's diff never touches an existing test file, so the pre-change baseline is provably `133 files − 7 = 126` / `834 tests − 24 = 810`, matching the brief's stated baseline without needing a separate pre-change run.)

## 2. Preflight findings

1. **Benefits (TRS-010/011) already exists and is complete for its stated scope.** `apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts:124` (`trustBenefits` table) — comment confirms *"nada é 'concedido'/persistido por usuário"*: eligibility is evaluated on-demand from `{score, level}` via the same JSON-condition engine as `trust_score_rules`. Seeded (`0011_trust_benefits_seed.sql`) with 3 benefits. **Classified VERIFY_ONLY.** No genuine gap was found that requires extending it for this IP: none of Points/Referral/Cashback needs a level-gated entitlement beyond what already exists (e.g. no spec anywhere ties referral limits or cashback rates to Trust Level).
2. **No Trust Points infrastructure exists anywhere in the codebase** — confirmed by grep (`trust_points`, `TrustPoint`, `points_ledger`: zero hits before this IP). This is the genuine gap.
3. **No Referral infrastructure exists** — confirmed by grep (`referral`: zero hits before this IP, outside doc/spec text).
4. **No Cashback infrastructure exists** — confirmed by grep (`cashback`: zero hits before this IP, outside doc text). The IP-010 ledger (`ledger_entries`, `LEDGER_ACCOUNTS`) exists and is the closed baseline this IP must post through, never bypass.
5. **`04_APPROVED_PRODUCT_DECISIONS.md` vs. `INCONSISTENCIAS.md` #27 conflict — read in full, not assumed away.** See §6. Per `00_READ_FIRST`'s precedence rules this is a genuine, unresolved contradiction between two control documents; this agent did not pick a side by default. It instead built infrastructure that is safe and useful under **either** resolution (Trust Points ships now with rules TBD, or Trust Points stays deferred to V2) and filed a Conflict Escalation asking for the explicit call.
6. **Owned files**: new `apps/api/src/modules/growth/**` module only, plus strictly additive touches to shared registration points: `apps/api/src/app.module.ts` (module import), `apps/api/src/shared/database/schema/index.ts` (schema re-export, same line every prior IP touches), `apps/api/drizzle/0041_...sql` + `meta/_journal.json` (new migration), and exactly two additions inside `payment/**`: two new `LEDGER_ACCOUNTS` entries (`CASHBACK_LIABILITY`, `CASHBACK_PAYABLE`) in `ledger-entry.ts`, and exporting the existing `LedgerPostingService` from `payment.module.ts` (it existed but was not exported — needed so `growth` can reuse the single ledger write path rather than re-implementing it). **No existing payment domain logic was modified.** Zero files touched under `identity/**` or `privacy/**` business logic.
7. **Two conflicts found and escalated, not silently resolved** — see §6 and the two standalone artifacts.

## 3. Implemented

### 3.1 Trust Points — safe, empty-by-default ledger infrastructure (NOT a business rule)

New module `apps/api/src/modules/growth/**`. Design decision, documented in-line
(`domain/entities/points-ledger-entry.ts`): Trust Points get their **own** append-only ledger
(`points_ledger`), not IP-010's monetary `ledger_entries` — a point is not money, has no
`payment_id`, and no approved Real-conversion rate exists (§6), so forcing it into the money
ledger would misrepresent it as a cash-equivalent the specs do not authorize. The new ledger
reuses every safety invariant of the money ledger anyway: append-only, idempotent by
`source_event_id` (unique index — `points_ledger`), balance always summed on-demand (never
materialized/never independently mutable), and provably non-negative (`RedeemPointsUseCase`
checks balance and throws `InsufficientPointsBalanceException` **before** any write).
`points_earning_rules` is the admin-config surface (`active` defaults `false`, optional
`starts_at`/`ends_at` window) — it ships **empty**; no rule is seeded. `AccruePointsFromRuleUseCase`
is a genuine no-op until an admin configures a rule via `POST /admin/growth/points-rules`.
Member-facing surface: `GET /growth/points/me/balance` only — no redemption catalog (none
decided; see Conflict Escalation).

### 3.2 Benefits — VERIFY_ONLY, zero code changes

Confirmed complete for its stated scope (§2.1). No file under `trust-score/**` touched by this
IP.

### 3.3 Referral — real attribution + anti-abuse infrastructure, reward value/trigger NOT decided

`ReferralCode` (1:1 per Identity, unique 8-char code) and `ReferralAttribution`
(referrer→referred, `PENDING`→`CONFIRMED`) in `domain/entities/referral.ts`. Anti-abuse is
enforced in **two independent layers** (defense in depth, same pattern IP-010/IP-011 use for
idempotency):
1. **Domain**: `ReferralAttribution.create` throws `SelfReferralException` if
   `referrerIdentityId === referredIdentityId` — an attribution object literally cannot be
   constructed for self-referral.
2. **Schema**: `idx_referral_attribution_referred_unique` — a unique index on
   `referred_identity_id` alone. One referred identity can only ever have **one** attribution,
   ever, ruling out both re-use of a code by the same referred identity and any race condition
   the domain layer alone couldn't catch.

`ConfirmReferralOnVerificationUseCase` promotes `PENDING→CONFIRMED` only once the referred
Identity has a **real, approved verification** — reusing `VerificationRepository.listByPassportId`
and the existing `VERIFICATION_STATUS.APPROVED` state (no second "verified" concept invented,
per the brief's explicit instruction to reuse VRF state). The reward that should fire on
`CONFIRMED` (points? cashback? nothing?) is **not implemented** — no spec states a trigger or
amount; see Conflict Escalation (folded into the Trust Points escalation, since any referral
reward would very likely be paid in Trust Points).

**Wired end-to-end (post-Quality-Gate fix, see §12):** `AttributeReferralUseCase` is now called
from the real signup flow (`CreateIdentityUseCase`, an optional `referralCode` field on
`createIdentityRequestSchema`), and `ConfirmReferralOnVerificationUseCase` is now called by a
real `Verification.Approved` event consumer
(`VerificationApprovedReferralConfirmationConsumer`). Both are reachable by an actual user
through the running API today — confirmed by a new Postgres-backed e2e spec
(`test/integration/ip-012-trust-points-referral-cashback.e2e.spec.ts`).

### 3.4 Cashback — real ledger liability, campaign parameters NOT decided

`CashbackCampaign` (admin-config, `active` defaults `false`, `starts_at`/`ends_at` **both
required**, `percentageBps` in basis points to stay integer-only per Shared Standards §5).
`cashback_campaigns` ships **empty** — no campaign seeded. `AccrueCashbackLiabilityUseCase`
looks up an active campaign at the moment of the triggering fact and, only if one exists, posts
a real **balanced** entry through IP-010's actual `LedgerPostingService` (debit
`CASHBACK_LIABILITY` / credit `CASHBACK_PAYABLE`) — the exact same single-write-path every
other ledger consumer in the codebase uses; no manual `LedgerEntry` construction. With no
campaign configured (the shipped state), this is a verified no-op
(`cashback.usecases.spec.ts`). Actual disbursement (paying the Member) is unreachable while
IP-009 is BLOCKED_EXTERNAL and was **not attempted** — this IP only accrues/exposes the
liability, per the brief.

## 4. Files changed

**New (growth module + e2e, 20 files)**
```
apps/api/drizzle/0041_ip012_trust_points_benefits_referral_cashback.sql
apps/api/src/modules/growth/growth.module.ts
apps/api/src/modules/growth/domain/exceptions/growth.exceptions.ts
apps/api/src/modules/growth/domain/entities/points-ledger-entry.ts
apps/api/src/modules/growth/domain/entities/points-ledger-entry.spec.ts
apps/api/src/modules/growth/domain/entities/points-earning-rule.ts
apps/api/src/modules/growth/domain/entities/points-earning-rule.spec.ts
apps/api/src/modules/growth/domain/entities/referral.ts
apps/api/src/modules/growth/domain/entities/referral.spec.ts
apps/api/src/modules/growth/domain/entities/cashback-campaign.ts
apps/api/src/modules/growth/domain/entities/cashback-campaign.spec.ts
apps/api/src/modules/growth/domain/repositories/growth.repository.ts
apps/api/src/modules/growth/application/usecases/points.usecases.ts
apps/api/src/modules/growth/application/usecases/points.usecases.spec.ts
apps/api/src/modules/growth/application/usecases/referral.usecases.ts
apps/api/src/modules/growth/application/usecases/referral.usecases.spec.ts
apps/api/src/modules/growth/application/usecases/cashback.usecases.ts
apps/api/src/modules/growth/application/usecases/cashback.usecases.spec.ts
apps/api/src/modules/growth/application/usecases/admin-config.usecases.ts
apps/api/src/modules/growth/infrastructure/persistence/growth.schema.ts
apps/api/src/modules/growth/infrastructure/persistence/drizzle-growth.repository.ts
apps/api/src/modules/growth/infrastructure/api/growth-member.controller.ts
apps/api/src/modules/growth/infrastructure/api/growth-admin.controller.ts
apps/api/src/modules/growth/infrastructure/consumers/verification-approved.consumer.ts
apps/api/test/integration/ip-012-trust-points-referral-cashback.e2e.spec.ts
docs/Multi-Agent Implementation Doc/IPS/IP-012-CONFLICT-ESCALATION-TRUST-POINTS-ACCRUAL.md
docs/Multi-Agent Implementation Doc/IPS/IP-012-CONFLICT-ESCALATION-CASHBACK-CAMPAIGN.md
```

**Altered (8)**
| File | What |
|---|---|
| `apps/api/src/app.module.ts` | registered `GrowthModule` |
| `apps/api/src/shared/database/schema/index.ts` | export `growth.schema` |
| `apps/api/drizzle/meta/_journal.json` | migration 0041 entry |
| `apps/api/src/modules/payment/domain/entities/ledger-entry.ts` | added `CASHBACK_LIABILITY` / `CASHBACK_PAYABLE` to the closed `LEDGER_ACCOUNTS` dimension (documented why) |
| `apps/api/src/modules/payment/payment.module.ts` | exported the pre-existing `LedgerPostingService` so `growth` can reuse the single ledger write path |
| `apps/api/src/modules/identity/application/dto/create-identity.request.ts` | added optional `referralCode` field (format-validated, never required) |
| `apps/api/src/modules/identity/application/usecases/create-identity.usecase.ts` | calls `AttributeReferralUseCase` (via `ModuleRef`, best-effort, non-blocking) when `referralCode` is present — Quality Gate finding #1 |
| `apps/api/src/modules/identity/application/usecases/create-identity.usecase.spec.ts` | 3 new tests for the referral wiring (calls when present, skips when absent, never fails signup) |

No `identity/**` or `trust-score/**` (Benefits) **business logic** was touched — the identity
change is additive (one optional DTO field, one best-effort side-call, mirroring the existing
email-verification try/catch pattern in the same use case). `privacy/**` remains untouched.

## 5. Migration

`0041_ip012_trust_points_benefits_referral_cashback.sql` — additive, re-runnable (same
`CREATE TABLE IF NOT EXISTS` / FK-guarded-by-`information_schema` / conditional index style as
0024–0040). Five new tables, all born **empty**: `points_ledger`, `points_earning_rules`,
`referral_codes`, `referral_attributions`, `cashback_campaigns`. Nothing in `trust_benefits`,
`ledger_entries`, or any existing table's rows is touched; the two new `LEDGER_ACCOUNTS`
constants are a code-level dimension change only (the column is `varchar`, not a DB enum — no
migration needed for that part, consistent with how `TRUST_FEE_EARNED`/`PSP_FEE` were added in
IP-010 without a migration either).

## 6. Conflict Escalations filed

Two standalone artifacts, both OPEN, both explicitly asking for a founder/product decision
rather than assuming one:

1. **`IP-012-CONFLICT-ESCALATION-TRUST-POINTS-ACCRUAL.md`** — `04_APPROVED_PRODUCT_DECISIONS.md`
   ("Approved concepts include Trust Points... Implement only under IP-012 rules") directly
   conflicts with `INCONSISTENCIAS.md` #27 ("Trust Points... ficam pós-MVP (não há spec)").
   Neither document, nor any other spec, states an accrual rate, a point-to-Real exchange rate,
   or a redemption catalog. This agent did not resolve the conflict by assumption; it built the
   ledger/idempotency/admin-config infrastructure either resolution would need, left every rule
   table empty, and is asking the founder to either (a) confirm Trust Points is in-scope now and
   supply concrete numbers, or (b) confirm it stays infrastructure-only / deferred, matching
   INCONSISTENCIAS #27.
2. **`IP-012-CONFLICT-ESCALATION-CASHBACK-CAMPAIGN.md`** — no spec states a cashback percentage,
   eligible transaction types, campaign duration/caps, or a disbursement mechanism (the last is
   moot anyway while IP-009 is BLOCKED_EXTERNAL). Built the real ledger-liability accrual path
   (two new closed-dimension accounts, posted through the shared `LedgerPostingService`) but left
   `cashback_campaigns` empty and is asking for concrete campaign parameters or confirmation this
   also stays infrastructure-only for Release 1.0.

Both escalations note that the referral reward (should `Referral.Confirmed` pay out anything) is
folded into the Trust Points escalation, since any such reward would almost certainly be paid in
Trust Points and shares the exact same "no rate decided" gap.

## 7. Tests and results

- **Unit** (`pnpm typecheck`, `pnpm lint` scoped to touched files, `pnpm test` full unit suite):
  all clean. `tsc -p tsconfig.build.json` (build) also clean. 28 new unit tests: 24 across the 7
  original growth spec files (points non-negative/idempotent — `points-ledger-entry.spec.ts`,
  `points.usecases.spec.ts`; self-referral blocked + one-time-use + no-op on unknown code —
  `referral.spec.ts`, `referral.usecases.spec.ts`; "no campaign forever" + integer-cents
  computation + no-op without an active campaign + a correctly-balanced ledger post —
  `cashback-campaign.spec.ts`, `cashback.usecases.spec.ts`; admin-config safe defaults —
  `points-earning-rule.spec.ts`) plus 4 added during the Quality Gate fix: 1 new
  `RedeemPointsUseCase` concurrency-ordering test (lock-before-read) and 3 new
  `CreateIdentityUseCase` tests for the referral wiring (calls when `referralCode` is present,
  skips when absent, never fails signup on attribution error).
- **Full unit run** (`vitest run`, no DB): **96 files passed / 38 skipped (134 total)**,
  **684 passed / 156 skipped (840 total)** — includes the growth module's 7 unit spec files / 24
  tests plus the identity wiring's 3 new tests (+1 new skipped e2e file, run only under
  `TEST_DATABASE_URL`), zero regressions elsewhere.
- **Full E2E, real embedded Postgres** (`node test/e2e-local.mjs --no-file-parallelism`, run to
  completion, not sampled): **134/134 files passed, 840/840 tests passed** — exactly the
  pre-IP-012 baseline of 126/126 files, 810/810 tests **plus** the 7 growth unit spec files (24
  tests), the 3 identity-wiring unit tests, and 1 new e2e spec file (2 tests) — 810 + 24 + 3 + 2
  + 1 (RedeemPointsUseCase concurrency test) = 840. Zero regressions, zero skips, zero flakes. No
  stray `postgres.exe` was left running afterward; `.pgdata-e2e` was removed by this agent after
  every run.
- **New Postgres-backed e2e spec**:
  `apps/api/test/integration/ip-012-trust-points-referral-cashback.e2e.spec.ts` (2 tests) —
  added during the Quality Gate fix (see §12) to close the "referral attribution is unreachable"
  finding with a real, running-API proof: (1) happy path — a real referrer requests a code, a
  second real signup uses it, the attribution is initially uncounted (`PENDING`), a full VRF
  KYC flow (create → 2 evidences → admin review → admin approve) runs for the referred Identity,
  and the referrer's `confirmedReferrals` stat reaches 1 only after the real
  `Verification.Approved` event is drained and consumed; (2) failure path — signing up with an
  unknown/malformed referral code still returns 201 (registration never blocked). Self-referral
  and one-time-use/reattribution remain covered at the unit/domain level only (already
  independently verified as race-proof by the Quality Gate, §5 of the Diff Review) — a true
  self-referral or reattribution race is not reachable through the public signup-only API
  surface by construction, so no e2e equivalent exists for those two specifically.

## 8. Acceptance criteria

| Criterion | Evidence |
|---|---|
| Points non-negative/idempotent | `InsufficientPointsBalanceException` before any REDEEM write; `idx_points_ledger_source` unique index + `onConflictDoNothing`; unit-tested both |
| Referral self-abuse blocked | `SelfReferralException` in domain (can't construct) + `idx_referral_attribution_referred_unique` in schema (can't persist even under a race); unit-tested. Reachable end-to-end: signup DTO → `AttributeReferralUseCase` → e2e-verified (§7, §11). |
| Cashback funded/accounted explicitly | Every accrual is a real, balanced `LedgerPostingService.post()` call against IP-010's ledger — never a bare number; unit-tested |
| Benefits resolve from rules | Pre-existing (TRS-010/011), verified not rebuilt |
| Admin can configure eligible campaigns safely | `points_earning_rules` / `cashback_campaigns` both admin-only (`AdminGuard`), both default `active=false`, both carry an explicit window — no "forever" campaign possible |

## 9. Deviations and decisions

1. **Trust Points uses a dedicated ledger, not IP-010's monetary ledger** — documented
   in-code and in the Conflict Escalation; a point is not a Real and forcing it into the money
   ledger's `Cents`/`payment_id` shape would misrepresent an undecided concept as settled money.
2. **Both Trust Points accrual/redemption and Cashback campaign parameters are
   infrastructure-only** — no rule/campaign is seeded; nothing fires until an admin configures it.
   This is the correct outcome per the brief ("very likely PARTIAL or INFRASTRUCTURE-ONLY... is
   the CORRECT outcome"), not a shortfall.
3. **Referral reward is not implemented** — attribution/anti-abuse/confirmation-on-KYC are real;
   the payout (if any) is deferred to the same Conflict Escalation as Trust Points.
4. **No frontend surface beyond what the brief allowed** — `GET /growth/points/me/balance` and
   `POST /growth/referral/me/code` exist server-side (i18n-ready shells, no hardcoded strings to
   add since responses are numeric/opaque codes); no dedicated `apps/web` screen was built in this
   pass given the scope was already large and no UI copy was required by these two thin endpoints.
   Flagged as remaining work (§10) rather than silently skipped.
5. **Two Conflict Escalations filed instead of one**, deliberately split by concern (Trust
   Points accrual vs. Cashback campaign) so each can be approved/rejected independently by the
   founder without blocking the other.

## 10. Remaining work

- Founder/product decision on both Conflict Escalations (§6) — everything downstream (accrual
  rules, redemption catalog, cashback campaigns, referral reward) is a config/data change once a
  decision exists, not a code change.
- A minimal `apps/web` points-balance widget was not built this pass (server endpoint exists,
  ready to consume) — flagged rather than rushed, since no i18n copy was specified for it beyond
  "balance," which risked inventing UI without direction.
- Cashback disbursement/settlement of `CASHBACK_PAYABLE` is explicitly out of scope until IP-009
  is unblocked — a future IP must define that settlement flow.
- No dedicated Postgres-backed e2e spec for `growth/**` — every current code path is either a
  verified no-op (empty tables) or already covered at the unit/use-case level; a future IP that
  seeds real rules should add e2e coverage exercising a live rule/campaign end-to-end.

## 11. Quality Gate fixes (post-review revision)

Independent Diff Review + Quality Gate (`IP-012-DIFF-REVIEW.md`, `IP-012-QUALITY-GATE.md`) —
verdict **PASS WITH FINDINGS**. Every finding closed in this revision:

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | MAJOR | `AttributeReferralUseCase`/`ConfirmReferralOnVerificationUseCase` unit-tested but never called from reachable code — no signup endpoint, no verification-approval consumer. | Added optional `referralCode` to `createIdentityRequestSchema`; `CreateIdentityUseCase` now calls `AttributeReferralUseCase` (best-effort, non-blocking, resolved via `ModuleRef.get(..., {strict:false})` — see design note below) when present. Added `VerificationApprovedReferralConfirmationConsumer` subscribed to the pre-existing `Verification.Approved` event, calling `ConfirmReferralOnVerificationUseCase`. Added `GET /growth/referral/me/stats` (Member-facing, observable proof) and a new e2e spec exercising the full loop. |
| 2 | MINOR | `RedeemPointsUseCase` had no DB-level concurrency guard — two concurrent redemptions could both pass the balance check. | Added `PointsLedgerRepository.lockIdentityForRedeem` (`pg_advisory_xact_lock(hashtext(identityId))`, self-releasing at transaction end). `RedeemPointsUseCase` now runs lock→read-balance→write-REDEEM inside one `db.transaction`, serializing concurrent redemptions for the same Identity. New unit test asserts lock-before-read ordering. |
| 3 | OBSERVATION | `PointsEarningRule.create`/`CashbackCampaign.create` defaulted `active` to `true` at the domain layer (inconsistent with "never on by accident," though not exploitable via the HTTP API since the Zod schemas already defaulted to `false` first). | Flipped both domain-layer defaults to `false`. |
| 4 | OBSERVATION | IP-012 spec §5 requires E2E happy/failure paths; none existed for `growth/**`. | Added `apps/api/test/integration/ip-012-trust-points-referral-cashback.e2e.spec.ts` (2 tests, see §7) once finding #1 gave it something real to exercise. |

**Design note — avoiding a circular module import.** The natural fix for finding #1 (inject
`AttributeReferralUseCase` into `CreateIdentityUseCase`'s constructor) creates a real ES-module
/ NestJS-module cycle: `GrowthModule` imports `VerificationModule` and `PaymentModule` (needed
for `ConfirmReferralOnVerificationUseCase`'s and `AccrueCashbackLiabilityUseCase`'s
dependencies), and both of those already import `IdentityModule` — so `IdentityModule` importing
`GrowthModule` back closes a loop that breaks at **module load time**, not just at Nest's DI
resolution time (`forwardRef()` alone does not fix this class of failure — confirmed by trying
it first and hitting `UndefinedModuleException`/`UnknownDependenciesException` in a real e2e
boot). The fix used instead is Nest's own documented pattern for this exact situation:
`CreateIdentityUseCase` resolves `AttributeReferralUseCase` lazily via
`ModuleRef.get(AttributeReferralUseCase, { strict: false })` at call time, which searches the
whole DI container rather than requiring a module-import edge. `IdentityModule` therefore still
does not import `GrowthModule` at all; `GrowthModule` imports `IdentityModule` only for the
pre-existing `AdminGuard` (used by `GrowthAdminController`), which is a one-directional,
non-circular edge. Confirmed by three full e2e boots during debugging (see repo history) — the
final version boots and passes clean.

## 12. Commits

`COMMIT_PENDENTE` — diff left uncommitted and unstaged for review, per instruction (git identity
is unset in this environment; no self-approval, no merge to `main`).

---

**Wave 6 status**: IP-012 implementation-complete, including a functionally-reachable Referral
loop (infrastructure + two open Conflict Escalations for Points/Cashback), Diff Review + Quality
Gate PASS WITH FINDINGS (all findings closed in this revision, §11), pending founder decision on
the two remaining Conflict Escalations.
