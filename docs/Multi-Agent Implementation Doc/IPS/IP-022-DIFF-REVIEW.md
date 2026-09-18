# IP-022 — Diff Review

**Mobile/Responsive/PWA Field Experience — independent Checker pass**
Reviewed 2026-09-17 against baseline `791c409`, branch `main`. Scope: `apps/web/**` only (frontend). Backend files were read (not modified) to independently verify the 6 `idempotent: true` claims — this is exactly the rigor the completion report's §7 asked for.

## 1. Diff scope (confirmed)

```
 M apps/web/app/layout.tsx
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/lib/api.ts
?? apps/web/components/service-worker-registration.tsx
?? apps/web/public/manifest.json
?? apps/web/public/sw.js
?? apps/web/public/offline.html
?? apps/web/public/icons/icon-192.png
?? apps/web/public/icons/icon-512.png
?? apps/web/public/icons/icon-maskable-512.png
```

`git diff --stat HEAD` confirms only 3 modified files under `apps/web/**`, 96 lines changed total. Zero files touched under `apps/api/**` — confirmed by direct diff/status inspection, not just report claim. The claim "134/134 file / 840/840 backend baseline unaffected by construction, not re-run" is TRUE by construction, but see §5 below: repo-wide `pnpm lint` (not `pnpm --filter @trust/web ...`) was NOT run by the report and does fail, so "unaffected" needs qualification (see Finding F5).

## 2. The 6 `idempotent: true` endpoints — independent backend trace

Traced every one to its real use case, not just the spec's characterization.

### 2.1 `pause` (`apps/api/.../service-execution.usecase.ts` `pause()`)
- Guard: `session.pause(now)` throws `ServiceExecutionTransitionException` unless in-memory session (freshly loaded via `findSessionByOrder` at the top of the call) is `ACTIVE`.
- **Genuine DB-level protection**: a partial unique index on `(session_id) WHERE resumed_at IS NULL` prevents two concurrently-open pauses from ever being persisted — confirmed via the code comment and referenced in the domain doc. Even a true race (two pause calls in flight) cannot both commit a second open-pause row.
- Verdict: **Safe to retry blind.** Sequential retry (the only kind `fetchWithRetry` produces) re-reads current state and is rejected by the domain guard; concurrent duplication is blocked by the DB constraint.

### 2.2 `resume` (`apps/api/.../service-execution.usecase.ts` `resume()`)
- Genuine CAS: `executionRepository.closePauseIfOpen(openPause, tx)` performs a conditional UPDATE (only succeeds if `resumed_at IS NULL` in the DB at UPDATE time); if it returns false (lost the race / already resumed), the transaction throws `ServiceExecutionTransitionException` before the session save or the `ServiceExecution.Resumed` event is enqueued.
- This is the real IP-001 CAS pattern — the report's characterization is accurate here.
- Verdict: **Safe to retry blind.**

