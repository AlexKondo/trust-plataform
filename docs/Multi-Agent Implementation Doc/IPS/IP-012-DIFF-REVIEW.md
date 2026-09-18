# IP-012 — Independent Diff Review

**Reviewer:** independent Quality/Diff Agent (not the Executor)
**Baseline reviewed:** working tree at `b13fd5f` + IP-012 uncommitted diff
**Scope of review:** re-derived, not taken from the Completion Report's claims.

## 1. Regression / scope check

`git status --short` / untracked listing confirms exactly:

**New**
```
apps/api/drizzle/0041_ip012_trust_points_benefits_referral_cashback.sql
apps/api/src/modules/growth/**  (22 files: 5 domain entities + 5 specs, 3 usecases + 3 specs,
  admin-config usecases, repository interfaces, drizzle repository, growth.schema.ts,
  growth.module.ts, 2 controllers)
docs/Multi-Agent Implementation Doc/IPS/IP-012-CONFLICT-ESCALATION-TRUST-POINTS-ACCRUAL.md
docs/Multi-Agent Implementation Doc/IPS/IP-012-CONFLICT-ESCALATION-CASHBACK-CAMPAIGN.md
docs/Multi-Agent Implementation Doc/IPS/IP-012-COMPLETION-REPORT.md
```

**Modified**
```
apps/api/drizzle/meta/_journal.json           (migration registration)
apps/api/src/app.module.ts                    (GrowthModule import)
apps/api/src/modules/payment/domain/entities/ledger-entry.ts  (+2 LEDGER_ACCOUNTS entries)
apps/api/src/modules/payment/payment.module.ts (export LedgerPostingService)
apps/api/src/shared/database/schema/index.ts   (re-export growth.schema)
```

Confirmed **zero touch** of `identity/**`, `privacy/**`, `notification/**`, `marketplace/**`
business logic, and **zero touch** of `trust_benefits`/`trust-score/**` (TRS-010/011) — the
claim of VERIFY_ONLY for Benefits is real, not just asserted.

## 2. Points ledger vs. reusing IP-010's ledger (report flag #1)

Read `points-ledger-entry.ts`, `points_ledger` migration/schema, and IP-010's
`ledger-entry.ts`/`LedgerPostingService` side by side.

**Judgment: sound, well-reasoned architectural call, not a shortfall.** IP-010's ledger models
real monetary facts (`Cents`, `currency`, `payment_id`, double-entry between monetary accounts).
A Trust Point has no approved conversion rate to Reais (confirmed — grep of every control doc
turns up no rate anywhere) and no `payment_id`. Forcing it into the monetary ledger would imply
a settled cash-equivalent that no spec authorizes, which is the opposite of what Shared
Standards §5 wants. The separate `points_ledger` reimplements the *same* invariants correctly:
append-only (no UPDATE/DELETE anywhere in the repository), idempotent via
`idx_points_ledger_source` (unique index on `source_event_id`, enforced through
`onConflictDoNothing().returning()` — DB-level, not app-level check-then-insert), and
non-negative by construction (`RedeemPointsUseCase` reads `balanceOf` and throws
`InsufficientPointsBalanceException` *before* any write; balance is always summed on-demand,
never a mutable counter). This is a legitimate alternative to "just another ledger account" —
reasonable engineers could disagree, but the reasoning is sound and the implementation matches
the stated invariants exactly.

## 3. New `LEDGER_ACCOUNTS` entries (report flag #2)

Diff of `ledger-entry.ts` is genuinely additive — two new string constants
(`CASHBACK_LIABILITY`, `CASHBACK_PAYABLE`) appended to the existing object literal; no
existing entry touched, no existing logic changed. `payment.module.ts`'s only change is
exporting the pre-existing `LedgerPostingService` provider (it existed; it was not previously
exported) so `growth` can call the single ledger write path — confirmed no manual
`LedgerEntry` construction exists anywhere in `growth/**` (`AccrueCashbackLiabilityUseCase`
calls `ledgerPosting.post({...debitAccount, creditAccount...})`, the same method every other
IP-010 consumer uses, so the debit/credit pair still balances to zero under the same posting
service that enforces that invariant for the whole codebase).

