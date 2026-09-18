# IP-002 — Completion Report

**Internationalization & Localization Foundation**
Executed 2026-09-15. Owner: Experience/Foundation implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§8 Internationalization) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-002 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-002_Internationalization_Localization_Foundation.md`) > IP-000's Completion Report (§4, §14) > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Hard dependency**: IP-000, status APPROVED (Quality Gate PASS, per task brief). IP-001 (Engineering Hardening) is also APPROVED, left with its changes **uncommitted** in the working tree at the start of this IP, as instructed — not reverted, not stashed, not touched beyond what this IP itself needed to add on top.
- Manifest confirmation (`01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` §Wave 1): "IP-001 and IP-002 may run in parallel after IP-000" — no ownership conflict expected between the two IPs. Verified empirically: `git status --short` at the start of this IP showed exactly IP-001's known footprint (`.gitignore`, `apps/api/src/modules/marketplace/**/service-execution.*`, `apps/api/src/shared/api/global-exception.filter.(spec.)ts`, `apps/api/test/e2e-local.mjs`, `apps/api/test/integration/pack-03.e2e.spec.ts`, `apps/api/test/setup-env.ts`, `tools/extract-docx.mjs`); this IP did not modify any of those files (see §5 — zero overlap).
- IP-000-COMPLETION-REPORT.md §4 (frontend inventory — 25 screens, `apps/web` has no lint/test tooling) and §14 (IP-002 classified `IMPLEMENT` — material gap, no existing i18n infrastructure) were used as the authoritative starting point; both re-verified directly against the repository (§2) before writing any code.

## 2. Preflight findings

1. Read all 6 required documents in order (00, 01, 02 §8, 03, 04, IP-002 spec), plus IP-000-COMPLETION-REPORT.md §4/§14, root `CLAUDE.md`, and `apps/web/lib/labels.ts` in full, as instructed.
2. Confirmed no existing i18n infrastructure in the repository: `grep -ri "preferredLocale\|preferred_locale\|SUPPORTED_LOCALES\|Accept-Language"` across `apps/api/src` and `apps/web` returned zero matches before this IP started. `apps/web/lib/labels.ts` is enum→PT-BR label maps plus `Intl` formatters hard-coded to `'pt-BR'` — exactly the "closest thing to i18n today" the brief described, confirmed by reading it end-to-end.
3. Inspected the real schema for the user-preference table: `apps/api/src/modules/identity/infrastructure/persistence/identities.schema.ts` was the correct target (not `trust_passports` — that table is verification/profile-completion state, not user preference; `identities` already carries `is_admin`, the other "flag the user owns" column, confirmed by reading both schemas).
4. Inspected the notification pipeline (`apps/api/src/modules/notification/domain/notification-rules.ts`, `infrastructure/consumers/notification.consumers.ts`): 17 rules, each a pure `(payload) => NotificationDraft[]` function with **PT-BR text baked in at event time** — the module's own doc comment explains this is deliberate (`notification-labels.ts`: "o corpo do aviso é persistido no momento do evento: o histórico precisa continuar legível mesmo que os catálogos mudem depois"). Concluded that rewriting all 17 rules' text to be locale-parametrized would be (a) a rewrite of existing, working, closed-baseline content — not a "new flow" — and (b) disproportionate to a foundation IP. Decision recorded in §4/§11.
5. Existing capabilities to reuse: `apps/web/lib/labels.ts`'s `Intl`-based `formatCurrency`/`formatDate`/`formatDateTime` pattern (parametrized by locale in the new `lib/i18n/format.ts`, not duplicated logic); the identity module's existing `PATCH`-style "own resource" endpoint pattern from `apps/api/src/modules/trust-passport/infrastructure/api/trust-passport.controller.ts` (`updateMine`, ownership from token); the additive-migration idiom used by migrations 0024–0027 (`ADD COLUMN IF NOT EXISTS` + `DO $$ ... IF NOT EXISTS ... END $$` for constraints) was reused verbatim for migration 0028.
6. Exact gaps confirmed present (all from IP-002 spec §1): no locale column anywhere; no locale resolution logic; no translation catalog structure in `apps/web`; no language selector; no proof that notifications can resolve a recipient's locale.
7. Owned files / collision hotspots: `apps/api/src/modules/identity/**` (schema/entity/mapper/DTO/usecase/controller/module — adding the locale field and its endpoint), `apps/api/src/modules/notification/**` (locale resolution in the consumer + schema/repository, NOT the 17 rules' text), new `apps/api/src/shared/i18n/**`, new `apps/web/lib/i18n/**`, `apps/web/lib/labels.ts` (formatters only, delegated not rewritten), `apps/web/components/app-shell.tsx` + `apps/web/app/settings/**` (nav labels + new language page), `apps/web/app/layout.tsx` (provider wiring), `docs/openapi.yaml`, `CLAUDE.md`. Confirmed zero overlap with IP-001's touched files (§5).
8. Baseline tests run before implementation: `pnpm typecheck` (0 errors) and `pnpm lint` (0 errors) at the pre-change working tree, both green — matching IP-001's own reported starting point. No conflict found requiring escalation before implementation.

## 3. Implemented

### 3.1 Backend — locale primitives (shared kernel)

- `apps/api/src/shared/i18n/locale.ts` — `SUPPORTED_LOCALES = ['pt-BR', 'en-US']`, `DEFAULT_LOCALE = 'pt-BR'`, `isSupportedLocale()`. Single source of truth; adding a locale later is editing this list + the catalogs, no structural change.
- `apps/api/src/shared/i18n/locale-resolver.ts` — `resolveLocale(preferred, acceptLanguageHeader)`: pure function implementing the exact precedence the spec names — user preference → `Accept-Language` (RFC 7231 §5.3.5, exact tag match then language-family match) → PT-BR default. 7 unit tests in `locale-resolver.spec.ts`.

### 3.2 Backend — `identities.preferred_locale`

- **Migration** `apps/api/drizzle/0028_ip002_locale_foundation.sql` (additive, idempotent, same style as 0024–0027): `ALTER TABLE identities ADD COLUMN IF NOT EXISTS preferred_locale varchar(10) NOT NULL DEFAULT 'pt-BR'` + a conditionally-created `CHECK (preferred_locale IN ('pt-BR','en-US'))` constraint; also adds `notifications.locale` (§3.4). Journal entry added at `apps/api/drizzle/meta/_journal.json` idx 28.
- `identities.schema.ts` — new `preferredLocale` column.
- `Identity` entity (`domain/entities/identity.ts`) — new `preferredLocale` prop/getter; `createNew()` accepts an optional `preferredLocale` (defaults to PT-BR via `isSupportedLocale` guard — never trusts the caller); new `changePreferredLocale(locale, now)` method that throws `UnsupportedLocaleException` (new file `domain/exceptions/locale.exceptions.ts`, `BusinessRuleViolationException`, `UNSUPPORTED_LOCALE`, 422) for anything outside the catalog — defense in depth: the DTO already rejects bad input at the boundary, but the entity itself never trusts it either (Clean Architecture invariant, not just an HTTP contract). 5 new tests in `domain/entities/identity.spec.ts`.
- `DrizzleIdentityRepository` — `preferredLocale` included in insert/update/`toEntity`.
- `GetCurrentIdentityResponse`/`IdentityMapper` — `preferredLocale` added to the public `/identities/me` payload (nothing sensitive; existing `isAdmin` precedent).
- **New endpoint** `PATCH /identities/me/locale` (`update-preferred-locale.request.ts` DTO with `z.enum(SUPPORTED_LOCALES)`, `update-preferred-locale.usecase.ts`, wired in `identity.controller.ts` + `identity.module.ts`). Ownership from token only (anti-IDOR, same pattern as `trust-passports/me`). **Idempotent**: re-sending the same locale does not call `save()` or write an audit entry (verified by a dedicated test). Audited via `AuditLogService` on actual change (operation `UpdatePreferredLocale`) — but **does not publish a domain event**; this is a deliberate decision (§11), not an oversight.
- `CreateIdentityUseCase` — `RequestMetadata` gained an optional `acceptLanguage` field; the use case now calls `resolveLocale(null, metadata.acceptLanguage)` to seed the initial `preferredLocale` at signup (no preference exists yet, so only the header and the default participate). `IdentityController.metadataFrom()` now forwards `request.headers['accept-language']`.

### 3.3 Backend — notification locale resolution mechanism

- `notifications.schema.ts` — new `locale varchar(10) NOT NULL DEFAULT 'pt-BR'` column (migration 0028, §3.2).
- `notification-rules.ts` — new `LocalizedNotificationDraft` type (`NotificationDraft & { locale: string }`); the 17 existing rules are **untouched** (still pure `(payload) => NotificationDraft[]`, still PT-BR text — a deliberate, explicit scope decision, §4/§11).
- `notification.consumers.ts` (`RuleNotificationConsumer.handle`) — after calling `rule.build(payload)`, resolves **each recipient's own** locale via `IdentityRepository.findById(draft.identityId, tx).preferredLocale ?? DEFAULT_LOCALE` and attaches it to the draft before persisting. `NotificationModule` now imports `IdentityModule` (for `IdentityRepository` only — no Identity business rule leaks into Notification). **`tx` is passed explicitly** — see the connection-pool deadlock this fixed, §10.5/§11.7.
- `IdentityRepository.findById()` gained an optional second `executor?: DatabaseExecutor` parameter (mirrors the existing `save(identity, executor?)` pattern), implemented in `DrizzleIdentityRepository` as `target = executor ?? this.db`. This is what let the consumer above reuse the relay's own transaction connection instead of requesting a second one from the pool mid-transaction.
- `DrizzleNotificationRepository.createMany()` — signature changed from `NotificationDraft[]` to `LocalizedNotificationDraft[]`; persists `locale`.
- **Why this shape**: the notification body text is generated once, at event time, and is intentionally immutable history (module's own pre-existing design decision, confirmed in §2.4) — rewriting the 17 rules to render per-locale text would mean either (a) storing message keys + params instead of rendered strings (a real architecture change to an existing, working, closed-baseline module, well beyond "minimum safe design" for a foundation IP) or (b) duplicating each of the 17 rules' text in two languages while keeping the current eager-render design (inconsistent halfway state, misleading). Neither was judged appropriate for this IP's scope (§4 explicitly excludes "translate the whole app"). What **is** delivered, and end-to-end tested (§10), is the resolution mechanism itself: every notification, for every event type, now carries the correct recipient locale in the database, ready for a future IP to switch the 17 rules to locale-aware rendering without touching this consumer or another migration.

### 3.4 Frontend — translation catalog architecture (`apps/web/lib/i18n/`)

- `locale.ts` — mirrors the backend's `SUPPORTED_LOCALES`/`DEFAULT_LOCALE` (duplicated deliberately, not shared via a new package — frontend and backend are independent deployments, Vercel/Render; a shared package would be new infrastructure, out of scope for "minimum safe design"). Adds `LOCALE_META` (label + flag for the selector), `localeStore` (localStorage, wrapped in try/catch per artifact/browser-storage discipline), and `resolveInitialLocale()` (localStorage → `navigator.languages` → PT-BR — the client-side mirror of the backend's precedence).
- `messages/pt-BR.ts` + `messages/en-US.ts` — a representative slice: navigation labels, the language settings page's own strings (the one genuinely **new** user flow), and two enum catalogs already used elsewhere in the app (`levels.*`, `orderStatus.*`) to prove the same catalog can carry both new UI copy and existing business vocabulary. `en-US.ts` uses `satisfies Messages` (the type extracted from `pt-BR.ts`) so a missing or extra key between the two catalogs is a TypeScript compile error, not a runtime gap. Canonical brand vocabulary (Trust Member, Trust Score, Trust Passport, ...) is **not** in either catalog — those identifiers stay language-neutral by product decision (04_APPROVED_PRODUCT_DECISIONS), never routed through `t()`.
- `catalog.ts` — `translate(locale, key)` with a compile-time-checked `MessageKey` dot-path type (`DotPaths<Messages>`) and a PT-BR fallback if a key is ever missing at runtime.
- `format.ts` — locale-aware `Intl` wrappers (`formatCurrency`, `formatNumber`, `formatDate`, `formatDateTime`, `formatRelative` via `Intl.RelativeTimeFormat`, `formatDuration`), each taking an explicit `locale` parameter defaulting to `'pt-BR'`.
- `LocaleProvider.tsx` — client-side source of truth. Resolution order on mount: best local guess (`resolveInitialLocale`) renders immediately (never blocks first paint), then — only if a session token exists — reconciles with `GET /identities/me`'s `preferredLocale` and overwrites local state/localStorage. `setLocale()` updates state + localStorage immediately and, only when authenticated, calls `PATCH /identities/me/locale`; on failure it rolls back the displayed locale and rethrows (UI shows the error, §"language-selector.tsx"). Also keeps `document.documentElement.lang` in sync via effect. Exposes `useLocale() → { locale, setLocale, t, saving }`.
- `apps/web/lib/labels.ts` — `formatCurrency`/`formatDate`/`formatDateTime` now **delegate** to `lib/i18n/format.ts` with locale fixed to `'pt-BR'` (byte-identical `Intl` options as before — zero behavior change for the ~25 existing screens that import from here). `formatRelative` and `formatDuration` were deliberately **left untouched** (own local implementation) because they hand-roll PT-BR-specific abbreviations ("há 3 min", not "3 minutes ago") that would visibly change existing screens' text if routed through `Intl.RelativeTimeFormat` — out of scope (no opportunistic refactor of 25 screens for a foundation IP).
- `apps/web/lib/api.ts` — `CurrentIdentity` interface gained `preferredLocale: string`.

### 3.5 Frontend — language selector + wiring

- `components/language-selector.tsx` — radio-style list of `SUPPORTED_LOCALES` (flag + label from `LOCALE_META`), calls `useLocale().setLocale()`, shows a success/error `Banner` (existing component, same pattern as `settings/privacy`).
- `app/settings/language/page.tsx` — new screen (`AppShell` + `PageHeader` + `Card`, same shape as `settings/privacy`), plus a **live preview** panel (`formatDateTime`, `formatCurrency`, `t('orderStatus.CUSTOMER_CONFIRMED')`, `t('levels.GOLD')`) that visibly updates the instant the selector changes locale — a single self-contained screen that proves both halves of the architecture (Intl formatting + message catalog) together, without needing to touch any of the 24 pre-existing screens to "prove" the secondary locale works.
- `app/settings/page.tsx` — added the "Idioma"/"Language" section card linking to `/settings/language`; page chrome (`PageHeader` title) now goes through `t('nav.settings')`.
- `components/app-shell.tsx` — sidebar `MENU` (7 items), "Moderação", "Configurações" and the logout button's `title` now go through `t()` instead of literal PT-BR strings — the one piece of chrome visible on all 24 authenticated screens, translated without touching any screen's own body content.
- `app/layout.tsx` — wraps `{children}` in `<LocaleProvider>`. `<html lang="pt-BR">` stays as the static SSR default (correct — PT-BR is the product default and first paint must not depend on a client round-trip); `LocaleProvider` updates `document.documentElement.lang` client-side after resolving the real locale.

### 3.6 Documentation

- `docs/openapi.yaml` — `preferredLocale` added to the `/identities/me` example; new `PATCH /identities/me/locale` path (request/response examples, 400/401/404).
- `CLAUDE.md` — new short section summarizing the IP-002 foundation, in the same style as the existing PACK-00..03/module entries.
- No `docs/event-catalog.md` change — no new event was published (§11 explains why).

## 4. Not implemented / out of scope

Per IP-002 §4 ("do not translate internal identifiers; do not implement multi-region; do not require all world languages") and the brief's explicit framing ("prove the architecture, not full coverage"):

- **Full translation of the 24 existing screens** — not attempted. Only the shell/nav chrome (7 menu items + 2 buttons) and the brand-new language settings screen are translated; screen bodies (dashboard, marketplace, orders, etc.) remain PT-BR-only text, unchanged.
- **Localized notification body/title text for the 17 existing rules** — not attempted (§3.3 explains the reasoning in full). The recipient-locale **resolution and persistence** mechanism is implemented and end-to-end tested; rendering per-locale text is carried forward as follow-up scope.
- **A domain event for locale preference changes** (e.g. `Identity.PreferredLocaleChanged`) — deliberately not published. Shared Engineering Standards §3: "Do not create events for trivial persistence." No other module needs to react to a display preference changing; if that changes later, adding the event is a small additive change to `UpdatePreferredLocaleUseCase`.
- **A shared `i18n` package between `apps/api` and `apps/web`** — the two `locale.ts` files are intentionally duplicated, not extracted into shared infrastructure (new tooling/build wiring, out of scope for "minimum safe design").
- **Address formatting locale-awareness** — Shared Standards §8 names "currency, date, time, number and address formatting locale-aware." Currency/date/time/number are implemented (§3.4). Address formatting was not touched: the existing `TrustPassport` address fields (`country`/`state`/`city`, see `apps/web/lib/types.ts`) are stored and displayed as plain labelled fields, not run through any locale-specific address-layout formatter today (no such formatter existed before this IP either). Building one was judged out of proportion to a foundation IP with only 2 supported locales that don't actually differ in address field order for the data captured; recorded as a known gap (§12), not silently dropped.
- **A `[locale]` App Router segment / URL-based locale routing** — not implemented. The existing `apps/web/app` structure has no locale segment (e.g. `/en-US/dashboard`); locale is a per-session client/account preference, not a URL concern, consistent with "user preference may select another supported locale" (§8) rather than multi-region routing (explicitly out of scope, §4).

## 5. Files changed

**Zero overlap with IP-001's touched files** (verified by diffing this IP's full changed-file list against IP-001's, listed in §1).

New files (18):
```
apps/api/drizzle/0028_ip002_locale_foundation.sql                                    31
apps/api/src/shared/i18n/locale.ts                                                    21
apps/api/src/shared/i18n/locale-resolver.ts                                           65
apps/api/src/shared/i18n/locale-resolver.spec.ts                                      33
apps/api/src/modules/identity/domain/exceptions/locale.exceptions.ts                  14
apps/api/src/modules/identity/domain/entities/identity.spec.ts                        40
apps/api/src/modules/identity/application/dto/update-preferred-locale.request.ts      19
apps/api/src/modules/identity/application/usecases/update-preferred-locale.usecase.ts 88
apps/api/src/modules/identity/application/usecases/update-preferred-locale.usecase.spec.ts 94
apps/api/test/integration/ip-002-i18n.e2e.spec.ts                                    216
apps/web/lib/i18n/locale.ts                                                           79
apps/web/lib/i18n/catalog.ts                                                          34
apps/web/lib/i18n/format.ts                                                           95
apps/web/lib/i18n/LocaleProvider.tsx                                                  92
apps/web/lib/i18n/messages/pt-BR.ts                                                   66
apps/web/lib/i18n/messages/en-US.ts                                                   61
apps/web/components/language-selector.tsx                                             69
apps/web/app/settings/language/page.tsx                                               65
```

Modified files (23, `insertions/deletions` from `git diff --stat`):
```
CLAUDE.md                                                                    +18
apps/api/drizzle/meta/_journal.json                                          +7
apps/api/src/modules/identity/application/dto/get-current-identity.response.ts +2
apps/api/src/modules/identity/application/mapper/identity.mapper.ts          +1
apps/api/src/modules/identity/application/usecases/create-identity.usecase.ts +7
apps/api/src/modules/identity/application/usecases/get-current-identity.usecase.spec.ts +2
apps/api/src/modules/identity/domain/entities/identity.ts                    +25
apps/api/src/modules/identity/domain/repositories/identity.repository.ts     +9/-1  (§10.5 deadlock fix)
apps/api/src/modules/identity/identity.module.ts                             +2
apps/api/src/modules/identity/infrastructure/api/identity.controller.ts      +28/-1
apps/api/src/modules/identity/infrastructure/persistence/drizzle-identity.repository.ts +6/-2  (§10.5 deadlock fix)
apps/api/src/modules/identity/infrastructure/persistence/identities.schema.ts +6
apps/api/src/modules/notification/domain/notification-rules.ts               +10
apps/api/src/modules/notification/infrastructure/consumers/notification.consumers.ts +36/-4  (§10.5 deadlock fix)
apps/api/src/modules/notification/infrastructure/persistence/drizzle-notification.repository.ts +8/-4
apps/api/src/modules/notification/infrastructure/persistence/notifications.schema.ts +8
apps/api/src/modules/notification/notification.module.ts                    +6
apps/web/app/layout.tsx                                                      +5/-1
apps/web/app/settings/page.tsx                                               (restructured, +81/-32)
apps/web/components/app-shell.tsx                                            +28/-14
apps/web/lib/api.ts                                                          +2
apps/web/lib/labels.ts                                                       +37/-19
docs/openapi.yaml                                                            +46
```
(`apps/web/tsconfig.tsbuildinfo` also shows as modified — a build cache artifact regenerated by `tsc`, not a source change.)

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0028_ip002_locale_foundation.sql`, journal idx 28, tag `0028_ip002_locale_foundation`. Additive only: two `ADD COLUMN IF NOT EXISTS` (`identities.preferred_locale`, `notifications.locale`), one conditionally-created `CHECK` constraint. No data migration, no backfill needed (both columns have a `DEFAULT` so existing rows get `'pt-BR'` automatically). Not applied to any shared/prod environment — created and exercised only against the disposable embedded Postgres used by `pnpm test:e2e` and the ephemeral `TEST_DATABASE_URL` used by `pnpm test` integration specs, per the "no agent may apply migrations to shared/prod" rule.
- No `.env`/config schema changes — `SUPPORTED_LOCALES`/`DEFAULT_LOCALE` are code constants (matches the spec: "structurally ready for multiple languages; do not require every language" — adding a locale is a code + migration-constraint change, not a new runtime config surface for a 2-locale MVP).

## 7. APIs / events / jobs

- **New route**: `PATCH /identities/me/locale` (auth required, ownership from token). Documented in `docs/openapi.yaml`.
- **Changed response**: `GET /identities/me` gained `preferredLocale` (additive, backward compatible).
- **No new event published.** `UpdatePreferredLocaleUseCase` deliberately does not enqueue an outbox event (§4). No changes to any existing event's payload shape.
- **No new job/consumer.** The existing 17 `ntf.*` consumers gained an internal resolution step (§3.3); no new consumer was registered, no `consumerName`/`eventType` changed, so dedupe/idempotency semantics for every existing notification consumer are unaffected.

## 8. Security / authorization / privacy

- `PATCH /identities/me/locale` follows the exact anti-IDOR pattern already established by `PUT /trust-passports/me`: the identity being modified comes only from the authenticated JWT (`@CurrentIdentity()`), never from a route/body parameter — there is no `identityId` anywhere in the request.
- Input validated at the boundary with `z.enum(SUPPORTED_LOCALES)` before reaching the use case (400 `VALIDATION_ERROR` for anything else, with the same envelope every other validated route uses); the domain entity independently re-validates and throws `UnsupportedLocaleException` (422) if ever called with an unsupported value from another code path — two independent layers, neither trusts the other.
- No new sensitive data: locale preference is not PII beyond what a browser's `Accept-Language` header already reveals to every HTTP server on every request; no new consent/legal text was introduced (Shared Standards §7 — nothing to externalize here that wasn't already externalized).
- Audit: `UpdatePreferredLocaleUseCase` writes an `AuditLogService.record()` entry (`operation: 'UpdatePreferredLocale'`) only when the value actually changes — avoids audit-log noise from idempotent no-op calls while still tracking real preference changes.

## 9. Data / financial invariants

Not applicable — this IP touches no money, no Trust Score, no state machine, no financial snapshot. `identities.preferred_locale` and `notifications.locale` are both simple `NOT NULL DEFAULT` additive columns with a `CHECK` constraint (identities only) enforcing the supported-locale invariant at the database level, consistent with Shared Standards §4 ("use CHECK constraints when they enforce invariants").

## 10. Tests executed and exact results

### 10.1 New tests written (24 total)

- `apps/api/src/shared/i18n/locale-resolver.spec.ts` — 7 unit tests (precedence order, exact/language-family `Accept-Language` matching, unsupported-value fallback).
- `apps/api/src/modules/identity/domain/entities/identity.spec.ts` — 5 unit tests (default-locale-on-create, explicit-locale-on-create, unsupported-locale-on-create silently falls back, `changePreferredLocale` success, `changePreferredLocale` rejects unsupported value).
- `apps/api/src/modules/identity/application/usecases/update-preferred-locale.usecase.spec.ts` — 5 unit tests (default is PT-BR, updates to en-US, audits in the same transaction, is idempotent — no save/audit on repeat of the same value, 404 on missing identity).
- `apps/api/src/modules/identity/application/usecases/get-current-identity.usecase.spec.ts` — 1 existing test updated (added `preferredLocale` to the expected response and the exhaustive key list) — not a new test, a required update to an existing one.
- `apps/api/test/integration/ip-002-i18n.e2e.spec.ts` — 7 new e2e tests: signup defaults to PT-BR with no `Accept-Language`; signup resolves `en-US` from `Accept-Language: en-US,pt;q=0.5`; an unsupported `Accept-Language` (`fr-FR,de-DE`) falls back to PT-BR; `PATCH /identities/me/locale` updates and **persists** (verified via a second `GET`); an unsupported locale is rejected with 400; the endpoint requires auth (401 with no token); and — the key architecture proof — a notification recipient who set `en-US` gets a `notifications` row with `locale = 'en-US'` in the database after a real marketplace-contact event flows through the outbox relay, while the message sender (left at PT-BR default) is unaffected.

### 10.2 Unit/domain suite (`pnpm test`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Ran from `apps/api`:
```
Test Files  43 passed | 22 skipped (65)
     Tests  377 passed | 93 skipped (470)
```
All 43 unit suites green, including the 3 new IP-002 spec files (`locale-resolver.spec.ts`, `identity.spec.ts`, `update-preferred-locale.usecase.spec.ts`) and the updated `get-current-identity.usecase.spec.ts`. Zero failures, zero regressions in any pre-existing suite.

### 10.3 Full e2e suite (`pnpm test:e2e --no-file-parallelism`, embedded disposable Postgres)

**First run** (before the fix in §10.5): 16 of 65 files failed, 58 of 470 tests failed, all failures `Error: Test timed out in 60000ms`/`120000ms` — never an assertion failure. Total run duration was **4412s (~73.5 min)**, versus IP-001's own reported baseline of a few minutes for the same suite. Failures spanned modules this IP never touched at all (`pay-001`, `pay-002`, `tps-001-003`, `vrf-001-006`, `trs-reputation.e2e.spec.ts`, part of `pack-03`), which made it clear from the start this was not a straightforward "my new code is broken" signal — but two of my own touched files (`ntf-001.e2e.spec.ts`, the pre-existing notification suite, and the new `ip-002-i18n.e2e.spec.ts`'s notification-locale test) were also among the 16 failed files, so the ambiguity had to be resolved, not assumed away, per this IP's explicit instruction to re-run and confirm rather than dismiss failures as known flakiness.

**Diagnosis** (§10.5): a real connection-pool deadlock, introduced by this IP's own notification-consumer change, was found and fixed. The 41 unrelated timeouts (identity, TPS, VRF, PAY, TRS-reputation) were separately confirmed to be transient host contention (28 concurrent Node processes on the shared machine at the time, `checkpoint` fsync durations up to 176s logged by the embedded Postgres instance itself — both symptoms of disk/CPU contention external to this repository, not a code defect): re-running `idn-001`/`idn-005-006`/`module0` in isolation immediately after showed `module0` complete in 4.33s and `idn-001`/`idn-005-006` pass cleanly, with no code change to those files at all.

**Final run, after the fix**:
```
Test Files  65 passed (65)
     Tests  470 passed (470)
Duration    439.31s (~7.3 min) — back to a normal-shaped run
```
All 65 e2e/integration suites green, all 470 tests green, including the new `ip-002-i18n.e2e.spec.ts` (7/7) and the pre-existing `ntf-001.e2e.spec.ts` (3/3) that had been the deadlock's most direct symptom. Zero regressions in any PACK-00..03/IDN/TPS/VRF/TRS/MRK/PAY suite.

### 10.4 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors (root, including tools/extract-docx.mjs — already fixed by IP-001)
pnpm build       → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 26 routes, all ✓ (25 pre-existing + new /settings/language),
                   "Compiled successfully", static generation 26/26 OK
```

### 10.5 Real bug found and fixed during e2e verification: notification consumer connection-pool deadlock

This is the most important finding of this IP and is recorded in full because it is exactly the kind of thing "run the tests, don't just assume" (per this IP's explicit instructions) exists to catch.

**Symptom**: after implementing §3.3 (per-recipient locale resolution inside `RuleNotificationConsumer.handle`), the first full `pnpm test:e2e` run showed 16/65 files failing with pure timeouts (never assertion failures). Re-running only the 4 files this IP actually touches (`ip-002-i18n`, `ntf-001`, `idn-005-006`, `idn-001`) after the environment had visibly quieted down (confirmed via `module0.e2e.spec.ts` completing in 4.33s, versus timing out minutes earlier) showed `idn-001`/`idn-005-006` now passing cleanly, but **`ntf-001.e2e.spec.ts` (3/3) and the notification test in `ip-002-i18n.e2e.spec.ts` (1/7) still consistently timed out** — an isolated, repeatable signal pointing at exactly the one piece of business-module wiring this IP added (§16.1 had already flagged this as the area needing independent review, before the bug was even found).

**Root cause**: `RuleNotificationConsumer.handle(envelope, tx)` runs **inside** the outbox relay's own database transaction — `tx` is a connection already checked out from the pool (`DB_POOL_MAX=4` in the test environment). This IP's new code called `this.identityRepository.findById(draft.identityId)` with **no executor argument**, so `DrizzleIdentityRepository.findById` fell back to `this.db` — the shared pool — and tried to check out a **second** connection while the first was still held open by the very transaction that was waiting on this call to resolve. Under any real concurrency (multiple jobs/events processed by the relay around the same time, which is exactly what `ntf-001`'s and `ip-002-i18n`'s scenarios produce — several notification-worthy events firing off one flow), every in-flight transaction can end up holding one pool connection each while also waiting for one more — a classic connection-pool deadlock, manifesting as an indefinite hang until the test's own timeout fired. It was not a data-correctness bug (the logic that resolves `preferredLocale` was correct, per the unit tests, §10.1) — it was a resource-management bug specific to calling a repository method from inside someone else's transaction without threading the transaction through.

**Fix** (already reflected in §3.2/§3.3 above, not a separate change from what's described there):
- `IdentityRepository.findById(id, executor?)` — added an optional `executor?: DatabaseExecutor` parameter, mirroring the exact pattern the same file's `save(identity, executor?)` already used (`target = executor ?? this.db`).
- `RuleNotificationConsumer.resolveRecipientLocale` now takes and forwards the `tx` it already received from `handle`, so the lookup reuses the transaction's own connection instead of requesting a new one.

**Verification the fix actually works, not just "typechecks"**:
1. `ntf-001.e2e.spec.ts` + `ip-002-i18n.e2e.spec.ts` re-run together: both green, 10/10 tests, 22.5s total (was: both hanging to the 60s timeout every time, consistently, across two separate runs before the fix).
2. Full `pnpm test:e2e --no-file-parallelism`: 65/65 files, 470/470 tests, 439s — a normal-shaped run, not a coincidence of quieter hardware (the previous *targeted, low-concurrency* re-runs of the exact same 2 files still failed with the bug present, ruling out "it was just contention" as an explanation for the notification-specific failures specifically).
3. `pnpm test` (unit suite): unaffected before and after (377/377) — this bug could only ever manifest under real transaction/concurrency conditions an in-memory mocked-repository unit test cannot reproduce, which is itself a lesson: this class of bug needs the real e2e suite to be caught, not more unit tests.

**Why this matters beyond this one fix**: `grep`-ing every other `identityRepository.findById(` call site in the repository (§3.2 footnote is now covered by this section) confirmed this was the *only* call site invoked from inside a transaction — every other usage (in `change-password`, `get-current-identity`, `refresh-session`, etc.) calls it before opening its own `db.transaction()`, matching the pre-existing convention. This bug was specific to this IP's new code, fully self-contained to the one file, and is now fully fixed — but it is a reminder that `IdentityRepository` (and likely other shared-kernel repositories) silently allow this failure mode for the *next* caller who forgets to pass `executor` from inside a transaction; documented as a known-issue for the reviewer/architecture agent in §12.

## 11. Deviations / decisions

1. **No domain event for locale change** (`Identity.PreferredLocaleChanged` was considered and rejected) — Shared Standards §3 explicitly forbids events for trivial persistence, and no consumer currently needs to react to a preference change. If a future IP needs this (e.g. to re-send a "welcome" email in the new language), adding the event is a small, additive change localized to `UpdatePreferredLocaleUseCase`.
2. **Notification body/title text stays PT-BR-only** — the single largest scope decision in this IP. The task brief itself anticipated this exact outcome ("even if only PT-BR templates exist today, the resolution mechanism should be locale-aware and ready for more"). Implemented precisely that: the *mechanism* (per-recipient locale resolution + persistence) is real, tested end-to-end via a live outbox/relay flow, and required zero changes to the 17 existing rules' content. Rendering localized text later is additive on top of this.
3. **`identities` over `trust_passports` for the locale column** — `identities` is the user-preference/account-settings aggregate (already owns `is_admin`); `trust_passports` is verification/profile-completion state. Confirmed by reading both schemas before choosing.
4. **`formatRelative`/`formatDuration` in `lib/labels.ts` left untouched, not delegated** — see §3.4. Delegating would have silently changed visible text on ~25 existing screens (a locale-driven `Intl.RelativeTimeFormat` string is not textually identical to the hand-rolled "há 3 min" abbreviation), which is an unrequested behavior change to closed screens, not something this foundation IP should do opportunistically.
5. **Frontend/backend locale constants duplicated, not extracted to a shared package** — `apps/api` and `apps/web` are independently deployed (Render/Vercel); introducing a shared workspace package is new build infrastructure, judged out of proportion to "minimum safe design" for two small constant files.
6. **`CHECK (preferred_locale IN ('pt-BR','en-US'))` at the database level** — chosen over relying on application-layer validation alone, per Shared Standards §4 ("use CHECK constraints when they enforce invariants"); consistent with the existing migration style (0024–0027 all use conditional `DO $$ ... END $$` blocks for constraints). Extending to a third locale later requires a small additive migration that replaces this constraint — an explicit, deliberate step, not a silent gap.
7. **`RuleNotificationConsumer` threads `tx` through to `IdentityRepository.findById`** rather than accepting the simpler-looking no-executor call — see §10.5 for the full investigation. This was not a stylistic choice; the no-executor version genuinely deadlocks the connection pool under concurrency and was caught only by running the real e2e suite, not by unit tests or typecheck.

## 12. Known issues / technical debt

- Address formatting is not locale-aware (§4) — carried forward, not currently blocking (only 2 locales supported, same field layout).
- Notification title/body text is not yet locale-rendered (§3.3/§11.2) — the resolution mechanism and the `notifications.locale` column are ready for a follow-up IP to wire actual per-locale templates without further migrations.
- 24 of 25 frontend screens (all except the new language settings page) still contain PT-BR-only literal strings in their body content — explicitly out of scope per the IP-002 brief ("not expected to translate the entire existing app").
- No `[locale]` URL segment / SSR-time locale resolution for the very first server-rendered paint of a returning `en-US` user — `<html lang>` is always `pt-BR` at initial SSR and corrected client-side after mount; a flash-of-wrong-language is possible for a split second on slow connections. Acceptable for a foundation IP (no SSR data currently depends on locale); would need proper `Accept-Language`-aware SSR / cookie-based locale to fully eliminate, which is broader than "add a language selector."
- **`IdentityRepository` (and likely other shared-kernel repositories) allow silent connection-pool deadlocks** for any future caller that invokes a no-executor read from inside an existing transaction (§10.5). This IP fixed its own single instance of the pattern; it did not audit or harden every other repository/call site in the codebase against the same class of mistake (that would be a cross-cutting shared-kernel change outside this IP's scope/ownership) — flagged here explicitly for the Architecture/Integrator agent to consider as a follow-up (e.g. a lint rule or a runtime pool-exhaustion guard), not silently left implicit.

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken.

## 14. Acceptance criteria matrix

| Criterion (IP-002 spec §6) | Status | Evidence |
|---|---|---|
| PT-BR default works | PASS | `Identity.createNew()` defaults to `pt-BR` when no `Accept-Language` present (identity.spec.ts); `formatCurrency`/`formatDate`/`formatDateTime` in `lib/labels.ts` unchanged, still `pt-BR`; `<html lang="pt-BR">` static SSR default. |
| At least one secondary test locale proves the architecture | PASS | `en-US` fully wired: backend (`Accept-Language` resolution, `PATCH` endpoint, notification locale persisted — all e2e-tested in §10.1/§10.3), frontend (`en-US.ts` catalog with compile-time parity check, nav chrome + language page fully translated, live-preview panel demonstrates `Intl` + catalog together). |
| No critical user-facing strings hard-coded in new flows | PASS | The only genuinely new user-facing flow is the language settings page + selector — 100% of its strings go through `t()`. Nav chrome touched for this IP also goes through `t()`. Backend never hard-codes locale-dependent text in the new use case (it returns structured data, not rendered strings). |
| Locale preference persists | PASS | `PATCH /identities/me/locale` → `identities.preferred_locale` (DB column, migration 0028); e2e test explicitly re-`GET`s after the `PATCH` to prove persistence, not just an in-memory response. |
| Formatting tests pass | PASS | `lib/i18n/format.ts` reused by `lib/labels.ts` (0 behavior change, confirmed by unchanged `Intl` options); `locale-resolver.spec.ts` (7 tests) covers the resolution logic that determines which locale formatting uses; full backend unit suite green (§10.2), full e2e suite green 65/65 files · 470/470 tests after fixing a real connection-pool deadlock found during verification (§10.3/§10.5); `apps/web` typecheck/build green (§10.4) — `apps/web` has no test runner (confirmed pre-existing gap, IP-000 §4), so frontend formatting correctness is verified by TypeScript's structural check (`satisfies Messages`) plus manual `Intl` API usage identical to the pre-existing, already-proven `lib/labels.ts` pattern. |

## 15. Commits

**Not committed** — `git config user.name`/`user.email` are unset in this environment (same constraint IP-001 operated under) and this agent was explicitly instructed not to configure git identity itself. `git commit` was attempted and failed with `fatal: unable to auto-detect email address`, exactly as expected.

All of this IP's changes are **staged** (`git add`, not committed) in the working tree, on top of — not instead of — IP-001's own pre-existing uncommitted changes, which were left completely untouched (verified: `git status --short` before and after this IP shows IP-001's files with the same unstaged `M` status throughout; none were staged, edited, or reverted by this IP). The two IPs' changes coexist cleanly in the same working tree with zero file overlap (§1/§5).

The intended commit message (ready for whoever configures git identity and runs `git commit`):
```
IP-002: Internationalization & Localization Foundation

Locale architecture with PT-BR default and en-US as the proven secondary
locale: identities.preferred_locale (migration 0028) resolved from user
preference -> Accept-Language header -> PT-BR default; PATCH
/identities/me/locale to change and persist it; notifications.locale
records the resolved recipient locale on every notification (mechanism
ready for localized rendering; NTF-001's 17 rules stay PT-BR-only content,
out of scope for this foundation IP). Frontend gains a translation catalog
(apps/web/lib/i18n/), a LocaleProvider + language selector at
/settings/language, and locale-aware Intl formatting utilities layered
under the existing lib/labels.ts without changing any of the ~25 existing
screens' behavior.

Fixes a connection-pool deadlock found while verifying this IP end-to-end:
RuleNotificationConsumer.handle runs inside the outbox relay's own
transaction, and resolving the recipient's locale via
IdentityRepository.findById() without passing that transaction's executor
could exhaust the pool under concurrency. IdentityRepository.findById now
accepts an optional executor, mirroring the existing save() pattern.

See docs/Multi-Agent Implementation Doc/IPS/IP-002-COMPLETION-REPORT.md
(gitignored, not part of this commit) for full preflight, test evidence,
and reviewer-focus notes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

**Note on this report's own location**: `docs/Multi-Agent Implementation Doc/` (the entire folder, including this file) is gitignored — a rule IP-001 itself added (`.gitignore`, "Pacote de handover do founder... e guia derivado"), matching the fact that IP-000's and IP-001's own Completion Reports were never tracked in git either (confirmed via `git log` returning nothing for `IP-000-COMPLETION-REPORT.md`). This file was written to disk at the correct path per the task instructions and is available for the Quality/Diff Agent to read there; it is intentionally not part of the staged git changes above, consistent with existing repo convention.

## 16. Recommended reviewer focus

1. **`notification.consumers.ts` + `IdentityRepository.findById(id, executor?)`** (§10.5) — this is where a real bug was found and fixed during this IP's own verification (a connection-pool deadlock from calling a repository read without threading the transaction through). Confirm the fix is correct — `tx` must flow from `EventConsumer.handle(envelope, tx)` into every repository call the consumer makes, not just this one — and consider whether this class of bug (no-executor read from inside someone else's transaction) needs a structural guard elsewhere in the codebase (flagged as follow-up debt, §12, not fixed repo-wide by this IP). Also independently confirm the per-recipient locale resolution is correct for multi-recipient events (e.g. `MarketplaceDispute.Resolved`, which notifies both buyer and seller) — each recipient should get *their own* locale, not the first resolved one reused for all (`Promise.all(drafts.map(...))`, one resolution per draft — verified in the full e2e run, §10.3).
2. **`Identity.createNew()` default-locale fallback** — confirm silently falling back to PT-BR for an unsupported/malformed `Accept-Language` (rather than rejecting the signup) is the right product call; this IP treated it as obviously correct (a browser's language header should never be able to block registration) but it was not an explicitly stated product decision anywhere in `04_APPROVED_PRODUCT_DECISIONS.md`.
3. **Scope boundary on notification text** (§3.3/§11.2/§12) — this is the single biggest judgment call in the IP; confirm it matches the spec's intent ("mechanism ready, PT-BR-only content acceptable") rather than reading as an incomplete implementation.
4. **`apps/web/lib/labels.ts` delegation** (§3.4/§11.4) — confirm `formatCurrency`/`formatDate`/`formatDateTime` delegating to `lib/i18n/format.ts` while `formatRelative`/`formatDuration` stay local is an acceptable inconsistency (deliberate, to avoid changing visible text on existing screens) rather than something that should be made uniform.
5. **Migration 0028's `CHECK` constraint** — confirm the hard-coded `IN ('pt-BR','en-US')` list (mirroring `SUPPORTED_LOCALES` in code) is the desired trade-off versus a softer, code-only validation that wouldn't need a migration to add a third locale later.
6. **If re-running the e2e suite independently gets timeouts spanning modules this IP never touched** (PAY/TPS/VRF/TRS-reputation) **on the first attempt** — re-run before concluding anything is broken; this environment showed genuine, severe, transient host-level I/O contention during this IP's own verification (§10.3), independent of any code change, confirmed by a trivial untouched suite (`module0.e2e.spec.ts`) going from timing out to completing in 4.33s with zero code changes in between.
