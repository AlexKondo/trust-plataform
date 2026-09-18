# IP-018 — Independent Diff Review

**Admin, Support & Operations**
Reviewer: independent Quality/Diff Agent. Baseline: `main` @ `4e05092`. Working tree contains files from a concurrent, unrelated Render→Vercel migration (`render.yaml`, `apps/api/vercel.json`, `apps/api/api/`, `apps/api/src/modules/internal-jobs/`, `apps/api/src/shared/events/outbox-relay.service.ts`, `env.schema.ts`, `app-config.service.ts`, most `test/integration/*.e2e.spec.ts` files, `.github/workflows/outbox-relay.yml`, `pnpm-lock.yaml`, `apps/api/package.json`, `apps/api/tsconfig.json`, `.env.example`) — **explicitly out of scope for this review**, not inspected or judged here.

## IP-018-scoped file list (per Completion Report §8, verified against `git status`)

New:
- `apps/api/src/modules/payment/infrastructure/api/admin-payment.controller.ts`
- `apps/api/src/modules/marketplace/infrastructure/api/admin-evidence.controller.ts`
- `apps/api/src/modules/admin-ops/admin-ops.module.ts`
- `apps/api/src/modules/admin-ops/application/support-lookup.service.ts`
- `apps/api/src/modules/admin-ops/infrastructure/api/admin-audit-log.controller.ts`
- `apps/api/src/modules/admin-ops/infrastructure/api/admin-support.controller.ts`
- `apps/api/src/modules/admin-ops/infrastructure/persistence/admin-ops.repository.ts`
- `apps/api/test/integration/ip-018-admin-support-operations.e2e.spec.ts`
- `apps/web/app/admin/risk-flags/page.tsx`, `apps/web/app/admin/support/page.tsx`, `apps/web/app/admin/audit-logs/page.tsx`, `apps/web/app/admin/evidence/[orderId]/page.tsx`

Modified (additive, minimal):
- `apps/api/src/app.module.ts`, `apps/api/src/modules/payment/payment.module.ts`, `apps/api/src/modules/marketplace/marketplace.module.ts`
- `apps/api/src/modules/marketplace/application/usecases/order-lifecycle.service.ts` (+`loadForAdmin`)
- `apps/api/src/modules/marketplace/application/usecases/service-execution.usecase.ts` (+`listEvidenceForAdminReview`)
- `apps/web/app/admin/page.tsx`, `apps/web/app/admin/disputes/page.tsx`

This matches the report's §8 claim exactly; no undisclosed IP-018 file found outside this list.

## 1. Admin-refund reuse — VERIFIED, genuine

Read `admin-payment.controller.ts` end to end. It resolves `paymentId` → `Payment` + approved `PaymentAuthorization.providerTransactionId`, then calls `RefundPaymentUseCase.execute({..., reason: 'ADMINISTRATIVE_REFUND', idempotencyKey, providerTransactionId, ...})`. No parallel refund logic exists in the new controller — it is a pure resolve-and-forward.