### 2.3 `POST .../start` (check-in, `manage-order.usecase.ts` `start()`) — **CONCERN**
### 2.4 `POST .../complete` (check-out, `manage-order.usecase.ts` `completeExecution()`) — **CONCERN**
- Both go through `OrderLifecycleService.commit()` → `MarketplaceOrderRepository.save()`.
- `save()` (`drizzle-marketplace-order.repository.ts`) is a **blind `INSERT ... ON CONFLICT (id) DO UPDATE`** — it unconditionally overwrites `status`/`startedAt`/`completedAt`/etc. with whatever is in the in-memory `order` object. There is **no `WHERE status = previousStatus` clause, no `SELECT ... FOR UPDATE`, no optimistic-lock/version column** anywhere in this path.
- The only guard against a duplicate transition is the **in-memory** check `order.start()`/`order.completeExecution()` (in `marketplace-order.ts`), which throws if the `MarketplaceOrder` object — loaded at the top of the request via a plain `findById` — is not in the expected prior status (`SCHEDULED`/`IN_PROGRESS`).
- This is **read-then-write without database-level enforcement** — a materially different, weaker pattern than `resume`'s `closePauseIfOpen` conditional UPDATE or `pause`'s DB unique-index constraint. It is **not** "the same CAS pattern IP-001 established," contrary to the completion report §3.2/§3.3 claim.
- Practical risk for `fetchWithRetry` specifically: because `fetchWithRetry` only issues attempt N+1 after attempt N's `fetch()` promise has *rejected* (a `TypeError` — connection genuinely failed), the two attempts are strictly sequential from the client's point of view. For the common case where attempt 1 never reached the server (DNS/connection-refused before any request bytes sent) or fully completed-then-committed before the socket dropped, attempt 2's fresh `findById` read will see the correct post-transition state and the domain guard rejects it safely.
- However there **is** a narrow but real race window: if the client's TCP connection dies *while the server is still mid-request* (e.g., a genuine "response lost in flight" — request bytes delivered, server begins processing, but the socket is torn down by a network handover before the server's transaction commits and the response is written back), the client sees the same `TypeError` and retries. If the original request is *still in-flight and has not yet committed* when the retry's `findById` executes, the retry can read the **pre-transition** status, pass the in-memory guard, and now two concurrent transactions can both proceed to insert/enqueue a `MarketplaceOrder.Started` / `MarketplaceOrder.ExecutionCompleted` event and commit — the blind `onConflictDoUpdate` will not detect or reject this; whichever commits last simply wins, and **both** outbox events have already been enqueued (outbox insert happens in the same transaction as the order save, before either transaction knows about the other).
- For `complete` specifically this is the highest-consequence case in the whole IP: `MarketplaceOrder.ExecutionCompleted` carries `actualDuration`/`billableMinutes` and is what downstream billing/Trust Score consumers key off. A duplicate firing of this event (even if the order row itself ends up in a consistent final state) is exactly the "network retry silently double-firing a business-critical transition" scenario the task brief called out as CRITICAL.
- **This is a genuine gap, not a theoretical nitpick**: the fix is straightforward and already modeled in the same file (`resume`'s conditional update) — e.g. `UPDATE marketplace_orders SET status = $new WHERE id = $id AND status = $previousStatus RETURNING id`, aborting the transaction (and the event enqueue) if zero rows are affected.

### 2.5 `POST .../travel-status/en-route` (`manage-order-travel-status.usecase.ts` `markEnRoute()`)
- `OrderTravelStatus.markEnRoute()` is explicitly documented and implemented as idempotent-by-design from `EN_ROUTE` (re-declaring ETA is a supported, expected user action, not just a retry accommodation) — end state after N repeats is identical.
- **Caveat**: every call, including a pure network-retry duplicate with the same payload, still calls the external `EtaEstimatorPort.estimate()` again and enqueues a **new** `MarketplaceOrder.PartnerEnRoute` outbox event and a new audit-log row. If anything downstream treats this event as "notify buyer partner is en route," a lost-response retry could cause a duplicate notification. This is a **minor** deviation from the report's wording ("a no-op re-declare, not a duplicate effect") — the *state* is a no-op, but the *event/audit trail* is not exactly a no-op. Low real-world severity since re-declaring ETA is already a normal, repeatable user action server-side.

### 2.6 `POST .../travel-status/arrived` (`manage-order-travel-status.usecase.ts` `markArrived()`)
- `OrderTravelStatus.markArrived()` only transitions from `EN_ROUTE` and is terminal; a second call after the state is already `ARRIVED` throws `OrderTravelTransitionException` on the in-memory guard (same fresh-read pattern as start/complete). No DB-level CAS here either (same blind-upsert `repository.save()` shape), but the transition is terminal and one-directional, and the practical race window is even narrower than start/complete (no further status to race into afterward, and no downstream billing consequence tied to double-firing "arrived"). Acceptable risk, but same underlying pattern gap as §2.3/2.4.

## 3. `idempotent: true` scoping (claim #2)

`grep -rn "idempotent" apps/web` finds exactly 6 call sites setting `idempotent: true` — two via the shared `act()` helper's 4th argument (`start`, `complete`) and four explicit (`en-route`, `arrived`, `pause`, `resume`). No other call site in the codebase sets it. Evidence upload (`execution-evidences`), service notes, reviews, Change Order create/submit/approve/reject, order cancel, referral/points/cashback admin config calls all correctly default to `idempotent: false` (verified by absence from the grep results — every other `authApi`/`api.request` call site in `apps/web` omits the flag). **Claim confirmed.**

## 4. `fetchWithRetry` correctness (`apps/web/lib/api.ts`)

- Retries only on the `fetch()` call itself throwing (network-level `TypeError`) — confirmed by the `try { return await fetch(...) } catch (error) { ... }` structure; a resolved `Response` (including 4xx/5xx) is returned immediately on the first line of the `try` block and never enters the retry path.
- `GET` is always retryable (`retryable = method === 'GET' || options.idempotent === true`).
- `maxAttempts = retryable ? 3 : 1` → up to 2 extra attempts, matching the claim.
- Backoff: `300 * 2 ** (attempt - 1)` → 300ms then 600ms. Matches the claim.
- **Claim confirmed**, this is a correct, conservative implementation.

## 5. `sw.js` GET-only interception (claim #3)

- `fetch` event handler: `if (request.method !== 'GET') { return; }` is the very first check — unconditional early return before any cache/network logic, so POST/PUT/DELETE (including multipart evidence upload) are never intercepted, cached, or replayed. **Confirmed.**
- Cache-first is scoped to `/icons/*`, `/manifest.json`, `/_next/static/*` — all content-hashed or versioned by Next.js build, so a stale cache entry cannot survive a redeploy under a *different* filename; the claim that this can't serve stale JS across a deploy is reasonable (not tested against a live redeploy, as both the report and this review note — no dev server available).
- `offline.html` fallback only triggers in the `.catch()` of the network-first branch, and only for `request.mode === 'navigate'` — a genuine fetch failure, never masking a real HTTP error response (which would resolve, not reject, `fetch()`). **Confirmed.**
- **New finding not in the report (F5, see below)**: `apps/web/public/sw.js` is a plain, un-transpiled worker script served from `public/`, and it is **not excluded from the repo's ESLint scope**. Running the top-level `pnpm lint` (rather than only `pnpm --filter @trust/web ...`) fails with 16 `no-undef` errors (`self`, `caches`, `fetch`, `URL`, `Response` all flagged as undefined) because no ESLint `env: serviceworker` / worker globals are configured for `public/*.js`. The file is functionally correct (these are real Service Worker globals), but the repo's lint gate is not currently green.

## 6. Camera capture (claim #5)

`apps/web/app/orders/[orderId]/page.tsx` diff shows `capture="environment"` added as a new attribute on the existing `<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" .../>`; the `accept` allowlist and the surrounding `FormData`/upload-submission code (`onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}` and whatever builds the multipart body downstream) are untouched by this diff — confirmed by reading the full diff hunk, which shows only the one new line inserted. **Confirmed additive-only, no contract change.**

## 7. PWA manifest/registration (claim #6)

- `manifest.json` is valid JSON with `name`, `short_name`, `start_url`, `display: standalone`, `background_color`, `theme_color`, and 3 icon entries (192/512/maskable-512) — all required PWA fields present.
- `service-worker-registration.tsx`: client-only (`'use client'`), guards `typeof window === 'undefined'` and `!('serviceWorker' in navigator)`, and `.catch()`s the registration promise so a failure is fully swallowed — never blocks render, runs in a `useEffect` with `[]` deps (fires once, post-mount). **Confirmed safe.**
- `layout.tsx`: `<ServiceWorkerRegistration />` is mounted inside `<body>`, does not wrap or gate `{children}` — rendering is not blocked by it. **Confirmed.**

## 8. Responsive/deep-link/tap-target spot checks (claim #7)

Spot-checked directly (not re-derived from the report):
- `components/ui.tsx` — `PrimaryButton`/`SecondaryButton` are `w-full px-4 py-3` with the `btn-text` typography class; consistent with the report's ≈48px height claim.
- `globals.css` `.tds-input` — `font-size: 16px` confirmed (prevents iOS Safari auto-zoom-on-focus).
- Dynamic routes `/orders/[orderId]`, `/marketplace/[listingId]`, `/service-requests/[serviceRequestId]`, `/conversations/[conversationId]`, `/p/[token]` all appear as `ƒ` (dynamic/server-rendered) entries in the `next build` route table reproduced in §"Test re-run" below — matches the report's deep-link claim.

## 9. Offline.html i18n deviation (claim #8)

`offline.html` is a static file served directly by the service worker's `fetch` handler outside the Next.js render tree — it genuinely cannot import `LocaleProvider`/`lib/i18n/` (those are React modules bundled into the app JS, not available to a document served as a raw cache hit before any app JS may have loaded). The `navigator.language`-based pt/en switch is a reasonable, low-risk interim approach for a rarely-seen fallback page. **Architecturally correct, not a shortcut** — confirmed.

## 10. Findings summary

| # | Finding | Severity |
|---|---|---|
| F1 | `start`/`complete` (check-in/check-out) rely on an in-memory, read-then-write status guard with a **blind** `onConflictDoUpdate` (no `WHERE status = previousStatus`, no optimistic lock) — this is materially weaker than the `resume`/`pause` CAS patterns the report claims they reuse. A narrow but real race (client retry firing while the original request is still mid-flight, socket dropped before commit) can cause two `MarketplaceOrder.Started`/`MarketplaceOrder.ExecutionCompleted` events to be enqueued for the same transition. | **CRITICAL** |
| F2 | `travel-status/arrived` shares the same blind-upsert pattern as F1 (no DB-level CAS), though the transition is terminal and lower-consequence. | MAJOR |
| F3 | `travel-status/en-route` is state-idempotent by design, but every repeated call (including a pure retry) enqueues a new `MarketplaceOrder.PartnerEnRoute` event and re-calls the ETA estimator — the report's "no duplicate effect" wording overstates this slightly (state is a no-op; event/audit trail is not). | MINOR |
| F4 | Repo-wide `pnpm lint` fails (16 `no-undef` errors) on the new `apps/web/public/sw.js` — no ESLint service-worker env/globals configured for files under `public/`. The report only ran the web-scoped typecheck/build, not the full repo lint, so this was not caught. | MAJOR |
| F5 | Manifest icons are solid-color placeholder PNGs, disclosed by the report as a known follow-up, not a functional defect. | OBSERVATION |
| F6 | `offline.html` i18n deviation, disclosed by the report, judged architecturally sound. | OBSERVATION |

## 11. Regression / test re-run

- `pnpm --filter @trust/web typecheck` — clean (matches report).
- `pnpm --filter @trust/web build` — clean, 33 routes, matches report's route table exactly (including `orders/[orderId]` at 8.45 kB).
- `pnpm typecheck` (repo-wide, both `apps/api` and `apps/web`) — clean.
- `pnpm lint` (repo-wide) — **FAILS**, 16 errors, all in `apps/web/public/sw.js` (see F4). This was not surfaced by the completion report.
- Backend e2e suite not re-run (frontend-only diff confirmed by `git diff --stat`), consistent with the report's own scoping and prior IPs' precedent — acceptable since zero `apps/api/**` files are touched.

## 12. Confirmation pass (2026-09-17, independent, post-fix)

Re-verified independently against the Executor's claimed fixes in `IP-022-COMPLETION-REPORT.md` §3.2/§3.4/§7. Not a full re-review — scoped to F1/F2/F4 closure plus a quick re-check that nothing else shifted.

**F1/F2 (CRITICAL/MAJOR) — CLOSED.** Read `apps/web/lib/api.ts` diff and `apps/web/app/orders/[orderId]/page.tsx` directly (not just the report's prose):
- `idempotent: true` grep across `apps/web` now returns exactly 3 call sites: `pause` (line 316), `resume` (line 336), `travel-status/en-route` (line 278). `start`/`complete` (via the shared `act()` helper) and `travel-status/arrived` have no `idempotent` flag at all — confirmed by reading the full call sites, not just the grep.
- The shared `act()` helper (`page.tsx`, used by `start`/`complete`) no longer takes an `idempotent` parameter — confirmed by reading its signature (`const act = async (path: string, body?: unknown, successText?: string) => {...}`), matching the report's claim that the dead parameter was fully removed, not just left unused.
- **Fix choice judgment**: the Executor took the minimal option (drop `idempotent: true` from the three unsafe call sites) rather than adding backend DB-level CAS. This is a reasonable and genuinely safe choice for a frontend-scoped IP: it fully eliminates the race (no client retry means no possibility of two in-flight requests racing each other for the same transition) rather than mitigating it, and it reverts `start`/`complete`/`arrived` to exactly their pre-IP-022 behavior (no retry ever existed there before). This is a narrowing of scope/value delivered, not a regression — confirmed correct framing in report §6 item 3.
- The 3 remaining `idempotent: true` sites were re-read end-to-end in this pass: `pause` still carries its DB partial-unique-index guard (unchanged in this fix round — the fix touched only `idempotent` flags and the ESLint config, not the pause/resume/en-route code paths), `resume` still calls `closePauseIfOpen()`'s genuine conditional `UPDATE ... WHERE resumed_at IS NULL`, and `en-route` is unchanged from the original pass. No backend files were touched at all in this fix round (`git diff --stat -- apps/api` is empty), so nothing could have altered their safety — confirmed directly rather than inferred.

**F4 (MAJOR) — CLOSED.** Read the new block in `eslint.config.mjs` (lines 53–71): scoped via `files: ['apps/web/public/sw.js']` — a single exact-path glob, not a directory-wide or extension-wide pattern, so it cannot leak leniency to any other file. It only adds `languageOptions.globals` (`self`, `caches`, `clients`, `fetch`, `Response`, `Request`, `URL`, `Promise`, all `readonly`) — it does not touch, disable, or override the `rules` block, so `no-undef`/`no-unused-vars`/etc. still fully apply within `sw.js`; only the specific Service Worker global identifiers are declared as known, which is the narrowly-correct fix (not a blanket rule suppression).

**Test re-run (this pass, from scratch):**
- `pnpm --filter @trust/web typecheck` — clean.
- `pnpm --filter @trust/web build` — clean, 33 routes, `orders/[orderId]` at 8.41 kB (matches report).
- `pnpm typecheck` (repo-wide) — clean.
- `pnpm lint` (repo-wide) — **clean, 0 errors** (was 16). Reproduced independently.
- `git status --short` — confirms the diff is still `apps/web/app/layout.tsx`, `apps/web/app/orders/[orderId]/page.tsx`, `apps/web/lib/api.ts`, `eslint.config.mjs` (modified) plus `apps/web/components/service-worker-registration.tsx`, `apps/web/public/**` (new). Zero `apps/api/**` touched — verified directly, not accepted from the report, so no backend e2e re-run is needed.

**Verdict: PASS.** Both blocking findings (F1 CRITICAL, F4 MAJOR) are genuinely closed. The proactive `travel-status/arrived` fix is consistent with the same root-cause fix already applied to `start`/`complete` and was independently verified safe. No new issues introduced by the fix round.
