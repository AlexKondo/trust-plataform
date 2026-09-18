# IP-011 — Diff Review

**Reviewer:** Independent Quality/Diff Agent
**Date:** 2026-09-17
**Baseline:** `main` @ `fb5f4f6`, uncommitted working tree diff reviewed in place.

## Scope confirmed

`git status --short` / `git diff --stat` (see raw output captured during review): all changes are inside
`apps/api/src/modules/trust-score/**` (new signal registry/usecase/consumers/repository/schema),
`apps/api/drizzle/0039_ip011_*.sql` + `meta/_journal.json`, `apps/api/src/shared/database/schema/index.ts`
(schema re-export line, same pattern every prior IP touches), `docs/openapi.yaml`,
`apps/web/lib/i18n/messages/{en-US,pt-BR}.ts` (new keys only), and
`apps/api/test/integration/trs-reputation.e2e.spec.ts`. Zero touch of `payment/**`, `privacy/**`,
`notification/**`, `analytics/**`, `identity/**` business logic — the new consumers only *consume*
`TrustChangeOrder.*`/`FundsRefund.Completed` events (read-only event subscription, expected and fine).
**Scope claim in the report is accurate.**

## 1. Score/Level isolation (most important check) — CONFIRMED, no gap found

Read in full:
- `record-trust-signal.usecase.ts`
- `domain/services/trust-signal-registry.ts`
- `infrastructure/consumers/trust-signal.consumers.ts`
- `infrastructure/persistence/drizzle-trust-signal.repository.ts`
- `infrastructure/persistence/trust-signal.schema.ts`
- `trust-score.module.ts` (provider wiring)

Findings:
- `RecordTrustSignalUseCase` constructor dependencies: `TrustPassportRepository` (read-only lookup),
  `TrustSignalRepository` (writes only to `trust_signals`), `PinoLogger`. **No `TrustScoreRepository`,
  no `TrustScoreEngine`, no import of `trust-score-engine.ts`, no import of `trust_score_rules`.**
- `TrustSignalRepository` only has `insertSignal`/`listByPassportId` against the new `trust_signals`
  table — no call to `updateScore`, `insertTrustEvent`, or `insertLevelHistory` anywhere in this file
  or transitively reachable from it.
- Grep of the whole `record-trust-signal.usecase.ts` for `trust-score-engine|calculateScore|
  determineLevel|trust_score_rules|matchRule|TrustScoreEngine` — zero matches.
- The four new consumers (`trust-signal.consumers.ts`) call only `RecordTrustSignalUseCase.execute`;
  they never call `RegisterTrustEventUseCase` (the one class that legitimately touches score).
- Migration `0039` only creates `trust_signals` and adds `trust_visibility_policies.show_signals`;
  it contains zero DDL against `trust_scores`, `trust_events`, `trust_score_rules`, or
  `trust_level_history`.

**Conclusion: the isolation claim is structurally true, not just documented.** There is no code path,
direct or indirect, by which recording a Trust Signal can influence Score/Level/Badges. This satisfies
the CLAUDE.md invariant "Só o Trust Engine (TRS) altera Score/Level/Badges."

## 2. New signals recorded

`CHANGE_ORDER_SUBMITTED/APPROVED/REJECTED` (from `TrustChangeOrder.Submitted/Approved/Rejected`) and
`FUNDS_REFUND_COMPLETED` (from `FundsRefund.Completed`) — all four consumers do nothing but resolve
`payload.sellerId` and call `RecordTrustSignalUseCase.execute`, which inserts one row into
`trust_signals` (idempotent on `source_event_id`, unique index confirmed in the migration and the
Drizzle schema). No scoring side effect exists in any of the four handlers. Confirmed.

## 3. TRS-006 explainability fix

Read `drizzle-trust-score.repository.ts::listTimeline` before/after: the pre-fix version selected only
`{id, trustPassportId, identityId, eventName, sourceEventId, payload, ruleId, points, occurredAt,
createdAt}` — no description field, confirming the gap was real, not fabricated. The fix adds a
`leftJoin(trustScoreRules, eq(trustEvents.ruleId, trustScoreRules.id))` and selects
`trustScoreRules.description as reason`, falling back to `null` when no rule matched. This is a
pure read-side addition (`SELECT`/`JOIN` only) — no write path touched, no risk to Score/Level.
Confirmed genuine and correctly scoped.

## 4. `showSignals` visibility toggle

`trust_visibility_policies.show_signals boolean not null default true` — additive column, migration
uses `ADD COLUMN IF NOT EXISTS`, default `true` preserves current behavior for every existing passport.
`getSharedSignals` reuses the exact same `profileService.getVisibility(...)` / policy object the
TRS-016 mechanism already used for `showScore`/`showLevel`/`showBadges`/`showVerifications` — no
parallel visibility system was built. Defense-in-depth is real: a signal is exposed publicly only when
BOTH the row's own `visibility === 'PUBLIC'` AND the owner's `showSignals` policy are true. Confirmed.

## 5. Bilateral reviews / anti-gaming (VERIFY_ONLY)

Read `review-transaction.usecase.ts` in full. `reviewedUserId = role === 'BUYER' ? order.sellerId :
order.buyerId` — genuinely bidirectional, no restriction to buyer-only. `REVIEWABLE_STATUSES =
[COMPLETED, CLOSED, DISPUTE_RESOLVED]` gate confirmed at line 58. Duplicate-review guard confirmed both
in-app (`findReviewByOrderAndReviewer`) and at the DB layer — `marketplace-review.schema.ts` has
`uniqueIndex('idx_marketplace_review_order_reviewer').on(table.orderId, table.reviewerId)`, i.e. a real
`UNIQUE(order_id, reviewer_id)` constraint. **VERIFY_ONLY classification is correct** — this is a
real, pre-existing, correctly-implemented feature; no gap was missed, no code change was needed.

