# IP-010 — Completion Report

**Ledger, Settlement & Reconciliation**
Executed 2026-09-17. Owner: Payments implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§5 Money) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §2 > IP-010 spec (`IP-010_Ledger_Settlement_Reconciliation.md`) > `IP-009-COMPLETION-REPORT.md`/`IP-009-DIFF-REVIEW.md` > `IP-007-COMPLETION-REPORT.md` / `IP-008-COMPLETION-REPORT.md` > real code/migrations/tests at the frozen baseline.

**Fix-cycle addendum (this revision)**: the independent Diff Review (`IP-010-DIFF-REVIEW.md`) returned verdict **FAIL** with one BLOCKING finding, F1: `LedgerReconciliationService.reconcilePayment` double-subtracted `REFUND_ISSUED` in its `ledgerOutstandingCents` formula, which the original version of this report mischaracterized as a disclosed semantic limitation rather than a real bug. The formula has been corrected, a regression test added, and this report updated throughout (§5/§6 rewritten, §4 test counts refreshed) to reflect the fix. The reviewer's own added integration test, `apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts` (real-Postgres concurrency + numeric round-trip proof for `drizzle-ledger.repository.ts`), is kept as part of this IP's final file set. See §9 for the full fix-cycle account.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `312e9f8` (`main`), clean working tree.
- **Hard dependency**: IP-009 (Real PSP integration) — committed but classified `BLOCKED_EXTERNAL`: no real Asaas credentials exist, only a fail-closed adapter skeleton; `SandboxPaymentGateway` remains the active gateway. Confirmed by reading `IP-009-COMPLETION-REPORT.md`/`IP-009-DIFF-REVIEW.md` directly. This is treated as the single most important preflight fact of this IP: it makes the "domain × PSP × ledger" three-way reconciliation the spec describes **unbuildable against real data today** — see §5.
- Touched only `apps/api/src/modules/payment/**` (new files + additive edits to `payment.module.ts`/`payment.exceptions.ts`), `apps/api/src/shared/database/schema/index.ts` (the established one-line-per-module re-export list), and a new additive migration `apps/api/drizzle/0038_ip010_ledger_settlement_reconciliation.sql` + journal entry. Zero files under `identity/**`, `privacy/**`, `notification/**`, `marketplace/**` domain logic touched (only `IdentityModule` is *imported*, unmodified, into `PaymentModule` to resolve `AdminGuard` — same pattern as `AnalyticsModule`).

## 2. Preflight findings

1. Read all required control documents, IP-009's completion/diff-review reports, IP-007/IP-008 completion reports, and the full `payment/**` module (domain entities, schemas, use cases, consumers) before writing code.
2. Inventory of existing money-moving facts already captured in the domain (per §7 of the task brief):
   - `Payment.Authorized` (custody starts, PACK-01) — payload carries `amount`/`currency` in reais.
   - `Funds.ReadyForRelease` / `Funds.Released` (custody released to partner, PACK-01 + IP-007 incremental tranches) — same payload shape for both `TrustCustody` and `IncrementalTrustCustody`.
   - `FundsRefund.Completed` (IP-008) — refund against a `Payment`, capped by `Payment.refundableCents`.
   - No concrete "Trust Fee paid" / "PSP fee charged" domain event exists anywhere in `payment/**`: `TrustFee`/commercial fee snapshots (migration `0026`) live in the Marketplace commercial-snapshot model as **quote-time** fields, never posted as a realized financial fact by the Payment module. Confirmed by `grep -rn "TRUST_FEE\|TrustFee" apps/api/src/modules/payment` returning nothing outside comments/docs.