**Would anything post to these accounts today without an admin-configured campaign?** Traced
the only caller path: `AccrueCashbackLiabilityUseCase.execute` → `campaigns.findActiveAt(now)`
→ returns empty array (table ships with zero rows, migration seeds nothing) → early return
`{ accrued: false, cashbackCents: 0 }`, no `ledgerPosting.post()` call. Grepped the entire
`growth/**` tree and its only caller (`growth.module.ts` providers list) for any other
invocation site — `AccrueCashbackLiabilityUseCase` is exported from `GrowthModule` but **is not
called from any controller, event consumer, or other module in this diff**, so there is no
live trigger at all yet, configured or not. No code path posts to these accounts today. This is
consistent with the report's "verified no-op" claim (backed by `cashback.usecases.spec.ts`).

**Boundary judgment:** extending IP-010's `LEDGER_ACCOUNTS` enum from a Growth-owned IP is
within the "minimal necessary extension" allowance — it is a single, clearly-documented,
additive dimension change with no behavioral effect on any existing IP-010 code path, and it
was explicitly flagged by the Executor rather than silently done. Acceptable, not a boundary
violation.

## 4. Benefits VERIFY_ONLY (report flag #3)

`git diff --stat` confirms zero files touched under `trust-score/**` or any Benefits-adjacent
path. Independently re-read IP-012 spec §1 ("Benefits/levels entitlements") and
`trust-score.schema.ts`'s `trustBenefits` table/seed. No spec anywhere ties a Benefit's
eligibility condition to Referral count, Points balance, or Cashback — the existing JSON
condition engine evaluates only `{score, level}`. VERIFY_ONLY is a complete, correct answer for
this IP's actual scope, not scope-avoidance — there is no unaddressed entitlement gap to point
to.

## 5. Referral anti-abuse — traced, not just read

- **Self-referral**: `ReferralAttribution.create` throws `SelfReferralException` when
  `referrerIdentityId === referredIdentityId` (domain-level, object cannot be constructed).
  Since `Identity` is the platform's deduplicated identity concept (KYC/CPF-backed, from
  IDN), "same identity, different email" collapses to the same `identityId` upstream of this
  check — the check is correct at the layer it operates on.
- **DB-level race safety**: `idx_referral_attribution_referred_unique` is a genuine Postgres
  unique index on `referred_identity_id` alone. `saveAttribution` inserts via
  `.onConflictDoNothing().returning({id: ...})` and returns `inserted.length > 0`. Reasoned
  through concurrently: two simultaneous transactions inserting attributions for the same
  `referred_identity_id` will have one succeed and commit; the second's insert either blocks on
  the unique index and then silently no-ops (`ON CONFLICT DO NOTHING`) or, under looser
  isolation, fails the unique constraint and Postgres's `ON CONFLICT` clause absorbs it
  transactionally — in both cases exactly one row can ever exist and the use case surfaces the
  loser via `ReferralAlreadyAttributedException`. This is the same idempotency pattern IP-010/
  IP-011 use elsewhere in the codebase and is a correct, standard Postgres guarantee. (Reasoned
  through analytically rather than driven with a live concurrent-request test — the unique-index
  + `ON CONFLICT DO NOTHING` + `RETURNING` pattern is a well-established, race-proof primitive
  and matches the pattern already relied on elsewhere in this codebase, so an additional
  concurrency harness was judged unnecessary to establish confidence at this review depth.)
- **Confirmation reuses VRF state**: `ConfirmReferralOnVerificationUseCase` calls
  `VerificationRepository.listByPassportId` and checks
  `v.status === VERIFICATION_STATUS.APPROVED` — traced the import, it is the real,
  pre-existing VRF status enum, not a new concept.

### Finding: referral attribution is unreachable in production (new finding, not flagged by the report)

`AttributeReferralUseCase` and `ConfirmReferralOnVerificationUseCase` are registered as
providers in `growth.module.ts` and covered by unit tests, but grepping the entire `apps/api/src`
tree shows **no controller, consumer, or other module ever calls them** outside their own spec
files. Specifically:
- The registration/signup flow (`identity/**`) has zero references to `referral` (confirmed by
  grep) — there is no endpoint that accepts a referral code at signup and calls
  `AttributeReferralUseCase`.
- No event consumer subscribes to a verification-approved event to call
  `ConfirmReferralOnVerificationUseCase`.
- `GrowthMemberController` only exposes code generation (`POST /growth/referral/me/code`) and
  points balance — there is no `POST /growth/referral/attribute` or equivalent either.

The anti-abuse logic itself is real and correctly designed, but as shipped, **no user can ever
actually create a referral attribution** through any reachable path. This is different from the
deliberate, escalated no-ops (points rules / cashback campaigns, which are blocked on a genuine
missing business decision) — wiring an attribution endpoint at signup requires no undecided
number, only an integration point the Executor didn't build. The Completion Report does not
disclose this gap (§3.3 implies attribution is "real," which is true only at the unit-test
level). Classified **MAJOR** in the Quality Gate.

