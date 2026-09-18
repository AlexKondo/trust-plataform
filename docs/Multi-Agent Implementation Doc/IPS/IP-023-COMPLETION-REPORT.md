# IP-023 — External Integrations & Webhooks — Completion Report

**Primary owner:** Integration
**Hard dependencies:** IP-001 (foundation/outbox), IP-009 (existing inbound webhook precedent)
**Status:** Implemented, self-tested, awaiting independent Diff Review + Quality Gate. **Not merged, not self-approved.**

## 1. Baseline and dependencies

- Repo: `C:\projects\trust`, branch `main`, HEAD `b5b0bf7` at task start (clean working tree).
- Read in full before implementation: `00_READ_FIRST...md`, `02_SHARED_ENGINEERING_STANDARDS.md`, `IP-023_External_Integrations_Webhooks.md`, `IP-009-COMPLETION-REPORT.md`, `MIGRATION-RENDER-TO-VERCEL-COMPLETION-REPORT.md`, `docs/event-catalog.md`, and (skimmed) `IP-014`/`IP-018` completion reports for the `AdminGuard` CRUD pattern.
- **Hard dependencies status**: IP-001 (transactional outbox + `EventConsumer`/`OutboxRelayService`) is closed baseline, confirmed by reading `apps/api/src/shared/events/outbox-relay.service.ts` and `event-consumer.ts` in full, per instruction. IP-009 is closed baseline (Asaas **inbound** webhook, fail-closed signature verifier) — read and explicitly **not** touched or duplicated.
- **VERIFY_ONLY check**: no outbound webhook capability existed anywhere in the repo prior to this IP (confirmed by `grep` for `webhook` across `apps/api/src`, which only matched the IP-009 inbound Asaas path under `modules/payment/infrastructure/webhook/`). This IP is net-new, not `VERIFY_ONLY`.

## 2. Preflight findings — capabilities reused vs. gaps closed

Reused (no duplication):
- `OutboxRelayService.drainOnce()` — outbox draining, per-row attempts/backoff, `PENDING → PUBLISHED/FAILED`, `processedEvents` dedupe. **Not modified.**
- `EventConsumer` abstract contract (`eventType`, `consumerName`, `managesOwnTransaction`, `handle`) — extended, not changed.
- `AdminGuard` (`modules/identity/infrastructure/security/admin.guard.ts`) — reused as-is for every new endpoint, same pattern as `RiskFlagController` (IP-014) and `LedgerAdminController` (IP-010).
- `AuditLogService` — every subscription mutation (create/update/disable/enable/rotate/confirm) is audited via the existing `record()` API.
- `ZodValidationPipe`, canonical error/response envelope, `/api/v1/...` routing — all reused unmodified.

Gaps closed by this IP:
- No outbound webhook subscription model existed → new `webhook_subscriptions`/`webhook_deliveries` tables.
- No curated external-event allowlist existed → `webhook-event-allowlist.ts`.
- No outbound signed delivery mechanism existed → `WebhookSignatureService` + `WebhookDeliveryService` + one `EventConsumer` per allowlisted event type.
- No admin surface for any of the above → `AdminWebhookController`.

## 3. Implemented

### 3.1 Event allowlist (curated, not "export everything")

File: `apps/api/src/modules/integrations/webhooks/domain/webhook-event-allowlist.ts`.

**Included** (`WEBHOOK_ALLOWED_EVENT_TYPES`), with rationale:

| Event type | Why included |
|---|---|
| `MarketplaceOrder.Scheduled` | Order lifecycle milestone a partner integration needs to track a job's timeline. |
| `MarketplaceOrder.Started` | Execution check-in — partner-visible operational milestone. |
| `MarketplaceOrder.ExecutionCompleted` | Provider check-out — partner-visible operational milestone (not the final "done" state, but a legitimate integration hook). |
| `MarketplaceOrder.CustomerConfirmed` | The platform's most important business fact (per `docs/event-catalog.md`); a partner reconciling its own order record needs this. |
| `MarketplaceOrder.Completed` | Terminal success state of the order lifecycle. |
| `MarketplaceOrder.Cancelled` | Terminal cancellation state — a partner needs to know a job it was tracking will not happen. |
| `MarketplaceDispute.Resolved` | Dispute **outcome** only (never `Opened` — see Conflict Escalation below) — a partner needs to know a disputed order's final resolution to close its own ticket. |

