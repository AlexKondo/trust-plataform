# IP-017 — Completion Report

**Trust Partner Experience**
Executed 2026-09-17. Owner: Frontend/domain implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§8 i18n, §9 Frontend) > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-017 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-017_Trust_Partner_Experience.md`) > `CLAUDE.md` history > `IP-016-COMPLETION-REPORT.md`/`IP-016-DIFF-REVIEW.md` > real backend controllers/DTOs at baseline `358d185`, branch `main`.

## 1. Scope and preflight

IP-016 (just completed, sibling IP) closed the **Member-side** journey. Preflight for this IP (direct reads of `apps/web/app/**` and the relevant backend controllers, not assumed) found:

- **VERIFY_ONLY — already working, untouched**: onboarding/verification/Trust Passport (`verifications`, `trust-passport`) — shared with Member, no Partner-specific gap. Profile/service listing (`marketplace/mine`) — full CRUD for the seller's own listings already exists. Request discovery via conversations — `conversations/*` already lets a Partner see and respond to any conversation started against their listing. Quote/counteroffer — the full MRK-009..014 offer negotiation flow already lives in `conversations/[conversationId]/page.tsx` (unchanged, not read in full detail again since IP-016 already verified it, and no Partner-specific change was needed there). Order check-in/check-out — `orders/[orderId]/page.tsx` already had these two seller buttons before this IP. Change Order **approval** (Member-side) and evidence/service-note **display** — added by IP-016, left untouched (`apps/web/app/service-requests/**` was not touched at all, per the IP-016 file-ownership boundary).
- **Genuine gaps** (zero UI references anywhere in `apps/web`, confirmed by direct reads of `apps/api/src/modules/marketplace/infrastructure/api/marketplace-partner-availability.controller.ts`, `marketplace-order.controller.ts`, `marketplace-change-order.controller.ts`, and `apps/api/src/modules/marketplace/application/dto/trust-change-order.dtos.ts`): Partner availability window management (IP-005 `PUT/GET /marketplace/partner-availability[/mine]`), Partner-side travel-status declaration (`POST .../travel-status/en-route|arrived` — only the read side existed, added by IP-016 for the Member to *view*), Trust Pause/Resume (`POST .../pause|resume`), execution-evidence **upload** and service-note **creation** (only the Member-facing *display* existed), Change Order **creation/proposal** by the Partner (`POST .../change-orders` + `.../submit` — only *approval* existed), and Partner economics/earnings display (`GET .../service-summary` already returns `currentTrustFeeAmount`/`currentProviderNetBeforePspFees` when the caller is the seller, per PACK-03 §15 — no screen anywhere read these fields).

## 2. Backend investigation — result: no backend changes needed

Every capability this IP needed already existed as a real endpoint, confirmed by reading the full controller + DTO source (not guessed):

- `marketplace-partner-availability.controller.ts` — `PUT /marketplace/partner-availability` (replace-all), `GET /marketplace/partner-availability/mine`. Body/response shapes read directly from `partner-availability.dtos.ts`.
- `marketplace-order.controller.ts` — `POST :orderId/travel-status/en-route` (`{ declaredEtaMinutes: number 1..480 }`), `POST :orderId/travel-status/arrived` (no body).
- `marketplace-change-order.controller.ts` — `POST orders/:orderId/pause` (`{ reasonCode, note? }`), `POST orders/:orderId/resume`, `POST orders/:orderId/execution-evidences` (multipart `type`+`file`), `POST orders/:orderId/service-notes` (`{ body }`), `POST orders/:orderId/change-orders` (`CreateChangeOrderRequest`), `POST change-orders/:id/submit`, `GET orders/:orderId/service-summary` (`ServiceSummaryResponse`, includes `execution.status` for pause/resume UI state and the optional Partner-economics fields).
- Read `marketplace-types.ts` for the **real** enum values, which surfaced two pre-existing frontend defects from IP-016 (§5).

**No backend files were modified.** `git status --short` confirms the diff is 100% under `apps/web/**`.

## 3. Gaps closed — files created

| Journey step | File (absolute path) | Notes |
|---|---|---|
| Partner availability (IP-005) | `C:\projects\trust\apps\web\app\partner\availability\page.tsx` | New screen: lists/edits/adds/removes weekly windows (day + start/end time pickers), saves via replace-all `PUT`. Loading/error/empty states; nav entry `nav.myAvailability` added to `AppShell`. |

## 4. Gaps closed — files modified

`C:\projects\trust\apps\web\app\orders\[orderId]\page.tsx` (already extended once by IP-016; extended again here for the **Partner-action side** of the same order-scoped screen — no new route needed, and `service-requests/**` was not touched):

1. **Travel status declaration (IP-005)** — the existing read-only travel card now also renders, only for the seller when the order is `SCHEDULED`/`AWAITING_EXECUTION` and not yet `ARRIVED`, a "declare en-route" button (opens a panel for the ETA-minutes input) or a "declare arrived" button once en route.
2. **Trust Pause / Resume (PACK-03 §10.2/§10.3)** — new buttons in the Ações card, gated on `isSeller && status === 'IN_PROGRESS'`; toggles between Pause (reason-code select + optional note panel) and Resume based on `serviceSummary.execution.status === 'PAUSED'` (read from the newly-fetched Service Summary, never computed client-side).
3. **Execution evidence upload + service note (IP-006)** — two new buttons open panels: a multipart file upload (`type` + `file`, same MIME allowlist as the backend: jpeg/png/webp/pdf) and a free-text note form. Both call the real multipart/JSON endpoints and re-`load()` afterward — the pre-existing IP-016 evidence/note **display** card picks these up automatically since it reads the same lists.
4. **Change Order proposal (PACK-03 §7)** — new "Propor alteração" button opens a form (type select — `ADDITIONAL_TIME`/`SCOPE_CHANGE`/`MATERIAL`/`MIXED`; conditional fields — minutes for time, three money deltas otherwise; reason/description) that `POST`s to `.../change-orders` then immediately `.../submit`s it (a Draft with no submit is invisible to the Member — matching PACK-03 §6.1). **No self-approval path exists**: the pending-Change-Order card (added by IP-016 for the Member) now checks `changeOrder.proposedBy !== me` before rendering the Approve/Reject buttons at all — if the current identity is the proposer, it renders an explanatory sentence (`partner.changeOrderNoSelfApprove`) instead. This is a structural guarantee (the button never exists in the DOM for the proposer), not a hidden/disabled control.
5. **Partner earnings ("Seus ganhos")** — new card, rendered only when `isSeller && serviceSummary.currentProviderNetBeforePspFees !== undefined` (i.e., the API actually populated the Partner-only fields — the same gate the backend itself applies per caller role), showing gross authorized amount, Trust Fee, and net-before-PSP-fees, with an explicit hint that the PSP's own fees are settled separately. The pre-existing "Pagamento autorizado" card (Member-and-Partner-shared custody breakdown) is untouched.
6. Load: added `GET .../service-summary` to the existing `Promise.all` in `load()`, `.catch(() => null)` like every other optional card — a Member (or any order with no execution data yet) simply doesn't get the new cards, exactly as IP-016's cards degrade.

`C:\projects\trust\apps\web\components\app-shell.tsx` — added one nav entry (`/partner/availability`, `nav.myAvailability`), same `t()`-driven pattern as every other menu item; visible to everyone (there is no separate "Partner" role/permission in the identity model — same reasoning the backend's own `partner-availability.controller.ts` header comment gives for why any authenticated identity manages its own availability).

`C:\projects\trust\apps\web\lib\types.ts` — added `CreateChangeOrderRequest`, `ExecutionPause`, `ExecutionSession`, `PartnerAvailabilityWindow`, `AvailabilityWindowInput`; extended `ChangeOrder` with the optional Partner-economics fields (`trustFeeRateBps`, `changeTrustFeeBaseAmount`, `changeTrustFeeAmount`, `changeProviderNetBeforePspFees` — all mirror the backend DTO exactly, confirmed by direct read of `trust-change-order.dtos.ts`); extended `ServiceSummary` to match the full `ServiceSummaryResponse` shape (it was missing `execution`, `currentTrustFeeAmount`, `currentProviderNetBeforePspFees`, `evidences`, `notes` — IP-016 had only modeled the Member-visible subset, which is exactly why the Partner-earnings gap couldn't be closed without this).

`C:\projects\trust\apps\web\lib\labels.ts` — two **bugfixes** (not new vocabulary) to dictionaries IP-016 added: `EXECUTION_EVIDENCE_TYPE_LABEL` had keys `BEFORE_PHOTO`/`AFTER_PHOTO`/`DOCUMENT` but the real backend enum (`EXECUTION_EVIDENCE_TYPE` in `marketplace-types.ts`) is `BEFORE`/`AFTER`/`OTHER` — every existing evidence badge on the Member's order-detail screen was silently falling back to the raw enum code instead of translating. `CHANGE_ORDER_TYPE_LABEL` had `ADDITIONAL_MATERIAL` (doesn't exist) and was missing `MATERIAL`/`MIXED` (the real enum values) — same silent fallback. Both corrected in place since this IP's new Change Order proposal form needed the *correct* type labels to build its select options, and leaving the pre-existing (broken) Member-facing badges unfixed while introducing the fix only in a new i18n dictionary would have created two sources of truth for the same enum.

## 5. i18n decision (the explicit correction this IP was asked to make)

IP-016's Diff Review flagged a MAJOR non-blocking finding: new enum/vocabulary strings went into `lib/labels.ts` (existing dominant convention, hardcoded PT-BR, not locale-switchable) instead of `lib/i18n/` (IP-002's canonical, locale-aware mechanism). This IP was explicitly instructed not to repeat that.

**All genuinely new vocabulary introduced by this IP** — the entire `partner.*` namespace (weekday names, pause reasons, Change Order type/evidence labels used in the new proposal form, every button/field/success/error string on the new availability screen and the five new order-detail panels) — was added to `lib/i18n/messages/pt-BR.ts` **and** `lib/i18n/messages/en-US.ts`, both screens use `useLocale().t()` exclusively for that vocabulary, and the `satisfies Messages` contract on `en-US.ts` (which fails to compile on any key mismatch) passed on the first `tsc --noEmit` run. `labels.ts` was touched **only** to fix two pre-existing key mismatches (§4) — not to add anything new to it. This is the one deliberate, disclosed deviation from "match the file's existing convention exactly": `orders/[orderId]/page.tsx` now imports enum labels from *both* `lib/labels.ts` (pre-existing Member-side enums, left as-is) and `lib/i18n` (`t('partner.*')`, this IP's additions) in the same file. The judgment call is that following the literal, repeated instruction (use the catalog for new vocabulary) outweighs single-file import-source consistency, especially since the Checker was specifically told to watch for this exact pattern.

## 6. Diff summary

```
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/components/app-shell.tsx
 M apps/web/lib/i18n/messages/en-US.ts
 M apps/web/lib/i18n/messages/pt-BR.ts
 M apps/web/lib/labels.ts
 M apps/web/lib/types.ts
?? apps/web/app/partner/                    (new: availability/page.tsx)
```

Zero files under `apps/api/**` or `apps/web/app/service-requests/**` touched.

## 7. Verification

- `pnpm --filter @trust/web typecheck` (`tsc --noEmit`): **PASS**, 0 errors.
- `pnpm --filter @trust/web build` (`next build`): **PASS** after fixing two ESLint errors the build's own lint step caught (`CHANGE_ORDER_TYPES` used only as a type, an unnecessary type assertion on the pause-reason translation key) — both fixed by reusing the const array via `.map()` for the select options instead of hardcoding, and dropping the redundant `as const`. Final build confirms the new route `/partner/availability` (3.09 kB) and the extended `/orders/[orderId]` (8.37 kB, up from IP-016's 6.59 kB) compiled cleanly, all 30 routes generated.
- `apps/web/tsconfig.tsbuildinfo` was reverted with `git checkout --` before finishing — it is a build cache artifact that got touched by running `tsc`/`next build`, not a real source change.
- **Deviation**: the Postgres-backed e2e suite was **not** run. Justification: identical to IP-016's — zero backend files modified (§2, §6), the diff is 100% `apps/web`, and the e2e suite exercises `apps/api` against a live database. Running it would not exercise any line of code this IP changed.
- No automated component tests were added — same pre-existing gap IP-016 disclosed (`apps/web` has zero `*.test.tsx` files and no test runner wired in `package.json`); not introduced fresh by this IP, not silently claimed as covered.
- **Not live-smoke-tested**: no dev server/DB was started in this session (matches IP-016's own disclosed limitation for its `.../matches` assumption). The new multipart evidence upload (`FormData` via `authApi`'s existing `form` option, confirmed already used correctly by the client's own `rawRequest` implementation) and the availability replace-all `PUT` are typecheck/build-verified against the real DTOs but not runtime-verified against a live API in this session.

## 8. Constraints checklist

- **No Partner self-approval of commercial increases**: verified by construction — the Approve/Reject buttons are never rendered in the DOM when `changeOrder.proposedBy === me` (§4.4); the create-Change-Order flow only ever calls `create` then `submit`, never `approve`; `approve`/`reject` remain exclusively wired to `decideChangeOrder`, unchanged from IP-016.
- **No Member private-data exposure beyond job need**: no new screen reads or displays Member profile fields beyond what already flowed through the pre-existing order/conversation screens; the Partner availability screen exposes only the Partner's own data to themselves.
- **Partner economics shown correctly and only to the Partner**: gated on both `isSeller` (client-side UX gate) and the API actually having populated `currentProviderNetBeforePspFees`/`currentTrustFeeAmount` (server-side gate per PACK-03 §15) — verified by grep that no `trustFee`/`ProviderNet`/`Psp` token is referenced outside that one gated card (§ "grep" check performed, zero unexpected matches).
- **Mobile-first, loading/error/empty states, accessibility**: all new UI reuses the existing `Field`/`PrimaryButton`/`SecondaryButton`/`Card`/`Banner`/`EmptyState`/`Loading`/`ErrorState` kit (`components/ui.tsx`, `components/layout.tsx`) exactly as IP-016 did — no new component patterns invented. The availability screen has explicit `Loading`/`ErrorState`/`EmptyState`. The five new order-detail panels reuse the same panel/feedback pattern already proven by the existing schedule/cancel/review/dispute panels.
- **No client-side computation of authorization/eligibility**: every new mutating call is a direct passthrough to the API; the only client-side "computation" is simple display formatting (`formatCurrency`, `formatDuration`) of numbers the API already returned — same discipline as IP-016 §8.
- **Additive-only, no backend changes**: confirmed in §2/§6.
- Git identity untouched, no commits made; working tree left exactly as `git status --short` shows in §6 (after reverting the incidental `tsconfig.tsbuildinfo` cache touch).

## 9. Areas for Checker's highest scrutiny

1. **§5 i18n placement** — re-verify the `partner.*` catalog additions are actually consumed via `t()` everywhere in the new/changed files (not accidentally left as literal strings) and that the two `labels.ts` edits are genuinely bugfixes to pre-existing (IP-016) keys, not new vocabulary smuggled into the wrong mechanism.
2. **Partner-economics gating correctness** — re-verify by grepping `apps/web/app/orders/[orderId]/page.tsx` for `trustFee`/`ProviderNet`/`Psp`; confirm all three occurrences are inside the `isSeller && serviceSummary.currentProviderNetBeforePspFees !== undefined` branch (§4.5, §8).
3. **Self-approval structural guarantee** — confirm by reading the pending-Change-Order block (`changeOrder.proposedBy !== me` condition) that there is no code path, including the newly added `createChangeOrder`, that could call `approve`/`reject` on a Change Order the same identity proposed.
4. **`EXECUTION_EVIDENCE_TYPE_LABEL`/`CHANGE_ORDER_TYPE_LABEL` bugfix correctness** — cross-check the corrected keys (`BEFORE`/`AFTER`/`OTHER`, `MATERIAL`/`MIXED`) against `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts` lines ~181-186 and ~311-315 directly, since this is a defect inherited from IP-016's Change Order/evidence display that this IP silently repaired — the Checker should confirm the fix doesn't regress anything IP-016's own diff review already accepted.
5. **Multipart evidence upload contract** — the new evidence-upload panel assumes the same `FormData` `type`+`file` shape the backend's `submitExecutionEvidence` handler parses (§2); this was verified by reading the controller source, not by a live upload in this session.
6. **`ServiceSummary.execution.status === 'PAUSED'` as the pause/resume toggle condition** — confirm this matches `ExecutionSessionResponse.status`'s real value set (only read from the DTO comment/type, not from a live paused order).
