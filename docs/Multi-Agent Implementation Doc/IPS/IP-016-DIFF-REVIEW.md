# IP-016 — Diff Review (independent Quality/Diff Agent)

Reviewed at `main`@`c53f344` (post-Executor working tree, uncommitted). Re-verified independently; did not trust the Completion Report's claims without direct file reads and re-running checks.

## 1. Scope / regression check

`git status --short`:
```
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/components/app-shell.tsx
 M apps/web/lib/i18n/messages/en-US.ts
 M apps/web/lib/i18n/messages/pt-BR.ts
 M apps/web/lib/labels.ts
 M apps/web/lib/types.ts
 M apps/web/tsconfig.tsbuildinfo   (build artifact, not source)
?? apps/web/app/service-requests/  (new: page.tsx, new/page.tsx, [serviceRequestId]/page.tsx)
```
Matches the report's claimed scope exactly. **Zero** touches under `apps/api/**`. Confirmed.

## 2. `/matches` pagination envelope — the Executor's flagged untested assumption

Traced the full chain:
- Controller `marketplace-service-request.controller.ts` `GET :serviceRequestId/matches` calls `DiscoverServiceRequestMatchesUseCase.execute`, which returns `PaginatedResult<ServiceRequestMatchResponse>` (`discover-service-request-matches.usecase.ts`).
- `PaginatedResult` (`apps/api/src/shared/api/api-envelope.ts`) is `{ items: T[], pagination: PaginationMeta }`.
- `response-envelope.interceptor.ts` special-cases `data instanceof PaginatedResult` and emits `{ success: true, data: items, pagination }` — i.e. `data` is the **array**, `pagination` is a **sibling** field, confirmed by the interceptor's own spec test.
- Frontend `authApiPaged<T>` (`apps/web/lib/api.ts`) calls `authRaw<T[]>`, reads `result.data` as `T[]` and `result.pagination`, returning `{ items, pagination }`. This is exactly the shape the interceptor emits.
- `apps/web/app/service-requests/[serviceRequestId]/page.tsx` calls `authApiPaged<ServiceRequestMatch>(.../matches)` and reads `.items` for the match list.

**Verdict: the assumption is correct.** No bug. The Executor's own flagged risk resolves cleanly on inspection — `/matches` genuinely returns the paginated envelope, `/offers` genuinely returns a plain object (`ServiceRequestOfferComparisonResponse`, via `CompareServiceRequestOffersUseCase.execute`, not wrapped in `PaginatedResult`), and the frontend uses `authApi` (non-paged) for `/offers` and `authApiPaged` for `/matches` respectively — correctly differentiated.

## 3. Live smoke test

Attempted. Found: no `docker-compose.yml` for the `trust` repo, no `apps/api/.env` present (only `.env.example`), and the only running Postgres container on the machine (`gwm-bhub-db-local`) belongs to an unrelated project. Standing up a fresh Postgres instance, migrating, seeding an authenticated Member session, and manually exercising all 3 new routes plus the extended order page against a live backend was not achievable within a reasonable effort budget in this environment (no existing dev-DB bootstrap script was found in `apps/api/package.json` beyond `nest start --watch`, which still requires a live `DATABASE_URL`).