**Explicitly excluded**, with reasons:

| Event / family | Why excluded |
|---|---|
| `TrustScore.*`, `TrustLevel.*`, `TrustBadge.*` | Internal Trust Score signals (task instruction: exclude explicitly). These are platform-internal reputation mechanics, not a business fact about a partner's own order/transaction — TP-001 ("only the Trust Engine publishes Trust Score events") reinforces that these are not meant for external consumption. |
| `Payment.*`, `Funds.*`, `TrustCustody.*`, `IncrementalTrustCustody.*`, `PaymentIncrementalAuthorization.*`, `FundsRefund.Completed` | Payment/PSP internals (task instruction: exclude explicitly). These carry custody/gateway state that is Trust Platform's internal financial machinery, not something a partner should observe or react to directly — also avoids ever needing to reason about float/PSP-fee precision in an external payload. |
| `Identity.*`, `Session.*` | Authentication/session PII — no legitimate external-partner need, high sensitivity. |
| `MarketplaceMessage.Sent`, `MarketplaceConversation.*` | Message content/negotiation PII — no legitimate external-partner need. |
| `MarketplaceListing.Viewed` | Analytics/browsing PII (nullable `viewerId`), no legitimate external-partner need. |
| `MarketplaceOffer.*`, `MarketplaceListing.Created/Updated/Published`, `MarketplaceOrder.Created`, `MarketplaceListing.Reserved` | Internal negotiation/listing mechanics — narrower allowlist was chosen deliberately per the IP's "keep narrow and product-facing" instruction; these are not order-lifecycle-terminal or dispute-outcome facts. |
| `TrustChangeOrder.*` | Carries commercial/monetary delta fields (`changeGrossAmount`, `changeTrustFeeAmount`) — payment-adjacent internal commercial mechanics, same rationale as the Payment family. |
| `ServiceExecution.Paused/Resumed`, `MarketplaceOrder.PartnerEnRoute/PartnerArrived`, `MarketplaceOrder.Rescheduled` | Operational/Trust Signal-level detail, not a lifecycle milestone or dispute outcome per the IP's stated scope. |
| `MarketplaceReview.Created` | Reputation content about a specific user — no legitimate external-partner need disclosed in the IP; also feeds Trust Score directly. |

