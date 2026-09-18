# IP-022 — Completion Report

**Mobile/Responsive/PWA Field Experience**
Executed 2026-09-17. Owner: Frontend/domain implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§9 Frontend) > IP-022 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-022_Mobile_Responsive_PWA_Field_Experience.md`) > `IP-016-COMPLETION-REPORT.md`/`IP-016-DIFF-REVIEW.md` > `IP-017-COMPLETION-REPORT.md`/`IP-017-DIFF-REVIEW.md` > real repository state at baseline `791c409`, branch `main`. No live dev server available in this sandbox — static contract/typecheck/build verification only, same constraint IP-016/IP-017 documented.

**Revision note (post-Diff-Review fix, same day):** the independent Diff Review (`IP-022-DIFF-REVIEW.md`) returned verdict FAIL with one CRITICAL finding (F1) and one MAJOR finding (F4), both addressed below in §3.2/§3.4/§8 before this report was finalized. §3.2 as originally written claimed `start`/`complete` reused the same CAS pattern as `pause`/`resume`; the Diff Review traced the real backend and found that claim was **wrong** — `MarketplaceOrderRepository.save()` is a blind `ON CONFLICT DO UPDATE` with no DB-level compare-and-swap, unlike `resume`'s genuine conditional `closePauseIfOpen()` update. The original §3.2 text below has been corrected in place rather than left as a false claim with a patch note bolted on.

## 1. Scope and preflight

Hard dependencies IP-016 (Member journey) and IP-017 (Partner journey) are both committed on `main`. Direct reads of `apps/web/app/**` (Member: `service-requests/**`, `orders/[orderId]`; Partner: `partner/availability`, the Partner-side cards in `orders/[orderId]`), `apps/web/components/ui.tsx`, `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/lib/api.ts`, `apps/web/next.config.ts`, and `apps/web/package.json` found:

- **VERIFY_ONLY — already adequate, no change made**:
  - **Responsive layout / tap targets.** All screens use Tailwind flex/grid with `w-full`/`max-w-[…]` containers, not fixed pixel widths that would overflow at 375–428px. `PrimaryButton`/`SecondaryButton` (`components/ui.tsx`) are `w-full`, `px-4 py-3` with `btn-text` (16px/24px line-height) — real rendered height ≈48px, well above the 44×44px guideline. `.tds-input` (`globals.css`) uses `font-size: 16px` (prevents iOS Safari's auto-zoom-on-focus) and `padding: 0.75rem 1rem` (≈48px tall). No genuinely broken (overflowing/unreadable/unusable) layout was found in the sampled screens; where tables exist they already use horizontal-scroll containers rather than forcing page-level overflow. Conclusion: no forced cosmetic rework — nothing here met the "genuinely broken" bar the IP asks to focus on.
  - **Deep links.** Next.js App Router routes (`/orders/[orderId]`, `/service-requests/[serviceRequestId]`, `/conversations/[conversationId]`, `/marketplace/[listingId]`, `/p/[token]`) are all directly linkable server-rendered/dynamic routes by construction; a notification or external link to any of these resolves correctly with no additional work. Confirmed by reading the route tree and the dynamic-route build output (`ƒ` entries in `next build`). No gap found.
  - **Viewport meta.** Next.js 15 injects a default responsive viewport meta automatically; this IP made it explicit (see §3) rather than leaving it implicit, but there was no broken/missing behavior to begin with.

- **Genuine gaps closed** (see §3): camera capture on the execution-evidence file input, bounded network retry for GET and for specific CAS-guarded state-transition mutations, and a minimal PWA installable shell (manifest + service worker + offline fallback) — none of which existed at all before this IP (`apps/web/public/` did not exist; `apps/web/lib/api.ts` had no retry path; the evidence `<input type="file">` had no `capture` attribute).

## 2. Backend investigation

None needed. This IP is frontend-only per its own scope (§4: "no backend business logic changes... except possibly a minimal PWA-support static file, which has no backend component"). `git status --short` confirms the diff is entirely under `apps/web/**`; no backend files were read for modification, only for the idempotency judgment call in §3.2 (reusing what IP-001/IP-017 already established about Trust Pause/Resume being a CAS-guarded transition).

## 3. Gaps closed

### 3.1 Camera capture for field evidence (IP-006 contract, IP-017 upload UI)

`apps/web/app/orders/[orderId]/page.tsx` — the execution-evidence `<input type="file">` (the only Partner-in-field, evidence-capture file input in the app; the admin verification-review upload in `verifications/page.tsx` is a back-office moderation flow, not field capture, and was intentionally left untouched) now has `capture="environment"`, so a mobile browser offers the rear/back camera directly instead of only a file/gallery picker. The existing `accept="image/jpeg,image/png,image/webp,application/pdf"` allowlist is unchanged — `capture` only biases the picker UI, it doesn't affect what the backend accepts, and file-picker fallback (choosing an existing photo or a PDF) still works exactly as before on desktop or when `capture` isn't supported.

### 3.2 Bounded network retry (`apps/web/lib/api.ts`) — corrected after Diff Review F1/F2

Added `fetchWithRetry` inside `rawRequest`: retries only on a `fetch`-level `TypeError` (request never reached the server — dropped connection, DNS failure, timeout), never on a parsed 4xx/5xx business response. Up to 2 extra attempts, 300ms/600ms backoff. Retry is applied:
- **Always** for `GET` (naturally idempotent, no risk).
- **Only when the caller explicitly opts in** via a new `idempotent: true` request option, for mutations. This was deliberately *not* made a blanket default for all POSTs, because most mutations in this codebase (evidence upload, service notes, reviews, Change Order creation) create a new record on each success — a client retry after a "request sent but response lost" scenario would risk duplicating that record, which the spec explicitly forbids ("do NOT add client retry logic for a backend operation that isn't genuinely idempotent").

**Originally** `idempotent: true` was applied to six mutations, including `start`/`complete`/`arrived`, on the claim that all six reuse the same CAS pattern IP-001 established for Trust Pause/Resume. The independent Diff Review traced the real backend and found this claim was **false for three of the six**: `POST .../start` (check-in), `.../complete` (check-out), and `.../travel-status/arrived` all go through `MarketplaceOrderRepository.save()` / the equivalent travel-status repository save, which is a **blind `INSERT ... ON CONFLICT DO UPDATE`** — no `WHERE status = previousStatus`, no `SELECT ... FOR UPDATE`, no optimistic-lock column. The only guard is an **in-memory** status check against a `findById` snapshot taken earlier in the same request. That is read-then-write, not compare-and-swap. `resume`'s `closePauseIfOpen()`, by contrast, is a genuine conditional `UPDATE ... WHERE resumed_at IS NULL`, and `pause` is additionally protected by a DB partial-unique-index constraint — both really are safe to retry blind. The Diff Review identified a narrow but real race: if a client's connection drops *while the server is still mid-request, after it began processing but before it commits*, a retry's fresh `findById` can, in that window, still observe the pre-transition status, pass the in-memory guard, and let two concurrent transactions both enqueue `MarketplaceOrder.Started` / `MarketplaceOrder.ExecutionCompleted` — a real double-fire of a business-critical event (rated CRITICAL for `complete`, whose event carries `actualDuration`/`billableMinutes` consumed by billing/Trust Score; MAJOR for `arrived`, same pattern, lower consequence since it's a terminal one-way transition).

**Fix applied (minimal/faster option, as offered by the escalation, in preference to adding new backend CAS logic in a frontend-scoped IP):** `idempotent: true` was **removed** from `start`, `complete`, and `arrived`. These three mutations now behave exactly as they did before this IP — sent once, no client-side retry — closing the race entirely rather than accepting it. The shared `act()` helper (used by `start`/`complete`) no longer takes an `idempotent` parameter at all, since nothing calls it with `true` anymore; the dead parameter was removed rather than left unused.

`idempotent: true` remains applied only where the Diff Review independently confirmed a genuine DB-level (or design-level) guard:
- `POST .../pause` — DB partial-unique-index on the open-pause row prevents a concurrent duplicate from ever persisting, independent of the in-memory check.
- `POST .../resume` — genuine conditional `UPDATE ... WHERE resumed_at IS NULL` (`closePauseIfOpen`), the real CAS pattern.
- `POST .../travel-status/en-route` — the domain method (`OrderTravelStatus.markEnRoute()`) is documented and implemented as idempotent-by-design from `EN_ROUTE` (re-declaring ETA is itself a normal, repeatable user action, not just a retry accommodation); the Diff Review flagged as MINOR that a pure retry still re-calls the ETA estimator and enqueues a new `PartnerEnRoute` event/audit row (not a fully silent no-op), judged acceptable low severity and left as-is.

Deliberately **not** marked idempotent/retryable: `start`, `complete`, `arrived` (see above), evidence upload, service notes, review submission, and Change Order creation/submit/approve/reject. Approve/reject in particular is money-adjacent (PACK-03 §6.1) and was left to manual retry (full visibility to the user) out of extra caution even though it is state-guarded in the same in-memory-only sense as `start`/`complete`, consistent with this same finding's logic — it was never marked retryable in the first place, so no change was needed there.

**If a future IP adds genuine DB-level CAS to the order-lifecycle `start`/`complete` transitions** (the escalation's preferred, higher-value option — e.g. a conditional `UPDATE marketplace_orders SET status = ? WHERE id = ? AND status = ? RETURNING id`, mirroring `resume`'s `closePauseIfOpen()`), `idempotent: true` can be safely re-added to these three call sites at that point. That backend change was judged out of scope for this pass: it touches `apps/api/**` order-lifecycle persistence, which is a materially different risk/review surface than the frontend-only diff this IP was scoped to, and the minimal fix fully closes the CRITICAL finding without it.

### 3.3 PWA installable shell (new, `apps/web/public/`, minimal scope per the spec's own restraint)

- `manifest.json` — name/short_name, `display: standalone`, theme/background colors matching the TDS tokens (`--color-primary` `#0037b0`, `--color-background` `#faf8ff`), `start_url: /dashboard`, three icons (192/512/maskable-512). **Deviation, disclosed**: no brand-art generation tool was available in this sandbox, so the icons are solid-color TDS-primary PNGs generated by a small local Node script (valid, installable PNGs, not a placeholder image asset pulled from anywhere external) — functionally correct for installability but should be swapped for real brand art before this ships to users; flagged here explicitly rather than left silent.
- `sw.js` — cache-first for `/icons/*`, `/manifest.json`, and `/_next/static/*` (hashed build assets); network-first for everything else (navigation + API), falling back to `/offline.html` only on an actual fetch failure during navigation. Non-`GET` requests are never intercepted by the service worker — mutations always go straight to the network, so the SW cannot ever serve a stale/wrong response to a check-in or evidence upload.
- `offline.html` — static fallback page shown only when navigation fails with no network. **Deviation, disclosed**: this page is served directly by the service worker outside the Next.js/React tree, so it cannot use `LocaleProvider`/the i18n catalog; it ships fixed pt-BR/en-US copy switched once via `navigator.language`, not routed through `lib/i18n/`. This is the one place in the diff that doesn't follow the "every user-facing string goes through `lib/i18n/`" rule, and it's disclosed rather than silently deviated from — the alternative (no offline fallback, or a fallback that itself depends on JS bundles that may not have loaded) was judged worse for the field-use case this IP targets.
- `apps/web/components/service-worker-registration.tsx` (new) — client-only `useEffect` that registers `/sw.js`, swallows registration failure (progressive enhancement, never blocks the app).
- `apps/web/app/layout.tsx` — added `manifest: '/manifest.json'` and `appleWebApp` to `Metadata`, a `Viewport` export (`width: device-width`, `initialScale: 1`, `themeColor`), and mounted `<ServiceWorkerRegistration />`.

No offline data-sync queue, no background sync, no push notifications — out of scope per the spec's explicit "optionally PWA... a basic installable shell... is the right scope."

### 3.4 ESLint scope for the Service Worker (fix for Diff Review F4)

The Diff Review ran repo-wide `pnpm lint` (this report originally only ran the web-scoped `typecheck`/`build`, not the full lint) and found 16 `no-undef` errors in `apps/web/public/sw.js`: the repo's `eslint.config.mjs` had no Service Worker global-scope declarations (`self`, `caches`, `clients`, `fetch`, `Response`, `Request`, `URL`), so ESLint's browser/Node defaults didn't recognize them. Fixed by adding one narrowly-scoped config block to `eslint.config.mjs`, matching only `apps/web/public/sw.js`, declaring exactly those globals as `readonly` — no rule was loosened, and no other file's lint scope changed. `pnpm lint` (repo-wide) now passes with 0 errors.

## 4. Files changed

```
 M apps/web/app/layout.tsx
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/lib/api.ts
 M eslint.config.mjs
?? apps/web/components/service-worker-registration.tsx
?? apps/web/public/manifest.json
?? apps/web/public/sw.js
?? apps/web/public/offline.html
?? apps/web/public/icons/icon-192.png
?? apps/web/public/icons/icon-512.png
?? apps/web/public/icons/icon-maskable-512.png
```

No i18n catalog files were modified — this IP introduced no new *in-app* user-facing vocabulary requiring a translation key (the SW-served `offline.html` copy is the one disclosed exception in §3.3).

## 5. Tests / verification

- `pnpm --filter @trust/web typecheck` — clean, no errors.
- `pnpm --filter @trust/web build` — succeeds; all 33 routes generate/compile correctly, including the modified `orders/[orderId]` route (8.41 kB after the F1/F2 fix removed the now-dead `idempotent` parameter from `act()`) and the new static files under `public/`.
- `pnpm typecheck` (repo-wide, `apps/api` + `apps/web`) — clean.
- `pnpm lint` (repo-wide) — **clean, 0 errors** (was 16 errors before the F4 fix in §3.4).
- No backend files touched (confirmed by `git status --short`: only `apps/web/**` + `eslint.config.mjs`), so the 134/134 file / 840/840 backend e2e baseline is unaffected by construction; not re-run. This IP deliberately took the frontend-only fix option for F1 (§3.2) specifically so no backend change, and therefore no backend e2e re-run, would be needed — consistent with IP-016/IP-017's own scoping and with keeping this a scoped fix rather than a broader change.
- No dev server available in this sandbox — service worker install/activate, offline fallback rendering, and manifest installability prompts were verified by static review of `sw.js`/`manifest.json` logic only, not by an actual browser `chrome://inspect/#service-workers` or Lighthouse PWA audit. This is the same constraint IP-016/IP-017 operated under.

## 6. Blockers / deviations (summary)

1. Manifest icons are generated placeholder PNGs (solid TDS-primary color), not real brand art — no image-generation tool was available; flagged for a follow-up asset swap, not a functional blocker.
2. `offline.html` copy bypasses `lib/i18n/` (fixed bilingual text, switched by `navigator.language`) because it is served by the service worker outside the React tree — disclosed, not silent.
3. `start`/`complete`/`arrived` do **not** get automatic network retry (see §3.2) — this is a narrowing relative to the original implementation, not a regression relative to pre-IP-022 `main` (these three never had client retry before this IP either). A genuine fix (DB-level CAS on the order-lifecycle transitions, mirroring `resume`) is flagged as a candidate for a future backend-scoped IP, not done here since it's outside this IP's frontend-only scope.
4. No other blockers. No Conflict Escalation needed.

## 7. Areas for the Checker's highest scrutiny

1. **Retry safety, narrowed scope** — re-verify that the three remaining `idempotent: true` call sites (`pause`, `resume`, `travel-status/en-route`) are genuinely safe per §3.2's corrected characterization (DB partial-unique-index for `pause`, genuine conditional `UPDATE` for `resume`, documented idempotent-by-design domain method for `en-route`) — and confirm `start`/`complete`/`arrived` truly have zero retry path left (grep `idempotent` in `apps/web` should show exactly 3 `true` call sites now, not 6).
2. **`act()` signature change** — confirm removing the dead `idempotent` parameter from the shared `act()` helper didn't silently change behavior for its other callers (`complete-completion`... i.e. `confirm-completion`, `cancel`) — both were already `idempotent: false`-equivalent (no flag) before and after, only the now-unused parameter was deleted.
3. **Service worker fetch interception** — confirm the `request.method !== 'GET'` early-return in `sw.js` truly excludes all mutations (including multipart evidence upload) from ever being intercepted, and that cache-first for `/_next/static/*` can't ever serve a stale JS bundle across a deploy in a way that breaks the app shell (Next.js's content-hashed filenames should make this safe, but wasn't tested against a live redeploy).
4. **ESLint SW globals scoping (§3.4)** — confirm the new `eslint.config.mjs` block matches only `apps/web/public/sw.js` and doesn't inadvertently widen `no-undef` leniency to any other file via a broader glob.
5. **Offline fallback UX** — the `offline.html` i18n deviation (§3.3, §6.2) and whether the Checker considers the disclosed exception acceptable given the constraint, or requires a different approach (e.g., routing offline copy through a tiny inlined script that reads a locale cookie).

This is the last IP of Wave 6. Once this passes, only Wave 7 (IP-024, final release-readiness gate) remains.