## 6. Cashback ledger integration

Traced `AccrueCashbackLiabilityUseCase` — the only path from a "cashback amount" to a ledger
entry, and it unconditionally goes through `LedgerPostingService.post()` with a real
`debitAccount`/`creditAccount` pair; no bare counter exists anywhere in `growth/**`. Grepped for
hard-coded percentages/amounts (`percentageBps.*=`, literal basis-point constants) across
`growth/**` — the only matches are inside validation bounds (`<= 10_000`, i.e., "at most 100%",
a sanity ceiling, not a campaign value) and test fixtures. No production code path sets a
default/fallback campaign or percentage. `cashback_campaigns` ships empty (confirmed in the
migration, no `INSERT`). Disbursement (`CASHBACK_PAYABLE` settlement) genuinely does not exist
anywhere in the diff — correctly deferred given IP-009 `BLOCKED_EXTERNAL`.

## 7. Points ledger idempotency/non-negativity — traced, not just read

- Idempotency: `idx_points_ledger_source` unique index + `saveAttribution`-equivalent
  `.onConflictDoNothing().returning()` pattern in `DrizzlePointsLedgerRepository.append` — same
  DB-level guarantee as referral attribution, confirmed by reading the repository directly.
- Non-negativity: `RedeemPointsUseCase.execute` computes `balance` first, throws before writing
  if `balance < input.points`. There is a narrow theoretical race (two concurrent redemptions
  both reading the same pre-redemption balance before either writes) that is **not** closed by a
  DB constraint the way referral/points-idempotency are — nothing in the schema enforces
  `SUM(signed_points) >= 0` at the database level. Under concurrent redemption requests for the
  same identity, both could pass the balance check and both write, taking balance negative.
  Classified **MINOR** (no live redemption trigger exists yet — catalog undecided, endpoint not
  even exposed to Members — so this is not exploitable today, but should be closed with either a
  `SELECT ... FOR UPDATE` on the identity's ledger rows or an application-level advisory lock
  before any redemption UI ships).

## 8. Both Conflict Escalations

