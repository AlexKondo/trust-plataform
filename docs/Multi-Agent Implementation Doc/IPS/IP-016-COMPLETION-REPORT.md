# IP-016 — Completion Report

**Trust Member Experience**
Executed 2026-09-17. Owner: Frontend/domain implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§8 i18n, §9 Frontend) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` (§2) > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-016 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-016_Trust_Member_Experience.md`) > `CLAUDE.md` history > real backend controllers/DTOs at the frozen baseline (`c53f344`, branch `main`).

## 1. Scope and preflight (confirmed, not re-derived)

This IP is a **closing** pass over `apps/web`: the journey (onboarding → profile/passport → create need → discover/compare offers → schedule → authorize/pay → follow ETA → approve Change Order → view evidence/summary → confirm service → dispute/refund → review Partner → view Trust/rewards) is implemented end to end by ~25 existing screens plus the backend. Preflight (already supplied, re-verified by direct file reads before writing any code) found:

- **Existing, correct, untouched (VERIFY_ONLY)**: `admin/*`, `conversations/*`, `dashboard`, `forgot-password`, `login`, `marketplace/*`, `notifications/page.tsx`, `orders/page.tsx`, `p/[token]`, `register`, `reset-password`, `settings/*`, `trust-passport`, `trust-score`, `verifications`, `verify-email`. `orders/[orderId]/page.tsx` was confirmed to already implement the full order lifecycle (timeline, schedule, start/complete/confirm, review, dispute, cancel) — its gaps (no Change Order approval, no incremental-payment breakdown, no evidence/notes) are exactly what this IP closes, by extending the same file.
- **Genuine gaps** (zero UI references anywhere in `apps/web`, confirmed again by `grep -ril` before writing code): create-need screen (IP-003 `ServiceRequest`), offer discovery/comparison screen (IP-004), Change Order approval UI (PACK-03), incremental-payment UI (IP-007), evidence/service-summary display (IP-006). Travel-status/ETA had a backend endpoint (IP-005) but no Member-facing screen.

## 2. Backend investigation — result: **no backend changes needed**

Before writing any frontend code I read every relevant controller/DTO in full:

- `apps/api/src/modules/marketplace/infrastructure/api/marketplace-service-request.controller.ts` — `POST /marketplace/service-requests`, `GET .../mine`, `GET .../:id`, `GET .../:id/matches` (IP-003 discovery), `GET .../:id/offers` (IP-004 comparison), `POST .../:id/engage`.
- `apps/api/src/modules/marketplace/infrastructure/api/marketplace-offer.controller.ts` — full negotiation lifecycle (create/update/withdraw/counter/accept/reject), unchanged, reused via the conversation screen.
- `apps/api/src/modules/marketplace/infrastructure/api/marketplace-change-order.controller.ts` — `POST/GET .../change-orders`, `POST .../submit|approve|reject|cancel`, `GET .../service-summary` (PACK-03/IP-006), evidence and service-note endpoints.
- `apps/api/src/modules/marketplace/infrastructure/api/marketplace-order.controller.ts` — `GET/POST .../travel-status[/en-route|/arrived]` (IP-005).
- `apps/api/src/modules/payment/infrastructure/api/payment.controller.ts` + `get-payment.usecase.ts` + `payment.mapper.ts` — `GET /payments/by-order/:orderId` already returns `custodySummary` (IP-007: `originalAmount`, `totalCommerciallyAuthorized`, `totalHeld`, `amountAuthorizedNotInCustody`, `incrementalTranches[]`) whenever at least one incremental authorization exists for the order.

**Every read endpoint the Member-facing gaps needed already existed**, with response shapes that already exclude Partner economics for the Member: `ChangeOrderResponse.trustFeeRateBps` / `changeTrustFeeAmount` / `changeProviderNetBeforePspFees` and `ServiceSummaryResponse.currentTrustFeeAmount` / `currentProviderNetBeforePspFees` are typed **optional** in the API DTO and (per the controller comments) only populated for the Partner/admin caller — the frontend types added for this IP (`apps/web/lib/types.ts`) deliberately **omit** those fields entirely, so there is no code path in the new screens that could render them even by accident.

