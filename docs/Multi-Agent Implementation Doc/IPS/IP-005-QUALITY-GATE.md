# IP-005 — Quality Gate

**Scheduling, Availability, Location & ETA**
Independent Quality/Diff Agent. Executed 2026-09-16 against baseline SHA `e9ff7bc` (`main`, tip after IP-004), reviewing IP-005's uncommitted working-tree diff. See `IP-005-DIFF-REVIEW.md` for full evidence and reasoning behind every line below.

## Gate checklist (per `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §4)

| Requirement | Status |
|---|---|
| Completion Report exists | Yes — `IP-005-COMPLETION-REPORT.md`, read in full |
| Diff Review completed independently | Yes — `IP-005-DIFF-REVIEW.md`, every changed production file read, migration and concurrent-reschedule race independently traced from code, not accepted from the report's prose |
| Diff Review verdict | APPROVED WITH ONE FLAGGED FOLLOW-UP (non-blocking — see Finding #1 below) |
| Dependency graph valid | Yes — hard dependency IP-003 confirmed APPROVED on `main`; zero IP-003-owned files touched beyond the shared `manage-order.usecase.ts`/`marketplace-order.schema.ts` files this IP legitimately owns as part of Marketplace |
| Shared-file conflicts resolved | N/A — no cross-IP collision; `docs/openapi.yaml`/`docs/event-catalog.md`/`CLAUDE.md`/`shared/database/schema/index.ts`/migration journal all edited only in new, dedicated, additive sections |
| Main regression suite green | Yes, with one known-transient flake unrelated to this IP — see below |
| No production code changes made by this review | Confirmed — this review made zero edits to any source file; only read/ran commands |
| No shared/prod Supabase touched | Confirmed — all DB-dependent tests ran against embedded disposable Postgres / ephemeral test databases only |
| No self-approval | This gate is issued by the independent Quality/Diff Agent, not the implementing agent |

## Independently reproduced test results

- `pnpm typecheck` — 0 errors (apps/api, apps/web)
- `pnpm lint` — 0 errors
- `pnpm -r build` — apps/api and apps/web both build clean, 27 routes
- Unit suite (`npx vitest run`, apps/api): **61 passed / 29 skipped (90 files); 499 passed / 126 skipped (625 tests)**, 89.03s — matches report exactly
- `mrk-015-022.e2e.spec.ts` (pre-existing scheduling suite, the file most exposed to this IP's constraint change), run standalone: **4/4 passed**, 33.78s
- `ip-005-scheduling-availability-location-eta.e2e.spec.ts`, run standalone: **5/5 passed**, 32.90s
- Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, all 90 files): **1 failed / 89 passed (90 files); 1 failed / 624 passed (625 tests)**. Failure: `ip-002-i18n.e2e.spec.ts`, a file this IP never touches, root-caused (independently, via the embedded Postgres log showing two WAL checkpoint stalls of 247.8s and 93.9s write time during the failure window) to transient host/checkpoint timing, not a defect. Re-run in isolation, fresh Postgres, zero code change: **7/7 passed**, 17.61s — confirms transience.
- **IP-005's own new e2e file, and the pre-existing scheduling suite it modifies, both passed clean** in every run (full-suite and standalone).
- **Combined: 90/90 files, 625/625 tests, 0 reproducible failures caused by this IP's diff** — a genuine independent reproduction, not a restatement of the report's numbers.

## Migration / concurrency verdict (highest-scrutiny item, per assignment)

- **Migration 0033 safety**: SAFE. The `UNIQUE(order_id)` → `UNIQUE(order_id) WHERE status='ACTIVE'` swap is exactly what INCONSISTENCIAS #26 prescribed. Every pre-existing row is trivially compliant (the *old* unconditional unique constraint already guaranteed at most one row per order, of any status, so no two rows could ever both become `ACTIVE`). No backfill needed, none attempted, none missing. `DROP INDEX`/`CREATE INDEX` run inside the same migration transaction — no unprotected window for a concurrent writer.
- **`saveScheduling` upsert-target change (`orderId` → `id`)**: CORRECT. Necessary consequence of the partial index; verified the write ordering inside `reschedule()` (cancel old row, *then* insert new row, both in the same DB transaction via `OrderLifecycleService.commit`) never permits two `ACTIVE` rows to coexist even momentarily.
- **Concurrent-reschedule race, traced in full**: two simultaneous `reschedule()` calls on the same order serialize on a row-level lock (both transactions' first write targets the same existing scheduling row's primary key); the loser's second `INSERT` of a new `ACTIVE` row collides with the partial unique index, aborts the loser's entire transaction (including its order-status write), and surfaces as HTTP 409 via the existing generic `23505` → `CONFLICT` mapping in `global-exception.filter.ts`. **No double-`ACTIVE` state is reachable under concurrency. Not BLOCKING.**

## Privacy verdict

Zero latitude/longitude/coordinate-shaped columns anywhere in the new travel-status surface — confirmed by direct grep of `order-travel-status.ts` and `order-travel-status.schema.ts` (only doc-comment prose mentions the words, asserting their absence) and by reading `TravelStatusResponse`'s field list. The only real GPS in the Marketplace module remains PACK-03's `marketplace_order_execution_events`, untouched by this diff. Read authorization confirmed both participants; write authorization confirmed Partner-only (`loadForSeller`, 403 for buyer).

## Timezone-math verdict

`fitsAvailability`/`localInstant` (`Intl.DateTimeFormat` with explicit `timeZone`) correctly resolves DST/offset per-instant rather than via a fixed offset. The midnight-crossing edge case is handled conservatively and correctly: a window whose local end lands after midnight on a different weekday is rejected; a window whose end lands exactly at local midnight is correctly treated as the end of the start day (not a cross-day span). Zero-declared-windows correctly imposes zero restriction (verified as the very first branch in the function, not merely by test).

## Findings summary (full detail in Diff Review)

- 0 CRITICAL, 0 BLOCKING.
- 1 MAJOR (non-blocking): the Completion Report's stated precedent for not wiring notification consumers on the three new events (`MarketplaceOrder.Rescheduled`/`.PartnerEnRoute`/`.PartnerArrived`) — "MRK-019/020/021's own events have zero consumers" — is **factually false**. `notification-rules.ts` contains real, firing consumer rules for exactly those three cited events (`ntf.order-scheduled`, `ntf.order-started`, `ntf.order-execution-completed`), independently confirmed both by reading the file and by observing them fire in this review's own test re-runs. This does not break anything today (no security/money/data-integrity impact, `notification/**` correctly left untouched per ownership rules), but it means the "Notification hooks emitted" acceptance criterion is satisfied only by the weaker reading (event published, no one told), and the codebase's own actual convention argues for the stronger reading. Recommend a scoped, additive follow-up (three new `notification-rules.ts` entries, mirroring the existing pattern) be tracked as an explicit open item before IP-024's Release Readiness Gate — not silently treated as closed.
- 2 OBSERVATION: `radiusKm`/geocoding deferred for a second consecutive IP (reasoning still sound, flagged by the report itself for re-judgment); reschedule's "any participant" authorization posture and the no-cross-midnight-window scope are deliberate, reasonable MVP defaults, not defects.

## Verdict

# PASS

IP-005 may proceed through the remaining integration steps. The migration is safe and correctly sequenced; the concurrent-reschedule race that this review was specifically tasked to scrutinize for a possible BLOCKING classification was traced in full and found to be properly backstopped by the database's partial unique index with a correct 409 mapping — it is not exploitable and does not block merge. The privacy boundary (zero coordinates in the new travel-status surface) and the timezone math both hold up under direct code inspection, not just test-passing. The one MAJOR finding is a factual error in the report's own justification for an acceptance-criterion interpretation, not a code defect, security gap, or broken invariant — it should be carried forward as an explicit, trackable follow-up (add the three notification rules, or make an explicit product decision not to) rather than silently accepted as fully satisfied.

Every specific claim this gate was tasked to independently verify — migration safety and row-handling, the `saveScheduling` conflict-target change, the full concurrent-reschedule trace, timezone/midnight-crossing correctness, the zero-coordinates privacy boundary, the notification-hooks precedent claim, the regression footprint, and all test counts — was independently reproduced from the real repository and, where testable, from freshly executed tests, not accepted on the report's own authority.