Independently re-read `04_APPROVED_PRODUCT_DECISIONS.md` (Growth/economy section: "Approved
concepts include Trust Points, Benefits, Referral and Cashback. Implement only under IP-012
rules.") against `INCONSISTENCIAS.md` #27 ("Trust Points/Capital/Coin/Shield ficam pós-MVP (não
há spec)."). This is a real, direct contradiction between two control documents — not something
the Executor invented or could have resolved by reading more carefully elsewhere; no accrual
rate, exchange rate, or redemption catalog exists in any spec. Same finding for
`04_APPROVED_PRODUCT_DECISIONS.md`'s approval of "Cashback... under IP-012 rules" against the
complete absence of a percentage/eligible-transactions/duration/cap anywhere, compounded by
IP-009 `BLOCKED_EXTERNAL` foreclosing disbursement regardless. **Both escalations are genuinely
necessary and well-scoped** — split by concern (accrual vs. campaign) so either can be decided
independently, each stating exactly what infrastructure exists today and exactly what concrete
numbers/decision are needed to activate it.

## 9. Test re-run (independent, from scratch)

- `pnpm --filter api typecheck` — clean.
- `pnpm -r build` (`apps/api` + `apps/web`) — clean, both succeed.
- `pnpm --filter api test` (unit, no DB): **96 files passed / 37 skipped (133), 680 passed / 154
  skipped (834)** — matches the Completion Report's claimed figures exactly, growth module's 7
  new spec files/24 new tests included, zero regression.
- Full Postgres-backed e2e (`node test/e2e-local.mjs`) — see Quality Gate for final figures
  (run to completion as part of this review).
- No stray `postgres.exe` or locked `.pgdata-e2e` was present before this review started.

## 10. Confirmation pass — all four findings re-verified independently

**Scope:** second independent pass, confirming the Executor's claimed fixes to the four findings
from the original review (§1–9 above), not a full re-review. Working tree at `b13fd5f` + the new
diff described below.

### 10.1 Regression / scope check (re-derived)

```
git status --short
 M apps/api/drizzle/meta/_journal.json
 M apps/api/src/app.module.ts
 M apps/api/src/modules/identity/application/dto/create-identity.request.ts
 M apps/api/src/modules/identity/application/usecases/create-identity.usecase.spec.ts
 M apps/api/src/modules/identity/application/usecases/create-identity.usecase.ts
 M apps/api/src/modules/payment/domain/entities/ledger-entry.ts
 M apps/api/src/modules/payment/payment.module.ts
 M apps/api/src/shared/database/schema/index.ts
?? apps/api/drizzle/0041_ip012_trust_points_benefits_referral_cashback.sql
?? apps/api/src/modules/growth/**
?? apps/api/test/integration/ip-012-trust-points-referral-cashback.e2e.spec.ts
```

This is exactly the union of the original IP-012 diff plus a small, targeted footprint for the
four fixes: `create-identity.request.ts`/`.usecase.ts`/`.usecase.spec.ts` (referral wiring),
`growth/**` additions (`ModuleRef`-consumed usecase exports, the new consumer, the advisory lock,
the `active: false` defaults — all inside the already-reviewed module boundary), and the new e2e
spec. **No touch of `payment/**`/`marketplace/**` business logic** beyond what was already
reviewed and accepted in §3 of the original pass (the `payment.module.ts`/`ledger-entry.ts` diff
lines here are identical to what was already reviewed, not new). Confirmed clean.

### 10.2 Fix 1 (referral wiring) — re-verified as genuinely closed

Traced the real HTTP → domain path directly in the code, not from the Completion Report's prose:

- `create-identity.request.ts` adds an optional `referralCode` (`.regex(/^[A-Z0-9]{6,12}$/)`,
  matching the domain's `ReferralCode` shape) validated at the edge only — no business decision
  made here.
- `create-identity.usecase.ts`: after the identity is persisted, email-verification issued, and
  audit/consent recorded, `if (request.referralCode)` calls
  `this.moduleRef.get(AttributeReferralUseCase, { strict: false })` and `.execute(...)` inside a
  `try/catch` that only `logger.warn`s on failure — the signup response and everything before it
  is entirely unaffected by attribution failing. Confirmed by direct code read, not by trusting
  the comment: the `try` block is the **only** place `AttributeReferralUseCase` is invoked, and
  it wraps both the resolution (`moduleRef.get`, which throws if the provider genuinely can't be
  found) and the `.execute()` call. An unknown/malformed code cannot throw past this boundary.
- **`ModuleRef` judgment:** the cycle is real, not manufactured to justify a shortcut —
  `GrowthModule` imports `VerificationModule` and `PaymentModule` (needed for referral
  confirmation and cashback ledger posting), and both of those already import `IdentityModule`.
  Constructor-injecting `AttributeReferralUseCase` into `CreateIdentityUseCase` would require
  `IdentityModule` to import `GrowthModule`, closing `Identity → Growth → Verification/Payment →
  Identity` — a genuine ES-module load cycle, not just a DI resolution order issue. Restructuring
  which module "owns" referral confirmation to avoid this would mean either (a) moving referral
  logic to depend on nothing but `IdentityModule` (impossible — it genuinely needs
  `VerificationRepository` for confirmation and `LedgerPostingService` for cashback), or (b)
  splitting Growth into a "core" module Identity could safely import plus a "verification-aware"
  module — a real refactor for a single late-bound call site. `ModuleRef.get(...,
  {strict: false})` used at **request time only** (never during module bootstrap) is the
  documented, correct Nest pattern for exactly this shape of problem, is limited to one call
  site, is fully commented in both files explaining why, and does not add a module import that
  would reintroduce the cycle. `.get()` (not `.resolve()`) is the right choice here because
  `AttributeReferralUseCase` is a singleton-scoped provider (default Nest scope, no
  `@Injectable({ scope: Scope.REQUEST })` anywhere in `growth/**`), so there is no per-request
  instantiation concern `.resolve()` would otherwise be needed for. Risk of `ModuleRef.get`
  throwing because a target module "isn't ready": not present — `ModuleRef.get` is only ever
  called from inside `execute()`, i.e. during HTTP request handling, which by construction can
  only happen after `app.init()` has fully resolved the whole module graph (Nest does not start
  accepting requests mid-bootstrap). **Judgment: legitimate, narrowly-scoped, correctly
  implemented use of `ModuleRef` to break a real cycle — not a red flag, not a paper-over of a
  deeper architectural problem.**
- `verification-approved.consumer.ts` (`VerificationApprovedReferralConfirmationConsumer`):
  subscribes to `Verification.Approved` (pre-existing VRF event, confirmed no changes to
  `verification/**`), extends `EventConsumer` exactly like every other consumer in the codebase
  (`trust-signal.consumers.ts`, `order-lifecycle.consumers.ts`, `notification.consumers.ts`, etc.
  — all read directly and compared side by side), relies on the platform's outbox-relay dedupe
  (`(consumerName, eventId)`) for idempotency rather than inventing its own, and does exactly one
  thing: `await this.confirmReferral.execute(identityId, ...)`. No scope creep into any other
  verification-approval side effect. Confirmed live in the full e2e run (§10.4): log line shows
  `"context":"OutboxRelayService"..."consumerName":"growth.confirm-referral-on-verification-approved"..."result":"SUCCESS"`
  firing in the same request/event chain as the pre-existing `tps.sync-verification-approved`,
  `trs.score-verification-approved`, and `ntf.verification-approved` consumers for the same
  `Verification.Approved` event — genuinely wired into the existing event fan-out, not a parallel
  or divergent mechanism.

**Finding #1: genuinely closed.** No BLOCKING issue found in the wiring, the `ModuleRef` design,
or the best-effort/non-blocking failure semantics.

### 10.3 New e2e spec — re-verified as genuinely reachable and adequate

Read `ip-012-trust-points-referral-cashback.e2e.spec.ts` in full (245 lines). Both tests use real
`app.inject()` HTTP calls against a real Postgres-backed Nest app (`createApp()` + `app.init()`),
no mocking of any use case, repository, or consumer:

- **Happy path**: generates a real referral code via `POST /growth/referral/me/code`, signs up a
  second identity with that code in the request body, confirms `confirmedReferrals` is `0`
  immediately after signup (PENDING, not yet counted), runs a **real** KYC flow (create
  verification → upload two evidence files → admin review → admin approve, all real HTTP calls
  through the pre-existing VRF endpoints), drains the outbox relay, and asserts
  `confirmedReferrals` becomes `1`. This is a genuine end-to-end exercise of exactly the two fixed
  paths (signup→attribution, verification-approval→confirmation), not a shortcut.
- **Failure path**: `referralCode: 'ZZZZZZ99'` (well-formed but non-existent) on signup asserts
  `201` — signup succeeds regardless. Directly exercises the "unknown code never blocks signup"
  claim over real HTTP, not just at the unit level.
- **Self-referral / one-time-use claim re-examined:** the spec's own comment says these remain
  unit/domain-level only "since the public API surface can't reach those cases directly." Traced
  this independently: a referral code can only be generated by `POST
  /growth/referral/me/code`, which requires an authenticated (i.e., already-signed-up) identity.
  Attribution, in turn, only ever happens at `POST /api/v1/identities` (signup) via the
  `referralCode` field on a *not-yet-existing* identity. There is no second, standalone
  "attribute a referral" endpoint. Consequently: (a) self-referral would require an identity to
  pass its own code at its own signup — but that code cannot exist yet at signup time (it can
  only be generated after the identity exists and authenticates), so self-referral is
  **structurally unreachable** via the real HTTP surface, exactly as claimed; (b) attribution
  happens exactly once per identity, at the one moment that identity is created — there is no
  code path that could call `AttributeReferralUseCase` twice for the same referred identity
  through the live API, so the `idx_referral_attribution_referred_unique` DB race case is also
  correctly unreachable via e2e today. **The Executor's reasoning is accurate, not a
  rationalization** — an e2e test for these two cases is not currently reachable given the wiring
  as built, and the existing unit/domain coverage (`referral.spec.ts`,
  `referral.usecases.spec.ts`) is the correct place for them.

**Finding #4 (OBSERVATION): genuinely closed** — the required e2e spec now exists and covers
exactly the two paths that were previously dead code, with an accurate (not hand-waved)
justification for what remains unit-level.

### 10.4 Fix 2 (points redemption concurrency) — re-verified as genuinely closed

Read `RedeemPointsUseCase.execute` (`points.usecases.ts`) and
`DrizzlePointsLedgerRepository.lockIdentityForRedeem` (`drizzle-growth.repository.ts`) directly:

```ts
return this.db.transaction(async (tx) => {
  await this.ledger.lockIdentityForRedeem(input.identityId, tx);   // 1. lock first
  const balance = await this.ledger.balanceOf(input.identityId, tx); // 2. read after lock
  if (balance < input.points) { throw ...; }
  ...
  const inserted = await this.ledger.append(entry, tx);             // 3. write, still locked
});
```

```ts
async lockIdentityForRedeem(identityId: string, executor: DatabaseExecutor): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${identityId}))`);
}
```

- **Lock-before-read ordering:** confirmed correct — the lock call is the first statement inside
  the transaction, strictly before `balanceOf` executes. A useless "lock-after-read" ordering
  would have been a real defect; it is not present.
- **Transaction-scoped:** `pg_advisory_xact_lock` (the `_xact_` variant, not the session-level
  `pg_advisory_lock`) releases automatically at `COMMIT`/`ROLLBACK` — no manual unlock exists or
  is needed anywhere in the method, and there is no code path that could leak a held lock on an
  exception (the exception thrown for insufficient balance happens inside the same
  `db.transaction` callback, so it rolls back and releases the lock the same way a normal error
  would).
- **Key scoping:** `hashtext(identityId)` — scoped to exactly one identity, not a global lock.
  Two concurrent redemptions for *different* identities do not serialize against each other;
  only two concurrent redemptions for the *same* identity do. This closes the actual race
  (both readers seeing the same pre-redemption balance) without introducing a
  system-wide throughput bottleneck. `executor` is required (not an optional/default `db`),
  correctly preventing a caller from accidentally taking the lock outside a real transaction,
  which would provide no protection.
- Given the ordering, scoping, and auto-release are all directly confirmed by reading the
  implementation (not merely accepting the unit test's assertion or the code comment), and the
  full e2e suite (§10.5) exercises this code path with zero regressions, an additional
  throwaway concurrency harness was judged unnecessary to add further confidence at this
  depth — the `pg_advisory_xact_lock`+read-after-lock pattern is a well-established, correct
  Postgres primitive for exactly this shape of problem, and the code matches the pattern exactly.

**Finding #2 (MINOR): genuinely closed.**

### 10.5 Fix 3 (OBSERVATION — `active` defaults) — re-verified as genuinely closed

Read both entities directly:

- `points-earning-rule.ts` line 50: `active: input.active ?? false,` with an in-code comment
  `// "never on by accident": omitting `active` must mean OFF, not ON.`
