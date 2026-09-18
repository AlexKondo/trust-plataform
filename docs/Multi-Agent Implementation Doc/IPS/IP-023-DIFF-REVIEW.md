# IP-023 — External Integrations & Webhooks — Independent Diff/Quality Review

Reviewer: independent Quality/Diff Agent (Wave 5 closer)
Base commit: `b5b0bf7` (working tree, IP-023 uncommitted at review time)
Date: 2026-09-17

## 1. Scope / regression check — PASS

Full changeset (`git status --short` / `git diff --stat`):

```
 M apps/api/drizzle/meta/_journal.json
 M apps/api/src/app.module.ts
 M apps/api/src/shared/database/schema/index.ts
?? apps/api/drizzle/0040_ip023_external_integrations_webhooks.sql
?? apps/api/src/modules/integrations/            (16 new files: webhooks module)
?? apps/api/test/integration/ip-023-external-integrations-webhooks.e2e.spec.ts
```

- `app.module.ts`: additive only — one new import (`WebhooksModule`) + one registration line.
- `shared/database/schema/index.ts`: additive only — two new `export *` lines.
- Zero touches to `payment/**`, `privacy/**`, `identity/**`.
- Zero touches to `apps/api/src/shared/events/outbox-relay.service.ts` or any `event-consumer.ts` base class — `git diff` on `outbox-relay.service.ts` is empty. This is the single most important structural check for this IP (it extends the just-migrated outbox mechanism) and it is clean: IP-023 only adds a new consumer registered against the existing mechanism, never modifies the shared relay.

## 2. Signature scheme — PASS

`apps/api/src/modules/integrations/webhooks/domain/webhook-signature.service.ts`:
```ts
sign(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}
```
Call site (`webhook-delivery.service.ts`): `rawBody = JSON.stringify(body)` is computed **once**, and that exact string is both signed and sent as the fetch body — no re-serialization risk. Key used is `subscription.secretActive` (correct).

Secret exposure: `webhook-subscription.service.ts` `toView()` strips `secretActive`/`secretPrevious` before returning; confirmed by tests. Plaintext secret is returned only once, from `create` and `rotateSecret` responses (by design, standard practice for API keys/secrets). No logger call anywhere includes the secret value.

## 3. Event allowlist and field stripping — PASS, with one documentation inaccuracy

`webhook-event-allowlist.ts` contains exactly the 7 claimed event types, no more/less.

Architecture is **not** "N EventConsumer subclasses with per-event payload code" as could be implied by the report's phrasing — it is one generic `WebhookDeliveryConsumer`, instantiated per allowed event type, delegating to a single centralized `sanitizeWebhookPayload()` field-allowlist table. This is a factual mischaracterization of the implementation (MINOR — not a security issue; arguably a stronger pattern, single point of enforcement, than N hand-rolled builders), but the report should be corrected to describe it accurately.

`MarketplaceDispute.Resolved` payload strips 4 fields from the source event (`decisionId`, `openedBy`, `faultIdentityId`, `decidedBy`), not just the 2 claimed (`decidedBy`, `faultIdentityId`) — the extra two are also correctly omitted (conservative/safe), just underreported in the completion report (MINOR — report underclaims its own thoroughness).

Independent judgment on sufficiency: cross-checked against `docs/event-catalog.md`. `MarketplaceDispute.Resolved` carries no free-text reason, no evidence URLs, no resolution notes (those live on `Opened`, which is excluded entirely from the allowlist). `decisionType` is a closed enum, not sensitive text. `refundAmount` is order-scoped, not incrementally more reputationally sensitive than the buyer/seller IDs already included. No additional PII/financial/reputation field was missed. The curation is sound.

No spread-operator leak risk: confirmed by reading `webhook-event-allowlist.ts` and `webhook-delivery.consumers.ts` in full — payload construction is a `for (const field of allowed)` copy loop, never `...event`/`...payload`.

## 4. Conflict Escalation (`MarketplaceDispute.Opened` excluded) — genuine, well-reasoned

No standalone `IP-023-CONFLICT-ESCALATION*.md` file exists; the exclusion and its reasoning are documented inline in the completion report (§3.1). Judgment: this is a real, non-obvious product trade-off — a partner integration reacting to "dispute opened" before adjudication could itself cause externally-visible, hard-to-reverse reputational harm to the counter-party, versus the operational value of early visibility. Unlike the other exclusions (Payment/Identity/Score internals, which are unambiguous), this one has plausible arguments both ways. The implementer made the conservative default call (exclude) and documented the reasoning rather than silently guessing. Appropriately flagged, not manufactured busywork.

## 5. Retry / DLQ / idempotency — PASS

