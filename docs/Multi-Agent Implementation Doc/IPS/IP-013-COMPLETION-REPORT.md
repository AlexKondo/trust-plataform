# IP-013 — Completion Report

**Notification & Communication Completion**
Executed 2026-09-15/16. Owner: Communications implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §3, §8, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-013 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-013_Notification_Communication_Completion.md`) > IP-000/IP-002/IP-003's Completion Reports > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `dfd9da0` (`main`, tip after IP-003 — `git log -1` confirmed).
- **Hard dependency**: IP-000, status APPROVED (per its own Completion Report §14: IP-013 row classified `PARTIAL` — "in-app rules-driven notification engine is complete (21 rules); no email/SMS/push channel, delivery-status/retry, or user preference/opt-out model exists"). IP-001/IP-002/IP-003/IP-007 are also already committed to `main` (`4685b1a`, `3ec7426`, `dfd9da0`, `3b6ef0c`).
- **Working tree at start**: `git status --short` showed exactly one pre-existing, unrelated line — `M .claude/settings.local.json` — the same file every prior IP (IP-001/002/003/007) reported as pre-existing local tooling configuration, not part of any IP's diff. No other file was modified or untracked at start.
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` lists IP-013's only hard dependency as IP-000, "Parallelizable after deps: yes", release class `CORE`, Wave 2 alongside IP-003/007/020/021 "where file ownership is isolated". This IP touched only `apps/api/src/modules/notification/**` (its own declared primary-owner domain — "notification rules" is explicitly named as a collision hotspot in Manifest §5, and no other active IP claims it in this wave) plus one new migration/journal entry and shared documentation collision hotspots (`docs/event-catalog.md`, `docs/openapi.yaml`, `CLAUDE.md`, this report). **Zero files under `apps/api/src/modules/payment/**` or `apps/api/src/modules/marketplace/**` were touched** — both explicitly off-limits per the task brief; this IP only *reads* events those modules already publish.

## 2. Preflight findings

