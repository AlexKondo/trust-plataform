# IP-022 — Quality Gate

**Mobile/Responsive/PWA Field Experience**
Independent Checker pass, 2026-09-17. Full detail in `IP-022-DIFF-REVIEW.md`.

## Verdict: **PASS** (confirmation pass, 2026-09-17, post-fix)

Original pass (below) returned FAIL with one CRITICAL (F1) and one MAJOR (F4) finding. The Executor fixed both: dropped `idempotent: true` from `start`/`complete` (and proactively from `travel-status/arrived`, which shared the same blind-upsert weakness as F2), and added a narrowly-scoped ESLint globals block for `apps/web/public/sw.js`. An independent confirmation pass re-verified both fixes directly against the code (not the report's prose):

- `idempotent: true` now appears at exactly 3 call sites repo-wide (`pause`, `resume`, `travel-status/en-route`), each re-confirmed to have a genuine DB-level (or design-level) guard unchanged by this fix round. `start`, `complete`, `travel-status/arrived` have zero retry path — confirmed by reading `apps/web/lib/api.ts` and `apps/web/app/orders/[orderId]/page.tsx` directly, including that the shared `act()` helper's now-dead `idempotent` parameter was fully removed, not left unused.
- The minimal fix (drop the flag rather than add backend CAS) is judged reasonable and genuinely safe: it eliminates the race entirely and reverts exactly to pre-IP-022 behavior for those three mutations (no prior retry existed there either) — a narrowing of value delivered, not a regression.
- `eslint.config.mjs`'s new block is scoped to the exact path `apps/web/public/sw.js` only, adds only the needed SW globals (`self`, `caches`, `clients`, `fetch`, `Response`, `Request`, `URL`, `Promise`) as `readonly`, and does not touch/disable any rule — `no-undef` and friends still apply fully within that file.
- Test re-run from scratch: `pnpm --filter @trust/web typecheck`/`build` clean (33 routes, `orders/[orderId]` 8.41 kB); repo-wide `pnpm typecheck` clean; repo-wide `pnpm lint` clean, 0 errors (was 16) — reproduced independently. `git status --short` confirms zero `apps/api/**` touched, verified directly rather than accepted from the report, so no backend e2e re-run needed.

Full detail: `IP-022-DIFF-REVIEW.md` §12. This closes Wave 6.

---

## Original verdict (superseded above): **FAIL**

## Why

The completion report's own §7 flagged retry safety of the 6 `idempotent: true` endpoints as the item requiring highest scrutiny, and explicitly disclosed it had not re-verified the backend guards line-by-line. Independent trace of all 6 found:

- `pause` and `resume` are genuinely safe — real DB-level CAS (`closePauseIfOpen` conditional UPDATE for resume; a partial unique index for pause). These match the IP-001 pattern as claimed.
- `travel-status/en-route` is state-idempotent by design (minor caveat: duplicate event/audit entry per repeat, not a state bug).
- **`start` (check-in) and `complete` (check-out) — the two highest-consequence transitions — do NOT have DB-level CAS protection.** `MarketplaceOrderRepository.save()` is a blind `INSERT ... ON CONFLICT DO UPDATE` with no `WHERE status = previousStatus` guard, no `SELECT ... FOR UPDATE`, no optimistic-lock column. The only protection is an in-memory status check against a `findById` snapshot taken at the top of the request. This is a narrower, weaker pattern than the report's own §3.2 claim that these six "reuse exactly the pattern IP-001's Trust Pause/Resume already established." For `complete` specifically, a race where a client retry fires while the original request is still mid-flight (socket dropped after the server started processing but before it committed/responded) can result in two `MarketplaceOrder.ExecutionCompleted` events being enqueued for the same execution — the exact "network retry silently double-firing a business-critical transition" failure mode this whole verification exercise exists to catch.
- `travel-status/arrived` shares the same blind-upsert weakness (lower consequence, terminal transition).

Per the task's own instruction ("any confirmed non-idempotent operation marked retryable should be CRITICAL"), marking `start`/`complete` as `idempotent: true` without the equivalent DB-level CAS that `resume` already demonstrates in the same codebase is a CRITICAL finding.

Additionally, `pnpm lint` (full repo) fails with 16 `no-undef` errors in the new `apps/web/public/sw.js` (no ESLint service-worker globals configured) — a real, reproducible failure the report did not catch because it only ran the web-scoped `typecheck`/`build`, not a full repo lint pass.

## What passed

- `fetchWithRetry` logic itself: correctly distinguishes network-level failure (`fetch()` throwing) from a parsed HTTP response (never retries 4xx/5xx); attempt count and backoff match the claim exactly.
- Exactly 6 call sites use `idempotent: true`, nowhere else — confirmed by full-repo grep.
- `sw.js` never intercepts non-`GET` requests (`request.method !== 'GET'` is the first line of the fetch handler) — evidence upload and all mutations are unaffected.
- Camera capture (`capture="environment"`) is additive-only; upload/FormData contract untouched.
- PWA manifest is well-formed; service worker registration is safe/non-blocking.
- Responsive/tap-target/deep-link spot checks all confirmed as claimed.
- `offline.html` i18n deviation is architecturally sound and correctly disclosed.
- `pnpm --filter @trust/web typecheck` / `build`: clean, 33 routes, matches report exactly.
- `pnpm typecheck` (repo-wide): clean.
- Zero `apps/api/**` files touched — confirmed directly.

## Required to reach PASS

1. **F1 (CRITICAL, blocking)**: Give `start`/`complete` (and ideally `travel-status/arrived`) genuine DB-level CAS before they can be safely marked `idempotent: true` for client retry — e.g. a conditional `UPDATE marketplace_orders SET status = $new WHERE id = $id AND status = $previousStatus`, aborting (throwing) the transaction when zero rows are affected, mirroring `resume`'s `closePauseIfOpen`. Until then, either (a) fix the backend, or (b) remove `idempotent: true` from `start`/`complete` call sites in `apps/web/app/orders/[orderId]/page.tsx` and accept manual-retry-only for these two, consistent with how `approve`/`reject`/cancel were already deliberately left out of scope for the same reason.
2. **F4 (MAJOR, blocking for a clean gate)**: Add an ESLint override (globals: `serviceworker`, or exclude `public/*.js` from the main TS/React ruleset) so `pnpm lint` is green repo-wide.

## Findings register

| Severity | Finding | File(s) |
|---|---|---|
| CRITICAL | `start`/`complete` marked retryable without DB-level CAS; narrow race can double-fire `MarketplaceOrder.ExecutionCompleted`/`.Started` | `apps/api/src/modules/marketplace/application/usecases/manage-order.usecase.ts`, `.../order-lifecycle.service.ts`, `.../infrastructure/persistence/drizzle-marketplace-order.repository.ts` |
| MAJOR | `travel-status/arrived` shares the same blind-upsert pattern (lower consequence) | `apps/api/src/modules/marketplace/application/usecases/manage-order-travel-status.usecase.ts` |
| MAJOR | Repo-wide `pnpm lint` fails on new `sw.js` (no service-worker ESLint env) | `apps/web/public/sw.js` |
| MINOR | `travel-status/en-route` retry enqueues a duplicate event/audit row even though end state is a no-op | `apps/api/src/modules/marketplace/domain/entities/order-travel-status.ts` |
| OBSERVATION | Manifest icons are placeholder solid-color PNGs (disclosed) | `apps/web/public/icons/*.png` |
| OBSERVATION | `offline.html` bypasses `lib/i18n/` (disclosed, architecturally justified) | `apps/web/public/offline.html` |

## Scope confirmation

Files changed: `apps/web/app/layout.tsx`, `apps/web/app/orders/[orderId]/page.tsx`, `apps/web/lib/api.ts` (modified); `apps/web/components/service-worker-registration.tsx`, `apps/web/public/{manifest.json,sw.js,offline.html,icons/*}` (new). Zero `apps/api/**` files touched — confirmed via `git diff --stat HEAD`.

This originally did **not** close Wave 6 pending the fix-and-recheck cycle — see the confirmation pass at the top of this document, which now returns PASS and closes Wave 6.