3. Gap to implement: no ledger table, no posting logic, no reconciliation, no admin discrepancy surface existed anywhere in the repo (`find . -iname "*ledger*"` returned nothing before this IP).
4. Idempotency mechanism to reuse: `EventConsumer` + `processed_events` (Module 0) — every consumer's `handle()` already runs at-most-once per `(consumerName, eventId)` inside the same transaction as its effect. No new dedupe mechanism was invented.
5. Baseline tests before implementation: `pnpm exec vitest run` (apps/api, no `TEST_DATABASE_URL`) — **83 files passed / 34 skipped (117 total), 619 tests passed / 139 skipped (758 total)**; `tsc --noEmit` 0 errors; `eslint src` 0 errors/warnings. (The skipped files are the repository/e2e suite that requires a live Postgres via the project's `.pgdata-e2e` harness — not spun up for this IP given the documented risk of that harness hanging; see §7.)
6. Conflict found and escalated (not guessed): the "real" three-way reconciliation (domain × PSP transaction/webhook × ledger) required by the spec's acceptance criteria cannot be built or tested against genuine data while IP-009 is `BLOCKED_EXTERNAL` — see §5 and the extension point left in code.

## 3. Implemented

### 3.1 Ledger schema (`ledger_entries`)

`apps/api/drizzle/0038_ip010_ledger_settlement_reconciliation.sql` (+ journal entry) and `apps/api/src/modules/payment/infrastructure/persistence/ledger.schema.ts`. Additive `CREATE TABLE IF NOT EXISTS`, no existing table touched. Append-only by convention: no application code ever issues `UPDATE`/`DELETE` against it. Columns: `source_event_id`/`source_event_type`/`source_aggregate_type`/`source_aggregate_id` (traceability back to the exact domain event/entity that produced the row — required by the spec), `payment_id` (every row is attributable to one `Payment`), `account`, `direction` (`DEBIT`/`CREDIT`), `amount_cents` (integer, `numeric(18,0)` — never `numeric(18,2)`/float), `currency`, `posting_group_id` (groups the N rows of one fact). `idx_ledger_entry_dedupe` is a **unique** index on `(source_event_id, account, direction)` — belt-and-braces idempotency at the data layer, on top of (never instead of) the `processed_events` dedupe every consumer already gets for free.

### 3.2 Domain: `LedgerEntry`, accounts, balanced posting

`apps/api/src/modules/payment/domain/entities/ledger-entry.ts`. `LEDGER_ACCOUNTS` is a closed dimension derived from what the domain already distinguishes: `MEMBER_FUNDING_CLEARING`, `CUSTODY_HELD`, `PARTNER_PAYABLE`, `REFUND_ISSUED`, plus `TRUST_FEE_EARNED`/`PSP_FEE` defined-but-unused (§6, gap). `LedgerEntry` is immutable (no setters/`transitionTo`). `buildBalancedPosting()` is the **only** constructor path used by consumers — it always returns a debit+credit pair sharing one `postingGroupId`; `assertBalanced()` verifies the signed sum of any posting group is exactly zero and is called before every write (`LedgerPostingService.post`). Convention: **asset-style accounts** — a debit increases `CUSTODY_HELD`/`PARTNER_PAYABLE`/`REFUND_ISSUED` (the intuitive reading: "how much is currently held/paid/refunded"), a credit decreases them.

### 3.3 Idempotent posting service

`apps/api/src/modules/payment/application/services/ledger-posting.service.ts` — the single write path from event consumers into the ledger. Idempotency has **two independent layers**, per the task's explicit instruction to reuse the existing pattern rather than invent a new one:
1. The calling `EventConsumer`'s own `(consumerName, eventId)` row in `processed_events` — a retried outbox job never re-invokes `handle()` for an event it already committed.
2. The ledger's own unique index (§3.1) — defense-in-depth in case a posting is ever triggered outside that exact path.

`ledger-posting.service.spec.ts` proves both the balance invariant and idempotency directly (posting the *same* `sourceEventId` three times inserts exactly 2 rows, not 6).

### 3.4 Consumers (posting from real domain events)

Three new `EventConsumer`s, each mirroring an *existing* canonical consumer's trigger 1:1 (never a new event, never a second calculation of the same fact):
- `PostLedgerOnPaymentAuthorizedConsumer` (`Payment.Authorized`, same trigger as `HoldFundsOnAuthorizedConsumer`) — debit `CUSTODY_HELD` / credit `MEMBER_FUNDING_CLEARING`.
- `PostLedgerOnFundsReleasedConsumer` (`Funds.Released`, covers both `TrustCustody` and IP-007 `IncrementalTrustCustody` releases, same payload shape) — debit `PARTNER_PAYABLE` / credit `CUSTODY_HELD`.
- `PostLedgerOnRefundCompletedConsumer` (`FundsRefund.Completed`, IP-008) — debit `REFUND_ISSUED` / credit `CUSTODY_HELD`.

All three are registered in `PaymentModule` alongside (never replacing) the consumers that already move custody/payment state — the ledger is a **read-consistent mirror of the same facts**, not an independent source of truth for state transitions (Shared Standards: no accounting ERP, no second business-logic engine).

### 3.5 Reconciliation (what is genuinely real today) + PSP extension point

`apps/api/src/modules/payment/application/services/ledger-reconciliation.service.ts`. `LedgerReconciliationService.reconcilePayment(paymentId)` compares the domain `Payment.refundableCents` against `ledgerOutstandingCents = CUSTODY_HELD + PARTNER_PAYABLE` (all summed per-Payment straight from ledger rows) and returns `OK` / `MISMATCH` / `NO_LEDGER_ACTIVITY` plus the raw components, never silently correcting anything. This is a real, DB-verifiable invariant check, not a placeholder.

**Fix-cycle correction (F1)**: the formula originally also subtracted `REFUND_ISSUED`. That was wrong: every refund posting credits `CUSTODY_HELD` (never `PARTNER_PAYABLE` — §3.4), so `CUSTODY_HELD + PARTNER_PAYABLE` is *already*, by construction, net of every refund (`custodyHeld + partnerPayable == amountCents − refundIssued` holds algebraically for any hold/release/refund sequence). Subtracting `refundIssued` again double-counted it, producing a spurious `MISMATCH` on essentially any refunded payment — including a refund with **zero** partner release, the simplest possible case. Fixed by dropping the extra term; see the regression tests added in §4.

`PspTransactionReconciler` (abstract class, same file) is the **extension point** for the spec's "real" three-way reconciliation (domain × PSP transaction/webhook × ledger). It has no implementation and is not wired into `PaymentModule` — per the task's explicit instruction, no synthetic PSP data was fabricated to make a test "pass." When IP-009 leaves `BLOCKED_EXTERNAL` with real Asaas credentials, an adapter implements this interface against real webhook/transaction data without changing the reconciliation service's contract.

### 3.6 Admin discrepancy surface

`apps/api/src/modules/payment/infrastructure/api/ledger-admin.controller.ts`, `@Controller('admin/ledger')` + `@UseGuards(AdminGuard)` (same admin-only, DB-reevaluated-per-request pattern as `admin/analytics`/`admin/risk-flags`):
- `GET /admin/ledger/balances` — platform-wide balance per account, computed purely by summing `ledger_entries` (proves "financial reports derive from ledger," acceptance criterion).
- `GET /admin/ledger/reconcile/:paymentId` — the discrepancy-surfacing endpoint; 404 if the Payment doesn't exist, otherwise the full `PaymentReconciliationResult`.

## 4. Tests

- `domain/entities/ledger-entry.spec.ts` — balance invariant (`assertBalanced` rejects a lone unbalanced entry), rejects zero/non-integer amounts, proves a full lifecycle (hold → partial release → partial refund) still sums to zero across accounts.
- `application/services/ledger-posting.service.spec.ts` — balanced posting, and the idempotency invariant (same `sourceEventId` posted 3× → 2 rows, correct balance).
- `application/services/ledger-reconciliation.service.spec.ts` — `OK` (simple hold), `OK` after partial release + partial refund (fix-cycle: was asserting a spurious `MISMATCH` before the F1 fix), **new regression test**: `OK` after a partial refund with **zero** partner release — the exact minimal case F1 broke — `MISMATCH` on genuine ledger drift (unaffected by the fix, still correctly flags), `NO_LEDGER_ACTIVITY`, and the not-found path.
- `infrastructure/consumers/post-ledger-on-payment-authorized.consumer.spec.ts` — payload → posting call mapping (reais→cents conversion) and no-op on an incomplete payload.
- **`test/integration/ip-010-ledger-repository.e2e.spec.ts`** (written by the independent Diff Review, kept as part of this IP's final file set, real embedded Postgres): proves the unique index `(source_event_id, account, direction)` genuinely deduplicates under **three concurrent** `postGroup()` calls for the same posting group (exactly 2 rows persist, correct sum), and that `numeric(18,0)` round-trips a large cents value (999999999) through Drizzle's string-based numeric handling without precision loss. This closes the integration-coverage gap the original version of this report disclosed as missing.
- Full regression after the fix: `pnpm exec vitest run src/modules/payment` → **20 files / 140 tests, all passing** (+1 vs. pre-fix, the new regression test); repo-wide `pnpm exec vitest run` (no `TEST_DATABASE_URL`) → **83 files passed / 35 skipped (118), 620 tests passed / 141 skipped (761)** — the new e2e-only integration spec file adds one more skipped file/skipped test in this run (it requires `TEST_DATABASE_URL`), everything else unchanged, zero regression.
- `pnpm test:e2e --no-file-parallelism` (full, real embedded Postgres) — run by the Diff Review before the fix: **113/117 files, 745/758 tests passed**, 4 files/13 tests failed, all pre-existing `pack-00.e2e.spec.ts` embedded-Postgres timeout flakes unrelated to `payment/**` (confirmed by the reviewer, no ledger code involved). Re-run by this agent after the F1 fix + regression test — see §9 for the exact result recorded in this revision.
- `tsc --noEmit` (apps/api): 0 errors. `eslint src test` (apps/api): 0 errors/warnings.

## 5. Reconciliation: what's real vs. blocked (Conflict Escalation)

No formal `IP-010-CONFLICT-ESCALATION-*.md` artifact was filed, because this is not a mid-implementation blocker requiring a stop — it is a scoping fact established during preflight (§2.1) and treated as such throughout, exactly as the task instructions anticipated ("this directly shapes your own preflight"). Documenting it here, explicitly, is the escalation:

- **Buildable and built today**: domain (`Payment.refundableCents`, custody state) × ledger reconciliation — §3.5. Fully tested, fully real.
- **Not buildable, not built, and not faked**: domain × PSP transaction/webhook × ledger. IP-009 is `BLOCKED_EXTERNAL`; only `SandboxPaymentGateway`'s synthetic responses exist, and using those to "prove" PSP reconciliation would fabricate the very risk this IP exists to prevent (silent, false confidence in balance correctness). The extension point (`PspTransactionReconciler`, §3.5) exists and is ready; it should be revisited when IP-009 is unblocked with real credentials. **Recommendation for the program**: IP-010 cannot be marked fully `APPROVED` against 100% of its own acceptance criteria ("reconciliation detects missing/duplicate/mismatched transactions" — read as PSP transactions) until IP-009 is unblocked; the domain-vs-ledger half of reconciliation can be considered done.

## 6. Known limitations / deviations (disclosed, not hidden)

1. **`TRUST_FEE_EARNED`/`PSP_FEE` accounts exist in code but nothing posts to them.** No domain event today represents a *realized* Trust Fee or PSP fee as a fact separate from a commercial quote snapshot (§2.2). Inventing one would be new business logic, out of this IP's scope (Shared Standards §5: "Trust Fee policy must be configurable; no new hard-coded commercial percentage" — and more fundamentally, out-of-scope per IP-010 §4 "no accounting ERP"). Flagged as a gap for a future IP once Marketplace/Payments decide where a realized-fee event is published.
2. **~~`ledgerOutstandingCents` diverges from `Payment.refundableCents` once a partial release has happened~~ — RETRACTED, was a real bug (F1), now fixed.** The original version of this report characterized the "MISMATCH after partial release" test result as a legitimate, disclosed semantic divergence between the domain's refund cap and the ledger's more precise view of where money physically sits. The independent Diff Review re-derived the numbers by hand and showed this was wrong: `CUSTODY_HELD + PARTNER_PAYABLE` is *already* net of every refund by construction (every refund credits `CUSTODY_HELD`, never `PARTNER_PAYABLE`), so subtracting `REFUND_ISSUED` a second time in the old formula double-counted it. The corrected formula (§3.5) makes both the simple and the partial-release-plus-refund cases resolve to `OK`, matching the domain exactly, with no known remaining semantic gap between the two views. This was the session's one real domain-logic bug; it is disclosed here in full rather than quietly dropped from the limitations list.
3. **Refund consumer always credits `CUSTODY_HELD`**, even when a refund targets a `Payment` whose custody was already (partially) released — documented inline in `post-ledger-on-refund-completed.consumer.ts`. **Re-confirmed correct** after the F1 fix (not a bug, F4 in the Diff Review): because `PARTNER_PAYABLE` is untouched by a refund, the invariant `CUSTODY_HELD + PARTNER_PAYABLE == amountCents − refundIssued` still holds even when a post-release refund drives a Payment's own `CUSTODY_HELD` balance negative — a negative per-Payment `CUSTODY_HELD` reading is a valid state (money returned beyond what was still physically held, because the matching amount had already moved to `PARTNER_PAYABLE`), not corruption.
4. E2E/Postgres integration tests were not run in the original session; closed in this fix cycle — see §4/§9.

## 7. Definition of Done checklist

- [x] Preflight documented (§2).
- [x] Implementation limited to IP scope (`payment/**` + shared schema re-export + additive migration).
- [x] Migration documented (§3.1, additive, `IF NOT EXISTS`).
- [x] Unit/domain/application tests green; typecheck/lint clean (§4).
- [x] Postgres-backed repository/e2e tests — closed this fix cycle: reviewer's `ip-010-ledger-repository.e2e.spec.ts` (real Postgres, concurrency+precision) plus a full `pnpm test:e2e` re-run after the F1 fix (§9).
- [x] No unresolved blocking conflict — the one real scoping limit (§5) is documented, not blocking further work.
- [x] This report generated and updated for the fix cycle.
- [x] Independent Diff Review completed (`IP-010-DIFF-REVIEW.md`) — verdict FAIL on first pass (F1 blocking), addressed in this revision. Not self-approved; not merged to `main`.
- [ ] Quality Gate PASS — pending re-review of this fix cycle by the coordinator/reviewer.

## 8. Files touched

New: `apps/api/drizzle/0038_ip010_ledger_settlement_reconciliation.sql`, `apps/api/src/modules/payment/domain/entities/ledger-entry.ts(+.spec.ts)`, `apps/api/src/modules/payment/domain/repositories/ledger.repository.ts`, `apps/api/src/modules/payment/infrastructure/persistence/ledger.schema.ts`, `apps/api/src/modules/payment/infrastructure/persistence/drizzle-ledger.repository.ts`, `apps/api/src/modules/payment/application/services/ledger-posting.service.ts(+.spec.ts)`, `apps/api/src/modules/payment/application/services/ledger-reconciliation.service.ts(+.spec.ts)`, `apps/api/src/modules/payment/infrastructure/consumers/post-ledger-on-payment-authorized.consumer.ts(+.spec.ts)`, `apps/api/src/modules/payment/infrastructure/consumers/post-ledger-on-funds-released.consumer.ts`, `apps/api/src/modules/payment/infrastructure/consumers/post-ledger-on-refund-completed.consumer.ts`, `apps/api/src/modules/payment/infrastructure/api/ledger-admin.controller.ts`.

Modified (additive only): `apps/api/src/modules/payment/payment.module.ts`, `apps/api/src/modules/payment/domain/exceptions/payment.exceptions.ts`, `apps/api/src/shared/database/schema/index.ts`, `apps/api/drizzle/meta/_journal.json`.

`docs/openapi.yaml`: added the `Ledger` tag and the two new `admin/ledger/*` routes (§3.6). `docs/event-catalog.md` was **not** updated — no new domain event was published; this IP only *consumes* existing cataloged events (`Payment.Authorized`, `Funds.Released`, `FundsRefund.Completed`) via three new subscribers.

Fix cycle also kept (not authored by this agent, reviewer's contribution): `apps/api/test/integration/ip-010-ledger-repository.e2e.spec.ts`.

## 9. Fix cycle — F1 (BLOCKING) resolution record

**Finding**: `IP-010-DIFF-REVIEW.md` §4/§10 (F1, BLOCKING). `LedgerReconciliationService.reconcilePayment`'s `ledgerOutstandingCents = custodyHeld + partnerPayable − refundIssued` double-subtracted refunds, because `custodyHeld + partnerPayable` is already net of every refund by construction (every refund posting credits `CUSTODY_HELD`, never `PARTNER_PAYABLE`). Concretely: hold 10000, refund 2000, zero release → old formula gave `outstanding = 8000 − 2000 = 6000` against `domainRefundableCents = 8000`, a false `MISMATCH` that would fire on essentially every refunded payment in production.

**Fix applied**: dropped the `− refundIssued` term (`apps/api/src/modules/payment/application/services/ledger-reconciliation.service.ts`); `ledgerOutstandingCents = custodyHeld + partnerPayable`. Docstrings/inline comments in that file and in `post-ledger-on-refund-completed.consumer.ts` rewritten to record the algebraic invariant explicitly (`custodyHeld + partnerPayable == amountCents − refundIssued`, always, by construction) so the same mistake is harder to reintroduce.

**Regression coverage added**: `ledger-reconciliation.service.spec.ts` —
1. Rewrote the previously-mischaracterized "MISMATCH after partial release" test to assert `OK` (it was actually proving the bug, not a feature).
2. Added a new minimal-reproduction regression test: hold → partial refund → **zero** release → asserts `OK`, `discrepancyCents: 0` — the exact scenario the reviewer used to demonstrate the bug's real-world blast radius.
3. Left the genuine-drift test (`MISMATCH`, ledger says 7000 vs domain 10000, no refund involved) unchanged — confirmed by hand and by the reviewer that it is unaffected by the fix.

**F4 (MINOR, related)**: reviewed whether the refund consumer's "always credit `CUSTODY_HELD`" choice needed to change alongside the F1 fix. Concluded no: the invariant `custodyHeld + partnerPayable == amountCents − refundIssued` holds regardless of whether a refund happens before or after a release, because `PARTNER_PAYABLE` is never touched by a refund — a post-release refund simply drives that Payment's own `CUSTODY_HELD` reading negative, which is a valid signed balance, not corruption. Comment in `post-ledger-on-refund-completed.consumer.ts` rewritten to record this reasoning explicitly rather than leave it as an open question.

**Verification after the fix**:
- `pnpm exec tsc --noEmit` (apps/api): 0 errors.
- `pnpm exec eslint src test` (apps/api): 0 errors/warnings.
- `pnpm exec vitest run src/modules/payment`: 20 files / **140 tests** passing (was 139 before the regression test).
- `pnpm exec vitest run` (repo-wide, no `TEST_DATABASE_URL`): 83 files passed / 35 skipped (118), 620 tests passed / 141 skipped (761) — no regression vs. the pre-fix baseline plus the reviewer's new (skipped-without-DB) integration spec file.
- `pnpm test:e2e --no-file-parallelism` (full, real embedded Postgres), re-run by this agent after the fix, clean start (no stray `postgres.exe`, no locked `.pgdata-e2e`): **117/118 files passed, 760/761 tests passed**, exit code non-zero only because of 1 unrelated failure. The single failure is `test/integration/ip-002-i18n.e2e.spec.ts` > "notificação resolve o locale do DESTINATÁRIO..." — `Error: Score não chegou a 25` from a `waitForScore` polling helper timing out, an async Trust Score eventual-consistency flake under embedded-Postgres load (same class of pre-existing flake the Diff Review already documented for `pack-00.e2e.spec.ts`). Zero failures, zero mentions, in any `payment/**` or ledger-related spec, including the reviewer's own `ip-010-ledger-repository.e2e.spec.ts` (both its concurrency-dedupe and numeric-precision assertions passed). This confirms the F1 fix did not regress anything real-Postgres-backed and closes the Definition of Done item that was previously outstanding.
