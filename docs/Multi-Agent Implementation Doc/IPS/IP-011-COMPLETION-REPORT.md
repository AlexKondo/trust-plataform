# IP-011 — Completion Report

**Trust Signals & Reputation Completion**
Executed 2026-09-17. Owner: Trust implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` (Trust/reputation section) > IP-011 spec (`IPS/IP-011_Trust_Signals_Reputation_Completion.md`) > IP-003/IP-006 completion reports (hard dependencies) > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `fb5f4f6` (`main`, tip after IP-010). Clean working tree.
- **Hard dependencies**: IP-003 (Service Request/Discovery/Matching) and IP-006 (Field Execution & Trust Evidence) — both committed on `main`, confirmed present (`0030_ip003_service_request_discovery_matching.sql`, `0037_ip006_field_execution_evidence.sql`).
- **Baseline unit tests**: `pnpm typecheck`/`pnpm lint` clean; unit suite **85 files / 630 passed, 142 skipped (772 total)** before any new test was added — skipped count is all e2e specs gated on `TEST_DATABASE_URL`.

## 2. Preflight findings

Delegated a read-only research pass across the TRS module, the marketplace review/change-order code, and the payment refund path (see prompt in the agent transcript). Confirmed, by reading the real code, not assuming:

1. **Bilateral reviews already work.** `review-transaction.usecase.ts:66` derives `reviewedUserId` from the caller's role (`BUYER→sellerId`, `SELLER→buyerId`); nothing restricts the endpoint to buyers. `04_APPROVED_PRODUCT_DECISIONS.md:60` explicitly names this as intentional. **Classified VERIFY_ONLY — not rebuilt.**
2. **Anti-gaming already has two real gates.** `REVIEWABLE_STATUSES` (COMPLETED/CLOSED/DISPUTE_RESOLVED only) and a DB unique index `(order_id, reviewer_id)` plus an app-level pre-check prevent duplicate/premature reviews. No minimum-order-value gate exists — noted as a gap but **not invented**, since no approved threshold exists anywhere in the product decisions.
3. **Trust Event catalog gap, confirmed against `trust_score_rules` seeds** (`0009`, `0018`, `0020`): `TrustChangeOrder.Submitted/Approved/Rejected` and `FundsRefund.Completed` (voluntary refund, outside `MarketplaceDispute.Resolved`) are emitted by the domain but have **zero** trust-score consumer and **zero** `trust_score_rules` row. Order lifecycle steps (Scheduled/Started/etc.) are also unscored — read as an intentional scope decision (avoid rewarding routine steps), not touched.
4. **TRS-006 explainability gap, confirmed by reading the endpoint.** `GET /trust-scores/me/timeline` returned only `{id, eventName, points, occurredAt}` — no human-readable reason, even though `trust_score_rules.description` already holds one. Genuine gap, in scope for this IP (pure additive fix, no new rule).
5. **TRS-016 visibility is self-contained booleans**, no IP-021 data-classification import anywhere in `trust-score/**`. Rather than build a second visibility system, reused the exact same pattern (one more boolean) for the new category.
6. **"Trust Signal" is named in `04_APPROVED_PRODUCT_DECISIONS.md`** ("Trust Signal", "Trust Signals are objective facts; a signal is not automatically fraud") but had **no dedicated domain object anywhere in code** — confirmed by grep, only `trust_events`/`trust_score_rules`/badges/visibility/shares exist. This is the genuine missing abstraction this IP had to build.
7. **Owned files**: `apps/api/src/modules/trust-score/**` only, plus additive changes to `apps/api/drizzle/*` (new migration), `apps/api/src/shared/database/schema/index.ts` (schema re-export, same line every prior IP touches), `docs/openapi.yaml`, and `apps/web/lib/i18n/messages/*.ts` (new keys only, no existing key touched). Zero files under `payment/**`, `privacy/**`, `notification/**`, `analytics/**` business logic — only *read* the payment refund event shape to learn its payload.
8. **One conflict found and escalated, not silently resolved** — see §6 and the standalone artifact `IP-011-CONFLICT-ESCALATION-SIGNAL-SCORING.md`.

## 3. Implemented

### 3.1 Trust Signal registry — genuine new abstraction, deliberately powerless over Score/Level

New `TRUST_SIGNAL_REGISTRY` (`domain/services/trust-signal-registry.ts`): a typed, versioned catalog (`signalType`, `version`, `sourceEventName`, `reasonKey`, `defaultVisibility`, and a literal `affectsScore: false` field on every entry) mirroring the discipline `trust_score_rules` already applies to scoring. New table `trust_signals` (idempotent by `source_event_id`, same shape as `trust_events`), new `RecordTrustSignalUseCase`, and four new consumers (`trust-signal.consumers.ts`) wired to the two gap-event families found in preflight: `TrustChangeOrder.Submitted/Approved/Rejected` and `FundsRefund.Completed`. `RecordTrustSignalUseCase` has **no dependency at all** on `RegisterTrustEventUseCase`, `trust-score-engine.ts`, or any score-mutating repository method — this is structural, not just documented, enforcement of "only the Trust Engine alters Score/Level" (TP-001/003).

### 3.2 Explainability (TRS-006 acceptance criterion: "score changes explain why")

`drizzle-trust-score.repository.ts::listTimeline` now `LEFT JOIN`s `trust_score_rules` to surface `reason` (the rule's description) per event; `GET /trust-scores/me/timeline` returns `reason` when a rule matched, else an i18n `reasonKey` (`trustTimeline.<eventName>`) for the client to resolve. E2E-verified: every row in a real timeline now has a non-empty `reason`.

### 3.3 Trust Signals surfaced, respecting visibility (reused TRS-016, not rebuilt)

- `GET /trust-signals/me` — owner's full signal feed (all visibilities), paginated.
- `GET /public/trust-profile/{token}/signals` — only `visibility=PUBLIC` rows, and only if the shared passport's `trust_visibility_policies.show_signals` is true (new additive boolean column, default `true`). Every recorded signal in this IP defaults to `PRIVATE` — nothing becomes publicly visible without the owner's Visibility Policy AND the signal's own visibility both being open, defense in depth.
- Copy is never hardcoded server-side: every response carries a `reasonKey` resolved against `apps/web/lib/i18n/messages/{pt-BR,en-US}.ts` under `trustSignals.*` / `trustTimeline.*` (IP-002 compliance).

## 4. Files changed

**New (9)**
```
apps/api/drizzle/0039_ip011_trust_signals_reputation_completion.sql
apps/api/src/modules/trust-score/domain/services/trust-signal-registry.ts
apps/api/src/modules/trust-score/domain/services/trust-signal-registry.spec.ts
apps/api/src/modules/trust-score/application/usecases/record-trust-signal.usecase.ts
apps/api/src/modules/trust-score/application/usecases/record-trust-signal.usecase.spec.ts
apps/api/src/modules/trust-score/infrastructure/consumers/trust-signal.consumers.ts
apps/api/src/modules/trust-score/infrastructure/persistence/trust-signal.schema.ts
apps/api/src/modules/trust-score/infrastructure/persistence/drizzle-trust-signal.repository.ts
docs/Multi-Agent Implementation Doc/IPS/IP-011-CONFLICT-ESCALATION-SIGNAL-SCORING.md
```

**Altered (9)**
| File | What |
|---|---|
| `trust-score.module.ts` | registered `TrustSignalRepository`, `RecordTrustSignalUseCase`, 4 new consumers |
| `infrastructure/persistence/trust-reputation.schema.ts` | `trust_visibility_policies.show_signals` (additive, default true) |
| `application/usecases/trust-profile.service.ts` | `DEFAULT_VISIBILITY` includes `showSignals` |
| `infrastructure/api/trust-reputation.controller.ts` | `visibilitySchema` requires `showSignals`; `GET /trust-signals/me`; `GET /public/trust-profile/{token}/signals` |
| `infrastructure/api/trust-score.controller.ts` | timeline response adds `reason`/`reasonKey` |
| `infrastructure/persistence/drizzle-trust-score.repository.ts` | `listTimeline` joins `trust_score_rules` |
| `apps/api/src/shared/database/schema/index.ts` | export `trust-signal.schema` |
| `apps/api/drizzle/meta/_journal.json` | migration 0039 entry |
| `apps/api/test/integration/trs-reputation.e2e.spec.ts` | `showSignals` in existing PUT payload; new IP-011 `it()` block |
| `apps/web/lib/i18n/messages/{pt-BR,en-US}.ts` | `trustTimeline.*`, `trustSignals.*` keys |
| `docs/openapi.yaml` | 2 new paths, updated `visibility`/`timeline` descriptions |

## 5. Migration

`0039_ip011_trust_signals_reputation_completion.sql` — additive, re-runnable (same `CREATE TABLE IF NOT EXISTS` / FK-guarded-by-`information_schema` / `ADD COLUMN IF NOT EXISTS` style as 0024–0038). One new table (`trust_signals`, FK to `trust_passports`, unique index on `source_event_id` for idempotency, composite index `(trust_passport_id, occurred_at)`), one additive column (`trust_visibility_policies.show_signals boolean default true not null`). Nothing in `trust_scores`/`trust_events`/`trust_score_rules` is touched.

## 6. Conflict Escalation filed

Full artifact: `IP-011-CONFLICT-ESCALATION-SIGNAL-SCORING.md`. Summary: `TrustChangeOrder.Rejected` (Partner's change-order rejection rate) and `FundsRefund.Completed` (voluntary refund frequency, outside dispute adjudication) are plausible reputation-relevant facts with **no approved `trust_score_rules` entry and no mention in `04_APPROVED_PRODUCT_DECISIONS.md`/INCONSISTENCIAS #13**. Per IP-011 §4 ("no unapproved punitive score rule") and the product decision "do not auto-penalize Trust Score without an approved deterministic rule," these were registered as **non-scoring Trust Signals only** — visible/explainable, structurally unable to touch Score/Level. The escalation asks Product/Trust owner to either approve a specific `trust_score_rules` row for either event (mechanism already supports it with zero code change) or confirm they should stay observational.

## 7. Tests and results

- **Unit**: `pnpm typecheck` clean, `pnpm lint` (scoped to `trust-score/**`) clean. New specs: `trust-signal-registry.spec.ts` (5 tests: every entry declares `affectsScore: false`; no ambiguous/duplicate mapping; already-scored events are NOT also signals — guards against a future double-pipeline; unknown event fails closed) and `record-trust-signal.usecase.spec.ts` (5 tests: no-op for unregistered event, no-op for missing target identity, throws for pg-boss retry when Passport doesn't exist yet, records with correct shape, idempotent on duplicate `sourceEventId`). Full unit suite: **85 files / 21 new tests added → 630→ (with new files) 5 new spec files; total unit run 630 passed** (trust-score subset: 21/21 passed standalone).
- **E2E, real embedded Postgres** (`node test/e2e-local.mjs -- --no-file-parallelism`), run by this agent directly, twice:
  1. **First full run** (before a bug fix — see below): **119/120 files, 771/772 tests passed**; the 1 failure was `ip-002-i18n.e2e.spec.ts` timeout, pre-existing/unrelated (notification locale propagation), matching the documented baseline flake pattern. This run also surfaced a **real bug in this diff**: `ChangeOrderApprovedSignalConsumer` (and its 3 siblings) crashed with `Cannot read properties of undefined (reading 'execute')` — Nest couldn't inject `RecordTrustSignalUseCase` because the subclasses had no explicit constructor (design:paramtypes metadata is only emitted on the declaring class). Fixed by giving each of the 4 consumers its own explicit constructor forwarding to `super()`, the exact pattern already used in `marketplace-scoring.consumers.ts`.
  2. **Second full run** (after the fix): **117/120 files, 761/772 tests passed**, but all 11 failures were **60–120s timeouts** in three files unrelated to this diff (`ip-003-service-request-discovery-matching`, `mrk-023-025`, `pack-03`) with **zero assertion mismatches** — the embedded Postgres log for that run shows checkpoint writes taking 265+ seconds (vs. sub-second normally), i.e. host I/O contention, the same class of Windows-specific flakiness IP-006's own completion report documents. No stray `postgres.exe` was found afterward (clean shutdown).
  3. **Targeted re-run to separate "flaky host" from "real regression"**: re-ran exactly the 3 files that failed (`trs-reputation.e2e.spec.ts`, `mrk-023-025.e2e.spec.ts`, `pack-03.e2e.spec.ts`) alone, fresh embedded Postgres, `--testTimeout=180000`: **3/3 files, 18/18 tests passed**, including the new IP-011 assertions (default `showSignals=true`, `GET /trust-signals/me` idempotency at the DB layer, Score provably unchanged after a signal insert, every timeline row carrying a non-empty `reason`). This confirms run #2's failures were host load, not code.

## 8. Acceptance criteria

| Criterion | Evidence |
|---|---|
| Signals typed/versioned/audited | `TRUST_SIGNAL_REGISTRY` (typed, `version` field); `trust_signals` row = audit record |
| Duplicate events do not double-count | `idx_trust_signal_source` unique index; e2e proves a duplicate `insertSignal` call is a no-op |
| Score changes explain why | `listTimeline` joins `trust_score_rules.description`; e2e asserts every row has a non-empty `reason` |
| Privacy visibility enforced | `showSignals` policy + per-row `visibility` (PUBLIC/PRIVATE), both must be open for public exposure |
| Reviews tied to completed eligible orders | Pre-existing (`REVIEWABLE_STATUSES`, unique index) — verified, not rebuilt |
| No unapproved punitive score rule | Conflict Escalation filed instead of inventing one; `RecordTrustSignalUseCase` structurally cannot touch score |

## 9. Deviations and decisions

1. **Bilateral reviews and anti-gaming (order-status gate + uniqueness) classified VERIFY_ONLY** — confirmed complete by reading the real use case, not rebuilt.
2. **No minimum-order-value anti-gaming gate added.** Preflight found none exists and none is approved anywhere; adding one would itself be an unapproved product rule. Noted as a gap, not invented.
3. **Signal target identity = seller (Partner)** for all four wired signal types, matching the existing `OrderConfirmed→sellerId` convention in `marketplace-scoring.consumers.ts`. A future IP could add the mirrored Member-side signal if product wants it — out of scope here (no gap named for it in the preflight).
4. **Conflict Escalation filed rather than implementing a plausible-looking scoring rule** — see §6.

## 10. Remaining work

- Product/Trust owner decision on the Conflict Escalation (§6) — either approve a `trust_score_rules` row for change-order rejections / voluntary refunds, or confirm observational-only is final.
- Frontend surfaces for the Trust Signals feed and the timeline `reason`/`reasonKey` — backend now exposes everything needed; not requested by this IP's spec.
- A Member-side mirror of the change-order/refund signals (buyerId) was not added — no gap named it in preflight; flag for Product if desired.

## 11. Commits

`COMMIT_PENDENTE` — diff left uncommitted and unstaged for review, per instruction (`main` commits the exact file set after Diff Review / Quality Gate).

---

**Wave 4 status**: with IP-011 complete (pending Diff Review + Quality Gate), Wave 4 (IP-006, IP-010, IP-011) is implementation-complete.