**No backend files were modified.** `git status --short` at the end of this work shows changes confined to `apps/web/**` — confirmed below in §6.

## 3. Gaps closed — files created

| Journey step | File (absolute path) | Notes |
|---|---|---|
| Create need (IP-003) | `C:\projects\trust\apps\web\app\service-requests\new\page.tsx` | Form → `POST /marketplace/service-requests`; client only checks non-empty/min-length for UX, all real validation is server-side (422 surfaced via `ApiError`). |
| My service requests (entry point, IP-003) | `C:\projects\trust\apps\web\app\service-requests\page.tsx` | `GET /marketplace/service-requests/mine`; loading/error/empty states; nav entry added. |
| Discover + compare offers (IP-003 matches / IP-004 comparison) | `C:\projects\trust\apps\web\app\service-requests\[serviceRequestId]\page.tsx` | `GET .../matches` (eligible Partners, `POST .../engage` to contact one) and `GET .../offers` (side-by-side comparison of each engaged negotiation's live offer — pricing model, amount, round count). Only Member-facing fields rendered (`ServiceRequestOfferComparisonItem`/`OfferComparisonTerms` have no Partner-economics fields in the API DTO itself). |

Nav: `apps/web\components\app-shell.tsx` — added a `nav.serviceRequests` menu entry (`/service-requests`) alongside the existing Marketplace/Conversations/Orders items, wired through `useLocale()`/`t()` exactly like the other menu items already are.

i18n: `apps/web\lib\i18n\messages\pt-BR.ts` and `apps/web\lib\i18n\messages\en-US.ts` — added the single new key (`nav.serviceRequests`) needed by the nav entry, preserving the `satisfies Messages` key-parity contract (en-US only type-checks if every pt-BR key is present).

## 4. Gaps closed — files modified

`C:\projects\trust\apps\web\app\orders\[orderId]\page.tsx` (existing 583-line order-detail screen, extended in place — no new route needed since Change Order approval, incremental payment, evidence and ETA are all order-scoped):

1. **Travel status / ETA (IP-005)** — new card, shown only once the Partner has declared movement (`travelStatus.status !== 'NOT_STARTED'`), reading `GET .../travel-status`.
2. **Change Order approval (PACK-03 §9 financial-confirmation requirement)** — new card listing every `PENDING_APPROVAL` Change Order with an explicit three-figure breakdown (**original order amount** + **this change's amount** + **total if approved**), plus Approve/Reject buttons calling `POST /marketplace/change-orders/{id}/approve|reject`. A second card lists already-decided Change Orders (history). No amount is computed client-side beyond simple addition for display — the actual authorization/custody state is always re-fetched from the API after a decision (`load()`).
3. **Incremental payment authorization (IP-007)** — new "Pagamento autorizado" card, rendered only when `payment.custodySummary` is present (i.e., at least one incremental authorization exists), showing original amount, each incremental tranche, the running total authorized, amount currently in custody, and amount authorized-but-not-yet-in-custody. The pre-existing "Resumo" card's single `order.amount` line is left untouched for the common case (no Change Order ever approved) — the new card supersedes it visually only when there is something incremental to show.
4. **Evidence / Service Summary (IP-006)** — new card showing execution evidence file entries (`GET .../execution-evidences`) and service notes (`GET .../service-notes`), both currently populated by the Partner during execution.

All four additions are read-only network calls wrapped in `.catch(() => defaultValue)` inside the existing `Promise.all` in `load()`, so a Member on an order with none of this data (the overwhelming majority — no Change Order, no incremental authorization) sees the screen render exactly as before, with the new cards simply not rendering (`{condition ? <Card>...</Card> : null}`).

`C:\projects\trust\apps\web\lib\types.ts` — added interfaces: `ServiceRequest`, `ServiceRequestSummary`, `ServiceRequestMatch`, `ServiceRequestEngagement`, `OfferComparisonTerms`, `ServiceRequestOfferComparisonItem`, `ServiceRequestOfferComparison`, `TravelStatus`, `ChangeOrderEvidence`, `ChangeOrder`, `ExecutionEvidence`, `ServiceNote`, `ServiceSummary`, `IncrementalTranche`, `CustodySummary`, `PaymentDetails`. Each mirrors the corresponding backend DTO field-for-field (confirmed by direct read of the `.dtos.ts` files, §2) and — where the backend DTO has optional Partner-economics fields — those fields are simply not present in the frontend type, so no new screen can reference them.

`C:\projects\trust\apps\web\lib\labels.ts` — added enum label dictionaries: `URGENCY_LABEL`, `SERVICE_REQUEST_STATUS_LABEL`, `TRAVEL_STATUS_LABEL`, `CHANGE_ORDER_TYPE_LABEL`, `CHANGE_ORDER_STATUS_LABEL`, `EXECUTION_EVIDENCE_TYPE_LABEL`, `AUTHORIZATION_STATUS_LABEL`, `CUSTODY_STATUS_LABEL`.

## 5. i18n decision (flagged for Checker scrutiny)

The repo has **two parallel, both-legitimate conventions**, confirmed by direct inspection rather than assumption:

- `apps/web/lib/labels.ts` — hardcoded PT-BR `Record<string,string>` enum dictionaries, imported directly by ~25 existing screens including `orders/[orderId]/page.tsx` itself (the file this IP extends the most). This is explicitly documented in `labels.ts`'s own header comment as the pattern that "não muda telas existentes" (does not change for existing screens).
- `apps/web/lib/i18n/` (`LocaleProvider`, `useLocale()`, `messages/{pt-BR,en-US}.ts` with `satisfies Messages` key-parity) — used today by exactly 3 screens (`settings/page.tsx`, `settings/language/page.tsx`, `settings/privacy/page.tsx`) plus the shared `AppShell` nav.

**Decision taken**: new enum vocabulary (Change Order type/status, travel status, urgency, evidence type, authorization/custody status) was added to `lib/labels.ts`, following the same convention the file being extended (`orders/[orderId]/page.tsx`) already uses for every other enum on that screen (`ORDER_STATUS_LABEL`, `DISPUTE_STATUS_LABEL`, etc.) — consistency within one screen was weighted over introducing a second i18n mechanism mid-file. The one genuinely new piece of chrome text this IP added to the global nav (`nav.serviceRequests`) **was** added through the `lib/i18n` catalog with key parity in both `pt-BR.ts` and `en-US.ts`, because `AppShell`'s menu array is already 100% `t()`-driven — adding a hardcoded string there would have broken that screen's existing convention instead.

**This is the highest-risk judgment call in this deliverable and should get the Checker's closest look.** The instruction said "every new user-facing string goes through `apps/web/lib/i18n/`... or match the existing convention exactly — do not invent a new one" — the interpretation taken is that *the existing convention for order-detail-adjacent, enum-heavy screens* is `labels.ts`, and that convention was matched exactly (same file, same `Record<string,string>` shape, same fallback-to-raw-code pattern `LABEL[x] ?? x`). None of the new copy is bilingual (en-US) today — an explicit, honest gap versus a hypothetical "everything through i18n" reading. If the Checker determines the literal instruction (all new strings through the catalog) takes precedence over convention-matching, the fix is mechanical: move the 8 new dictionaries in `labels.ts` into `messages/pt-BR.ts` + `messages/en-US.ts` and switch the 4 call sites from direct import to `useLocale().t()`.

## 6. Diff summary

```
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/components/app-shell.tsx
 M apps/web/lib/i18n/messages/en-US.ts
 M apps/web/lib/i18n/messages/pt-BR.ts
 M apps/web/lib/labels.ts
 M apps/web/lib/types.ts
?? apps/web/app/service-requests/                (new: page.tsx, new/page.tsx, [serviceRequestId]/page.tsx)
```

Zero files under `apps/api/**` touched — no backend read-model additions were needed (§2), so there is nothing to flag as a backend change.

## 7. Verification

- `pnpm --filter @trust/web typecheck` (`tsc --noEmit`): **PASS**, 0 errors, both before starting (baseline unaffected — only `apps/web` files touched) and after all changes.
- `pnpm --filter @trust/web build` (`next build`): **PASS** after fixing two ESLint `no-unused-vars` errors caught by the build's own lint step (`PrimaryButton`, `formatDateTime` unused imports in the new comparison screen). Final build output confirms all three new routes compiled: `/service-requests` (2.66 kB), `/service-requests/[serviceRequestId]` (3.9 kB, dynamic), `/service-requests/new` (3.2 kB), and the extended `/orders/[orderId]` (6.59 kB, up from its prior size, still a normal dynamic route).
- Root `pnpm -r build` / `pnpm -r typecheck` were not run in full (would also rebuild the untouched API); the targeted `--filter @trust/web` runs above are the correct and sufficient signal for a frontend-only change, per the task's own instruction ("If you only touch apps/web, this is less critical but still run typecheck/build as your primary gate").
- **Deviation**: the Postgres-backed e2e suite was **not** run. Justification: no backend files were modified (§2, §6 confirm the diff is 100% `apps/web`), and the e2e suite exercises `apps/api` against a live database — it cannot detect regressions in a change that touches zero backend code. Running it would only reconfirm the pre-existing baseline, at a cost disproportionate to this IP's actual (frontend-only) surface area.
- No automated component tests were added. `apps/web` has **zero** existing `*.test.tsx`/`*.spec.tsx` files (confirmed by `Glob`) and no test runner wired into its `package.json` scripts — there is no existing convention to extend, and inventing one (e.g., introducing Jest/RTL from scratch) was judged out of scope for a screen-closing IP whose own constraints emphasize minimality and reuse. This is a real gap, not a claimed pass.

## 8. Constraints checklist

- No client-side eligibility/pricing/state-machine logic: every new screen's only computed values are simple additions for **display** of numbers already returned by the API (e.g., `order.amount + changeOrder.changeGrossAmount` shown as "total if approved" *before* the Member clicks Approve) — the actual authorization always happens server-side and the screen re-fetches truth via `load()` after every action.
- No Partner economics exposed to the Member: verified by construction (§2, §4) — the optional economics fields were never copied into `apps/web/lib/types.ts`.
- Mobile-first, loading/error/empty states, accessibility (labels via `Field`, `htmlFor`/`id` pairing, `aria-hidden` icons, keyboard-operable native `<button>`/`<select>`/`<input>` — all reused from the existing `components/ui.tsx`/`components/layout.tsx` kit, not reinvented): present on all 3 new screens and the 4 new order-detail cards.
- Financial confirmation shows original + approved changes + final amount explicitly: implemented literally as three adjacent `<dd>` values in the Change Order approval card (§4.2) and again in the incremental-payment card (§4.3).
- Never trusts client-side authorization: all mutating calls (`engage`, `approve`, `reject`) go through `authApi`, which sends the Bearer token and lets the API 401/403/404/422 as appropriate; the UI only reflects the API's response, never pre-empts it.
- Git identity untouched, no commits made, working tree left as `git status --short` shows in §6 — nothing staged or committed.

## 9. Areas for Checker's highest scrutiny

1. **§5 i18n convention decision** — the single most subjective call in this deliverable; re-read the literal instruction wording and decide if `labels.ts` was the right target versus the `lib/i18n` catalog for the 8 new enum dictionaries.
2. **Partner-economics leakage** — re-verify by grepping `apps/web/app/orders/[orderId]/page.tsx` and the new `service-requests/**` files for `trustFee`, `ProviderNet`, `Psp` — expect zero matches.
3. **Financial breakdown correctness** — the Change Order approval card's "total if approved" is `order.amount + changeOrder.changeGrossAmount`; confirm this matches `PaymentDetailsResponse.custodySummary.totalCommerciallyAuthorized` semantics for a Member who has one pending (not yet approved) Change Order plus zero-or-more already-approved ones — the display is per-card (one pending change at a time added to the *current* order amount), not a running multi-change simulation, since the API is the only source of truth for combined totals once more than one change is approved.
4. **`GET .../matches` response shape assumption** — the new comparison screen calls `authApiPaged` against `.../matches`, assuming the same `{data: [...], pagination: {...}}` envelope as `GET .../mine` (confirmed by reading the controller's shared `paginationQuerySchema`/`page`/`size` pattern, not runtime-tested against a live API in this session — no dev server/DB was started). Worth a live smoke test before merge.