- `cashback-campaign.ts` line 46: identical pattern, identical comment.

Both domain-level defaults are now `false`, matching the admin Zod schemas and the documented
intent literally, closing the gap between "not exploitable via HTTP today" and "correct by
construction for any future direct caller."

**Finding #3 (OBSERVATION): genuinely closed.**

### 10.6 Test re-run (independent, from scratch)

- No stray `postgres.exe` process or `.pgdata-e2e` directory found before this run.
- `pnpm typecheck` (both `apps/api` and `apps/web`) — **clean**.
- `pnpm lint` — **clean** (`eslint .`, zero errors/warnings).
- `pnpm -r build` — **clean**, both apps build successfully.
- `pnpm --filter api test` (unit, no DB): **96/134 files, 684/840 tests** passed (38 files / 156
  tests skipped — the e2e specs gated on `TEST_DATABASE_URL`).
- `node test/e2e-local.mjs --no-file-parallelism` (full Postgres-backed e2e, run to completion):
  **134/134 files passed, 840/840 tests passed, exit code 0** — exactly matching the Executor's
  claim of 134/134 files, 840/840 tests, and matching the prior baseline of 133 files/834 tests
  plus the one new e2e spec file/6 new tests(referral happy-path + failure-path, embedded in the
  existing file count/test count growth), zero regressions. Live log output during this run
  independently confirms the `growth.confirm-referral-on-verification-approved` consumer firing
  successfully as part of the real `Verification.Approved` event fan-out (see §10.2).
- No stray `postgres.exe` process or leftover `.pgdata-e2e` directory found after the run
  completed.

### 10.7 Overall confirmation-pass judgment

All four original findings — the one MAJOR and the one MINOR in particular — are **genuinely
closed**, not just asserted closed. The referral attribution machinery is now demonstrably
reachable end-to-end through real HTTP calls and a real async event consumer (confirmed in a live
test run, not only by reading the code), the `ModuleRef` design is a legitimate, narrowly-scoped,
correctly-implemented solution to a real module-cycle problem rather than a workaround for a
deeper architectural flaw, the redemption concurrency guard is correctly ordered, transaction-
scoped, and identity-scoped, and both OBSERVATIONs are resolved with matching code. No new issues
were introduced by the fixes; the file footprint matches the claim exactly with no scope creep
into `payment/**`/`marketplace/**` business logic beyond the already-reviewed additive ledger
accounts. See Quality Gate for the final verdict.
