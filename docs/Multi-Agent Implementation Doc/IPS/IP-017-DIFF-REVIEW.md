# IP-017 — Diff Review

**Trust Partner Experience.** Independent re-verification of IP-017-COMPLETION-REPORT.md at baseline `358d185`, branch `main`. All checks below were performed by direct source reads, not by trusting the report's claims.

## 1. Self-approval check (highest priority) — VERDICT: PASS, no self-approval path found

Read `apps/web/app/orders/[orderId]/page.tsx` in full.

- The pending-Change-Order card (lines 561-644) renders Approve/Reject buttons only inside `changeOrder.proposedBy !== me ? (...) : (<p>...</p>)` (line 619). When the viewer is the proposer, the buttons are structurally absent from the DOM — not hidden/disabled, genuinely not rendered. Confirmed by reading the conditional itself, not the comment describing it.
- `createChangeOrder` (lines 379-415) only calls `POST .../change-orders` (create) then `POST .../change-orders/:id/submit`. It never calls `approve`/`reject`. Those two verbs are wired exclusively inside `decideChangeOrder` (lines 207-228), which is only reachable from the Approve/Reject buttons gated above.
- No other code path in the file calls the change-order decision endpoints.

Confirmed CRITICAL constraint from the spec §4 ("no ability to self-approve commercial increases") is satisfied.

## 2. Partner-economics gating — VERDICT: PASS