**Payload sanitization**: `sanitizeWebhookPayload(eventType, payload)` forwards only an explicit per-event-type field allowlist (e.g. `MarketplaceDispute.Resolved` forwards `disputeId/orderId/buyerId/sellerId/decisionType/refundAmount/decidedAt` but **drops** `decidedBy` — the deciding admin's identity — and `faultIdentityId` — internal fault attribution). Fields absent from the source payload are never fabricated. Proven by `webhook-event-allowlist.spec.ts` and the e2e test's payload assertions.

**Conflict Escalation filed (informal, in this report — no separate artifact needed per task instruction "if ambiguous... leave off and note as Conflict Escalation candidate")**: `MarketplaceDispute.Opened` was deliberately left OFF the allowlist. Rationale for treating it as a genuine judgment call rather than a clear exclusion: unlike `Resolved` (a settled fact), `Opened` reveals to a partner integration that an unresolved allegation exists against a counter-party before any adjudication — this could be used punitively/reputationally by a partner system in a way product has not approved. Because this is a real product trade-off (operational visibility vs. premature reputational signal) rather than an obviously-PII or obviously-internal event, it is called out here for a product/architecture decision rather than guessed at.

### 3.2 Signed delivery (outbound)

- `WebhookSignatureService` (`domain/webhook-signature.service.ts`): `sign()` = `HMAC-SHA256(secret, rawBody)` hex; `verify()` uses `crypto.timingSafeEqual` after equal-length check (mirrors IP-009's safe-comparison posture, even though IP-023 has no inbound verification endpoint — `verify()` exists for a future/administrative use and is unit-tested).
- Header sent: **`X-Trust-Webhook-Signature`** = signature over the exact serialized JSON string POSTed (never recomputed from a re-serialized object).
- Envelope POSTed to the partner (`WebhookDeliveryService.deliverToOne`):
  ```json
  {
    "payloadVersion": "1",
    "eventId": "<outbox eventId>",
    "eventType": "MarketplaceOrder.Completed",
    "occurredAt": "<ISO 8601>",
    "deliveryAttempt": 1,
    "data": { /* sanitizeWebhookPayload() output only */ }
  }
  ```
  This is a **distinct envelope from PACK-00's internal `EventEnvelope`** — it deliberately omits `producer`, `causationId`, and other internal-only fields that have no meaning to an external partner.
- Delivery is implemented as one `EventConsumer` subclass **per allowlisted event type** (`WEBHOOK_CONSUMER_PROVIDERS`, `infrastructure/consumers/webhook-delivery.consumers.ts`), built via a factory-provider array — the exact same pattern IP-013 uses for `NOTIFICATION_CONSUMER_PROVIDERS` (one provider per rule, avoiding N near-identical files). Each consumer's `handle()` iterates every **active** subscription subscribed to that event type and delivers to each.
- `managesOwnTransaction = true` (same as `pay.finalize-release`, PACK-01 §17): the HTTP call to a partner is an external dependency and must not run inside an open DB transaction/connection.

### 3.3 Retries / DLQ

- Per-(subscription, event) delivery row in `webhook_deliveries` (`attempts`, `status`, `responseStatus`, `lastError`, `deliveredAt`), unique on `(subscription_id, event_id)`.
- On each outbox drain, `deliverToOne` looks up (or creates) the delivery row; if it is already `SUCCESS` or `DEAD_LETTER` it is **skipped** (idempotent retry — proven by the e2e/unit "does not re-POST" test).
- On failure, `attempts` increments; once `attempts >= WEBHOOK_MAX_DELIVERY_ATTEMPTS` (8, `application/webhook-delivery.constants.ts`), the row moves to `DEAD_LETTER` and is treated as terminal for that subscription (no more HTTP attempts, but **never silently dropped** — visible via `GET /admin/webhooks/deliveries?status=DEAD_LETTER` and per-subscription `GET /admin/webhooks/subscriptions/:id/health`).
- The `EventConsumer.handle()` throws while any subscription for that event has not reached a terminal state (`SUCCESS`/`DEAD_LETTER`), so the **outbox row itself** stays `PENDING` and is redelivered by `drainOnce()` on the next cron invocation — the existing, unmodified outbox backoff/attempts mechanism is the retry scheduler; this IP only adds finer-grained per-subscription bookkeeping and its own independent DLQ cap, layered on top without touching `outbox-relay.service.ts`.

### 3.4 Secret rotation — chosen design

Two-column, two-active-secrets model on `webhook_subscriptions`: `secretActive` + `secretPrevious` (+ `secretRotatedAt`).

- **Signing** always uses `secretActive` only — a delivery is signed with exactly one secret per attempt (this is a sender, not a verifier: the platform does not need to accept two signatures, it only ever produces one).
- `POST /admin/webhooks/subscriptions/:id/rotate-secret` generates a new random secret, moves the current `secretActive` into `secretPrevious`, and returns the **new** secret once (plaintext, never persisted-and-returned again).
- `secretPrevious` is preserved (not signing new deliveries, but available as a reference for an admin manually verifying an in-flight/older delivery during the partner's migration window) until the admin calls `POST /admin/webhooks/subscriptions/:id/confirm-rotation`, which clears it.
- This satisfies the task's "old+new active" requirement as: **old remains fetchable/verifiable by the admin until explicitly confirmed rotated out**, while every *new outbound delivery* uses the new secret immediately (no ambiguity about which secret signs a given attempt, unlike a "try both" verifier model which would only make sense for an inbound endpoint).

### 3.5 Admin CRUD + visibility (API-only, disclosed gap)

`AdminWebhookController` (`admin/webhooks/...`, `AdminGuard`-protected):
- `POST /admin/webhooks/subscriptions` — create (https-only URL, allowlist-only event types validated server-side).
- `GET /admin/webhooks/subscriptions` / `GET .../:id` — list/get (secret fields never serialized, via `toView()` omitting `secretActive`/`secretPrevious`).
- `PATCH /admin/webhooks/subscriptions/:id` — update URL/description/event types.
- `POST .../:id/disable` / `.../enable` — active flag toggle (used as the CRUD "delete" per the task's "active/disabled flag" instruction; no hard delete endpoint was built).
- `POST .../:id/rotate-secret` / `.../confirm-rotation` — secret rotation (§3.4).
- `GET .../:id/health` — success/pending/dead-letter counts.
- `GET /admin/webhooks/deliveries?subscriptionId=&status=` — DLQ/delivery listing.
- `GET /admin/webhooks/event-catalog` — returns the live allowlist for admin UI/tooling convenience.

**Disclosed gap**: API-only, no frontend page — same precedent as IP-010's ledger admin ("ledger admin is API-only", per that Completion Report). Not built here; out of scope per the task's explicit "API-only is acceptable" allowance.

## 4. Not implemented / out of scope

- No public SDK/agent marketplace, no arbitrary DB export (IP-023 §4 out-of-scope, respected).
- No inbound verification endpoint (this IP is outbound-only; `WebhookSignatureService.verify()` exists for future/administrative tooling but is not wired to any HTTP route).
- `MarketplaceDispute.Opened` — deliberately not allowlisted; flagged as a Conflict Escalation candidate (§3.1).
- No frontend admin UI (disclosed gap, §3.5).
- Hard delete of a subscription — only disable/enable exists, matching the task's own wording ("active/disabled flag").

## 5. Files changed / added

**New module** (`apps/api/src/modules/integrations/webhooks/`):
- `domain/webhook-event-allowlist.ts` (+ `.spec.ts`)
- `domain/webhook-signature.service.ts` (+ `.spec.ts`)
- `application/webhook-secret.util.ts`
- `application/webhook-delivery.constants.ts`
- `application/webhook-delivery.service.ts` (+ `.spec.ts`)
- `application/webhook-subscription.service.ts` (+ `.spec.ts`)
- `infrastructure/persistence/webhook-subscriptions.schema.ts`
- `infrastructure/persistence/webhook-deliveries.schema.ts`
- `infrastructure/persistence/drizzle-webhook.repository.ts`
- `infrastructure/consumers/webhook-delivery.consumers.ts`
- `infrastructure/api/admin-webhook.controller.ts`
- `webhooks.module.ts`

**New migration**:
- `apps/api/drizzle/0040_ip023_external_integrations_webhooks.sql` (additive: `CREATE TABLE IF NOT EXISTS` for `webhook_subscriptions`/`webhook_deliveries`, guarded FK adds, `CREATE INDEX/UNIQUE INDEX IF NOT EXISTS` — same idempotent style as `0024..0039`).
- `apps/api/drizzle/meta/_journal.json` — new entry `idx: 40, tag: 0040_ip023_external_integrations_webhooks` (appended manually; see §11 for why `drizzle-kit generate` was not used).

**New e2e test**:
- `apps/api/test/integration/ip-023-external-integrations-webhooks.e2e.spec.ts`

**Modified (minimal, additive)**:
- `apps/api/src/app.module.ts` — registers `WebhooksModule`.
- `apps/api/src/shared/database/schema/index.ts` — re-exports the two new schema files (same pattern as every other module).

**Not touched**: `payment/**`, `privacy/**`, `identity/**` business logic (only imported `identities`/`IdentityModule` read-only, same as every other admin module); `shared/events/outbox-relay.service.ts` and `event-consumer.ts` were **read in full but not modified** — the new consumers extend the existing abstract contract without any change to the relay.

## 6. Migrations / configuration

- Migration is additive-only (`CREATE TABLE IF NOT EXISTS`, guarded `DO $$ ... information_schema` FK adds, `IF NOT EXISTS` indexes) — no `ALTER`/`DROP` of existing tables, no destructive statement, matching `02_SHARED_ENGINEERING_STANDARDS.md §4`.
- No shared/prod Supabase environment was touched. No `db:migrate` was run against any real database; migrations were only applied by the e2e harness against the disposable embedded Postgres instance (`.pgdata-e2e`), exactly like every other IP's tests.
- No new required environment variables. Delivery timeout (`WEBHOOK_HTTP_TIMEOUT_MS = 10_000`), retry cap (`WEBHOOK_MAX_DELIVERY_ATTEMPTS = 8`), and payload version (`WEBHOOK_PAYLOAD_VERSION = "1"`) are code constants (not `.env`), following the same reasoning `event-envelope.ts` uses for `EVENT_TYPE_PATTERN` — they are not secrets and not environment-dependent.

## 7. APIs / events / jobs

- New routes are all under `/api/v1/admin/webhooks/...`, `AdminGuard`-protected, canonical response envelope (via the existing global `ResponseEnvelopeInterceptor`/`GlobalExceptionFilter` — untouched).
- No new domain event is published by this IP — it is a **consumer** of existing events, not a producer. `docs/event-catalog.md` was not modified because no new event type/producer/payload was introduced; this report itself documents the allowlist, which is IP-023-specific integration metadata rather than a catalog entry.
- OpenAPI: not updated in this pass — **disclosed gap**. The new admin routes follow the existing envelope/DTO conventions closely enough to be added mechanically, but `docs/openapi.yaml` was not regenerated/hand-edited due to time constraints; flagged for the Diff Review/Quality Gate follow-up.

## 8. Security / authorization / privacy

- Every new endpoint requires `AdminGuard` (re-checked server-side on every request, no client-trusted role) — proven by the e2e "authorization negative test" (non-admin → 403).
- Subscription URLs are validated `https://`-only server-side (`WebhookSubscriptionService.validateUrl`) — rejects `http://` even from an authenticated admin, proven by e2e.
- Secrets: `crypto.randomBytes(32).toString('hex')` (32 bytes/256 bits of entropy), never logged (`WebhookDeliveryService`/`WebhookSubscriptionService` log only `subscriptionId`/`eventId`/`eventType`/`attempt`/`responseStatus`, never the secret), never returned on any `GET` (proven by unit test `get() never exposes secretActive/secretPrevious` and e2e "never exposes it again on GET").
- Payload minimization: only allowlisted event types, only allowlisted fields per type (§3.1) — proven by unit tests that specifically assert internal fields (`decidedBy`, `faultIdentityId`) are dropped.
- Signature comparison uses `crypto.timingSafeEqual`, consistent with IP-009's stated security posture (§6 shared standards).
- No PII beyond IDs already treated as safe-to-correlate elsewhere in the platform (`orderId`/`buyerId`/`sellerId` UUIDs) is forwarded; no email, no message content, no location.

## 9. Data / financial invariants

- The only monetary field in the allowlisted payloads (`amount` on `MarketplaceOrder.CustomerConfirmed`/`Completed`, `refundAmount` on `MarketplaceDispute.Resolved`) is forwarded **verbatim from the source event**, never recomputed — this IP performs no arithmetic on money, so the "no floating point" rule is inherited unchanged from the producing module's own convention (integer cents, per repo-wide convention).
- `webhook_deliveries` has a unique constraint on `(subscription_id, event_id)` enforced at the database level (not just application logic), preventing duplicate delivery rows under concurrent/retried drains — this is the CAS-equivalent invariant for this IP's one non-outbox state transition.

## 10. Tests executed and exact results

All commands run from `C:\projects\trust\apps\api` unless noted.

1. **`npx tsc --noEmit`** — clean, 0 errors (after fixes).
2. **`npm run build`** (`tsc -p tsconfig.build.json`) — clean.
3. **`npx eslint apps/api/src/modules/integrations apps/api/test/integration/ip-023-external-integrations-webhooks.e2e.spec.ts`** (run from repo root) — clean, 0 errors (started at 103 errors across mock-typing/`any` issues, all fixed with real types or narrowly-scoped `eslint-disable-next-line` on hand-rolled test doubles, consistent with repo convention of disabling `@typescript-eslint/unbound-method` only for `**/*.spec.ts`).
4. **Unit tests** — `npx vitest run src/modules/integrations` → **4 files, 26 tests, all passed**:
   - `webhook-signature.service.spec.ts` (6): deterministic HMAC, different secret → different signature, tamper detection, wrong-secret rejection, malformed signature doesn't throw.
   - `webhook-event-allowlist.spec.ts` (4): allowlist membership both directions, field-level sanitization drops internal fields, never fabricates absent fields.
   - `webhook-subscription.service.spec.ts` (10): https-only rejection, allowlist rejection, empty-list rejection, secret generated/returned once/never re-exposed, rotate/confirm-rotation flow, disable audit.
   - `webhook-delivery.service.spec.ts` (6): no-op when no subscriber, HMAC header + envelope shape on the wire, idempotent no-double-POST on retry, non-2xx → retry signal, DLQ after `WEBHOOK_MAX_DELIVERY_ATTEMPTS` + no further attempts after DLQ, network error treated as failure.
5. **Baseline full e2e suite** (before any IP-023 code was present — `git stash -u` back to clean HEAD `b5b0bf7`, then `npm run test:e2e -- --no-file-parallelism`):
   - First attempt hit a stray `postgres.exe` holding a shared-memory block from a previous run (`FATAL: pre-existing shared memory block is still in use`) — handled per the task's explicit instruction: `taskkill /F /IM postgres.exe`, removed `.pgdata-e2e`, reran.
   - **Result: 121 test files passed (121), 777 tests passed (777)**, 0 failed. Matches the number reported in `MIGRATION-RENDER-TO-VERCEL-COMPLETION-REPORT.md` exactly (confirmed, not assumed).
6. **`git stash pop`** — IP-023 changes restored.
7. **Full e2e suite with IP-023 changes**, first run: **1 file / 2 tests failed** — both were IP-023's **own** new e2e tests (`rotates a secret...`, `disabling a subscription...`), root cause was a test bug (those two tests reused the plain-`http://` fake-server URL against the real, intentionally-`https`-only creation endpoint — a correct rejection by the code under test, not a defect in it). Fixed by using an `https://` literal for those two subscriptions (they don't need a reachable delivery target). **No other test — baseline or new — was affected.**
8. **Full e2e suite, final run** (`npm run test:e2e -- --no-file-parallelism`), after the test fix:
   - Stray shared-memory issue recurred once more between runs (same cause/handling as step 5).
   - **Result: 126 test files passed (126), 810 tests passed (810)**, 0 failed, 0 skipped. 126 − 121 = 5 new files is inconsistent with "1 new e2e file" at first glance — the actual accounting is: 121 baseline files + 1 new e2e file (`ip-023-...e2e.spec.ts`) + 4 new unit spec files under `src/modules/integrations/...` (vitest's single run collects both `test/integration/**` and `src/**/*.spec.ts`) = 126. Tests: 777 baseline + 33 new (26 unit + 7 e2e `it()` blocks in the new file) = 810. Both totals reconcile exactly against the diff.
   - **Zero regression** to any pre-existing test, explicitly including every outbox-relay/event-consumer-touching suite (`pack-00.e2e.spec.ts`, `ip-013-notification-communication-completion.e2e.spec.ts`, `ip-007-incremental-payment-authorization.e2e.spec.ts`, etc.) — all still passed.
9. Postgres cleanup performed after each run (`taskkill /F /IM postgres.exe` + `.pgdata-e2e` removal) — no leftover stray process at the end of the task.

## 11. Deviations / decisions

- **`drizzle-kit generate` was not used** to produce the migration file. It failed non-interactively with `Error: Interactive prompts require a TTY terminal` (a column-rename-conflict prompt it could not resolve without a live terminal, in this pre-existing repo/tool version combination — likely an artifact of the multi-agent sandboxed shell, not something specific to this IP's schema). Rather than fight the tool, the migration SQL and `meta/_journal.json` entry were **hand-written**, closely mirroring the exact idempotent style (`CREATE TABLE IF NOT EXISTS`, guarded `DO $$ ... information_schema` FK adds, `IF NOT EXISTS` indexes) of every migration from `0024` onward, and validated end-to-end by the e2e suite actually applying it via `drizzle-orm/postgres-js/migrator` (the same mechanism `apps/api/src/shared/database/migrate.ts` and every e2e spec use) — 810/810 tests passing is empirical proof the hand-written SQL is valid and matches the Drizzle schema.
- **One `EventConsumer` per allowlisted event type**, not one generic multi-event consumer, to preserve the outbox relay's `eventType → consumers[]` lookup semantics (`OutboxRelayService.getConsumers()`/`consumersByEventType`) exactly as designed — this was the only design compatible with the existing relay without touching it, and mirrors the already-established `NOTIFICATION_CONSUMER_PROVIDERS` factory pattern (IP-013).
- **Per-subscription DLQ cap is independent of the outbox row's own `outboxMaxAttempts`.** A subscription can reach `DEAD_LETTER` (stop being retried) while the outbox row itself is still being retried on behalf of *other* subscriptions to the same event, or vice versa the outbox row can hit `FAILED` (shared-standards-inherited terminal state) while a subscription delivery is still `PENDING` under this IP's own accounting — in that scenario, `retryFailed()` (existing outbox admin operation, unmodified) would need to be invoked by an operator to resume the outbox row before that pending subscription delivery can complete. This is a deliberate two-layer design (documented, not hidden) rather than reimplementing the outbox's own retry scheduling inside this IP.

## 12. Known issues / technical debt

- OpenAPI (`docs/openapi.yaml`) not updated for the new `/admin/webhooks/*` routes (§7).
- No admin frontend page (§3.5, disclosed/allowed gap).
- `WebhookSignatureService.verify()` is implemented and unit-tested but has no caller in this IP (kept for a plausible future use — e.g., an admin "test delivery" endpoint, or a future inbound acknowledgment channel — but is genuinely dead code today; flagged rather than hidden).
- `webhook_subscriptions.eventTypes` is `jsonb` filtered in application code (`Array.includes`) rather than a `jsonb` containment query — acceptable at expected admin-managed-subscription scale (tens, not thousands, of rows) but would need revisiting if subscription volume grows materially.

## 13. External blockers

None that stopped implementation. The `drizzle-kit generate` TTY issue (§11) was worked around, not a blocker on the IP itself.

## 14. Acceptance criteria matrix (from the IP spec §6)

| Criterion | Status | Evidence |
|---|---|---|
| Webhook signatures verifiable | Met | `WebhookSignatureService`, HMAC-SHA256 hex over raw body, unit + e2e verified against an independently-computed signature. |
| Retries safe | Met | Idempotent per-(subscription, event) delivery row skips already-terminal deliveries; unit + e2e "no double-POST on retry". |
| Event allowlist | Met | `WEBHOOK_ALLOWED_EVENT_TYPES`, server-enforced on subscription create/update, e2e proves non-allowlisted event never delivered. |
| Secrets protected | Met | Random 256-bit secret, never logged, never re-exposed on GET, https-only delivery target. |
| Versioned payloads | Met | `payloadVersion: "1"` in every delivered envelope. |
| Admin configuration authorized | Met | `AdminGuard` on every route, e2e negative-authorization test. |

## 15. Commits

**None.** Per explicit process rule, git identity is unset in this environment and no commit was created — all changes are left uncommitted/unstaged in the working tree, ready for review.

## 16. Recommended reviewer focus for the independent Diff Review / Quality Gate agent (areas for highest scrutiny)

1. **Event allowlist judgment calls** — confirm the inclusion/exclusion table in §3.1 matches actual product intent, and resolve the `MarketplaceDispute.Opened` Conflict Escalation (§3.1) with an explicit product decision before this IP is considered final, rather than accepting the "left off" default as permanent.
2. **Signature verifiability** — independently recompute `HMAC-SHA256(secretActive, rawBody)` against a captured delivery in the e2e test and confirm it matches `X-Trust-Webhook-Signature` byte-for-byte (the e2e test already does this via `createHmac` from `node:crypto`, but a second pair of eyes on the raw-body-vs-object serialization order is warranted, since any re-serialization drift would break real partner verification undetectably in this test harness).
3. **Zero-regression-to-outbox claim** — rerun `npm run test:e2e -- --no-file-parallelism` independently and confirm the exact 810/810 count reported here (§10.8), with particular attention to any test that itself calls `relay.drainOnce()` directly (idempotency and ordering assumptions there are the most likely place a subtle regression would hide).
4. **Hand-written migration vs. `drizzle-kit generate`** (§11) — verify the SQL migration's column types/constraints match `infrastructure/persistence/*.schema.ts` exactly; the e2e suite passing is strong evidence but a manual diff against Drizzle's own generated snapshot (once the TTY issue is resolved in a normal terminal) would be the stronger proof.
5. **Retry/DLQ two-layer interaction** (§11, last bullet) — confirm the documented interaction between per-subscription DLQ and the outbox row's own `FAILED` state is acceptable operationally, or decide it needs unification in a follow-up IP.