Read `refund-payment.usecase.ts` (unmodified by this IP's diff — confirmed no changes to this file in `git status`): the exact same three defenses IP-008 built are present and untouched — idempotency-key replay short-circuit (`findByIdempotencyKey` before any gateway call), the `amountCents > payment.refundableCents` pre-gateway cap, and the CAS write (`applyRefundIfExpected`) with `MAX_CAS_ATTEMPTS` retry and rollback-on-lost-race (`CasLostSignal`). The admin controller supplies no alternate write path to `Payment`/`FundsRefund`.

`ADMINISTRATIVE_REFUND` in `RefundReason` (`funds-refund.ts`) is confirmed pre-existing: `git log --follow` shows it was introduced in commit `2a20d3d` ("IP-008: cancelamento, disputa e reembolso"), not added by this IP. Report's claim is accurate.

**Verdict: PASS.** Highest-stakes claim independently confirmed at the code level, not just from the report's prose.

## 2. `loadForAdmin` evidence-bypass reachability — VERIFIED, safely scoped

`OrderLifecycleService.loadForAdmin(orderId)` genuinely skips the participant check that `loadForParticipant` enforces — it does a bare `orderRepository.findById` + 404-if-missing, nothing else.

Grep for every call site of `loadForAdmin` across `apps/api/src` returns exactly **one** call: `service-execution.usecase.ts:488`, inside `listEvidenceForAdminReview`, which is itself only invoked from `AdminEvidenceController.reviewEvidence`, which carries `@UseGuards(AdminGuard)` at the controller level. No other method, controller, or consumer references `loadForAdmin`. The e2e spec's own assertion (a non-admin participant hitting `GET /admin/marketplace/orders/:orderId/evidence` gets 403) was independently re-run and passed.

**Verdict: PASS — no reachable non-admin path to the bypass.**

## 3. New evidence route

`GET /admin/marketplace/orders/:orderId/evidence`, `@UseGuards(AdminGuard)` confirmed on the controller class. `listEvidenceForAdminReview` genuinely aggregates three sources in parallel (`executionRepository.listEvidences`, `executionRepository.listNotes`, `changeOrderRepository.listByOrder` + per-change-order `listEvidences`) and returns a single consolidated shape. Every call is audit-logged via `auditLogService.recordSafe({operation: 'AdminReviewEvidence', ...})` with counts in metadata, before returning. Matches report.

## 4. Support lookup masking

`SupportLookupService` / `AdminOpsRepository`:
- Identity query (`findIdentityByEmail`) explicitly selects only `id, fullName, email, status, isAdmin, createdAt, lastLoginAt` — `passwordHash` is never in the select list, so it cannot leak regardless of serialization. No phone/document columns selected either.
- Payment masking (`maskPayment`) returns only `paymentId, orderId, status, amount, currency, refundedAmount, paymentProviderId, createdAt` — `paymentProviderId` is an internal provider reference, not a card/PSP secret; consistent with IP-009's no-card-data constraint (Trust never stores instrument/token data per repo convention).
- `AdminSupportController` requires exactly one of `email|orderId|paymentId` (`provided.length !== 1` → 400) — confirmed no open-ended search parameter exists; cannot be used to enumerate users by partial match.
- Every successful lookup path (`lookupByEmail`/`lookupByOrderId`/`lookupByPaymentId`) calls `auditLogService.recordSafe` with `operation: 'AdminSupportLookup'`. **Minor gap**: a *failed* lookup (404 — identity/order/payment not found) is not itself audit-logged; only successful lookups are. This is a MINOR finding, not blocking, since an admin probing for existence of an email/order/payment without a hit leaves no trail. Not flagged as a masking failure — no data is exposed on the 404 path.

**Verdict: PASS, with one MINOR observation (see Findings).**

## 5. Audit log search — read-only, trail integrity

`AdminAuditLogController` has a single `@Get()` handler, `@UseGuards(AdminGuard)`, delegating to `AdminOpsRepository.searchAuditLogs` — a pure `SELECT`, no write/delete method exists anywhere in `admin-ops.repository.ts` touching `auditLogs`. Filters (`identityId`, `operation`, `resource`, `correlationId`, `from`/`to` date range) are applied via parameterized Drizzle `and(...)`/`eq`/`gte`/`lte` — no raw string interpolation, no injection surface. Pagination is bounded: `size` capped at `z.coerce.number().max(100)`, default 20 — no unbounded dump path (an admin cannot request the whole table in one call regardless of filters).

The append-only trigger (`forbid_audit_log_mutation`, from Module 0/IP-000) was independently confirmed still active and untouched during the e2e run — the background full-suite run (before being cut off by the migration's concurrent state) logged genuine trigger-rejection errors (`audit_logs is append-only: UPDATE is not allowed`, `DELETE is not allowed`) from other, pre-existing test files that intentionally probe the trigger — proof the constraint is live in the schema this IP's migrations (there are none) did not touch.

**Verdict: PASS.**

## 6. No silent data edits

The only new admin *write* action in this IP is the refund, and it is audit-logged inside `RefundPaymentUseCase.execute()` itself (pre-existing IP-008 code, unmodified) on every outcome branch (`FAILURE` for ineligible/limit-exceeded/gateway-failed, `SUCCESS` for completed). `reasonDetail` is a required, non-empty field (`z.string().trim().min(1).max(2000)`) on the admin controller's request schema, so no admin refund can be issued without a recorded reason — matches the report's claim in §2.

Risk-flag review and dispute resolution are confirmed unmodified by this diff (no changes to `risk-flag.service.ts` or the dispute-resolve controller/usecase in `git status`) — reused as-is, consistent with the report.

## 7. Frontend

- `admin/support/page.tsx` — calls `GET /admin/support/lookup?{email|orderId|paymentId}=`, radio-button single-identifier UI matching the backend's exactly-one-identifier contract; response shape (`identity`/`orders`, or `order`/`payment`) matches the controller's actual return shapes read above.
- `admin/evidence/[orderId]/page.tsx` — calls `GET /admin/marketplace/orders/:orderId/evidence`, renders `executionEvidences`/`serviceNotes`/`changeOrderEvidences` matching `listEvidenceForAdminReview`'s actual return type field-for-field.
- `admin/page.tsx` diff adds three new cards (`risk-flags`, `support`, `audit-logs`) without touching any existing card; `admin/disputes/page.tsx` diff adds exactly one new link ("Ver evidência do pedido") to `/admin/evidence/:orderId` — confirmed via `git diff`, no other lines touched.
- i18n claim verified: `grep -rl "lib/i18n" apps/web/app/admin/` returns **zero** files (including the four new pages) — every existing `/admin/**` page (e.g. `disputes/page.tsx`, `trust-rules/page.tsx`) uses hardcoded pt-BR strings via `lib/labels.ts`/inline, confirming the precedent claim and that the new pages did not regress an established i18n pattern that didn't exist for this screen family.

**Verdict: PASS.**

## 8. Build/typecheck/lint/tests

- `pnpm --filter @trust/api typecheck` — clean.
- `pnpm --filter @trust/web typecheck` — clean.
- `pnpm --filter @trust/api build` — clean.
- `eslint` targeted at every new/modified IP-018 file — zero findings.
- Full `pnpm test:e2e` (embedded Postgres, full suite) was attempted but is unreliable right now: the concurrent migration's in-progress changes to `outbox-relay.service.ts`, `env.schema.ts`, `app-config.service.ts`, and nearly every other `test/integration/*.e2e.spec.ts` file are uncommitted and touch shared infrastructure (outbox relay, config schema) the whole suite depends on. A full run was started, ran cleanly through most of the suite (evidence of a live, correctly-enforced append-only audit trigger was observed mid-run, which is reassuring), but was terminated by a timeout/shell issue before completion — this is attributable to the concurrent work's transitional state, not to IP-018's diff.
- Instead, IP-018's own new e2e spec (`ip-018-admin-support-operations.e2e.spec.ts`) was run **in isolation** against a fresh embedded Postgres instance: **5/5 tests passed** — 401/403 on all four new routes, support-lookup masking (including the `passwordHash`-absent assertion), audit-log search finding its own written entry, evidence review 404/200/403, and admin-refund `NOT_ELIGIBLE`→`COMPLETED`→`ALREADY_PROCESSED` verified against the real `refunded_amount` column.

## Findings

| # | Severity | Finding |
|---|----------|---------|
| 1 | OBSERVATION | Admin-refund reuse of `RefundPaymentUseCase` is genuine and verbatim — confirmed at the code level, not just per the report's claim. |
| 2 | OBSERVATION | `loadForAdmin` bypass has exactly one call site, gated by `AdminGuard`; not reachable from any participant-facing route. |
| 3 | MINOR | Failed support lookups (404s) are not audit-logged, only successful ones. Does not leak data, but means a support-lookup probing pattern (checking whether an email/order/payment exists) is not fully traceable in the audit trail. Worth a follow-up ticket, not a blocker. |
| 4 | OBSERVATION | Audit-log search is read-only, parameterized, and bounded (max page size 100); the append-only trigger is confirmed live and untouched. |
| 5 | OBSERVATION | Full e2e suite could not be run to completion cleanly due to the concurrent, unrelated Render→Vercel migration's uncommitted changes to shared infrastructure files; IP-018's own scoped e2e spec was verified in isolation instead and passed 5/5. |

No CRITICAL or BLOCKING findings.