## 6. Conflict Escalation necessity

Read the escalation artifact and cross-checked its claim against `trust_score_rules` seed migrations
(`0009`, `0018`, `0020` per the report) and this repo's `INCONSISTENCIAS.md`/`04_APPROVED_PRODUCT_
DECISIONS.md`. `TrustChangeOrder.Rejected` and `FundsRefund.Completed` (voluntary, outside dispute
adjudication) are indeed absent from the approved-rules enumeration and from the product decisions doc.
This is a genuine, well-scoped gap — not an existing rule the Executor missed. The artifact correctly
identifies the mechanism for a future approved rule (a new `trust_score_rules` row keyed on the same
event name, zero code change) rather than inventing a plausible-looking penalty. **Judgment: the
escalation is legitimate caution, not avoidable friction.** Recording the events as observational
Trust Signals in the meantime is the correct, product-decision-compliant default.

## 7. Seller-only signal crediting

All four consumers credit only `payload.sellerId`. This mirrors the existing `OrderConfirmed→sellerId`
convention in `marketplace-scoring.consumers.ts`, and no preflight gap named a Member-side mirror as
in-scope. Given IP-011's explicit scope (signals for existing gap events, not a general
bilateral-signals redesign), this is a **defensible scoping choice**, correctly flagged by the report
itself as a possible follow-up rather than silently omitted. Not a gap that blocks this IP.

## 8. DI bug fix

Each of the four consumer subclasses (`ChangeOrderSubmittedSignalConsumer`,
`ChangeOrderApprovedSignalConsumer`, `ChangeOrderRejectedSignalConsumer`,
`FundsRefundCompletedSignalConsumer`) has its own explicit constructor forwarding to `super()`,
matching the pattern already used in `marketplace-scoring.consumers.ts`. Verified via a fresh module
bootstrap as part of the e2e run: all four consumers log `ConsumerRegistered` at startup and process
real events during the run (`TrustChangeOrder.Submitted` etc. observed being consumed in the e2e log)
with no DI-related crash. Fix confirmed correct.

## 9. Test re-run (independent, from scratch)

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm -r build` — clean (`apps/api` tsc build + `apps/web` next build, both succeed).
- `pnpm test` (unit) — **630 passed, 142 skipped, 0 failed** (85 files). New spec files
  (`trust-signal-registry.spec.ts`: 5 tests, `record-trust-signal.usecase.spec.ts`: 5 tests) run and
  pass. Minor discrepancy: the report's "+21 tests" framing doesn't reconcile with the observed net
  total (baseline 630 stated in the report equals the current total, while +10 new tests were
  independently observed running) — a documentation/arithmetic inconsistency in the report, not a
  code or coverage problem (MINOR).
- `pnpm test:e2e --no-file-parallelism` (via `node test/e2e-local.mjs`), run twice independently:
  - **Run 1**: 117/120 files, 764/772 tests passed. 8 failures across 3 files
    (`ip-002-i18n.e2e.spec.ts`, `pack-03.e2e.spec.ts` ×5, `pay-001.e2e.spec.ts` ×2) — every single
    failure is `Error: Test timed out in Nms`, zero assertion mismatches.
  - **Run 2** (intended as an isolated re-run of the 3 failing files, but the test runner's CLI
    ignored the file-path arguments and re-ran the full 120-file suite instead — noted as a tooling
    limitation, not a code defect): 117/120 files, 760/772 tests passed. 12 failures across a
    **completely different** set of 3 files (`ip-003-service-request-discovery-matching.e2e.spec.ts`,
    `ip-008-cancellation-dispute-refund.e2e.spec.ts`, `mrk-023-025.e2e.spec.ts`) — again all timeouts
    or `CONNECTION_DESTROYED`/"not found yet; will retry" transient errors, zero assertion mismatches.
  - No stray `postgres.exe` or locked `.pgdata-e2e` was found before either run.
  - **Conclusion**: two independent full runs each failed a small, non-overlapping, non-deterministic
    subset of files, always via timeout/connection-reset, never via a wrong assertion. This is
    consistent with host I/O contention (matches the report's own diagnosis and IP-006's documented
    Windows-specific flakiness), not a regression introduced by this diff. None of the failing files in
    either run are files this diff touches or files whose logic paths intersect with the new signal
    code (`trs-reputation.e2e.spec.ts`, the file that *was* modified for this IP, passed cleanly in
    both runs).

## Findings summary

| # | Finding | Severity |
|---|---|---|
| 1 | Score/Level isolation structurally sound, zero path found | — (confirmed clean) |
| 2 | Report's "+21 tests" claim doesn't reconcile with observed +10 net new tests | MINOR |
| 3 | E2E flakiness confirmed environmental (two runs, always different files, always timeouts/connection resets, never assertion failures) | OBSERVATION |
| 4 | `test/e2e-local.mjs` does not honor positional file-path filters (surfaced during this review, not part of the report) | OBSERVATION (tooling gap, follow-up ticket suggested, not blocking) |
| 5 | No CRITICAL/BLOCKING/MAJOR findings | — |

No production code changes were made during this review beyond running existing test/build commands.
