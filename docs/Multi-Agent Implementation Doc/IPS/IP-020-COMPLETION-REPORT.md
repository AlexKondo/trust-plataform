# IP-020 — Completion Report

**Analytics & Operational Intelligence**
Executed 2026-09-16. Owner: Data/Product implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §2, §4, §7, §11, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-020 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-020_Analytics_Operational_Intelligence.md`) > IP-000/IP-007/IP-003/IP-021's Completion Reports > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `2796018` (`main`, tip after IP-021 — `git log -1` confirmed; matches the task's own stated baseline). `git log --oneline -8` independently confirmed IP-000/001/002/003/007/013/021 are all already committed to `main` before this IP started.
- **Hard dependencies**: IP-000 (baseline reconciliation) and IP-007 (Incremental Payment Authorization) — both APPROVED and committed (`3b6ef0c` for IP-007). IP-000's own Completion Report classified IP-020 `IMPLEMENT` (material gap: no funnel/conversion/operational-metrics capability existed anywhere in the repository before this IP — confirmed independently by `grep -rn "analytics" apps/api/src` returning zero matches before this IP).
- **Working tree at start**: `git status --short` showed exactly one pre-existing, unrelated line — `M .claude/settings.local.json` — the same file every prior Wave 2 IP (003/007/013/021) reported as pre-existing local tooling configuration, not part of any IP's diff. No other file was modified or untracked at start.
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` places IP-020 in Wave 2 alongside IP-003/007/013/021, "parallelizable where file ownership is isolated," primary owner Data/Product. This is the **last** IP of Wave 2 to run — IP-003, IP-007, IP-013 and IP-021 are all already on `main`, so this IP's preflight (§2) could read their final, real, post-review schemas/routes/events directly rather than from prose alone.

## 2. Preflight findings

