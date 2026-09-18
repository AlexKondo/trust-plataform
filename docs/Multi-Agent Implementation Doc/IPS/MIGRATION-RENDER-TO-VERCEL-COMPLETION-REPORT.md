# MIGRATION — Render → Vercel — Completion Report

**Infrastructure migration (not a Pack-numbered IP)**
Executed 2026-09-17. Owner: infrastructure migration agent. Authority followed: `docs/Multi-Agent Implementation Doc/02_SHARED_ENGINEERING_STANDARDS.md` (general engineering rigor — money, security, migrations, testing), founder's direct decision to move backend hosting off Render.

## 1. Why

The Render account hosting `apps/api` was suspended over an account-billing issue unrelated to code or security. Rather than wait on Render support, the founder decided to move the API to Vercel Serverless Functions — the frontend (`apps/web`) already deploys there, so this consolidates the deployment platform.

## 2. Baseline

- Branch `main`, base commit `4e05092`.
- IP-018 (Admin Support Operations) was in progress with uncommitted changes at start (`apps/api/src/modules/admin-ops/**`, `admin-evidence.controller.ts`, `admin-payment.controller.ts`, several `apps/web/app/admin/**` pages, and additive edits to `apps/api/src/app.module.ts`, `marketplace.module.ts`, `payment.module.ts`, `order-lifecycle.service.ts`, `service-execution.usecase.ts`). None of these files were reverted or otherwise touched beyond what this migration itself needed to add. The only file this migration and IP-018 both touch is `apps/api/src/app.module.ts`; the diff is purely two independent additive module registrations (`AdminOpsModule` from IP-018, `InternalJobsModule` from this migration) — confirmed no textual overlap.

## 3. What changed