- `WEBHOOK_MAX_DELIVERY_ATTEMPTS = 8`, enforced via `attemptNumber >= WEBHOOK_MAX_DELIVERY_ATTEMPTS` before marking `DEAD_LETTER`.
- Idempotent skip: deliveries already `SUCCESS` or `DEAD_LETTER` return early without reprocessing.
- Uniqueness is DB-enforced, not app-level-only: migration creates `UNIQUE INDEX uq_webhook_delivery_subscription_event (subscription_id, event_id)`, and `createPendingDelivery` uses `.insert(...).onConflictDoNothing()` with a fallback lookup on conflict — genuinely race-safe.
- `GET /admin/webhooks/deliveries` supports a `status` filter including `DEAD_LETTER`, so dead-lettered deliveries are visible, not silently dropped. Controller carries `@UseGuards(AdminGuard)` at class level, covering all routes including the deliveries endpoint.

## 6. Secret rotation — PASS

Two-secret schema (`secretActive`, `secretPrevious`, `secretRotatedAt`). `rotateSecret` moves current active → previous, generates new active. `secretPrevious` is never used for outbound signing (Trust is sender-only; delivery always signs with `secretActive`) — it exists purely so the subscriber can validate against either secret during their own transition window. `confirmRotation` sets `secretPrevious = null`, confirmed by both repository code and a dedicated unit test — genuinely cleared, not left indefinitely.

## 7. Migration file — PASS

`apps/api/drizzle/0040_ip023_external_integrations_webhooks.sql`: fully additive (`CREATE TABLE IF NOT EXISTS`, FK guarded via `information_schema.table_constraints` check identical to the pattern in migrations 0036–0039, `CREATE INDEX IF NOT EXISTS`). Creates `webhook_subscriptions` (with `secret_active` NOT NULL, `secret_previous` nullable) and `webhook_deliveries` (with the dedup unique index described above). `_journal.json` entry `idx: 40` appended correctly after `idx: 39` (IP-011 completion migration), later timestamp, no collision, correctly the next available sequence number.

## 8. No payload leaks beyond allowlist — PASS

Confirmed by direct reading of both `webhook-event-allowlist.ts` (the sanitizer) and `webhook-delivery.consumers.ts` (the per-event-type consumer factory) in full. Field selection is explicit allowlisting only; no spread operators anywhere in the delivery path.

## Test re-run (reproduced independently, from scratch)

- `pnpm typecheck` — PASS (apps/api, apps/web).
- `pnpm lint` — PASS, zero warnings/errors.
- `pnpm -r build` — PASS (api tsc build + web Next.js production build, 33/33 static pages).
- `pnpm test` (unit) — **89 test files passed, 656 tests passed** (37 files / 154 tests skipped, pre-existing skip pattern unrelated to this IP). New files present: `webhook-event-allowlist.spec.ts` (4 tests), `webhook-signature.service.spec.ts` (6 tests), plus additional new spec files in the module — consistent with the report's "+26 new tests" claim.
- `pnpm test:e2e --no-file-parallelism` — **126/126 test files passed, 810/810 tests passed.** No stray `postgres.exe` or locked `.pgdata-e2e` directory was present before the run; the suite completed cleanly on the first attempt. This exactly matches the report's claimed numbers and shows zero regression from the post-migration baseline.

## File list reviewed

- `apps/api/src/modules/integrations/webhooks/domain/webhook-signature.service.ts` (+spec)
- `apps/api/src/modules/integrations/webhooks/domain/webhook-event-allowlist.ts` (+spec)
- `apps/api/src/modules/integrations/webhooks/application/webhook-delivery.service.ts`
- `apps/api/src/modules/integrations/webhooks/application/webhook-subscription.service.ts` (+spec)
- `apps/api/src/modules/integrations/webhooks/infrastructure/consumers/webhook-delivery.consumers.ts`
- `apps/api/src/modules/integrations/webhooks/infrastructure/persistence/drizzle-webhook.repository.ts`
- `apps/api/src/modules/integrations/webhooks/infrastructure/persistence/webhook-subscriptions.schema.ts`
- `apps/api/src/modules/integrations/webhooks/infrastructure/api/admin-webhook.controller.ts`
- `apps/api/drizzle/0040_ip023_external_integrations_webhooks.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/shared/database/schema/index.ts`
- `apps/api/test/integration/ip-023-external-integrations-webhooks.e2e.spec.ts`

## Findings summary

| Severity | Finding |
|---|---|
| MINOR | Completion report characterizes the architecture as "N EventConsumer subclasses" when it is one generic consumer + a centralized field-allowlist table. Factually inaccurate description, not a code defect; arguably a stronger pattern. |
| MINOR | Completion report understates the `MarketplaceDispute.Resolved` field stripping — 4 fields are actually removed (`decisionId`, `openedBy`, `faultIdentityId`, `decidedBy`), report only names 2. Safe/conservative outcome, just underreported. |
| OBSERVATION | No standalone `IP-023-CONFLICT-ESCALATION*.md` file exists; the `MarketplaceDispute.Opened` exclusion reasoning is documented inline in the completion report instead. Acceptable given it's a single, well-reasoned item, but a standalone artifact would have matched the naming convention implied by the task brief. |

No CRITICAL, BLOCKING, or MAJOR findings. No confirmed PII/payment-data leak in any allowlisted payload.