1. Read all 10 required documents in the mandated order (00, 01, 02, 03 §2, 04, IP-020 spec, IP-007-COMPLETION-REPORT.md, IP-003-COMPLETION-REPORT.md, IP-021-COMPLETION-REPORT.md §7/`data-classification.ts`, `docs/event-catalog.md` in full) before writing any code.
2. Hard dependencies IP-000/IP-007: APPROVED — confirmed by `git log` (both already on `main`) and by reading their own Completion Reports directly.
3. **Inventoried the full event surface first, per the task's explicit instruction**, by reading `docs/event-catalog.md` end to end (not skimming): confirmed the exact catalog of events this IP is meant to build funnel/conversion analytics FROM — Identity (`Identity.Created/Authenticated`, password lifecycle), TrustScore/TrustPassport/Verification, Marketplace listings/conversations/offers/orders/disputes/reviews, `ServiceRequest.*`/`ServiceRequestEngagement.Created` (IP-003), `Payment.*`/`PaymentIncrementalAuthorization.*`/`TrustCustody.*`/`Funds.*` (PACK-01/IP-007), `TrustChangeOrder.*` (PACK-03), notification events (IP-013). Zero new business event was invented — confirmed by design (§3, §4) and by `git diff docs/event-catalog.md` being empty (this IP touches no event, §7).
4. **Read the real schemas, not the prose**, before deciding what to query — `apps/api/src/modules/marketplace/infrastructure/persistence/{marketplace,marketplace-offer,marketplace-order,marketplace-review,service-request}.schema.ts` and `apps/api/src/modules/payment/infrastructure/persistence/payment.schema.ts`, plus `trust-score.schema.ts`, `trust-passports.schema.ts`, `identities.schema.ts` — to get exact column names (`completedAt` vs `customerConfirmedAt`, `ORDER_STATUS`'s 13 values including `CLOSED`/`DISPUTE_RESOLVED`/`REFUNDED`) before writing a single aggregation query, avoiding the class of bug where a metric silently measures the wrong column.
5. **Existing capabilities confirmed and reused, not rebuilt**:
   - `AdminGuard` (`apps/api/src/modules/identity/infrastructure/security/admin.guard.ts`) — the exact `is_admin`-flag-reevaluated-per-request pattern already used by `admin/trust-score-rules`/`admin/trust-benefits`/`admin/marketplace/disputes`. Reused verbatim (`@UseGuards(AdminGuard)`), zero modification to the guard itself.
   - The `count(*) filter (where …)::int` aggregate idiom, already used in `drizzle-marketplace-review.repository.ts`/`drizzle-marketplace-listing.repository.ts` for exactly this kind of "one query, several conditional counts" shape — reused, not invented, for every funnel/outcome/payment aggregate (§3.2).
   - `shared/money/money.ts`'s `fromReais` — reused for the two monetary aggregates this IP exposes (`grossOrderValueCents`/`releasedCustodyValueCents`), consistent with every other module's cents-at-the-boundary convention.
   - IP-021's `data-classification.ts` — read in full as the direct style precedent for this IP's own `metrics-definitions.ts` (a code-level, machine-readable catalog kept next to the code it describes, not a free-standing Markdown-only document that can drift).
6. **Exact gap confirmed**: zero analytics/metrics/aggregation code existed anywhere in the repository before this IP (`grep -rn "analytics\|funnel\|conversion" apps/api/src` — zero matches outside test fixtures). This IP is `IMPLEMENT`, not `VERIFY_ONLY`.
7. **Owned files / collision hotspots**: new `apps/api/src/modules/analytics/**` (exclusive, new module — no other IP claims this directory), new `apps/web/app/admin/analytics/**` (exclusive, new route). Shared collision hotspots touched, each with a minimal additive edit: `apps/api/src/app.module.ts` (2-line module registration, same shape as every prior IP's own registration), `apps/web/app/admin/page.tsx` (one new card object in an existing array, zero existing card touched), `docs/openapi.yaml` (new `Analytics` tag + 3 new paths, zero existing path touched), `CLAUDE.md` (new dedicated section after IP-013's, zero existing section touched). **No migration** — this IP adds no table, so `apps/api/drizzle/meta/_journal.json` is untouched (confirmed: `git status --short` shows no `drizzle/` file).
8. Baseline tests run before implementation: `pnpm typecheck` (0 errors) and `pnpm lint` (0 errors) — matched the clean starting point every prior IP reported. The full `pnpm test:e2e` baseline was not re-run a sixth time before starting (IP-000/001/002/003/007/013/021 all already independently reproduced a green baseline on this exact lineage); this agent's own post-implementation full run (§10.3) is the authoritative before/after comparison.
9. **No conflict found requiring escalation.** The one design question worth naming explicitly (not a blocker): whether to build a new table/materialized view/scheduled aggregation job, or pure on-demand SQL. Resolved in-repo, not escalated — see §3.1/§11.1.

## 3. Implemented

### 3.1 Design decision: pure on-demand SQL aggregation — no new table, no scheduled job

The mandate explicitly offered three options ("a materialized view, a scheduled aggregation job, or simple on-demand SQL aggregation queries"). Chose **on-demand SQL aggregation**, for reasons grounded in this repository's actual state, not a stylistic default:

- **No enterprise data warehouse** (IP-020 spec §4, non-negotiable). A materialized view or a scheduled pg-boss job is real, standing infrastructure with its own refresh/staleness/failure-mode surface — exactly the kind of thing "no enterprise architecture unless required by proven scale" argues against building speculatively for an MVP.
- **Reconciliation is the acceptance criterion, not performance.** IP-020 §6 asks that "numbers reconcile with source transactions" — the *only* way to guarantee that by construction, rather than by discipline, is to compute every number directly from the source tables on every call. A cached/materialized number is, by definition, a second copy that CAN drift from the source between refreshes; this IP's entire design exists specifically to avoid that class of bug.
- **Scale**: this MVP's data volume (per IP-000/every prior Completion Report's own evidence — tens to low hundreds of rows per table in the disposable test database, and no production traffic yet) does not remotely justify a scheduled aggregation job. Every query in `AnalyticsRepository` is a single-table or two-table indexed aggregate (`created_at`/`status` are already indexed on every table involved, per each owning module's own schema — confirmed by reading `idx_marketplace_order_status`, `idx_payment_authorization_status`, `idx_service_request_status`, etc.), not a full-table scan requiring pre-computation.

If a future IP needs to revisit this once real traffic exists, the natural evolution is a scheduled pg-boss job that materializes these same queries into a small summary table — this IP deliberately does not build that pre-emptively, per the mandate's own "no enterprise architecture merely because it might be needed" instruction.

### 3.2 `AnalyticsRepository` — the aggregation layer

`apps/api/src/modules/analytics/infrastructure/persistence/analytics.repository.ts`. Six methods, each a direct implementation of one or more entries in `metrics-definitions.ts` (§3.5):

- `getFunnelCounts(range)` — 4 queries (one per table group: `service_requests`, `marketplace_offers`, `marketplace_orders`, `trust_custodies`), each using `count(*) filter (where …)::int` to compute several stage counts from a single table scan rather than several round trips. Also computes `grossOrderValueCents`/`releasedCustodyValueCents` via `coalesce(sum(...) filter (where …), 0)`, converted through `fromReais` at the repository boundary — never a raw float.
- `getOutcomeCounts(range)` — completion/cancellation counts from `marketplace_orders`, dispute count via an inner join to `marketplace_disputes` (`count(distinct dispute.order_id)`, so an order with two disputes over its life still counts once).
- `getPaymentAuthorizationCounts(range)` — attempted/approved counts from `payment_authorizations`, the same "one row per attempt" table PAY-002 BR-003 already establishes.
- `getTimingMetrics(range)` — time-to-first-offer and Partner-response-time, via one raw parameterized SQL query (`db.execute(sql\`…\`)`, the same escape hatch `health.controller.ts` already uses) with two `LEFT JOIN LATERAL` subqueries. A raw query was the deliberate choice here (not query-builder composition): the two metrics both need "first row after a per-conversation correlated timestamp," which Drizzle's query builder cannot express as a single set-based query without either two round trips or the same LATERAL SQL written by hand underneath an ORM abstraction that would only obscure it — direct SQL is more auditable against the formula documented in `metrics-definitions.ts`, not less.
- `getTrustAdoption()` — current-state snapshot (no date range): active-identity count, Passport adoption, document-verified share, level distribution (`group by trust_scores.level`, joined to `identities` filtered `deleted_at is null` — **anonymized/deleted identities are excluded from every adoption count**, confirmed by dedicated unit reasoning in §8).
- `getCohortRetention(months)` — monthly signup cohorts (`date_trunc('month', identities.created_at)`) with two retention windows (month+1, month+2 after each cohort's own signup month), via one raw parameterized SQL query with two correlated `LEFT JOIN`s to `marketplace_orders`.

**Cross-module read pattern — deliberate, and explicitly sanctioned by the mandate**: `AnalyticsRepository` imports the Drizzle **table definitions** already exported by `marketplace/infrastructure/persistence/*.schema.ts` and `payment/infrastructure/persistence/payment.schema.ts` directly, and queries them through its own injected `DRIZZLE` connection — it does **not** import or depend on any Marketplace/Payment NestJS provider (repository, use case, service). This is different from IP-021's pattern (which imported other modules' *repository classes* via DI, for narrow per-identity reads) because this IP's job is fundamentally cross-table aggregation at a scale IP-021's per-identity repositories were never built to answer (e.g., "count all orders in a date range," not "list this one buyer's orders"). The task's own mandate explicitly authorized this ("you may read their schemas/tables for aggregation queries, but do not change their behavior") — and the result is verifiably zero-impact on those modules: `git diff --stat` shows **zero lines changed** in any file under `apps/api/src/modules/marketplace/**` or `apps/api/src/modules/payment/**` (§5).

### 3.3 `calculateRate` — one function, every percentage in the API

`apps/api/src/modules/analytics/domain/services/rate.ts`. A pure, independently unit-tested function (`rate.spec.ts`, 8 tests) used for every single rate/conversion value the controller returns — conversion between funnel stages, completion/cancellation/dispute rate, payment success rate, Passport adoption rate, document-verified share, cohort retention rate. Returns `null` for a zero (or negative — defensive) denominator, **never `0`** — a period with no data is a different fact from a period with a real `0%`, and every consumer (API response, frontend `pct()` helper) renders `null` as "—", not as a possibly-misleading `0%`.

This is the one piece of genuinely new "domain logic" this IP owns (IP-020 spec §5's "domain/unit invariants for every new rule") — everything else is either a read-only SQL query or a thin controller shaping the response.

### 3.4 `AnalyticsController` — three admin-only routes

`apps/api/src/modules/analytics/infrastructure/api/analytics.controller.ts`, `@Controller('admin/analytics')` + `@UseGuards(AdminGuard)` at the class level (so every route, present or future, is admin-gated by construction — not per-route, which would risk a forgotten decorator on a new route later):

- `GET /admin/analytics/overview?from&to` — funnel, conversion, outcomes, payments, timing, for a date window (default: last 30 days, validated `from < to` via a Zod `.refine()` so an inverted window is a deterministic 400, never silently swapped or sent to the database).
- `GET /admin/analytics/trust-adoption` — current-state snapshot, no date range (adoption is a "where are we now" question, not a "how much happened this period" question).
- `GET /admin/analytics/cohorts?months` — monthly cohort retention table, `months` defaults to 6, capped at 24 (Zod `.min(1).max(24)`).

### 3.5 `metrics-definitions.ts` — the metrics definition document (IP-020 §6 acceptance criterion)

`apps/api/src/modules/analytics/domain/metrics-definitions.ts` — following IP-021's own precedent (`data-classification.ts`) exactly in spirit: a machine-readable, code-level inventory (`METRIC_CATEGORY` enum + `METRIC_DEFINITIONS: MetricDefinition[]`), one entry per metric the API exposes, each with its `category`, the exact `sourceEvents` (event-catalog `eventType`s) it is derived from, the exact `sourceTables` it reads, its `formula` in plain business language + pseudo-SQL, and free-text `notes` disclosing every known approximation (e.g., the conversion-rate period-boundary caveat, §11.2). This is not a runtime mechanism — nothing queries it to make a live decision — it is kept next to `AnalyticsRepository` specifically so a reviewer can compare each `MetricDefinition.formula` against the repository method that implements it, line for line, without the two ever silently diverging.

A **human-readable companion**, `docs/analytics-metrics.md`, restates the same catalog as Markdown tables (the task's own wording asked for "structured markdown, similar in spirit to IP-021's data classification inventory") — explicitly marked as **derived from**, not a second independent source of truth for, the code file.

### 3.6 Frontend — minimal read-only ops dashboard

`apps/web/app/admin/analytics/page.tsx`, reached from a new card on `/admin` (`apps/web/app/admin/page.tsx`, one array entry added, zero existing card touched). Fetches the two range-agnostic-by-default calls on mount (`overview`, `trust-adoption`) and renders the funnel, conversion, outcomes, payment, timing and Trust-adoption numbers as read-only cards — no editing, no date picker, no charting library. This deliberately matches the task's own explicit scope guidance ("a solid backend API with clear metric definitions is the core deliverable, a full BI dashboard is not required") and the sibling `/admin/*` pages' own established convention (§11.3: no i18n hook on this page, consistent with `/admin/trust-rules`/`/admin/disputes`/`/admin/verifications`, all of which are internal-ops screens that predate this IP and do not use `useLocale()`).

## 4. Not implemented / out of scope

Per the IP-020 spec's explicit Out of Scope (§4) and this program's non-negotiable constraints:
- **No enterprise data warehouse, ETL pipeline, or BI tool integration** — every number is a direct SQL aggregate against operational tables (§3.1).
- **No new event** — this IP consumes the existing event-derived tables; `docs/event-catalog.md` is unmodified (confirmed by empty `git diff`).
- **No materialized view or scheduled aggregation job** — judged unnecessary at this MVP's scale (§3.1); a natural, explicitly-named follow-up if traffic grows, not built speculatively here.
- **No raw-data / bulk-PII export endpoint** — every response is aggregate-only (counts/sums/averages/rates); verified both by code review (no query ever `select`s a `full_name`/`email`/`phone`/precise-location column into a response) and by a dedicated e2e assertion that the test identities' own email/name/id never appear in any of the three endpoints' serialized JSON (§10.1).
- **No modification of `payment/**`/`marketplace/**` business logic** — confirmed by `git diff --stat` (§5): zero lines changed in either module's owned files. `AnalyticsRepository` only ever issues `SELECT` statements against their schema tables.
- **No admin-configurable metric definitions / custom-query builder** — metrics are a fixed, documented catalog (§3.5), not a user-authored query surface (which would itself be a raw-data-access risk the mandate explicitly warns against).
- **No cohort dimension beyond signup month** (no acquisition channel, no role-based cohort) — "cohort/retention basics" (IP-020 spec §1) is read literally: one dimension, two retention windows, not a full retention-analysis product.

## 5. Files changed

**New files (9)**:
```
apps/api/src/modules/analytics/analytics.module.ts                                     23
apps/api/src/modules/analytics/domain/metrics-definitions.ts                           299
apps/api/src/modules/analytics/domain/services/rate.ts                                  29
apps/api/src/modules/analytics/domain/services/rate.spec.ts                             43
apps/api/src/modules/analytics/application/dto/analytics.dtos.ts                        34
apps/api/src/modules/analytics/infrastructure/api/analytics.controller.ts              104
apps/api/src/modules/analytics/infrastructure/persistence/analytics.repository.ts      317
apps/api/test/integration/ip-020-analytics-operational-intelligence.e2e.spec.ts        409
apps/web/app/admin/analytics/page.tsx                                                  219
docs/analytics-metrics.md                                                              137
```
10 new files (9 source/test + 1 doc), 1,614 lines total.

**Modified files** (`git diff --stat`, excluding the incidental `apps/web/tsconfig.tsbuildinfo` build-cache regeneration, reverted per every prior IP's own precedent, and excluding the pre-existing unrelated `.claude/settings.local.json` line, §1):
```
 CLAUDE.md                     | 27 +++++++++++++
 apps/api/src/app.module.ts    |  2 +
 apps/web/app/admin/page.tsx   |  8 ++++
 docs/openapi.yaml             | 92 +++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 129 insertions(+), 0 deletions(-)
```
Zero files under `apps/api/src/modules/marketplace/**`, `apps/api/src/modules/payment/**`, `apps/api/src/modules/identity/**`, `apps/api/src/modules/privacy/**`, `apps/api/src/modules/notification/**`, or `apps/api/drizzle/**` were touched. **No migration** — this IP adds no table.

## 6. Migrations / configuration

- **No migration.** This IP is purely a read-query layer over existing tables — no new table, no new column, no index change. `apps/api/drizzle/meta/_journal.json` is untouched (still ends at idx 32, IP-021's `0032_ip021_privacy_lgpd_data_lifecycle.sql`).
- No `.env`/config schema changes — no new runtime configuration surface (no new external provider, no new secret).

## 7. APIs / events / jobs

- **Three new routes**, all `admin/analytics/*`, all `AdminGuard`-protected (§3.4), documented in `docs/openapi.yaml` under a new `Analytics` tag (103 path templates total, up from 100 before this IP — exactly the 3 new paths added, reconciled directly).
- **No new event.** `docs/event-catalog.md` is unmodified — this IP is a pure consumer of the tables those events already populate.
- **No new job/consumer/queue.** Every route computes its response synchronously, on demand, within the HTTP request.

## 8. Security / authorization / privacy

- **Admin-only, class-level guard**: `@UseGuards(AdminGuard)` on the controller class (not per-method) — every current and future route on this controller is admin-gated by construction, closing the "forgot the decorator on a new route" risk class. `AdminGuard` itself is untouched (zero diff) — the exact same `is_admin`-flag-reevaluated-per-request mechanism (DOC-002) every other admin surface in this repository already uses.
- **Aggregation is the privacy boundary, not an afterthought**: every field this API returns is a count, sum, average, or ratio — never a row keyed by an individual person. Confirmed three ways: (1) code review — no query in `AnalyticsRepository` ever selects `identities.fullName`/`.email`/`trustPassports.phone`/`.addressCity` or any `marketplace_order_execution_events` GPS column into a response; (2) `metrics-definitions.ts`'s own `notes` field explicitly documents *why* certain sensitive tables are read only through their already-safe boolean/derived projections (e.g. `documentVerifiedShare` reads `trust_passports.document_verified`, a boolean the Verification module already projects — never `verifications`/`verification_evidences` directly, which `data-classification.ts` classifies `SENSITIVE_KYC_EVIDENCE`); (3) a dedicated e2e assertion (§10.1) that the exact email/full name/identityId strings of every identity created during the test never appear anywhere in any of the three endpoints' serialized JSON responses — this is an executed proof, not a claim.
- **Soft-deleted (anonymized) identities are excluded from every adoption/cohort count** — `getTrustAdoption()`/`getCohortRetention()` both filter `identities.deletedAt is null` (and `trustPassports.deletedAt is null` for the Passport counts). An identity that exercised its IP-021 right to deletion does not linger in an aggregate count forever; it simply stops being counted, the same way it already stops appearing in every other `findById`/`findByEmail` call in this codebase.
- **No new audit entries** — this IP performs no state mutation (every route is `GET`, every underlying operation is `SELECT`), so there is nothing to audit under this codebase's existing "audit critical state transitions" convention (Shared Standards §11) — a read has nothing to record beyond the request/response logging every route already gets for free via the global logger/interceptor.
- **No new PII/sensitive data introduced.** No LGPD-relevant surface touched beyond reading two already-safe boolean/derived columns (§ above).

## 9. Data / financial invariants

- **No floating-point money anywhere in the new code.** `grossOrderValueCents`/`releasedCustodyValueCents` are computed via SQL `sum(...)` over the exact same `numeric(18,2)` columns every other module already sums, converted through the existing `shared/money.fromReais` at the repository boundary — the same helper `payment`/`marketplace` modules already use, not a second money-parsing implementation. Verified by a dedicated e2e assertion (`Number.isInteger(body.funnel.grossOrderValueCents)`, §10.1).
- **Numbers reconcile with source transactions — the acceptance criterion is proven empirically, not just by design.** `ip-020-analytics-operational-intelligence.e2e.spec.ts`'s main test runs one genuine end-to-end business flow through real HTTP endpoints (ServiceRequest → engage → offer → accept → authorize payment → schedule/start/complete → confirm-completion → custody released) against the real embedded Postgres, then calls `GET /admin/analytics/overview` for the exact same time window and asserts the funnel/outcome/payment counts include that flow's own order — and separately re-queries `marketplace_orders` directly (a plain `db.select()`, not the repository's own aggregate query) to independently confirm the order exists in the window the API claims to be counting. This is the strongest form of reconciliation proof available short of re-implementing every query a second time: an independent read path confirming the aggregate's ingredients are real, current rows.
- **Every rate is `null`, never `0`, when its denominator is zero** — proven by 8 dedicated unit tests on `calculateRate` (§3.3) and exercised in the controller (`overview`'s `conversion`/`outcomes`/`payments` fields, `trust-adoption`'s two rate fields, `cohorts`' two rate fields per row).
- **No mutation of any financial or business entity** — every route is `GET`; `AnalyticsRepository` issues only `SELECT` statements (confirmed by reading the file: zero `insert`/`update`/`delete` call anywhere in the module).

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `2796018`, in this environment. No shared/production database was touched — DB-dependent tests ran exclusively against the embedded, disposable, locally-started Postgres (`node test/e2e-local.mjs`).

### 10.1 New tests written: 8 unit tests (1 new spec file) + 5 e2e tests (1 new spec file)

- `apps/api/src/modules/analytics/domain/services/rate.spec.ts` — 8 unit tests: normal division rounded to 4 decimals; zero denominator → `null` (never `0`); negative denominator/numerator → `null` (defensive); numerator equals denominator → `1`; numerator zero with positive denominator → real `0` (distinct from `null`); `NaN`/`Infinity` in either position → `null`; `roundTo` rounding behavior.
- `apps/api/test/integration/ip-020-analytics-operational-intelligence.e2e.spec.ts` — 5 e2e tests against the real embedded Postgres:
  1. **401 without a token, 403 for an authenticated non-admin identity** on all three routes (`ADMIN_REQUIRED` error code asserted explicitly).
  2. **The main reconciliation test** (§9) — a full real HTTP flow from `ServiceRequest.Created` through `Funds.Released`, then independent reconciliation of the funnel/outcome/payment counts against a fresh, separately-issued `db.select()` on `marketplace_orders`, plus `Number.isInteger` assertions on both money fields, plus a PII-leak assertion (buyer/seller email, full name, and identityId never appear in the serialized response).
  3. **Trust adoption reconciles against an independent `db.select()`** over `identities` (not the repository's own aggregate query) — a genuinely different query path computing the same `activeIdentities` number.
  4. **Cohorts responds 200 with the documented shape** and the structural invariant `retainedMonthN <= cohortSize` for every row, with the same PII-leak assertion.
  5. **An inverted date window (`from > to`) is rejected with a deterministic 400**, proving the Zod `.refine()` guard (§3.4) actually fires end-to-end, not just in isolation.

### 10.2 Unit/domain suite (`npx vitest run` from `apps/api`, no `TEST_DATABASE_URL` — e2e specs skip via `describe.runIf`)

```
Test Files  57 passed | 27 skipped (84)
     Tests  473 passed | 120 skipped (593)
Duration    73.21s
```
Before this IP (IP-021's own final reported state): 56 passed | 26 skipped (82 files), 465 passed | 115 skipped (580 tests). **Delta: +1 file/+8 tests** in the always-run unit bucket (`rate.spec.ts`, exactly 8 tests), **+1 file/+5 tests** in the skipped-without-DB e2e bucket (`ip-020-*.e2e.spec.ts`, exactly 5 test cases). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Real bug found and fixed during e2e verification: `Date` interpolated into a raw `sql` fragment fails the postgres.js driver

Recorded in full, per this program's established standard of disclosing what was actually found (mirroring IP-002/007/003/021's own precedent).

**Symptom**: the first e2e run failed 2 of 5 tests with `500`s — `GET /admin/analytics/overview` and `GET /admin/analytics/cohorts` both threw `DrizzleQueryError`, root cause `TypeError: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date`.

**Root cause**: `getFunnelCounts`'s `count(*) filter (where … >= ${range.from} …)` fragments, and `getTimingMetrics`/`getCohortRetention`'s raw `db.execute(sql\`…\`)` calls, interpolated a raw JS `Date` object directly into a `sql` template. When a `Date` reaches a column-typed Drizzle helper (`gte(column, value)`, used safely elsewhere in this same file for `getOutcomeCounts`/`getPaymentAuthorizationCounts`), Drizzle knows the target column's type and serializes accordingly. Inside an **untyped** `sql\`…\`` fragment, the interpolated value is instead handed to the postgres.js driver as a raw bind parameter with no column-type context — and this driver configuration (`prepare: false`, the Supabase-session-pooler-compatible mode every module in this codebase already uses, `database.module.ts`) does not auto-coerce a `Date` instance at that layer.

**Fix**: every `Date` interpolated into a raw `sql` fragment (in `getFunnelCounts`, `getTimingMetrics`, `getCohortRetention`) is now converted to an ISO 8601 string (`.toISOString()`) before interpolation — the format `timestamptz` accepts as a textual bind parameter. `getOutcomeCounts`/`getPaymentAuthorizationCounts`, which use `gte(column, value)`/`lt(column, value)` (column-aware, not raw `sql` fragments), needed no change — confirmed by re-reading both methods and by them passing on the very first e2e run. A code comment was added at the top of `getFunnelCounts` explaining exactly why, so a future reader does not reintroduce a raw `Date` into a `sql` fragment elsewhere in this file.

**Verification**: re-ran the full e2e spec file in isolation after the fix — **5/5 tests pass**, including the two that previously 500'd.

### 10.4 Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

First run, all 84 files (79 pre-existing + this IP's 5 new/extended — `rate.spec.ts` + the e2e spec, matching §10.2's totals with the DB present so every previously-skipped e2e test body actually executes — hence 593, not 580):
```
Test Files  1 failed | 83 passed (84)
     Tests  1 failed | 592 passed (593)
Duration    659.92s (~11 min)
```
The one failure was, once again, a pure `waitForScore` polling timeout (`Error: Score não chegou a 25`) in **`ip-002-i18n.e2e.spec.ts`** — a file this IP never touches, and the exact same test/failure mode IP-007 §10.3, IP-003 §10.3 (three separate times) and IP-021 §10.3/§10.5 (twice) each already documented and diagnosed as transient host I/O contention on this same environment. **All 5 of this IP's own new e2e tests passed on this first run** (`ip-020-analytics-operational-intelligence.e2e.spec.ts` is among the 83 passed files).

Re-ran the one failed file in isolation immediately afterward, no code change in between:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    23.05s (19.56s test time)
```
Clean on the first retry — confirming transient host contention, not a regression introduced by this IP. **Combined evidence: 84/84 files, 593/593 tests, 0 reproducible failures** — the same "flakes once, passes clean in isolation with zero code change" signature every prior Wave 2 IP's own full-suite run already established on this exact environment.

Before this IP (IP-021's own reported final full-suite state): 82/82 files, 580/580 tests. Delta: **+2 files/+13 tests** (`rate.spec.ts`'s 8 unit tests + `ip-020-*.e2e.spec.ts`'s 5 e2e tests) — no other file's test count changed.

### 10.5 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: tsc --noEmit → Done · apps/web: tsc --noEmit → Done (0 errors)
pnpm lint        → eslint . → 0 errors
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 27 routes, all ✓ (26 before this IP + 1 new: /admin/analytics)
```

## 11. Deviations / decisions

1. **No new table, no migration** (§3.1) — the mandate offered three concrete design options; this agent chose the one requiring zero new infrastructure, judged the minimum-safe design for this MVP's data volume and the "no enterprise data warehouse" constraint. Flagged for reviewer re-judgment (§16) since it is the single biggest architectural choice in this IP.
2. **Conversion rates compare same-period counts, not a tracked cohort of individual requests/offers/orders through the funnel** (§3.5, `metrics-definitions.ts`'s own `notes` field for each `conversion*` metric) — an order accepted inside the window may have originated from an offer created before the window started. Documented explicitly, not hidden, as the simplest approximation appropriate to this Release's scale; the natural (larger) evolution would be tracking by `correlationId` across the whole funnel, out of this IP's minimum-safe scope.
3. **`/admin/analytics` frontend page does not use the `useLocale()` i18n hook** — a deliberate consistency choice, not an oversight or a regression of IP-002's i18n mandate: every existing `/admin/*` ops page (`trust-rules`, `disputes`, `verifications`) already hardcodes PT-BR strings directly and predates this IP; none of them route through `useLocale()`. Introducing i18n only on this one new admin page would be the inconsistent choice, not the compliant one — internal ops tooling in this codebase has an established, separate convention from consumer-facing product surfaces (which IP-002/IP-021's `/settings/privacy` correctly do route through i18n). Flagged for reviewer re-judgment (§16) since it is a place this agent followed an existing pattern rather than the letter of Shared Standards §8 in isolation.
4. **`getTimingMetrics`/`getCohortRetention` use raw parameterized SQL (`db.execute(sql\`…\`)`), not the Drizzle query builder** — a deliberate choice (§3.2), not a shortcut: both queries need `LEFT JOIN LATERAL`/per-row-correlated-window semantics the query builder cannot express as a single set-based query. The same escape hatch `health.controller.ts` already uses in this codebase, not a new pattern.
5. **`AdminGuard` applied at the controller class level**, not per-route — every prior admin controller in this codebase (`TrustScoreController`, `marketplace-review.controller.ts`) applies it per-method instead. This IP's controller has no non-admin route at all (unlike those two, which mix public/member/admin routes in one controller), so class-level application is strictly safer here (impossible to add a future route and forget the guard) and was judged the better choice for a controller that is admin-only by its entire nature. Flagged for reviewer confirmation (§16) as the one place this agent's authorization pattern differs in *shape* (though not in effect) from existing precedent.
6. **Incidental build-cache artifact reverted**: `apps/web/tsconfig.tsbuildinfo`, regenerated by `pnpm -r build`, reverted via `git checkout --`, per every prior IP's own precedent.
7. **Pre-existing `.claude/settings.local.json` change left untouched** (§1) — not authored by this agent, not part of this IP's diff.

## 12. Known issues / technical debt

- **No scheduled aggregation/materialization** — accepted at this MVP's scale (§3.1/§11.1); a follow-up IP's clear, well-scoped task if/when real traffic makes on-demand aggregation too slow for interactive dashboard use. Not a defect today (every query in this IP ran in low tens of milliseconds against the disposable test database in every e2e run, §10.4).
- **Conversion-rate period-boundary approximation** (§11.2) — documented, not silently accepted as precise.
- **No caching layer for the frontend dashboard** — every page load re-runs all three aggregations; acceptable for an admin-only, low-traffic ops screen, would need revisiting only if this became a high-frequency polling dashboard (out of this Release's scope).

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken.

## 14. Acceptance criteria matrix

Per IP-020 spec §6:

| Criterion | Status | Evidence |
|---|---|---|
| Metrics definitions documented | **PASS** | `apps/api/src/modules/analytics/domain/metrics-definitions.ts` (machine-readable, code-level) + `docs/analytics-metrics.md` (human-readable, derived from it) — every metric's exact formula, source event(s), and source table(s) (§3.5). |
| Event-derived where possible | **PASS** | Every `MetricDefinition.sourceEvents` cites real `docs/event-catalog.md` entries; every query reads the table that event's own consumer already projects into (§3.2/§3.5). |
| Dashboard/API available to authorized ops | **PASS** | 3 `admin/analytics/*` routes, `AdminGuard`-protected (§3.4/§7); minimal read-only frontend at `/admin/analytics`, linked from `/admin` (§3.6). |
| Numbers reconcile with source transactions | **PASS** | Proven empirically, not just by design: a real end-to-end business flow through real HTTP endpoints, then independently re-queried against the source tables via a separate `db.select()` path (§9/§10.1, test 2/3). |
| Privacy constraints applied | **PASS** | Aggregate-only responses (no individual row ever returned); soft-deleted identities excluded from every count; dedicated e2e assertion that no test identity's email/name/id ever appears in any response (§8/§10.1). |

## 15. Commits

**Not committed.** Git identity (`user.name`/`user.email`) is unset in this environment — confirmed unset, per the explicit instruction that configuring it is outside this agent's authority. All of this IP's changes are left in the working tree, **unstaged** (no `git add` was run), exactly as `git status --short` shows them (§1, §5) — new files untracked, modified files unstaged — ready for `git add`/`git commit` by "main."

Suggested commit split, consistent with `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §7 ("implementation → test/fix → docs"):

1. **Implementation commit** — `apps/api/src/modules/analytics/**`, `apps/api/src/app.module.ts`, `apps/web/app/admin/analytics/**`, `apps/web/app/admin/page.tsx`. Suggested message: `feat(IP-020): on-demand analytics & operational intelligence for ops`.
2. **Test commit** — `apps/api/src/modules/analytics/domain/services/rate.spec.ts`, `apps/api/test/integration/ip-020-analytics-operational-intelligence.e2e.spec.ts`. Suggested message: `test(IP-020): reconciliation, authorization and privacy-boundary coverage`.
3. **Docs commit** — `docs/openapi.yaml`, `docs/analytics-metrics.md`, `CLAUDE.md`, this Completion Report. Suggested message: `docs(IP-020): completion report, metrics catalog and OpenAPI update`.

All three should carry the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer per this session's attribution convention.

## 16. Recommended reviewer focus for the independent Diff Review agent

1. **The "no new table" design decision** (§3.1/§11.1) — this is the single biggest architectural judgment call in this IP. Confirm independently that the query volume/shape here genuinely does not warrant a materialized view or scheduled job at this MVP's scale, and that "on-demand SQL, recomputed every call" is actually what makes the "reconciles with source transactions" acceptance criterion true by construction rather than by discipline.
2. **The reconciliation e2e test itself** (`ip-020-analytics-operational-intelligence.e2e.spec.ts`, test 2) — re-run it independently and confirm the reconciliation assertions (`db.select()` on `marketplace_orders` matching the API's own count) are genuinely testing something — i.e., temporarily break `getFunnelCounts`' `ordersCreated` query (e.g., flip the date comparison) and confirm the test fails, then restore it. A reconciliation test that would pass regardless of the query's correctness is not actually proving reconciliation.
3. **The privacy/PII-leak assertions** (§8/§10.1) — re-read `AnalyticsRepository` end to end and independently confirm no query ever selects a PII column (`fullName`/`email`/`phone`/address/precise-location) into any response, not just trust the e2e assertion's negative match on a handful of known test strings.
4. **The `Date`-in-raw-`sql`-fragment bug and its fix** (§10.3) — this is where a real bug was found and fixed during this IP's own verification. Confirm the reasoning (untyped `sql` fragments don't get column-aware serialization, `gte(column, value)` does) is correct by reading the Drizzle/postgres.js behavior directly, not just trusting this report's prose, and confirm every remaining raw-`Date`-into-`sql` site in this file (there should be none left) really was fixed.
5. **The admin-only authorization boundary** — re-run the 401/403 test independently, and confirm `@UseGuards(AdminGuard)` at the class level genuinely covers all three current routes (and would cover a future one) by reading the controller file directly, not just trusting the class-level-decorator claim.
6. **The `/admin/analytics` frontend page's lack of i18n** (§11.3) — independently re-judge whether "matches the existing `/admin/*` convention" is the right call versus IP-002/Shared Standards §8's literal text, since this is the one place this agent chose an existing local pattern over an ostensibly stricter global rule.