### 3.1 Serverless HTTP adapter
- `apps/api/api/index.ts` (new): Vercel-convention entry point. Calls `createApp()` (already existed in `apps/api/src/main.ts`, pre-separated from `.listen()`), calls `app.init()` + waits for the Fastify adapter's `.ready()`, then bridges Vercel's Node `(req, res)` handler to Fastify via `app.getHttpAdapter().getInstance().server.emit('request', req, res)` — the documented pattern for running Fastify on Lambda/Vercel without binding a port. Verified against `fastify@5.10.0` (package.json) — no `.listen()` is called anywhere in this path.
- The built app instance is cached in a module-level `Promise` so warm containers reuse it across invocations; a failed bootstrap clears the cache so the next invocation retries cleanly instead of replaying a cached rejection.
- `apps/api/tsconfig.json` — added `api/**/*` to `include` so this file is typechecked (it was previously outside every tsconfig's scope). It is intentionally NOT in `tsconfig.build.json`'s `include` — Vercel's own builder (`@vercel/node`) compiles `api/index.ts` independently; it does not need to be part of the `pnpm build` → `dist/` output used by the Render/Node path.
- `apps/api/vercel.json` (new): project rooted at `apps/api/`, monorepo-aware `buildCommand` (`cd ../.. && pnpm install && pnpm --filter @trust/api build`), `functions["api/index.ts"].maxDuration: 60`, and a catch-all rewrite (`/(.*)`  → `/api/index`) so every request reaches the single serverless function (Nest owns internal routing via `setGlobalPrefix('api/v1')`, unchanged).

### 3.2 OutboxRelayService redesign — pg-boss removed
Full rewrite of `apps/api/src/shared/events/outbox-relay.service.ts`. Removed: `pg-boss` dependency entirely (also removed from `apps/api/package.json`; confirmed via grep it is not imported anywhere else in `apps/api/src`), `onApplicationBootstrap`/`onApplicationShutdown` lifecycle hooks, the `setInterval` poll loop, `ensureQueue`/`registerConsumers`/pg-boss `subscribe`/`work`, and the old two-phase `tick()` (outbox → pg-boss enqueue) + pg-boss worker (dequeue → `consume()`) split.

Replaced with a single method, **`drainOnce({ maxDurationMs })`**:
1. Discovers all `EventConsumer` providers via the existing `DiscoveryService` (unchanged mechanism — does not depend on pg-boss) and groups them by `eventType`.
2. Loops: selects a batch of PENDING `outboxEvents` rows (`FOR UPDATE SKIP LOCKED`, same query as before — still valuable if two relay invocations ever overlap, e.g. a slow invocation still running when the next cron fires).
3. For each row, looks up which consumers subscribe to its `eventType`, checks `processedEvents` to see which of those consumers already have a dedupe row for this `eventId` (handles partial-retry correctly — a consumer that already succeeded on a prior attempt is not re-invoked), and calls the **unchanged** `consume()`/`consumeOutsideTransaction()` logic (same transaction-wrapped dedupe-insert-then-handle, same `managesOwnTransaction` branch, same idempotency guarantee) for every consumer not yet done.
4. Finalizes the row: **PUBLISHED only if every consumer for that row's `eventType` succeeded this call or was already done from a prior attempt; otherwise PENDING (increment `attempts`) or FAILED once `attempts >= OUTBOX_MAX_ATTEMPTS`.**
5. Bounded by both `outboxBatchSize` (existing config) per DB round-trip and a wall-clock `maxDurationMs` (default 50s, called with 50s from the new endpoint to leave headroom under Vercel's 60s `maxDuration`) — leftover PENDING rows are simply picked up by the next invocation.

`retryFailed()` and `pendingCount()` are preserved verbatim (used by admin tooling). `EventConsumer` (`event-consumer.ts`) — its `handle()` contract, `managesOwnTransaction`, `eventType`/`consumerName` — was **not touched**; no consumer's business logic changed.

**Design decision — status semantics (read carefully, this is the highest-risk part):**
- Old behavior: a row was marked PUBLISHED as soon as `boss.publish()` successfully enqueued it — i.e. before any consumer had actually run. This was already documented in the old code as "at-least-once, mark-then-maybe-fail-later."
- New behavior: a row is marked PUBLISHED only once every *currently registered* consumer for its `eventType` has a confirmed `processedEvents` row. This is strictly safer — it can no longer mark a row done while a consumer failed to run.
- **Known edge case, explicitly flagged, not fully resolved by this migration**: if a NEW consumer is deployed for an `eventType` *after* older rows of that type were already marked PUBLISHED (whether under the old pg-boss semantics or the new one), those older rows will never be revisited — there is no "replay from history" scan over PUBLISHED rows in either the old or new design. This is a **pre-existing limitation of the outbox design**, not something this migration introduces or worsens; it is called out here because the task explicitly asked for this scrutiny. If this ever becomes a real requirement (e.g. backfilling a new consumer against historical events), it needs a deliberate replay mechanism (e.g. re-flip PUBLISHED→PENDING for a targeted `eventType`/date range) — out of scope here.
- No event can be silently dropped: a row only leaves PENDING for PUBLISHED when success is proven, or for FAILED after `OUTBOX_MAX_ATTEMPTS` (requiring manual `retryFailed()`), which is unchanged and already logged loudly.
- No consumer can double-process a real event under normal operation: `processedEvents` dedupe (`consumerName`, `eventId`) unique constraint is untouched, and `drainRow` explicitly skips consumers whose dedupe row already exists before invoking them again on retry.

### 3.3 Internal relay-trigger endpoint
- `apps/api/src/modules/internal-jobs/` (new module): `POST /api/v1/internal/jobs/outbox-relay`, calls `drainOnce({ maxDurationMs: 50_000 })`.
- Auth: header `x-internal-job-secret` compared against `INTERNAL_JOB_SECRET` (new env var) using `crypto.timingSafeEqual` (constant-time; length-mismatch path still performs a dummy `timingSafeEqual` call so early-return doesn't leak a timing signal). Missing/wrong secret → 403. The secret value itself is never logged (only presence/absence would show up in normal request logs, and even that is not explicitly logged).
- The route is `@Public()` at the JWT-guard level (it is not tied to any user identity — deliberately a separate M2M auth mechanism, not a bypass of user authorization) and is not documented as a product-facing route; it is called out as "[Internal]" in the controller's own doc comment. There is no generated OpenAPI/Swagger in this codebase (confirmed — no `SwaggerModule`/`DocumentBuilder` usage anywhere), so there was no public spec grouping to keep this out of; `docs/openapi.yaml` (hand-maintained) was intentionally left untouched by this route, consistent with it being operational rather than product surface.

### 3.4 GitHub Actions scheduled trigger
- `.github/workflows/outbox-relay.yml` (new): `schedule: cron: '*/5 * * * *'` + `workflow_dispatch` for manual runs, calls the endpoint via `curl` with the secret header, fails the job (non-2xx) if the drain call itself fails, using GitHub repo secrets `API_BASE_URL` and `INTERNAL_JOB_SECRET`.

### 3.5 Config / docs
- `apps/api/src/shared/config/env.schema.ts` / `app-config.service.ts`: added optional `INTERNAL_JOB_SECRET` (min length 16, optional in schema so test/dev environments that don't use the route aren't forced to set it — the controller itself refuses every call when it's unset).
- `.env.example`: documented `INTERNAL_JOB_SECRET` purpose and generation hint.
- `render.yaml`: left in place, annotated as superseded/fallback (not deleted — that's a founder call).
- `CLAUDE.md`: dated entry added under the existing history format.

## 4. Test results

All commands run from `C:\projects\trust` unless noted.

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install --no-frozen-lockfile` (lockfile needed regen after removing `pg-boss`) | OK |
| Typecheck | `pnpm --filter @trust/api typecheck` (`tsc --noEmit`, now includes `api/**`) | 0 errors |
| Lint | `pnpm run lint` (`eslint .`, root) | 0 errors, 0 warnings (one initial warning about an unused eslint-disable was fixed by switching the drain loop to `for (;;)`) |
| Build | `pnpm --filter @trust/api build` (`tsc -p tsconfig.build.json`) | OK |
| Unit tests | `pnpm --filter @trust/api test` (vitest) | **85 test files passed, 630 tests passed** (36 files / 147 tests skipped — pre-existing skips, unrelated to this change) |
| E2E | `pnpm test:e2e -- --no-file-parallelism` (embedded disposable Postgres, matches CI) | **See below** |

E2E: hit the known Windows embedded-Postgres cleanup flakiness documented in `test/e2e-local.mjs`'s own comments (a stray `.pgdata-e2e` directory from the immediately-preceding unit-test run caused one `EPERM` on first invocation before Postgres even started); removed the directory manually and re-ran — no stray `postgres.exe` processes were involved (checked via `tasklist` both times), consistent with the documented "Windows-only, not a real regression" caveat. Confirmed every one of the ~28 test files that previously called `relay.tick()` now calls `relay.drainOnce()` (global sed rename, verified 0 remaining `relay.tick()` references and 28 files now referencing `drainOnce`). Live log output confirms events flowing end-to-end through the new `drainOnce()` path (`OutboxRelayService` / `EventConsumed` / `result":"SUCCESS"` entries across Identity, TrustPassport, TrustScore, Marketplace, Payment, Notification consumers) throughout the run — the redesigned delivery mechanism is exercised by the real suite, not just typechecked.

**Final result: 121/121 test files passed, 777/777 tests passed, 0 failed** (confirmed from the completed run's own summary line, not assumed). This is the same 777-test count class the repo's prior IPs have reported as the full baseline, now green end-to-end through the redesigned `drainOnce()` delivery path across every module's e2e suite (identity, verification, trust-passport, trust-score, marketplace incl. disputes/change-orders/scheduling, payment incl. incremental auth/refunds, notification, privacy, analytics, admin-ops, i18n, rate-limit, safety/abuse).

## 5. Manual steps the founder must do (no credentials exist in this sandbox)

**Vercel:**
1. Create a new Vercel project rooted at `apps/api/` (Vercel dashboard → New Project → Import the `trust` repo → set "Root Directory" to `apps/api`). `apps/api/vercel.json` supplies build/function config.
2. Set environment variables on that project — same list `render.yaml` already documents (`DATABASE_URL`, `DIRECT_DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `BREVO_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `NODE_ENV=production`), **plus** the new `INTERNAL_JOB_SECRET` (generate with e.g. `openssl rand -hex 32`; must match the GitHub Actions secret below exactly).
3. Confirm the `maxDuration: 60` function config is honored by the plan (Vercel Hobby historically capped at 10s; recent Hobby tiers allow higher `maxDuration` but this should be verified against the actual plan in use — if capped lower, either upgrade or lower `outboxBatchSize`/the endpoint's `maxDurationMs` accordingly so a single invocation can't be killed mid-batch).
4. Run the DB migration step manually once (the old Render `startCommand` ran `node apps/api/dist/shared/database/migrate.js` before `main.js` on every deploy) — a serverless deploy has no equivalent "run once before serving" hook; the founder needs either a manual `pnpm --filter @trust/api db:migrate` run against the target DB, or a separate CI step, before or during each deploy that includes schema changes. This migration does not add a new DB migration itself, so nothing is required immediately, but this gap should be addressed before the next one that does.
5. After the new API URL is live, update `apps/web`'s configured API base URL (wherever it currently points at `https://trust-api-5zlh.onrender.com`) to the new Vercel URL, and update `APP_BASE_URL` used by the API's CORS/email-link config if the frontend URL itself changes.

**GitHub Actions:**
1. Add repository secrets (Settings → Secrets and variables → Actions): `INTERNAL_JOB_SECRET` (same value as the Vercel env var) and `API_BASE_URL` (the deployed API's public base URL, e.g. `https://trust-api.vercel.app`, no trailing slash).
2. Confirm the workflow's cron actually fires (GitHub can delay/skip scheduled workflows on low-activity repos) — the founder should watch the Actions tab after the first deploy and manually trigger via `workflow_dispatch` if needed to smoke-test end-to-end.

## 6. Known risks / areas for highest scrutiny

1. **Fastify-serverless bridge correctness** (`apps/api/api/index.ts`): the `.server.emit('request', req, res)` pattern is well-established for Fastify-on-Lambda/Vercel, but this repo has no prior serverless deployment to validate it against directly — it has not been exercised against a real Vercel deployment in this sandbox (no credentials). Worth a real smoke test against a Vercel preview deployment before relying on it in production.
2. **Outbox status-semantics edge case** (§3.2 above): a new consumer deployed after older rows of its `eventType` were already marked PUBLISHED will not automatically receive those historical events. Pre-existing limitation, not introduced by this migration, but now explicitly documented instead of implicit.
3. **`INTERNAL_JOB_SECRET` optionality**: left optional in the env schema so existing test/CI environments don't need it; this means a production deploy that forgets to set it will have the endpoint permanently return 403 (fail-closed, safe) rather than fail startup loudly. Consider making it required in production once the Vercel env is configured, if stricter fail-fast behavior is preferred.
4. **Migration-on-deploy gap** (§5.4): serverless deploys have no built-in "run migrations once" step the way the old Render `startCommand` did. Not exercised by this change (no new migration), but a real gap for the next one.
5. **`maxDuration: 60` vs. actual Vercel plan limits** — unverified against the founder's actual Vercel plan tier.