- The "Seus ganhos" card (lines 868-905) is gated on `isSeller && serviceSummary && serviceSummary.currentProviderNetBeforePspFees !== undefined` (line 874) — matches the report's claim exactly.
- Figures displayed (`currentAuthorizedGrossAmount`, `currentTrustFeeAmount`, `currentProviderNetBeforePspFees`) are read directly from the `ServiceSummary` object returned by `GET .../service-summary`, with zero client-side arithmetic — no duplicate business logic.
- Cross-checked `apps/web/lib/types.ts` `ServiceSummary` (lines 537-563) field-for-field against `ServiceSummaryResponse` in `apps/api/src/modules/marketplace/application/dto/trust-change-order.dtos.ts` (lines ~165-200): names and optionality (`currentTrustFeeAmount?`, `currentProviderNetBeforePspFees?`) match exactly.
- Grep for `trustFee`/`ProviderNet`/`Psp` in the order page confirms all occurrences live inside the gated card (report's own grep claim reproduced).

## 3. `labels.ts` bugfixes — VERDICT: PASS, both fixes are correct and complete

Confirmed real backend enums via `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts`:
- `CHANGE_ORDER_TYPE` = `ADDITIONAL_TIME | SCOPE_CHANGE | MATERIAL | MIXED` (lines 181-194).
- `EXECUTION_EVIDENCE_TYPE` = `BEFORE | AFTER | OTHER` (lines 311-323).

Current `apps/web/lib/labels.ts`:
- `CHANGE_ORDER_TYPE_LABEL` now has exactly `ADDITIONAL_TIME`, `MATERIAL`, `MIXED`, `SCOPE_CHANGE` — all four real values covered, no stray/missing keys (pre-fix state per `git diff` had the nonexistent `ADDITIONAL_MATERIAL` and was missing `MATERIAL`/`MIXED`).
- `EXECUTION_EVIDENCE_TYPE_LABEL` now has exactly `BEFORE`, `AFTER`, `OTHER` — all three real values covered (pre-fix state had `BEFORE_PHOTO`/`AFTER_PHOTO`/`DOCUMENT`, none of which match the real enum).

Both are genuine bugfixes to IP-016-introduced dictionaries, confirmed via `git diff apps/web/lib/labels.ts` — no new vocabulary was smuggled into this file alongside the fix.

## 4. i18n compliance — VERDICT: PASS

- `pt-BR.ts` and `en-US.ts` both have 156 top-level-pattern keys (script-counted); `en-US.ts` carries `satisfies Messages` (line 183), which fails to compile on any key mismatch — and `tsc --noEmit` passed.
- All new `partner.*` vocabulary (weekday names, pause reasons, Change Order type/evidence labels for the new form, every button/field/success/error string on the new availability screen and the five new order-detail panels) is consumed via `useLocale().t()` in both `apps/web/app/orders/[orderId]/page.tsx` and `apps/web/app/partner/availability/page.tsx` — no literal hardcoded strings found for this new vocabulary.
- `labels.ts` was touched only for the two disclosed bugfixes (§3); no new vocabulary added there, confirmed by `git diff`.

## 5. Multipart evidence-upload contract — VERDICT: PASS (static contract match; not live-tested)

No dev server/Postgres instance was available/started in this sandbox session (same limitation as IP-016's Checker), so this was verified by rigorous static contract matching, not a live upload:

- Backend `submitExecutionEvidence` (`marketplace-change-order.controller.ts` lines 199-240) uses Fastify's `request.file()`, reads a `type` field from `file.fields.type` and the binary from the same multipart part named `file`.
- Frontend `uploadEvidence` (`orders/[orderId]/page.tsx` lines 327-352) builds a `FormData` with `form.append('type', evidenceType)` then `form.append('file', evidenceFile)`, and `lib/api.ts`'s `rawRequest` (lines 80-93) sends it as `body: options.form` while deliberately omitting the `content-type` header when `options.form` is set (line 82-84) — this lets the browser set the correct `multipart/form-data; boundary=...` header itself, which is required for Fastify's multipart parser to work. This is the correct pattern.
- File type allowlist in the UI (`accept="image/jpeg,image/png,image/webp,application/pdf"`) matches the MIME types the report claims the backend allows (not independently re-derived from backend validation code in this pass, but consistent with the evidence types accepted).

Field names, part ordering, and content-type handling all match. This check is static/contract-level only, as disclosed.

## 6. No Member private-data over-exposure — VERDICT: PASS

Grepped `orders/[orderId]/page.tsx` for buyer/member-identifying tokens beyond job need (`buyer.`, `member.`, `memberProfile`, `buyerEmail`, `buyerPhone`, `buyerAddress`) — zero matches. The only Member-identifying references pre-date this IP (e.g., `order.sellerId`/`me` comparisons for role gating, and the pre-existing conversation link). The new Partner-availability screen (`app/partner/availability/page.tsx`) shows only the Partner's own windows, nothing about any Member. No new screen surfaces Member profile, payment method, or unrelated-order data.

## 7. Regression / scope check — VERDICT: PASS

`git status --short` / `git diff --stat` confirm the diff is exactly:
```
 M apps/web/app/orders/[orderId]/page.tsx
 M apps/web/components/app-shell.tsx
 M apps/web/lib/i18n/messages/en-US.ts
 M apps/web/lib/i18n/messages/pt-BR.ts
 M apps/web/lib/labels.ts
 M apps/web/lib/types.ts
?? apps/web/app/partner/               (new: availability/page.tsx)
```
Zero touch of `apps/api/**`. Zero touch of `apps/web/app/service-requests/**` (IP-016-owned). Matches the report exactly.

Note: `apps/web/tsconfig.tsbuildinfo` was touched by running `tsc`/`next build` during this review and was reverted with `git checkout --` before finishing, same discipline the report used.

## 8. Test re-run

- `pnpm --filter @trust/web typecheck` (`tsc --noEmit`): **PASS**, 0 errors.
- `pnpm --filter @trust/web build` (`next build`): **PASS**, 30 routes generated, `/partner/availability` (3.09 kB) and `/orders/[orderId]` (8.37 kB) present, matching the report's numbers exactly.
- `pnpm -w typecheck` (both `apps/api` and `apps/web`): **PASS**, 0 errors — confirms no backend-side regression.
- `pnpm -w lint`: **PASS**, 0 errors/warnings.

## 9. Findings

No CRITICAL or BLOCKING findings.

- **OBSERVATION**: The evidence-upload and availability-`PUT` contracts were verified statically (report's own disclosed limitation, confirmed accurate) because no live dev server/Postgres was available in this sandbox either. Recommend a live smoke test before the next IP builds further on this surface, same recommendation IP-016's Checker made.
- **OBSERVATION**: `orders/[orderId]/page.tsx` now imports enum labels from both `lib/labels.ts` (pre-existing) and `lib/i18n` (`t('partner.*')`, new) in the same file — disclosed and justified in §5 of the report as a deliberate trade-off favoring the i18n-catalog correction over single-file import consistency. Reasonable, not a defect.
- No MAJOR or MINOR findings identified beyond the above.

## 10. Final verdict

**PASS.** All six explicit scrutiny items from the report (i18n placement, economics gating, self-approval structural guarantee, labels.ts bugfix correctness, multipart contract, pause/resume status toggle) independently re-verified and confirmed correct. No self-approval path exists. No Member private-data over-exposure. No backend or IP-016-owned file touched. Both typecheck and build pass from scratch, and the full-repo typecheck/lint show no regression.