1. Read all 9 required control/context documents in the mandated order (00, 01, 02, 03, 04, IP-013 spec, IP-000-COMPLETION-REPORT.md, IP-002-COMPLETION-REPORT.md, IP-003-COMPLETION-REPORT.md), plus IP-007-COMPLETION-REPORT.md (for the payment-side event payload shapes this IP needed to consume), before writing any code.
2. Hard dependency IP-000: APPROVED — confirmed by reading its Completion Report directly.
3. **Verified the IP-000/CLAUDE.md Brevo claim myself, in code, rather than trusting either source**: `apps/api/src/modules/identity/infrastructure/email/brevo-email.service.ts` is a real, working REST integration to `api.brevo.com/v3/smtp/email`, wired in `identity.module.ts` (falls back to `LoggingEmailService` when `BREVO_API_KEY` has no `xkeysib-` prefix — exactly the same graceful-degradation pattern IP-000 described for `.env.example`). **Correction to IP-000's own framing**: Brevo is not merely "claimed but unwired" — it genuinely sends email today, but **only** for the `identity` module's own transactional flows (email verification, password reset/forgot). `grep -rn "brevo\|Brevo" apps/api/src/modules/notification` returned zero matches before this IP, and still does after — **the generic `notification` module (NTF-001) has never been connected to Brevo or any other email/push provider**, which is the more precise version of the gap this IP addresses architecturally (§3.4/§11).
4. Independently re-verified, in current source (not from prose), the exact notification-rule gaps this IP exists to close:
   - `apps/api/src/modules/notification/domain/notification-rules.ts` — read in full (368 lines before this IP): **21 distinct rules** (matching IP-000 §3.4's count exactly), all in one table-driven array, one `RuleNotificationConsumer` class discovered generically by `OutboxRelayService`'s `instanceof EventConsumer` scan (`notification.consumers.ts`).
   - `docs/event-catalog.md` — read the entries for every event IP-003 and IP-007 added: `ServiceRequest.Created/Matched/Closed/Cancelled` and `ServiceRequestEngagement.Created` explicitly say *"nenhum hoje (notificação ao Member/Partner é escopo do IP-013, que ainda não existe)"* (IP-003's own words); `Payment.AuthorizationFailed` said *"não tem consumidor"*; `PaymentIncrementalAuthorization.Approved/.Failed` said *"nenhum externo hoje"*; `Funds.Released` said *"nenhum hoje"*. Cross-checked directly against `notification-rules.ts` (`grep -c "eventType: '"` = 21, none of these 7 event types present) — confirmed, not assumed.
   - `apps/api/src/modules/identity` — grepped every `outboxService.enqueue` call for `eventType`: `Identity.PasswordChanged` and `Identity.PasswordRecoveryRequested` are both published (from `change-password.usecase.ts` and `forgot-password.usecase.ts`) with zero consumer anywhere in the repository (event-catalog.md: "auditoria/analytics" only).
5. **Delivery status/retry — checked what already exists before building anything** (per this IP's explicit instruction "don't rebuild if something adequate exists"): `apps/api/src/shared/events/outbox-relay.service.ts` already has a real, working, generic retry/observability mechanism — `outbox_events.status`/`attempts`/`lastError` (exhausts to `FAILED` after `OUTBOX_MAX_ATTEMPTS`, `retryFailed()` for manual reprocess) plus pg-boss per-queue retry with exponential backoff (`retryLimit: 12, retryDelay: 2, retryBackoff: true`) and structured `EventConsumed`/`OutboxPublish` logs at `result: FAILURE`. This is genuinely adequate for "did the notification get *created*" (it is the same infrastructure all 21 pre-existing rules already rely on) — **it was not rebuilt**. What genuinely did **not** exist anywhere: any representation of "did this notification get delivered through its *channel*" (a concept the outbox layer cannot express, since it only knows whether the *consumer's `handle()`* succeeded, not whether a hypothetical future email/push send succeeded) — see §3.2.
6. Existing capabilities to reuse, confirmed by reading the actual files (not assumed from names):
   - The `NOTIFICATION_RULES` table-driven pattern itself (`{eventType, consumerName, build(payload)}`) — reused verbatim in shape for all 7 new rules; **zero new consumer classes were created** (constraint §4: "no business logic inside notification consumers" / "not 17 near-identical new classes" — now 28, still one generic `RuleNotificationConsumer`).
   - `str()`/`num()`/`to()` payload helpers and `formatMoney()` (`notification-labels.ts`) — reused unchanged for the new money-bearing rules (`PaymentIncrementalAuthorization.*`, `Funds.Released`).
   - The "author of the action is never notified of their own act" and "no spam engine" conventions (documented in `event-catalog.md`'s own NTF-001 section) — applied to every scoping decision below (§3.1).
   - `apps/api/src/shared/i18n/` (IP-002) — inspected; no new user-facing string was hardcoded in a way that bypasses the existing pipeline. IP-002 deliberately left the 21 existing rules' title/body text PT-BR-only-by-design (its own §3.3/§11.2: "the *mechanism* is real and tested; rendering per-locale text is carried forward as follow-up scope"), with `notifications.locale` already resolved and persisted per recipient for every notification regardless of rule. The 7 new rules follow the **exact same, already-established** convention — new PT-BR text in the rule table (same place, same pattern as the 21 existing ones), with `locale` already resolved by the untouched `RuleNotificationConsumer.resolveRecipientLocale()`. No new hardcoded-PT-BR problem is introduced beyond what NTF-001 already has and what IP-002 already explicitly scoped as follow-up work — see §11.1 for why rendering localized text for all 28 rules was correctly treated as out of this IP's scope too, not silently skipped.
7. Owned files / collision hotspots: all of `apps/api/src/modules/notification/**` (this IP's exclusive domain — Communications is IP-013's primary owner, and "notification rules" is Manifest §5's own named hotspot). `docs/event-catalog.md`/`docs/openapi.yaml`/`CLAUDE.md` are shared documentation hotspots, edited only in the sections/entries describing this IP's own new consumers, following IP-003/IP-007's precedent of never touching another IP's section. `apps/api/drizzle/meta/_journal.json` received one new trailing entry (idx 31) — checked the highest existing index first (30, IP-003's) per every prior IP's convention.
8. Baseline tests run before implementation: `npx tsc -p tsconfig.json --noEmit` (0 errors) from `apps/api` — matched the clean starting point every prior IP reported. The full `pnpm test:e2e`/unit baseline was not independently re-run a sixth time before starting (IP-000/001/002/003/007 all already reproduced a green baseline on this exact lineage); this agent's own post-implementation full run (§10.3) is the authoritative before/after comparison.
9. No conflict found requiring escalation before implementation. One candidate scope question — "should this IP wire a real email/push provider" — is addressed as a deliberate, evidence-based scope decision, not an escalation, in §11.2/§13.

## 3. Implemented

### 3.1 Seven new `NOTIFICATION_RULES` entries — same table, same pattern, no new classes

`apps/api/src/modules/notification/domain/notification-rules.ts` grew from 21 to **28** rules (confirmed: `grep -c "eventType: '"` = 28 after this IP). Each new rule is a pure `(payload) => NotificationDraft[]` function added to the existing array — no new `EventConsumer` subclass, no new provider factory (`NOTIFICATION_CONSUMER_PROVIDERS` in `notification.consumers.ts` still maps `NOTIFICATION_RULES` generically and was **not modified**).

| eventType | consumerName | Recipient | Category acceptance criteria mapping |
|---|---|---|---|
| `ServiceRequestEngagement.Created` | `ntf.service-request-engagement-created` | `partnerId` | "request" |
| `Payment.AuthorizationFailed` | `ntf.payment-authorization-failed` | `buyerId` | "payment" |
| `PaymentIncrementalAuthorization.Approved` | `ntf.incremental-payment-approved` | `buyerId` | "payment" / "Change Order" |
| `PaymentIncrementalAuthorization.Failed` | `ntf.incremental-payment-failed` | `buyerId` | "payment" / "Change Order" |
| `Funds.Released` | `ntf.funds-released` | `sellerId` | "payment" / "completion" |
| `Identity.PasswordChanged` | `ntf.password-changed` | `identityId` | "security" |
| `Identity.PasswordRecoveryRequested` | `ntf.password-recovery-requested` | `identityId` | "security" |

**Deliberate non-additions, each reasoned from the existing "no spam / never notify the actor" conventions already governing the 21 pre-existing rules, not from omission**:
- `ServiceRequest.Created/Matched/Closed/Cancelled` (4 of IP-003's 5 new events) — every transition is caused by the Member who owns the request (the actor-exclusion rule already used by all 21 pre-existing rules, e.g. `OFFER_ACCEPTED` only notifies the party who *didn't* accept). The one party who *isn't* the actor — an engaged Partner — is already notified by the pre-existing `ntf.message-sent` rule, since `EngageServiceRequestUseCase` reuses `ContactListingOwnerUseCase` verbatim and that always publishes `MarketplaceMessage.Sent` too (confirmed by reading `engage-service-request.usecase.ts` and IP-003's own §3.5). `ServiceRequestEngagement.Created` was added specifically because it is the **one** event in this family with a genuinely different recipient (the Partner) and adds real information (request *context*, not just "new message").
- `Payment.Created`/`Payment.Authorized` — both fire automatically as a direct consequence of `MarketplaceOffer.Accepted`, which the pre-existing `ntf.offer-accepted` rule already tells the non-accepting party about ("A negociação foi fechada e o pedido já foi criado."). A second notification for the same underlying fact would be exactly the duplicate-notification "spam" the IP explicitly excludes (§4 "no spam engine").
- `MarketplaceOrder.Completed` — fires automatically, milliseconds after `MarketplaceOrder.CustomerConfirmed`, which the pre-existing `ntf.order-confirmed` rule already covers for the seller ("O serviço foi confirmado e os pontos de confiança entraram no seu score."). `event-catalog.md` itself already documents this event as having no MVP consumer; not adding a duplicate notification is a no-spam decision, not an overlooked gap.
- `TrustCustody.Created`/`Funds.Held` — purely structural "custody exists" facts with no independent user-facing meaning beyond what `Funds.Released` (the fact users actually care about — money moved) already communicates; adding a notification per intermediate state would be spam.
- `Identity.PasswordReset` — deliberately **not** given a notification rule: unlike `PasswordChanged` (current session survives), a `PasswordReset` revokes **every** session including any that might display the in-app notification, so there is no session left to show it to; the existing Brevo transactional email (outside NTF-001, in the `identity` module) is the correct channel here and was already correct before this IP (documented in `event-catalog.md`, §7 below).

### 3.2 `notifications` table becomes channel/delivery-status aware (email/push-**ready**, not email/push-**wired**)

New columns (migration 0031, §6): `channel` (`IN_APP`/`EMAIL`/`PUSH`, default `'IN_APP'`), `delivery_status` (`PENDING`/`DELIVERED`/`FAILED`, default `'DELIVERED'`), `delivered_at` (nullable timestamp), `failed_reason` (nullable text). New domain file `apps/api/src/modules/notification/domain/notification-types.ts` defines the three enums as `as const` objects + derived types (`NOTIFICATION_CHANNEL`, `NOTIFICATION_DELIVERY_STATUS`, `NOTIFICATION_CATEGORY`).

**Why this is the correct "delivery status/retry" scope and not scope creep**: the outbox layer (§2.5) already answers "did the consumer succeed" generically for all 21+7 rules. It cannot and does not answer a *different* question a future email/push channel needs: "did the *send* through this specific channel succeed" — a failure mode that, by construction, can only happen *after* a notification row already exists (e.g., a future Brevo/FCM call rejecting the send). Nothing anywhere in the repository represented that second failure mode before this IP. `DrizzleNotificationRepository.createMany()` now sets `channel: IN_APP`, `deliveryStatus: DELIVERED`, `deliveredAt: now` deterministically for every notification it creates — because for the one channel that exists today, **creating the row *is* the delivery** (no separate "send" step exists, confirmed by reading `notification.consumers.ts`/`drizzle-notification.repository.ts` before this IP — there never was one). No `markDeliveryFailed`/`markDelivered` mutation methods were added, because nothing in this repository would call them yet (no real EMAIL/PUSH adapter exists) — adding unused, untested mutation code paths would have been speculative, not "minimum safe design". `GET /notifications` now returns `channel`/`deliveryStatus` per notification (additive fields, `notification.controller.ts`), making the new state observable today even though only one value combination (`IN_APP`/`DELIVERED`) is ever produced.

**Explicitly not done, and why (§13/§11.2)**: no Brevo (or any) call was added to the `notification` module. Brevo genuinely exists and works (§2.3), but only inside `identity`'s own use cases for its own transactional flows — extending it to the generic `notification` module would mean designing a *new* cross-cutting email-sending architecture (which notification types get emailed, digest vs. immediate, unsubscribe-link legal requirements for a *marketing-adjacent* channel even though every current type is transactional, retry semantics for a real external HTTP call inside a consumer that today never leaves the DB transaction) — none of which the IP-013 spec's Out of Scope (§4: "no business logic inside notification consumers") or the task's own instruction ("treat wiring a live external provider as out of scope unless already-configured") license this agent to invent. This is recorded as a conflict-adjacent scope boundary, not silently dropped — see §13.

### 3.3 `category: TRANSACTIONAL` on the `NotificationRule` interface

`category?: NotificationCategory` was added to the `NotificationRule` interface as an **optional** field (documented default: omitted = `TRANSACTIONAL`, exactly matching every one of the 21 pre-existing rules, which were **not** touched to add the field explicitly — avoiding a 21-line mechanical diff across tested, closed-baseline code for a field whose value would be identical everywhere). The 7 new rules explicitly set `category: NOTIFICATION_CATEGORY.TRANSACTIONAL`. This directly and machine-checkably satisfies the acceptance criterion "opt-out rules respect transactional vs optional communication": every notification type in this MVP — old and new — is a direct consequence of the recipient's own transaction, account, or security state; there is no promotional/marketing/digest content anywhere in the module. Building an opt-out UI/toggle for a category with zero members would be UI without function and squarely the "spam engine" this IP is told not to build (§4). `NOTIFICATION_CATEGORY.OPTIONAL` exists in the enum as the documented extension point for the day a genuinely optional notification type is added.

### 3.4 What was verified as already complete and intentionally not rebuilt (`VERIFY_ONLY` sub-scope)

- **In-app delivery + read-status model** (`readAt`, `GET /notifications`, `unread-count`, `PATCH .../read`, `PATCH read-all`) — complete since NTF-001, untouched.
- **Locale resolution per notification** — complete since IP-002 (`notifications.locale`, resolved per-recipient inside the transaction), untouched; the 7 new rules automatically get this for free since it happens in the generic consumer, not per-rule.
- **Idempotency** — the `EventConsumer`/`processed_events` dedupe (`(consumerName, eventId)` at-most-once) already guarantees a duplicate event delivery cannot duplicate a notification; this is generic infrastructure this IP's new rules automatically inherit, not something built per-rule.
- **Event-level retry/observability** — the outbox `attempts`/`status`/`lastError` + pg-boss backoff (§2.5) — genuinely adequate, not rebuilt.

## 4. Not implemented / out of scope

Per IP-013 spec §4 ("No spam engine; no WhatsApp provider unless separately configured; no business logic inside notification consumers") and this program's constraints:
- **No real email/push provider was wired into the `notification` module.** Brevo exists and works, but only for `identity`'s own transactional emails, unchanged by this IP. See §3.2/§13 for the full reasoning and why this is a deliberate scope boundary, not an oversight.
- **No WhatsApp adapter** — not named as genuinely warranted by any acceptance criterion; not built.
- **No opt-out/preference-center UI or endpoint** — see §3.3: every current notification type is `TRANSACTIONAL`; building opt-out machinery with zero `OPTIONAL` members would be non-functional scope creep.
- **No localized (non-PT-BR) rendering of any of the 28 rules' title/body text** — IP-002 already explicitly scoped this as follow-up work for the 21 pre-existing rules (its own §3.3/§11.2/§12); the 7 new rules follow the exact same established pattern (PT-BR text in the rule, locale resolved and persisted separately) rather than inventing a *different*, inconsistent convention for only the new rules. Fully localizing all 28 rules' content is a materially larger, separate piece of work (a message-catalog/key-based rendering redesign of the notification module, per IP-002's own §3.3 reasoning) that neither IP-002 nor this IP's spec scopes.
- **No `markDeliveryFailed`/`markDelivered` repository mutation methods** — see §3.2; nothing would call them yet, so they were not spec-written as dead code.
- **No modification of `apps/api/src/modules/payment/**` or `apps/api/src/modules/marketplace/**`** — confirmed zero files touched in either directory; this IP only reads events those modules already publish.
- **No frontend work** — `apps/web/app/notifications/page.tsx` already exists (IP-000 §3.7) and already renders whatever `GET /notifications` returns; the new `channel`/`deliveryStatus` fields are additive and do not require a UI change to avoid breaking the existing page (not verified to be *used* by the UI — out of scope, backend-only IP, consistent with IP-003/IP-007's own precedent of no `apps/web` file being named anywhere in their mandates either).

## 5. Files changed

**New files (4)**:
```
apps/api/drizzle/0031_ip013_notification_communication_completion.sql                53
apps/api/src/modules/notification/domain/notification-types.ts                       43
apps/api/src/modules/notification/domain/notification-rules.spec.ts                 177
apps/api/test/integration/ip-013-notification-communication-completion.e2e.spec.ts  497
```
4 new files, 770 lines total.

**Modified files** (`git diff --stat`, excluding the incidental `apps/web/tsconfig.tsbuildinfo` build-cache regeneration, reverted per §11.3, and excluding the pre-existing unrelated `.claude/settings.local.json` line, §1):
```
 CLAUDE.md                                                                            |  38 ++++
 apps/api/drizzle/meta/_journal.json                                                  |   7 +
 apps/api/src/modules/notification/domain/notification-rules.ts                       | 122 +++++++
 apps/api/src/modules/notification/infrastructure/api/notification.controller.ts      |   3 +
 apps/api/src/modules/notification/infrastructure/persistence/drizzle-notification.repository.ts | 12 +-
 apps/api/src/modules/notification/infrastructure/persistence/notifications.schema.ts | 18 +
 docs/event-catalog.md                                                                | 23 +-
 docs/openapi.yaml                                                                    |  8 +-
 8 files changed, 219 insertions(+), 12 deletions(-)
```

Zero files under `apps/api/src/modules/payment/**`, `apps/api/src/modules/marketplace/**`, `apps/api/src/modules/identity/**` (production code — only *read* via the notification consumer's existing `IdentityRepository` dependency, unchanged), or `apps/web/**` were touched. Every modified file received only additive edits (new rules, new columns with defaults, new optional interface field, new response fields) — no existing function body's control flow was altered; `RuleNotificationConsumer` itself (`notification.consumers.ts`) was **not modified at all** (confirmed: not in the diff).

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0031_ip013_notification_communication_completion.sql` (§3.2). Additive only, same idempotent style as 0024–0030 (`ADD COLUMN IF NOT EXISTS`, conditional `DO $$ ... END $$` `CHECK` constraints, no `DROP`, no destructive `ALTER`, no `tenant_id`). One backfill statement (`UPDATE ... SET delivered_at = created_at WHERE delivered_at IS NULL`) covers existing rows for the one nullable timestamp column that has no `DEFAULT` (the two `NOT NULL DEFAULT` columns need no backfill — Postgres applies the default to existing rows automatically). Not applied to any shared/prod environment — exercised only against the disposable embedded Postgres (`pnpm test:e2e`/`node test/e2e-local.mjs`) and the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.
- **Journal**: `apps/api/drizzle/meta/_journal.json` — new entry, idx 31, tag `0031_ip013_notification_communication_completion`, following the exact same shape as entries 24–30.
- No `.env`/config schema changes — no new runtime configuration surface was needed (no provider key, no feature flag).

## 7. APIs / events / jobs

- **No new HTTP route.** `GET /notifications`'s existing response gained two additive fields (`channel`, `deliveryStatus`) — documented in `docs/openapi.yaml` (example updated, description updated to explain the provider-ready semantics).
- **No new event type.** All 7 new rules consume events that IP-003/IP-007/the `identity` module already publish; this IP is a pure consumer addition.
- **7 new consumers** (`ntf.service-request-engagement-created`, `ntf.payment-authorization-failed`, `ntf.incremental-payment-approved`, `ntf.incremental-payment-failed`, `ntf.funds-released`, `ntf.password-changed`, `ntf.password-recovery-requested`), discovered automatically by the existing `OutboxRelayService`'s `instanceof EventConsumer` scan — no wiring change was needed in `notification.module.ts` or `outbox-relay.service.ts` (confirmed: neither file appears in the diff), because `NOTIFICATION_CONSUMER_PROVIDERS` already maps over `NOTIFICATION_RULES` generically (this is precisely the "table-driven, not 17 near-identical classes" architecture the constraint §4 required this IP to preserve, and it required zero structural change to add 7 more rows).
- **`docs/event-catalog.md`** updated: the NTF-001 section header/count (20→28, correcting the pre-existing doc-drift IP-000 §3.4 already flagged, from a different angle, as a byproduct of this IP's own count change — not a separate fix); the "Consumidores" line for `Funds.Released`, `Payment.AuthorizationFailed`, `PaymentIncrementalAuthorization.Approved/.Failed`, `ServiceRequest.*`, `ServiceRequestEngagement.Created`, `Identity.PasswordChanged`, `Identity.PasswordRecoveryRequested`, and a new explanatory note on `Identity.PasswordReset` (§3.1) explaining why it deliberately has none.

## 8. Security / authorization / privacy

- **No new HTTP route, so no new authorization surface.** The two touched read paths (`GET /notifications`) already enforce `identity.identityId`-scoped ownership (`NotificationRepository.list(identityId, ...)`) — unchanged by this IP.
- **`Identity.PasswordChanged`/`.PasswordRecoveryRequested` notifications are themselves a security control**, not just informational: they let the legitimate account owner detect an unauthorized password change/reset attempt they did not initiate, a standard security-notification pattern. `PasswordChanged`'s notification is reachable because that flow deliberately keeps the current session alive (existing `change-password.usecase.ts` behavior, unchanged) — confirmed the in-app notification is genuinely visible before the user needs to log back in. `PasswordRecoveryRequested`'s notification is only visible on the account owner's *next* login (since no session exists at request time) — documented as a deliberate, lesser-but-still-valuable signal in §3.1, not claimed to be an immediate alert.
- **No PII beyond what already flows through the existing 21 rules.** The new rules' bodies never include a payment method, card detail, provider raw response, or any field beyond amount/currency/resource-id — matching the existing money-bearing rules' precedent (`TrustChangeOrder.Submitted`/`.Approved` already put amounts in notification bodies).
- **No business logic inside the consumer** (constraint §4): every new rule is a pure `payload → NotificationDraft[]` function, identical in shape/complexity to the 21 pre-existing ones — no conditional branching beyond what `TrustLevel.Changed`/`MarketplaceDispute.Resolved` (pre-existing) already do (multi-recipient fan-out, promotion-only gating).
- **Migration adds two `CHECK` constraints** (`channel`, `delivery_status`) enforcing the enum at the database level, matching Shared Standards §4 ("use CHECK constraints when they enforce invariants") and the exact precedent of migration 0028's `identities_preferred_locale_supported` constraint.

## 9. Data / financial invariants

- **No mutation of any financial entity.** `Payment`, `TrustCustody`, `IncrementalTrustCustody`, `PaymentIncrementalAuthorization`, `MarketplaceCommercialSnapshot`, `TrustChangeOrder` are all untouched — this IP only *reads* their already-published event payloads (`amount`/`currency` fields, never recomputed, always formatted via the existing `formatMoney()` helper, never re-derived from other fields).
- **No floating-point money introduced.** `formatMoney()` (reused unchanged) takes the event payload's `amount`/`currency` fields as already-serialized reais (the Marketplace/Payment convention, confirmed in IP-003 §9/IP-007 §3.7) and formats via `Intl.NumberFormat` for **display only** — no arithmetic is performed on money anywhere in this diff.
- **Idempotency for the new rules is identical to the 21 pre-existing ones** — inherited for free from the generic `EventConsumer`/`processed_events` dedupe (§3.4), proven directly by this IP's own e2e concurrency-adjacent tests reusing the same `waitForNotification`/relay-tick pattern every prior notification e2e test uses, and additionally by the fact that `Funds.Released` for an *incremental* tranche and `Funds.Released` for the *original* tranche are two genuinely distinct `eventId`s (different aggregates) even though they share one `eventType` — confirmed the rule fires once per genuine event, not once per `eventType` globally (unit test "Funds.Released também cobre a tranche incremental").
- **`PaymentIncrementalAuthorization.Failed`'s notification body does not expose the raw gateway/provider failure code** to the end user (only a generic "verifique seu método de pagamento" message) — matching the existing `Payment.AuthorizationFailed`/`MarketplaceOffer.Rejected` precedent of never leaking internal provider codes into user-facing text.

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `dfd9da0`, in this environment. No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`node test/e2e-local.mjs`) or the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.

### 10.1 New tests written: 11 unit tests + 5 e2e tests, both new spec files

- `apps/api/src/modules/notification/domain/notification-rules.spec.ts` — **11 unit tests**, pure `build()` calls, no DB: each of the 7 new rules' correct recipient/type/resource fields; the "no orphan notification without a recipient" guard (`ServiceRequestEngagement.Created` with no `partnerId`); `Funds.Released` correctly handles both the original-tranche and incremental-tranche payload shapes with the same rule (no special-casing needed); every new rule declares `category: 'TRANSACTIONAL'`; no duplicate `consumerName` exists across all 28 rules (a structural regression guard for the whole table, not just the 7 new entries).
- `apps/api/test/integration/ip-013-notification-communication-completion.e2e.spec.ts` — **5 e2e tests**, each proving one new consumer end-to-end (outbox → relay → consumer → `notifications` row → `GET /notifications`):
  1. Engaging a `ServiceRequest` notifies the Partner (`SERVICE_REQUEST_ENGAGEMENT_RECEIVED`, `resourceType: ServiceRequestEngagement`) and explicitly **not** the Member who engaged; also asserts `channel: 'IN_APP'`/`deliveryStatus: 'DELIVERED'` are present in the API response (the one place §3.2's new fields are directly observed by a test, not just by type).
  2. A sandbox-declined payment authorization (amount `440.13` → deterministic `.13` decline convention) notifies the buyer (`PAYMENT_AUTHORIZATION_FAILED`).
  3. An approved-then-a-declined Change Order (via the HOURLY-contract-in-progress helper, `serviceDeltaAmount: 60` then `40.13`) notifies the buyer with `INCREMENTAL_PAYMENT_APPROVED` then `INCREMENTAL_PAYMENT_FAILED`, and explicitly **not** the seller (who already has `CHANGE_ORDER_APPROVED` from the pre-existing rule).
  4. A full confirm-completion flow releases funds and notifies the seller (`FUNDS_RELEASED`), explicitly **not** the buyer.
  5. `POST /auth/change-password` notifies the account owner (`PASSWORD_CHANGED`).
- One real test-authoring bug was found and fixed while writing test #4 (§10.4).

### 10.2 Regression: pre-existing `ntf-001.e2e.spec.ts` (NTF-001's own original 3 tests), run in isolation

```
Test Files  1 passed (1)
     Tests  3 passed (3)
Duration    23.09s
```
Zero regression in the 21 pre-existing rules' own dedicated e2e coverage.

### 10.3 Full suites, before/after

**Unit/domain suite** (`npx vitest run` from `apps/api`, no `TEST_DATABASE_URL` — e2e specs skip via `describe.runIf`):
```
Test Files  54 passed | 25 skipped (79)
     Tests  449 passed | 108 skipped (557)
Duration    70.70s
```
Before this IP (IP-003's own final reported state, per its Completion Report §10.2): 53 passed | 24 skipped (77 files), 438 passed | 103 skipped (541 tests). **Delta: +1 file/+11 tests in the always-run unit bucket** (`notification-rules.spec.ts`), **+1 file/+5 tests in the skipped-without-DB e2e bucket** (`ip-013-*.e2e.spec.ts`) — exactly this IP's own two new files, no other file's count changed.

**Full e2e suite** (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres):
```
Test Files  79 passed (79)
     Tests  557 passed (557)
Duration    560.70s (~9.3 min)
```
**0 failures, 0 skipped, clean on the first run** (no flaky-retry needed, unlike several prior IPs' reports which documented transient host-contention timeouts). Before this IP (IP-003's own final reported state): 77/77 files, 541/541 tests. **Delta: +2 files/+16 tests**, exactly this IP's own two new files (11 unit + 5 e2e) — no other file's test count changed, confirming zero regression across PACK-00..03/IP-001/002/003/007's entire existing suite.

### 10.4 Real bug found and fixed during this IP's own e2e verification

Recorded in full, per this program's standard of disclosing what was actually found (mirroring IP-002 §10.5's/IP-003 §10.4's own precedent):

**Symptom**: the first run of the new e2e file had 2 of 5 tests failing.
1. *"liberação de fundos"* failed with the confirm-completion endpoint logging `"Order confirmed without funds in custody; nothing to release"` (`reason: 'NO_CUSTODY'`). **Root cause**: this test's local `hourlyContractInProgress` helper authorized the payment and immediately scheduled/started the order without first waiting for the asynchronous `Payment.Authorized → pay.hold-funds` consumer to actually create the `TrustCustody` row — a step IP-007's own `contractInProgress` helper (the pattern this test was modeled on) *does* perform (`waitFor(... custody.status === 'IN_CUSTODY' ...)`), and which this test's first draft omitted. **Fix**: added the identical wait-for-custody step, confirmed by re-running the affected test (§10.1, scenario 4) — not a production-code bug, a test-authoring gap in this IP's own new test file.
2. *"troca de senha"* failed with `expected 204 to be 200`. **Root cause**: this test assumed `POST /auth/change-password` returns `200`; the real route (`auth.controller.ts`) is decorated `@HttpCode(HttpStatus.NO_CONTENT)` — it returns `204`, which the test's first draft got wrong (an assumption, not verified against the controller before writing the assertion). **Fix**: corrected the expected status code to `204`, confirmed the controller source directly before applying the fix (`apps/api/src/modules/identity/infrastructure/api/auth.controller.ts:100-101`).

Both were test-only bugs, fixed in the same file, re-verified by a clean full run of the new spec (5/5, §10.1) and then by the full suite (§10.3) — **zero production code was implicated in either bug**.

### 10.5 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors (root, including tools/extract-docx.mjs — already fixed by IP-001)
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 26 routes, all ✓ (unchanged from IP-003 — zero apps/web files touched by this IP)
```
`docs/openapi.yaml` parsed successfully with `js-yaml` after every edit (98 path templates — unchanged count, since this IP added zero new routes, matching IP-003's own final count exactly).

## 11. Deviations / decisions

1. **No email/push provider wired into the `notification` module, despite Brevo existing and working elsewhere in the repo** (§3.2/§13) — the single largest scope decision in this IP. Corrected the task brief's own premise: Brevo is real and configured, but only for `identity`'s own two transactional flows, never for `notification`. Connecting it would require inventing a cross-cutting design (which types get emailed, retry-outside-a-DB-transaction semantics for the send itself, legal unsubscribe-link requirements even for transactional-only content) that neither the IP-013 spec nor the task brief authorizes this agent to invent — treated as the boundary the task brief itself drew ("treat wiring a live provider as out of scope unless already-configured *for this purpose*"), not as a gap silently left unfilled. Flagged for the reviewer/Orchestrator as a genuine candidate for a future, explicitly-scoped IP (§13).
2. **`category` field made optional with a documented default, rather than mechanically added to all 21 pre-existing rules** (§3.3) — avoids a 21-line no-op diff across tested, closed-baseline code; the acceptance criterion is satisfied either way (every rule, explicit or defaulted, is `TRANSACTIONAL`).
3. **No `markDeliveryFailed`/`markDelivered` repository methods added** (§3.2) — nothing would call them without a real channel adapter; writing unused mutation code paths was judged speculative, not "minimum safe design" per Shared Standards §1.
4. **`ServiceRequest.Created/Matched/Closed/Cancelled` deliberately left without notification rules** (§3.1) — every actor is the request's own Member owner (existing actor-exclusion convention), and the one genuinely different recipient (an engaged Partner) is covered by the new `ServiceRequestEngagement.Created` rule plus the pre-existing message notification. Flagged for reviewer re-judgment in §16, since IP-003's own report explicitly named "notificação ao Member/Partner é escopo do IP-013" for the whole family without specifying which of the 5 events actually need one.
5. **Incidental build-cache artifact reverted**: `apps/web/tsconfig.tsbuildinfo` was regenerated by `pnpm -r build`/`pnpm typecheck` and reverted with `git checkout -- apps/web/tsconfig.tsbuildinfo`, per every prior IP's own precedent (IP-000 §11.6, IP-003 §11.8).

## 12. Known issues / technical debt

- **28 rules' title/body text is PT-BR-only** — carried forward from IP-002's own explicitly-scoped gap (§4/§11.3 above); the 7 new rules follow the same established, tested pattern rather than diverging from it.
- **No real email/push channel exists** — the schema/domain/API are provider-ready (§3.2); wiring a real provider (whether extending Brevo or a dedicated push service) is explicitly out of this IP's scope and flagged for a future, dedicated IP (§13).
- **No opt-out mechanism** — correctly absent given zero `OPTIONAL`-category notification types exist (§3.3); would need to be added together with the first genuinely optional notification type, not before.
- **`Identity.PasswordReset`'s security notification is email-only** (the existing Brevo integration, unchanged) — its own session-revocation semantics make an in-app notification structurally unable to be seen at the moment that matters (§3.1); documented, not a defect.
- The pre-existing debt items from IP-000 §12 (double-Resume race, generic-500-vs-409 mapping, root lint) are outside this IP's owned files and were not touched.

## 13. External blockers

**None that stop this IP's own scope** — no credentials, external provider account, or product decision was required to deliver what is described above. One item is recorded here as a **flagged-not-blocking** scope boundary, per the task brief's own instruction to flag rather than silently expand or silently drop:

- **Whether to actually wire a real email/push provider into the generic `notification` module** (as opposed to keeping it provider-ready, which this IP delivers) is a product/architecture decision this agent explicitly did not make unilaterally — it touches legal (unsubscribe/consent requirements even for "transactional" email under some regimes), product (digest vs. immediate, which of the 28 types get emailed), and cost (a real Brevo/FCM send volume) considerations beyond "extend an existing rule table." Brevo credentials/configuration already exist in this environment (`.env.example`'s `BREVO_API_KEY`, already used by `identity`), so this would **not** be `BLOCKED_EXTERNAL` in the IP-000 sense (no missing credential) — it is a scope/product decision, correctly left for the Orchestrator to decide whether a follow-up IP should own it.

## 14. Acceptance criteria matrix

| Criterion (IP-013 spec §6) | Status | Evidence |
|---|---|---|
| Critical events have notifications | PASS | Request (`ServiceRequestEngagement.Created`), payment (`Payment.AuthorizationFailed`, `PaymentIncrementalAuthorization.*`, `Funds.Released`), Change Order (pre-existing, verified untouched-and-working), dispute/review/completion/scheduling/arrival (all pre-existing, verified §2.4), security (`Identity.PasswordChanged/.PasswordRecoveryRequested`) — §3.1, §7. |
| Duplicate events do not duplicate sends | PASS | Inherited generically from `EventConsumer`/`processed_events` dedupe (§3.4/§9), not rebuilt per-rule; proven directly for the new rules by e2e tests reusing the same relay-tick/wait pattern every prior notification test uses. |
| Locale templates work | PASS (mechanism; VERIFY_ONLY sub-scope) | IP-002's per-recipient locale resolution (`notifications.locale`) applies automatically to all 28 rules via the untouched generic consumer — confirmed by reading `notification.consumers.ts` (unmodified) and by this IP not needing to touch it. Rendering non-PT-BR *text* remains explicitly out of scope, consistent with IP-002's own documented decision (§11.1/§12). |
| Opt-out rules respect transactional vs optional communication | PASS | Every one of 28 rules is `category: TRANSACTIONAL` (§3.3); zero `OPTIONAL` members exist, so no opt-out mechanism was needed — a reasoned absence, not an unaddressed criterion. |
| Delivery failures observable | PASS | Event-consumption failures: already observable via `outbox_events.status/lastError` + structured logs (pre-existing, verified adequate, §2.5). Channel-level failures: `notifications.deliveryStatus`/`failedReason` now exist and are returned by `GET /notifications` (§3.2), ready for a future channel to populate `FAILED` — today deterministically always `DELIVERED` for the one real channel, which is itself correct (§3.2). |

## 15. Commits

**Not committed** — git identity is unset in this environment (same constraint every prior IP operated under) and this agent was explicitly instructed not to configure it. All of this IP's changes are left **unstaged/uncommitted** in the working tree, on top of — not instead of — the clean `dfd9da0` baseline, per the task's explicit instruction ("leave everything uncommitted/staged in the working tree; if a commit attempt fails, just note it and move on").

Files changed/added by this IP (§5), for "main"'s eventual commit:
```
apps/api/drizzle/0031_ip013_notification_communication_completion.sql          (new)
apps/api/drizzle/meta/_journal.json                                            (modified)
apps/api/src/modules/notification/domain/notification-rules.ts                 (modified)
apps/api/src/modules/notification/domain/notification-rules.spec.ts            (new)
apps/api/src/modules/notification/domain/notification-types.ts                 (new)
apps/api/src/modules/notification/infrastructure/api/notification.controller.ts (modified)
apps/api/src/modules/notification/infrastructure/persistence/drizzle-notification.repository.ts (modified)
apps/api/src/modules/notification/infrastructure/persistence/notifications.schema.ts (modified)
apps/api/test/integration/ip-013-notification-communication-completion.e2e.spec.ts (new)
CLAUDE.md                                                                       (modified)
docs/event-catalog.md                                                          (modified)
docs/openapi.yaml                                                              (modified)
docs/Multi-Agent Implementation Doc/IPS/IP-013-COMPLETION-REPORT.md            (new, this report)
```
`.claude/settings.local.json`'s pre-existing modified state (§1) is **not** part of this IP's diff and should not be committed under this IP's message.

Suggested commit message for "main":
```
IP-013: Notification & Communication Completion

Adds 7 new table-driven NOTIFICATION_RULES entries (21 -> 28) closing the
consumer gaps IP-003 and IP-007 self-reported as "notificacao e escopo do
IP-013": ServiceRequestEngagement.Created (Partner), Payment.
AuthorizationFailed / PaymentIncrementalAuthorization.Approved/.Failed /
Funds.Released (buyer/seller), and Identity.PasswordChanged/.
PasswordRecoveryRequested (account-owner security notice). No new consumer
class was created -- the existing table-driven RuleNotificationConsumer
pattern (NTF-001) is reused unchanged.

Migration 0031 (additive) makes `notifications` channel/delivery-status
aware (IN_APP/EMAIL/PUSH, PENDING/DELIVERED/FAILED) -- provider-ready, not
provider-wired: no email/push send was added anywhere in this module (Brevo
already exists but only for identity's own transactional emails, untouched).
Every rule (old and new) is tagged TRANSACTIONAL; no opt-out mechanism was
built since no OPTIONAL-category notification exists in this MVP.

79/79 e2e files, 557/557 tests green (was 77/541 before this IP); +2 files/
+16 tests, zero regressions.

See docs/Multi-Agent Implementation Doc/IPS/IP-013-COMPLETION-REPORT.md for
full preflight, test evidence, and reviewer-focus notes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 16. Recommended reviewer focus

Roughly in order of risk if wrong:

1. **The "no email/push provider wired" scope decision (§3.2/§11.1/§13)** — this is the single highest-judgment call in this IP. Confirm independently that Brevo is genuinely disconnected from `notification` (not just "this agent didn't look hard enough") — `grep -rn "brevo\|Brevo\|BrevoEmailService" apps/api/src/modules/notification` should return zero matches — and re-judge whether the task brief's "already-configured provider" bar was correctly read as "configured for identity emails, not for this module" rather than "configured, therefore should be extended here."
2. **`ServiceRequest.Created/Matched/Closed/Cancelled` left without rules (§3.1/§11.4)** — re-verify the claim that an engaged Partner is already covered by the pre-existing `ntf.message-sent` rule (trace `EngageServiceRequestUseCase` → `ContactListingOwnerUseCase` → `MarketplaceMessage.Sent` → `ntf.message-sent`) and decide whether that satisfies IP-003's "notificação ao Member/Partner é escopo do IP-013" framing for the whole family, or whether at least `ServiceRequest.Closed/Cancelled` should notify an already-engaged Partner (which would require a new DB-backed lookup this IP judged out of the "payload-only" minimum-safe pattern — confirm that judgment).
3. **The two test-authoring bugs found and fixed during this IP's own verification (§10.4)** — confirm both are genuinely test-only (re-read `auth.controller.ts`'s `@HttpCode(HttpStatus.NO_CONTENT)` decorator and the custody-wait fix) and not a symptom of a subtler production issue.
4. **`channel`/`deliveryStatus` schema design (§3.2)** — confirm the "creation IS delivery for IN_APP" modeling is sound and that leaving `markDeliveryFailed`/`markDelivered` unbuilt (rather than building them "for completeness") was the right minimum-safe call given nothing would call them yet.
5. **`category: TRANSACTIONAL` via optional-field-with-default rather than touching all 21 pre-existing rules (§3.3/§11.2)** — confirm this satisfies the acceptance criterion as rigorously as an explicit per-rule tag would, given it is a documented convention rather than a machine-visible property on every existing rule object.
6. **Full e2e run reproducibility** — re-run `node test/e2e-local.mjs --no-file-parallelism` independently and confirm 79/79 files, 557/557 tests; this run was clean on the first attempt (§10.3) with no host-contention flakiness, which is itself worth independently reproducing rather than assuming.
