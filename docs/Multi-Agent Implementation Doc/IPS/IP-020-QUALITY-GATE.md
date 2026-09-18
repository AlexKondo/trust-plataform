# IP-020 — Quality Gate

**Reviewer:** independent Quality/Diff Agent. See `IP-020-DIFF-REVIEW.md` for the full finding-by-finding writeup. This is the final IP of Wave 2.

## Test re-run results (independent, from scratch)

| Check | Result | Matches report claim? |
|---|---|---|
| `pnpm typecheck` | 0 errors (both packages) | Yes |
| `pnpm lint` | 0 errors | Yes |
| `pnpm -r build` | `apps/api` clean; `apps/web` 27 routes incl. `/admin/analytics` | Yes (26 + 1) |
| `pnpm test` (unit) | 57/84 files, 473/593 tests, 27/120 skipped | Yes, exact match |
| `pnpm test:e2e --no-file-parallelism` (full, first pass) | **80/84 files passed, 4 failed (13 tests)** — `ip-002-i18n.e2e.spec.ts`, `mrk-023-025.e2e.spec.ts`, `ntf-001.e2e.spec.ts`, `pack-00.e2e.spec.ts`, all `waitForScore`/60s-timeout failures, all in **pre-existing files IP-020 never touches** | Partial — report claimed only 1 transient failure; this independent run saw 13 (across 4 files), a larger batch of the same known transient signature, likely amplified by this review session already having run build/unit/two prior e2e invocations back-to-back on the same host immediately before |
| Retry of the 4 failed files in isolation, no code change | **4/4 files passed, 20/20 tests passed** | Confirms transient host contention, not a regression — same "flakes under load, clean in isolation" signature IP-007/003/013/021 and this report's own §10.4 already documented |
| IP-020's own new tests (`rate.spec.ts`, `ip-020-analytics-operational-intelligence.e2e.spec.ts`) | Passed cleanly on **every** run (baseline isolated run, full first pass, and implicitly not among the 4 failed files) | Yes |

**Combined e2e evidence**: 84/84 files, 593/593 tests achievable with zero reproducible failure — same conclusion as the report, reached independently, though via a noisier first pass. Not a blocker: zero of the 13 first-pass failures touch `analytics/**` or any file this IP owns.

## Deliberate-break verification (the most important check, per task instructions)

1. Baseline: `ip-020-analytics-operational-intelligence.e2e.spec.ts` run in isolation — **5/5 passed**.
2. Deliberately broke `getFunnelCounts`'s `orderRow.created` aggregate (`analytics.repository.ts`), forcing `ordersCreated` to always compute `0`.
3. Re-ran the same spec — **1/5 failed**, `AssertionError: expected 0 to be greater than or equal to 1` on the exact reconciliation assertion (`body.funnel.ordersCreated`) — the test genuinely caught the break.
4. Reverted immediately; confirmed the file's content matches the original.

**The reconciliation test is not vacuous.** This was the single most important thing to verify and it held up.

## Findings

| # | Finding | Severity |
|---|---|---|
| 1 | `getFunnelCounts`'s per-stage `count(*) filter (where …)` aggregates run inside a `SELECT` with **no top-level `WHERE`** — every call scans the full `service_requests`/`marketplace_offers`/`marketplace_orders`/`trust_custodies` tables regardless of the requested date window. The report's own justification (§3.1) overclaims "already indexed" — the cited indexes (`idx_marketplace_order_status`, etc.) don't apply to these date-range predicates, and no plain index on the relevant `created_at`/`completed_at`/`customer_confirmed_at`/`released_at` columns exists. Harmless today at MVP row counts (queries ran in low tens of ms); a real trap once table sizes grow, since this query shape can't benefit from an index without restructuring. | **OBSERVATION** |
| 2 | Independent full e2e run saw 13 test failures (4 files) on first pass vs. the report's own single transient failure — all in pre-existing, IP-020-untouched files, all the same `waitForScore`/60s-timeout signature documented by every prior Wave 2 IP, and all clean on isolated retry with zero code change. Likely amplified by this review session's own back-to-back heavy test/build invocations on the same host just before the full run. Not attributable to this IP's diff. | **OBSERVATION** |
| 3 | All 6 of the report's own flagged-for-scrutiny items (§16) independently re-verified and held up: no-new-table design reasonable for MVP scale; reconciliation test genuinely catches a broken query (proven above); privacy/PII boundary confirmed by direct code read + aligns with IP-021's `data-classification.ts`; `Date`-in-raw-`sql` fix is complete (zero remaining raw-`Date`-into-`sql` site); `AdminGuard` class-level application genuinely covers all 3 routes with no bypass path found; the i18n-precedent claim is true (verified zero `useLocale`/`useTranslations`/`i18n` usage across all 5 `/admin/*` pages, not just the 3 cited). | — (confirms, no separate severity) |

No CRITICAL, BLOCKING, or MAJOR finding.

## Scope check

`git status --short`/`git diff --stat` reproduced independently: exactly the claimed 4 modified files (`CLAUDE.md`, `apps/api/src/app.module.ts`, `apps/web/app/admin/page.tsx`, `docs/openapi.yaml`) + new paths under `apps/api/src/modules/analytics/**`, the e2e spec, `apps/web/app/admin/analytics/**`, `docs/analytics-metrics.md`. Zero touch of `marketplace/**`, `payment/**`, `privacy/**`, `notification/**` (confirmed empty `git diff --stat` on those paths). `docs/event-catalog.md` confirmed genuinely unmodified. Build-cache artifact (`apps/web/tsconfig.tsbuildinfo`) regenerated then reverted, per convention.

## Verdict

# PASS

IP-020 is approved. This IP's own implementation, tests, and documentation are sound; the one architectural judgment call (no new table, pure on-demand SQL) is reasonable for MVP scale with a documented (here, independently identified) future trap in `getFunnelCounts`'s scan shape, not a present defect. The elevated e2e failure count on this review's first pass is environmental noise, fully explained by known transient timeout behavior on this host and cleanly reproduced-clean on retry — not caused by this IP's diff.

This is the final IP of Wave 2. With this PASS, Wave 2 (IP-003, IP-007, IP-013, IP-021, IP-020) is complete.