**Fallback (per the task's own instruction)**: performed full-rigor static contract-matching for every new fetch call this IP added, not just `/matches`:
- `/matches` — verified above (§2), matches exactly.
- `/offers` — plain `authApi`, matches `ServiceRequestOfferComparisonResponse` shape (object with `serviceRequestId`, `serviceRequestStatus`, `items[]`), confirmed field-for-field against `toOfferComparisonItem`/mapper output vs. `apps/web/lib/types.ts` `ServiceRequestOfferComparisonItem`.
- `POST .../engage`, `POST /marketplace/service-requests`, `GET .../mine`, `GET .../:id` — plain `authApi`/`authApiPaged` per the same pattern verified above; DTOs mirror mapper output field names 1:1 (`toServiceRequestResponse`, `toServiceRequestSummary`).
- Order-detail extensions: `travel-status`, `change-orders`, `execution-evidences`, `service-notes`, `payments/by-order/:orderId` — frontend `TravelStatus`/`ChangeOrder`/`ExecutionEvidence`/`ServiceNote`/`PaymentDetails`/`CustodySummary` interfaces in `apps/web/lib/types.ts` were spot-checked against `trust-change-order.dtos.ts` and the payment mapper; field names line up (`changeGrossAmount`, `originalAmount`, `totalCommerciallyAuthorized`, etc.).

Both `pnpm --filter @trust/web typecheck` (0 errors) and `pnpm --filter @trust/web build` (success, all 3 new routes + extended `/orders/[orderId]` compiled, sizes match the report) were re-run from this session and pass.

**Residual risk**: static contract-matching does not catch runtime-only failures (e.g., a null field the type declares non-nullable, actual DB rows with unexpected data, auth/session edge cases). This is a real, disclosed gap — not resolved by this review — and should be flagged for a live smoke test before this ships to any shared/staging environment.

## 4. Partner-economics leakage

Grepped `apps/web/app/orders/[orderId]/page.tsx`, all of `apps/web/app/service-requests/`, and `apps/web/lib/types.ts` for `trustFee`, `ProviderNet`, `Psp`: zero rendering-code matches (the only hits are a code comment in `types.ts` documenting the exclusion). Cross-checked against the real backend DTO: `ChangeOrderResponse.trustFeeRateBps` / `changeTrustFeeAmount` / `changeProviderNetBeforePspFees` and `ServiceSummaryResponse.currentTrustFeeAmount` / `currentProviderNetBeforePspFees` are all `?:` optional in `trust-change-order.dtos.ts`, and the frontend `ChangeOrder`/`ServiceSummary` interfaces in `types.ts` simply omit them. **Verdict: no leakage, confirmed by construction, not just by the report's framing.**

## 5. Financial-breakdown correctness (Shared Standards §9)

Read the actual JSX in the Change Order approval card (`orders/[orderId]/page.tsx` ~L353-371): three explicit `<dd>` values are rendered — "Valor original do pedido" (`order.amount`), the delta (`+ changeOrder.changeGrossAmount`), and "Total autorizado se aprovar" (`order.amount + changeOrder.changeGrossAmount`). All three figures are genuinely present and distinct, not a two-figure display with an implied delta. **Verdict: meets the explicit §9 requirement.**

Edge case (flagged by the report itself, not found independently): if more than one Change Order is ever `PENDING_APPROVAL` or previously approved simultaneously, the "total if approved" for each pending card is computed as `order.amount + thisChange.changeGrossAmount` — i.e. per-card against the *current* order amount, not a cumulative simulation across multiple pending changes. This is a MINOR/OBSERVATION: the API (`payment.custodySummary.totalCommerciallyAuthorized`) remains the source of truth and is re-fetched after every decision, so this cannot produce an incorrect authorization, only a potentially confusing preview number in the rare multi-pending-change case. Not a blocking defect for the common Member journey (one change order at a time).

## 6. i18n decision

`lib/labels.ts` (hardcoded PT-BR `Record<string,string>`, no locale switching) is used by ~25 existing screens; `lib/i18n/` (`useLocale()`/`t()`, key-parity `satisfies Messages`, genuinely locale-switchable) is used by only 3 screens plus `AppShell`. The Executor added 8 new enum dictionaries to `labels.ts` (matching the file being extended's own dominant pattern) and routed only the one new nav string (`nav.serviceRequests`) through `lib/i18n` (matching `AppShell`'s own 100%-`t()`-driven convention).

**Judgment**: this is a defensible reading of "match the existing convention exactly," but it is not the stronger reading. IP-002 established `lib/i18n` as the canonical mechanism for *new* work; `labels.ts`'s own header comment ("não muda telas existentes") reads as a grandfather clause for pre-existing screens, not a license to keep adding new hardcoded PT-BR vocabulary going forward. The practical difference is real: none of the 8 new dictionaries (Change Order status/type, travel status, urgency, evidence type, authorization/custody status) are locale-switchable, while everything already in `lib/i18n` is. This is a **MAJOR** (not blocking) finding: it is inconsistent with the stated canonical direction and creates a growing pool of non-localizable strings, but it does not break functionality, was explicitly disclosed and reasoned through by the Executor (not silently smuggled in), and the stated fix is mechanical and low-risk (move 8 dictionaries + 4 call sites). Recommend a fast-follow, not a blocking rework.

## 7. Test coverage

Confirmed independently: `apps/web/package.json` scripts are only `dev`/`build`/`start`/`typecheck` — no test runner. No `jest`/`vitest`/`testing-library` references anywhere in `apps/web/package.json` or its config files. `Glob` for `*.test.tsx`/`*.spec.tsx` under `apps/web` returns nothing (verified this session). The report's claim of zero existing test convention is accurate.

**Judgment**: this is a **MAJOR/OBSERVATION-boundary** finding, not a blocking one for this specific IP. `apps/web` has had zero component-test infrastructure since before this IP started — that is a pre-existing, program-wide gap this IP did not create and could not reasonably be expected to fix unilaterally (introducing a test runner from scratch is a cross-cutting infra decision, not a screen-closing task). It should be escalated as a standing action item for the program (a stop condition for the *next* large frontend IP, if still unresolved), but retroactively blocking this already-completed, typecheck/build-clean IP over a pre-existing infra gap would be disproportionate.

## Findings summary

| # | Finding | Severity |
|---|---|---|
| 1 | `/matches` pagination envelope assumption | Verified correct — no defect |
| 2 | No live smoke test achievable in this environment; static contract-matching used as fallback, residual runtime risk remains | OBSERVATION |
| 3 | Partner-economics leakage | None found — verified by construction |
| 4 | Financial breakdown (3-figure requirement) | Met |
| 5 | Multi-pending-Change-Order preview total not cumulative across changes | MINOR |
| 6 | New enum vocabulary added to `labels.ts` instead of `lib/i18n`, against IP-002's canonical direction for new work | MAJOR (non-blocking, disclosed, mechanical fix available) |
| 7 | Zero component/unit tests added; zero pre-existing test infra in `apps/web` | MAJOR/OBSERVATION (pre-existing program gap, not this IP's fault) |
