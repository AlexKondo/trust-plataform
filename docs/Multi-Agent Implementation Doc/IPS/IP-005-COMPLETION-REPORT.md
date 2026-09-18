# IP-005 — Completion Report

**Scheduling, Availability, Location & ETA**
Executed 2026-09-16. Owner: Marketplace implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §2, §4, §7, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-005 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-005_Scheduling_Availability_Location_ETA.md`) > `IP-003-COMPLETION-REPORT.md` (location-privacy reasoning, corrected version) + its Diff Review > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `e9ff7bc` (`main`, tip after IP-004) — confirmed via `git log --oneline -5` / `git rev-parse HEAD`.
- **Hard dependency**: IP-003 (Service Request, Discovery & Matching), status APPROVED and committed to `main` at `dfd9da0`, confirmed by reading `IP-003-COMPLETION-REPORT.md` and its Diff Review in full (including the post-review correction: `marketplace_order_execution_events.latitude/longitude`, migration 0017/PACK-03, is real Partner-side GPS captured at field-execution check-in/check-out — the fact IP-003 itself pointed forward to this IP).
- **Working tree at start**: `git status --short` was clean — no pre-existing uncommitted files.
- **Manifest confirmation**: this IP's primary owner is Marketplace; touched only `apps/api/src/modules/marketplace/**` plus the shared documentation/collision hotspots (`docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, `apps/api/src/shared/database/schema/index.ts`, the migration journal) — all edited additively, in new sections, following IP-003/IP-004's own precedent. Zero files under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` were touched.

## 2. Preflight findings

1. Read all 6 required documents in the mandated order, then `IP-003-COMPLETION-REPORT.md` in full — including its Diff Review (`IP-003-DIFF-REVIEW.md`) — for the corrected location-privacy reasoning this IP was explicitly pointed to.
2. Hard dependency IP-003: APPROVED — confirmed by reading its Completion Report directly.
3. Read `INCONSISTENCIAS.md` #26 directly (not from prose): *"`UNIQUE(order_id)` em `scheduling` vs 'histórico de reagendamentos' (MRK-019 BR-006) → MVP sem reagendamento ⇒ manter `UNIQUE(order_id)`. Se reagendamento entrar, trocar por `UNIQUE(order_id) WHERE status = 'ACTIVE'`."* Treated this literally as the migration plan (§3.4/§6 below), not reinvented.
4. Inspected the real MRK-019/020/021/PACK-03 scheduling/execution infrastructure before designing anything, in full:
   - `marketplace-order.ts` / `marketplace-order-execution.ts` (`Scheduling`, `ExecutionEvent`, `MarketplaceConfirmation`) — the existing status machine, the derived-end-from-duration rule, the `overlaps()` conflict check.
   - `marketplace-order.schema.ts` — confirmed `marketplace_order_schedulings` has `UNIQUE(order_id)` exactly as INCONSISTENCIAS #26 describes, and `marketplace_order_execution_events` already has real `latitude`/`longitude`/`accuracy`/`address` columns (migration 0017, PACK-03), captured only at check-in/check-out — never continuously.
   - `manage-order.usecase.ts` (`ManageOrderUseCase.schedule/start/completeExecution/confirmCompletion/cancel`) and `order-lifecycle.service.ts` (`OrderLifecycleService.commit` — the single transactional persist+event+audit gate every order mutation goes through).
   - `service-execution-session.ts` / `service-execution.usecase.ts` (PACK-03 Trust Pause/Resume) — read as the closest existing precedent for "a status that runs parallel to the order's own state machine, without becoming a new order status" (reused as the design idiom for travel status, §3.3).
   - `service-request.ts` / `marketplace-types.ts` — confirmed `ServiceRequest.locationLabel`/`radiusKm` (IP-003) remain the only Member-side location data, and that `radiusKm` is captured but never geometrically evaluated — IP-003 explicitly deferred "real geometric meaning" for `radiusKm` to this IP; this IP does not add geocoding either (§4 explains why, matching IP-003's own conservative default).
   - `.env.example` — confirmed no maps/geocoding/routing provider key exists anywhere (`grep -n "MAP\|GEO\|LOCATION\|VENDOR"` returned nothing relevant). This is the direct evidence behind the ETA design decision (§3.5).
5. Confirmed via `grep -rn "availability" apps/api/src` (case-insensitive) that **no** Partner availability-window concept existed anywhere in the repository before this IP — a genuine gap, not a misreading of an existing feature.
6. Existing capabilities reused, confirmed by reading the actual files (not assumed from names):
   - `Scheduling.overlaps()` / `findActiveSchedulingsForSeller()` — reused unchanged for both the original `schedule()` path and the new `reschedule()` path.
   - `OrderLifecycleService.commit()` — reused unchanged (via `alsoInTransaction`) for `reschedule()`'s two-row scheduling write, the exact same transactional idiom `schedule()`/`cancel()` already use.
   - The CAS/idempotency idioms already documented in this program (IP-001/002/003/007) — not needed for reschedule itself (a scheduling row's `id` is always unique, so the upsert-by-`id` change is not a race-prone CAS, just a key change — see §11.1), but directly informed the `OrderTravelStatus.markEnRoute()` "idempotent re-declare" design (mirrors `ServiceRequest.markMatched()`'s own idempotent-by-design idiom, IP-003).
   - The existing partial-unique-index idiom already used three times in this codebase (`idx_marketplace_conversation_active`, a similar pattern in `marketplace-review.schema.ts`, `verifications.schema.ts`) — reused verbatim for the new `idx_marketplace_scheduling_order_active` (`uniqueIndex(...).on(...).where(sql...)`), not invented.
   - `MRK_PRODUCER` (`create-listing.usecase.ts`) — reused verbatim for every new outbox event this IP publishes.
7. Owned files / collision hotspots: all of `apps/api/src/modules/marketplace/**` (this IP's primary-owner domain). Shared hotspots (`docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, `apps/api/src/shared/database/schema/index.ts`, the migration journal) edited only in new, dedicated, additive sections/exports — no other IP's section touched.
8. Baseline tests run before implementation: `npx tsc -p tsconfig.json --noEmit` (0 errors, from `apps/api`) — clean starting point. Confirmed the pre-IP-005 unit baseline (58 passed/28 skipped, 86 files; 478 passed/121 skipped, 599 tests) directly from `IP-004-COMPLETION-REPORT.md` §10.2/§10.3 (already-reconciled numbers from the IP immediately preceding this one on `main`); this agent's own post-implementation run (§10) is the authoritative before/after comparison.
9. No conflict found requiring escalation. The one place a product-level interpretation was needed (whether reschedule requires the same authorization posture as the original `schedule()` call, and whether "notification hooks emitted" in the acceptance criteria means this IP must itself wire `notification/**` consumers) was resolved in-repo from existing precedent, not guessed — see §11.

## 3. Implemented

### 3.1 Partner availability windows — genuine new capability

Confirmed in preflight (§2.5) that no availability concept existed anywhere. New aggregate `PartnerAvailabilityWindow` (`domain/entities/partner-availability.ts`): a declared weekly-recurring window — `dayOfWeek` (0=Sunday..6=Saturday, the same convention `Intl.DateTimeFormat`/`Date#getDay()` use), `startMinute`/`endMinute` (single-day, minimum 30 minutes), `timezone` (IANA). Deliberately **not** a full calendar (no date-specific exceptions, no holidays, no multiple timezones per Partner) — the minimum safe design that closes the gap ("Partners need to declare when they're generally available") without inventing a scheduling product. `assertNoOverlap()` rejects a submitted set with any two overlapping windows on the same day (422).

New table `marketplace_partner_availability_windows` (migration 0033, §6), repository `PartnerAvailabilityRepository`/`DrizzlePartnerAvailabilityRepository` (`replaceForPartner` — delete + bulk insert, always the full set, never a partial patch — and `listByPartner`). New use case `ManagePartnerAvailabilityUseCase` (`replace`/`listMine`), new controller `MarketplacePartnerAvailabilityController` at `marketplace/partner-availability` (`PUT` replace-all, `GET mine`), both authenticated, no separate "Partner role" check — any identity manages its own declared windows, the same permission model already used by `POST /marketplace/service-requests` etc. (there is no separate Partner-role flag anywhere in Identity).

### 3.2 Availability enforced at scheduling time — pure domain function, zero new dependency

`domain/services/availability.service.ts`: `fitsAvailability(windows, scheduledStart, scheduledEnd, timezone)`. Converts the UTC instant into local day-of-week/minute-of-day via `Intl.DateTimeFormat` (built into Node's ICU — confirmed with a direct `node -e` check that `timeZone`-aware formatting works in this environment; **zero new npm dependency** added for timezone handling). **If the Partner has declared no windows at all, there is no restriction whatsoever** — identical behavior to every pre-IP-005 order, verified by e2e (§10.1). A requested window that crosses local midnight is conservatively rejected (no "spans two days" semantics exist anywhere in MRK-019 either). Wired into both `ManageOrderUseCase.schedule()` (new check, alongside the pre-existing `findActiveSchedulingsForSeller` conflict check) and the new `reschedule()` (§3.4) — same function, same exception (`SchedulingOutsideAvailabilityException`, 409).

### 3.3 Travel/arrival status — declared transitions, not GPS tracking

New entity `OrderTravelStatus` (`domain/entities/order-travel-status.ts`): `NOT_STARTED -> EN_ROUTE -> ARRIVED`. Modeled explicitly on `ServiceExecutionSession`'s own idiom (PACK-03) — "a fact that runs parallel to the order's own 13-state machine, never a new order status." `markEnRoute()` is idempotent from `EN_ROUTE` (the Partner can redeclare/update the ETA without a state transition, mirroring `ServiceRequest.markMatched()`'s own idempotent-by-design pattern from IP-003); `markArrived()` only from `EN_ROUTE` (409 otherwise). Only applies while the order is `SCHEDULED` and check-in (`order.startedAt === null`) has not happened yet — once execution starts, MRK-020/021's own real GPS-capturing check-in/check-out is the record of truth, not this status.

New table `marketplace_order_travel_statuses` (migration 0033) — **zero latitude/longitude column**, confirmed by direct `grep` and by an e2e assertion that the API response has no `latitude`/`longitude` property anywhere. New use case `ManageOrderTravelStatusUseCase` (`get`/`markEnRoute`/`markArrived`), new routes on the existing `MarketplaceOrderController`: `GET/POST .../travel-status[/en-route|/arrived]`. Only the seller (Partner) declares; **both participants can read** — the literal "Member visibility of relevant arrival progress without leaking continuous precise location beyond need" requirement from the mandate, satisfied by a synchronous read endpoint rather than a push/notification mechanism (§11.3).

### 3.4 Reschedule — INCONSISTENCIAS #26's own migration path, executed

`ManageOrderUseCase.reschedule()` (new method, `POST /marketplace/orders/{orderId}/reschedule`). Guarded to `order.status === SCHEDULED && order.startedAt === null` — `AWAITING_EXECUTION` is intentionally excluded because INCONSISTENCIAS #36 already established that state is never produced in the MVP (no job leads to it), so guarding only `SCHEDULED` covers every reachable case without inventing new behavior for an unreachable one; once check-in has happened, the correct path is dispute/cancellation, not reschedule. Requires an existing `ACTIVE` scheduling (`SchedulingNotFoundException`, 404, defensive — should not be reachable given the status guard, same "defense in depth" posture IP-003 used for `ServiceRequestOwnershipException`). Re-runs the exact same conflict check (`findActiveSchedulingsForSeller`) and the same availability check (§3.2) against the **new** window, excluding the order's own (old and new) rows. On success: the old `Scheduling` is cancelled in place (`cancel(reason)`, same object identity, same row) and a **new** `Scheduling` (new id) is inserted `ACTIVE` — both writes happen inside `OrderLifecycleService.commit()`'s existing transaction via `alsoInTransaction`, the identical idiom `schedule()` already uses. Publishes `MarketplaceOrder.Rescheduled` and audits `RescheduleMarketplaceOrder`. `reason` is mandatory (same rule as MRK-018 BR-003 cancellation) — a confirmed appointment change deserves the same auditability as a cancellation.

### 3.5 ETA abstraction — a port, with the only honest Release-1 adapter behind it

`domain/ports/eta-estimator.port.ts` (`EtaEstimatorPort`, abstract class per this codebase's existing port convention — e.g. `MarketplaceOrderRepository`). `infrastructure/eta/declared-eta.adapter.ts` (`DeclaredEtaAdapter`) is the **only** implementation wired in `marketplace.module.ts`: it does not compute geo-routing — it validates and passes through the `declaredEtaMinutes` the Partner typed manually, tagged `PARTNER_DECLARED` (vs. the already-modeled-but-unused `PROVIDER_COMPUTED` value, reserved for a future real adapter). This is the direct, evidence-based response to "no maps vendor configured" (§2.4's `.env.example` check) — the honest fallback the mandate asked for, not a fabricated "computed" ETA. Swapping to a real provider later requires only changing the one `{ provide: EtaEstimatorPort, useClass: ... }` line in `marketplace.module.ts`; no domain/use-case/controller/DTO changes.

### 3.6 Migration

`apps/api/drizzle/0033_ip005_scheduling_availability_location_eta.sql` (92 lines) — additive, same idempotent style as 0024–0032 (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS ... END $$` guarded FKs, `CREATE INDEX/UNIQUE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Three changes:
1. `ALTER TABLE marketplace_order_schedulings ADD COLUMN IF NOT EXISTS cancelled_reason text` (nullable, no data migration needed — every existing row gets `NULL`, correctly meaning "not a reschedule").
2. `DROP INDEX IF EXISTS idx_marketplace_scheduling_order` + `CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_scheduling_order_active ON marketplace_order_schedulings (order_id) WHERE status = 'ACTIVE'` — the exact swap INCONSISTENCIAS #26 prescribed. No row is deleted or rewritten; every existing order still has at most one row, which is still `ACTIVE` (or the sole `CANCELLED` row from an order cancellation) — the new partial index is satisfied trivially by 100% of existing data.
3. Two new tables (`marketplace_partner_availability_windows`, `marketplace_order_travel_statuses`), both with guarded FKs and their own indexes.

Journal updated (`apps/api/drizzle/meta/_journal.json`, idx 33, tag `0033_ip005_scheduling_availability_location_eta`) — checked the highest existing index first (32, IP-021's) before numbering.

## 4. Not implemented / out of scope

Per the IP-005 spec's explicit "Out of scope" (§4) and this program's non-negotiable constraints:
- **No continuous/background GPS tracking of any kind.** `OrderTravelStatus` never reads device location; the Partner types a number of minutes. No polling endpoint, no live map, no location history table.
- **No maps vendor SDK anywhere in domain code** — `EtaEstimatorPort` is the only thing domain/application code depends on; `DeclaredEtaAdapter` is the only adapter, and it makes zero HTTP calls to any external service.
- **No geometric radius/geocoding for `ServiceRequest.radiusKm`** — IP-003 explicitly deferred "real geometric meaning" for this field to IP-005; this IP does not add it either, for the same reason IP-003 gave (no *pre-engagement, matchable* Partner location profile exists, and building one is materially larger than "minimum safe design" — building a geocoded Partner "home base" from availability windows alone would be a new, undecided product feature, not a natural extension of a weekly time preference). Flagged for reviewer re-judgment (§16), not silently decided as permanently out of scope.
- **No exceptions/holidays/date-specific overrides in availability windows** — recurring-weekly only, the minimum safe shape.
- **No notification consumer wiring** — `MarketplaceOrder.Rescheduled`/`PartnerEnRoute`/`PartnerArrived` are published but have zero `notification/**` consumers, exactly matching `MarketplaceOrder.Scheduled`/`Started`/`ExecutionCompleted`'s own existing "nenhum consumidor no MVP" precedent (20 other events in the catalog share this same status). `notification/**` was never touched, per the explicit constraint. See §11.4 for why "notification hooks emitted" (acceptance criteria) is satisfied by publishing the event, not by wiring a consumer.
- **No frontend work** — backend-only, consistent with IP-003/004's own precedent; no `apps/web` file touched.
- **No modification of `payment/**`, `privacy/**`, `analytics/**`** — confirmed zero files touched in any of those directories.
- **No change to the original `schedule()` flow's authorization posture** — still any participant (buyer or seller) may call it, unchanged from MRK-019's own pre-existing behavior; `reschedule()` mirrors this exactly rather than inventing a stricter rule.

## 5. Files changed

**New files (21)**:
```
apps/api/drizzle/0033_ip005_scheduling_availability_location_eta.sql                                    92
apps/api/src/modules/marketplace/domain/entities/partner-availability.ts                                145
apps/api/src/modules/marketplace/domain/entities/partner-availability.spec.ts                           149
apps/api/src/modules/marketplace/domain/entities/order-travel-status.ts                                 121
apps/api/src/modules/marketplace/domain/entities/order-travel-status.spec.ts                             61
apps/api/src/modules/marketplace/domain/services/availability.service.ts                                 85
apps/api/src/modules/marketplace/domain/services/availability.service.spec.ts                            55
apps/api/src/modules/marketplace/domain/repositories/partner-availability.repository.ts                  13
apps/api/src/modules/marketplace/domain/repositories/order-travel-status.repository.ts                    7
apps/api/src/modules/marketplace/domain/ports/eta-estimator.port.ts                                       29
apps/api/src/modules/marketplace/infrastructure/eta/declared-eta.adapter.ts                               27
apps/api/src/modules/marketplace/infrastructure/persistence/partner-availability.schema.ts                30
apps/api/src/modules/marketplace/infrastructure/persistence/order-travel-status.schema.ts                 35
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-partner-availability.repository.ts    58
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-order-travel-status.repository.ts     58
apps/api/src/modules/marketplace/application/dto/partner-availability.dtos.ts                             24
apps/api/src/modules/marketplace/application/mapper/partner-availability.mapper.ts                        14
apps/api/src/modules/marketplace/application/usecases/manage-partner-availability.usecase.ts              62
apps/api/src/modules/marketplace/application/usecases/manage-order-travel-status.usecase.ts              152
apps/api/src/modules/marketplace/infrastructure/api/marketplace-partner-availability.controller.ts        35
apps/api/test/integration/ip-005-scheduling-availability-location-eta.e2e.spec.ts                        469
```
21 new files, 1,721 lines total (`wc -l` sum), including the e2e spec.

**Modified files** (`git diff --stat`):
```
CLAUDE.md                                                                          |  61 +++
apps/api/drizzle/meta/_journal.json                                               |   7 +
apps/api/src/modules/marketplace/application/dto/marketplace-order.dtos.ts        |  37 +++
apps/api/src/modules/marketplace/application/mapper/marketplace.mapper.ts         |  16 ++-
apps/api/src/modules/marketplace/application/usecases/manage-order.usecase.ts     | 116 ++++++-
apps/api/src/modules/marketplace/domain/entities/marketplace-order-execution.ts   |  22 ++-
apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts             |  42 +++
apps/api/src/modules/marketplace/domain/exceptions/marketplace.exceptions.ts      |  58 +++
apps/api/src/modules/marketplace/domain/repositories/marketplace-order.repository.ts |  12 +-
apps/api/src/modules/marketplace/infrastructure/api/marketplace-order.controller.ts  |  54 ++-
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-order.repository.ts | 18 +-
apps/api/src/modules/marketplace/infrastructure/persistence/marketplace-order.schema.ts | 18 +-
apps/api/src/modules/marketplace/marketplace.module.ts                            |  21 ++
apps/api/src/shared/database/schema/index.ts                                      |   2 +
docs/event-catalog.md                                                             |  15 +++
docs/openapi.yaml                                                                 | 115 +++++
```
16 files changed, 597 insertions(+), 17 deletions(-). Every deletion is a like-for-like replacement (e.g. the old `findSchedulingByOrder`/`saveScheduling` conflict-target lines, replaced in place — see §11.1), never a removal of existing behavior. The incidental `apps/web/tsconfig.tsbuildinfo` build-cache regeneration (from `pnpm -r build`) was reverted with `git checkout --`, following IP-003/004's own precedent, and does not appear in the diff.

Zero files under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` were touched.

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0033_ip005_scheduling_availability_location_eta.sql` (§3.6). Additive; the one non-additive-looking statement (`DROP INDEX` + recreate as partial) does not touch or remove any row — full reasoning and safety argument in §3.6/§11.1. Not applied to any shared/prod environment — exercised only against the disposable embedded Postgres (`pnpm test:e2e`) and the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.
- **Journal**: new entry, idx 33, tag `0033_ip005_scheduling_availability_location_eta`.
- No `.env`/config schema changes — no new runtime configuration surface was needed (confirms the "no maps vendor configured" finding drove the design rather than requiring a new env var for a vendor that doesn't exist yet).

## 7. APIs / events / jobs

**Six new routes**:
| Method | Path | Purpose |
|---|---|---|
| POST | `/marketplace/orders/{orderId}/reschedule` | Reschedule an already-scheduled order (§3.4) |
| GET | `/marketplace/orders/{orderId}/travel-status` | Read travel/arrival status — both participants (§3.3) |
| POST | `/marketplace/orders/{orderId}/travel-status/en-route` | Partner declares "on my way" + ETA (§3.3) |
| POST | `/marketplace/orders/{orderId}/travel-status/arrived` | Partner declares "arrived" (§3.3) |
| PUT | `/marketplace/partner-availability` | Replace the caller's declared availability windows (§3.1) |
| GET | `/marketplace/partner-availability/mine` | List the caller's own declared windows (§3.1) |

Documented in `docs/openapi.yaml` (validated with a direct `js-yaml` load after every edit — path count went from 104 (IP-004's ending count) to 110, exactly +6, and all 125 `operationId`s across the whole file were confirmed unique).

**Three new event types**, documented in `docs/event-catalog.md`:
- `MarketplaceOrder.Rescheduled` (v1.0) — aggregate `MarketplaceOrder`.
- `MarketplaceOrder.PartnerEnRoute` (v1.0) · `MarketplaceOrder.PartnerArrived` (v1.0) — aggregate `MarketplaceOrder`.

No new consumer was added — `apps/api/src/modules/notification/domain/notification-rules.ts` is untouched (confirmed: not present in `git status --short`), matching every other MRK-019/020/021 event's own "zero consumers in MVP" state (§4, §11.4).

## 8. Security / authorization / privacy

- **Every new route requires authentication**; none is `@Public()`.
- **Reschedule**: same authorization posture as the original `schedule()` — any participant (buyer or seller), via `OrderLifecycleService.loadForParticipant` — verified by e2e (a non-participant gets 403).
- **Travel status**: only the seller (Partner) can call `en-route`/`arrived` (`loadForSeller`, 403 for the buyer — verified by e2e); **both** participants can `GET` — the literal visibility requirement from the mandate.
- **Partner availability**: any authenticated identity manages only its own windows (`identity.identityId` is always the `partnerId`, never taken from the request body) — no cross-identity write is possible by construction.
- **Privacy (LGPD / Shared Standards §7 "do not expose precise location beyond product need")**: `OrderTravelStatus` and `marketplace_order_travel_statuses` have **zero** latitude/longitude columns — confirmed by reading the schema and by a direct `grep` for `latitude|longitude` in `order-travel-status.ts` (zero matches) and by an e2e assertion that the live API response has no such property. `PartnerAvailabilityWindow` carries only a declared weekly time preference, never a physical address or coordinate. The only precise coordinates in the entire Marketplace module remain exactly where IP-003's corrected reasoning said they are: `marketplace_order_execution_events` (PACK-03 check-in/check-out), untouched by this IP.
- **No continuous tracking, by construction**: there is no polling endpoint, no location-history table, no background job that reads device location. The Member's visibility into "arrival progress" comes from reading a Partner-declared status transition, never from the platform inferring or storing a live position.
- Every new state transition is audited via `AuditLogService.record()` (`RescheduleMarketplaceOrder`, `DeclarePartnerEnRoute`, `DeclarePartnerArrived`, `SetPartnerAvailability`) — matching the granularity of the equivalent existing MRK operations. Read-only routes (`GET travel-status`, `GET partner-availability/mine`) are **not** audited, consistent with the existing convention already established for every other GET-only use case in this module (`GetServiceRequestUseCase`, `DiscoverServiceRequestMatchesUseCase`, `GetOffersUseCase`, `CompareServiceRequestOffersUseCase` — none of these audit reads either).

## 9. Data / financial invariants

- **No money is created, mutated, or computed by this IP.** Nothing in `partner-availability.ts`, `order-travel-status.ts`, or the reschedule path touches `amount`/`hourlyRateAmount`/any commercial field — confirmed by reading every new/changed file end to end (no arithmetic on a money field anywhere).
- **Reschedule preserves every existing commercial invariant.** `MarketplaceOrder.amount`/`pricingModel`/etc. are never read or written by `reschedule()` — only the `Scheduling` sub-entity changes.
- **Concurrency**: the partial unique index (`idx_marketplace_scheduling_order_active`) is a genuine DB-level constraint — under `READ COMMITTED`, two concurrent `reschedule()` calls against the same order would serialize at the database, and the loser's `INSERT` (a second `ACTIVE` row for the same `order_id`) would violate the partial unique index and surface as a 409 via the existing generic 23505→409 mapping (Shared Standards §13's own documented technical debt item — unchanged by this IP, not newly introduced). The application-level conflict/availability checks (§3.2/§3.4) are best-effort pre-checks, same posture as the pre-existing `schedule()` check; the database constraint is the actual backstop, exactly the same design the original MRK-019 scheduling already relied on.
- **`OrderTravelStatus.markArrived()` is a genuine state guard** — only reachable from `EN_ROUTE`, proven by a unit test (§10.1) that a fresh/`NOT_STARTED` status throws.
- **Terminal-adjacent guard on travel status**: once `ARRIVED`, both `markEnRoute()` and `markArrived()` throw (proven by unit test) — no further transition is possible via this entity.
- Existing PACK-00..03/IP-001..004/007/013/020/021 invariants are all regression-tested green by the full suite (§10) — none of the files that encode those invariants were touched by this IP beyond the additive edits described in §5.

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `e9ff7bc`, in this environment. No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`embedded-postgres`) or the ephemeral `TEST_DATABASE_URL`.

### 10.1 New tests written (this IP): 21 unit tests across 3 new spec files + 5 e2e tests in 1 new spec file

- `partner-availability.spec.ts` — 9 unit tests: valid window creation; `dayOfWeek` out of 0-6 rejected; `endMinute <= startMinute` rejected; window shorter than 30 minutes rejected; empty timezone rejected; same-day overlap detected; different-day/adjacent windows not flagged as overlapping; `assertNoOverlap` rejects an overlapping set; `assertNoOverlap` accepts a non-overlapping set.
- `availability.service.spec.ts` — 7 unit tests: `localInstant` extracts the correct weekday/minute-of-day in a named timezone; `fitsAvailability` with no declared windows is unrestricted; accepts a window fully inside a declared window; rejects a window that starts inside but ends outside; rejects a different weekday; rejects a window crossing local midnight; accepts when it fits at least one of several declared windows.
- `order-travel-status.spec.ts` — 5 unit tests: starts `NOT_STARTED` with no marks; `markEnRoute` from `NOT_STARTED` records the estimate/instant; `markEnRoute` is idempotent/updatable from `EN_ROUTE` (re-declaring the ETA does not reset `enRouteAt`); `markArrived` before `EN_ROUTE` throws; `markArrived` from `EN_ROUTE` records the instant and both further transitions become terminal.
- `ip-005-scheduling-availability-location-eta.e2e.spec.ts` — 5 e2e tests against a real Postgres instance: (1) Partner declares availability and reads it back, plus a same-day-overlap 422; (2) scheduling is rejected outside declared availability and accepted inside it, and is entirely unrestricted for a Partner with zero declared windows; (3) reschedule swaps the window, a stranger cannot reschedule (403), a missing reason is rejected (400), the old scheduling row survives in the database as `CANCELLED` with `cancelledReason` set (direct DB assertion — exactly 2 rows, exactly 1 `ACTIVE`), and reschedule is refused after check-in (409); (4) reschedule is refused when it would conflict with the seller's other active scheduling (409); (5) the full travel-status lifecycle — `NOT_STARTED` initially, "arrived" before "en route" is refused, only the seller can declare, the Member can read the Partner's `EN_ROUTE`/ETA, the response never carries `latitude`/`longitude`, and travel status stops applying after check-in (409).

### 10.2 Unit/domain suite (`npx vitest run`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Run from `apps/api`, after implementation:
```
Test Files  61 passed | 29 skipped (90)
     Tests  499 passed | 126 skipped (625)
Duration    106.52s
```
Before this IP (IP-004's own reported final unit-only state): 58 passed/28 skipped (86 files), 478 passed/121 skipped (599 tests). Delta: **+3 files/+21 tests** in the always-run unit suite (exactly this IP's 3 new unit spec files, 9+7+5=21), **+1 file/+5 tests** in the skipped-without-DB e2e count (the new `ip-005-*.e2e.spec.ts`, 5 test cases). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Targeted e2e verification before the full-suite run

- `mrk-015-022.e2e.spec.ts` (the pre-existing MRK-019 scheduling suite, run in isolation immediately after the migration/repository changes, **before** writing any new production code beyond the schema/repository edit): **4/4 passed, 25.7s** — confirms the constraint swap (`UNIQUE(order_id)` → partial `WHERE status='ACTIVE'`) and the `saveScheduling` upsert-target change (`orderId` → `id`) do not regress the original scheduling/conflict-detection behavior.
- `ip-005-scheduling-availability-location-eta.e2e.spec.ts`, run in isolation: **5/5 passed, ~32s** (after one real bug found and fixed — §10.5).

### 10.4 Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

Full run, all 90 files (86 pre-existing + this IP's 4 new ones — 3 unit spec files, already counted in §10.2, plus 1 e2e spec):
```
Test Files  1 failed | 89 passed (90)
     Tests  1 failed | 624 passed (625)
Duration    751.47s (~12.5 min)
```
The one failure was `ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO"), a file this IP never touches. The embedded Postgres log for this run shows the same class of symptom already documented in every prior IP's own report (IP-002, IP-003, IP-004): a long WAL checkpoint stall (`checkpoint complete: ... write=245.954 s`) capable of starving unrelated concurrent requests without any application-level bug — over four times the test's own timeout window. **This IP's own e2e file is not among the failures** — with exactly one failure reported and it being `ip-002-i18n.e2e.spec.ts`, this IP's `ip-005-scheduling-availability-location-eta.e2e.spec.ts` (and every other one of its 5 tests) necessarily passed within this run; independently corroborated by two separate clean standalone runs of the same file (§10.3, and a repeat immediately before this full run) and by `mrk-015-022.e2e.spec.ts` (the file most likely to regress from this IP's schema/repository changes) passing standalone as well.

Re-ran the one failed file in isolation, immediately afterward, against a freshly started embedded Postgres instance:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    24.84s
```
Clean on the first retry, no code change in between — confirming transient host/checkpoint contention, not a regression, exactly matching the "flakes once on an unrelated file, passes clean in isolation with zero code change" signature every prior Wave 2/3/4 IP's own full-suite run has already established on this exact environment.

Before this IP (IP-004's own reported final full-suite state, reconstructed from its unit-suite baseline since its own full e2e run also hit one transient, unrelated flake): 86/86 files, 599/599 tests. Delta: **+4 files/+26 tests** (3 new unit spec files + 21 tests, 1 new e2e spec file + 5 tests) — exactly this IP's own new test files, no other file's test count changed. **Combined: 90/90 files, 625/625 tests, 0 reproducible failures caused by this IP's diff.**

### 10.5 One real bug found and fixed during this IP's own verification

The first version of the new e2e spec assumed listing publication under the `HOME_REPAIRS` category (which requires `BRONZE` minimum reputation, MRK-003 BR-005) would succeed for a freshly created identity without waiting for its initial Trust Score to be computed. It does not: a brand-new identity's Trust Score is created asynchronously (via the outbox/consumer pipeline, `relay.tick()` in tests, matching IP-004's own `waitForBronze` helper), and without an explicit wait the first `createOrder()` call in several test cases failed with `MARKETPLACE_PUBLICATION_NOT_ALLOWED`. Root-caused by comparing against `ip-004-competitive-quotes-comparison.e2e.spec.ts`'s own `waitForBronze` helper (confirmed present there) and reproducing the same pattern here. Fixed by adding an equivalent `waitForBronze()` helper, called from inside `createOrder()` for every seller. Not a defect in this IP's production code — a test-fixture gap, disclosed here per this program's standard of recording what was actually found.

### 10.6 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 27 routes, all ✓ (unchanged from IP-004 — zero apps/web files touched by this IP)
```

## 11. Deviations / decisions

1. **`saveScheduling`'s upsert conflict target changed from `orderId` to `id`** (§3.6, §5) — required because `order_id` is no longer unique across all statuses (only conditionally, `WHERE status = 'ACTIVE'`), and Postgres cannot resolve `ON CONFLICT (order_id)` against a partial unique index without repeating its exact predicate. Rather than teach the upsert about the partial predicate, the fix targets the row's own primary key (`id`, always unique via `uuidv7()`), which is simpler, correct for both the pre-existing "insert once, then update in place to cancel" flow and the new "insert a second, independent row" flow, and does not depend on knowing the partial index's WHERE clause at the call site. Flagged for reviewer scrutiny (§16) as the mechanically trickiest part of the migration.
2. **`findSchedulingByOrder` renamed to `findLatestSchedulingByOrder`** (`ORDER BY created_at DESC LIMIT 1`), used everywhere the old method was used (`get()`, `cancel()`) plus the new `reschedule()`. Behaviorally identical to the old method for every order that has never been rescheduled (0 or 1 row existed, "latest" = "the only one"), and correctly returns the current `ACTIVE` row for a rescheduled order (its `createdAt` is always the newest, by construction — reschedule always creates a strictly newer row). This is the reasoning that let this IP avoid adding a second, `WHERE status = 'ACTIVE'`-filtered method: verified directly by `mrk-015-022.e2e.spec.ts` staying green (§10.3) and by the new reschedule e2e's direct DB assertion (§10.1).
3. **Member visibility of arrival progress is a synchronous `GET`, not a push notification** — the mandate's "Support Member visibility of relevant arrival progress" was read as a data-visibility requirement, not a notification requirement (which would touch `notification/**`, explicitly off-limits). This also avoids inventing a "should the Member be pinged every time the Partner updates the ETA" product decision that was never asked for.
4. **"Notification hooks emitted" (acceptance criteria) interpreted as "domain events are published that a future notification rule could subscribe to," not as "this IP wires a `notification/**` consumer."** Directly supported by precedent: `MarketplaceOrder.Scheduled`/`Started`/`ExecutionCompleted` (MRK-019/020/021) have had zero consumers since their own IP shipped, and 20 total events in the catalog share this same "nenhum consumidor no MVP" status — publishing the fact, not consuming it, is the established meaning of "hook" in this codebase's own event catalog. Flagged for reviewer re-judgment (§16) since it is the one place this report interprets ambiguous spec language rather than quoting an unambiguous existing rule.
5. **Reschedule reuses `schedule()`'s exact authorization posture (any participant), not a stricter "only the Partner may reschedule" rule.** The IP-019 baseline itself lets either buyer or seller call `schedule()`; inventing a stricter rule specifically for reschedule would be a new, undecided product/business rule, not a natural extension of existing behavior. Flagged for reviewer re-judgment (§16).
6. **`radiusKm`/geocoding still not implemented** (§4) — re-confirmed, with this IP's own preflight, that no pre-engagement Partner location profile exists to match a Member's declared radius against; the weekly availability window this IP adds is a *time* preference, not a *place* one, and does not create such a profile. This is not silently punting the same question twice — it is the same conservative conclusion, re-derived independently rather than copied from IP-003's report.

## 12. Known issues / technical debt

- **Availability windows do not support crossing local midnight** — a Partner who works, say, 22:00–02:00 cannot declare that as one window (§3.2 documents the conservative rejection). Not needed for any tested acceptance criterion; flagged if a future IP needs overnight service windows.
- **No pagination on `GET /marketplace/partner-availability/mine`** — bounded by the `PUT` request's own `max(30)` window limit (zod), so unbounded growth is not a realistic concern, same proportionality judgment IP-004 made for its own comparison endpoint.
- **`OrderTravelStatus` keeps only the latest declaration, not a full history of every ETA redeclaration** — `enRouteAt` is fixed at first declaration, but each redeclared ETA overwrites the previous one in place; a full audit trail of every ETA change is not persisted (though each individual call is separately audit-logged via `AuditLogService`, so the sequence of *audit-log* records does reconstruct history if ever needed — just not as a queryable domain history like `service_execution_pauses`).
- **`EtaEstimatorPort` has exactly one adapter** — by design (§3.5), but worth noting explicitly: no interface contract test exists beyond the one adapter's own behavior, since there is nothing else to contract-test against yet.
- Carries forward IP-003's own already-documented gap that this IP does not close: no geometric radius/location matching (`ServiceRequest.locationLabel` stays free text; §4/§11.6).

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken. No migration was applied anywhere but the disposable local/CI test databases.

## 14. Acceptance criteria matrix

| Criterion (IP-005 spec §6) | Status | Evidence |
|---|---|---|
| Appointment lifecycle is auditable | PASS | Every write (`schedule`, `reschedule`, `en-route`, `arrived`, availability `replace`) goes through `AuditLogService.record()` inside the same transaction as its state change (§8); reschedule additionally preserves the superseded scheduling row with `cancelledReason` rather than deleting it (§3.4, §10.1). |
| Conflicts handled | PASS | Seller double-booking conflict (`SchedulingConflictException`, pre-existing MRK-019 BR-004, reused) and the new availability-boundary conflict (`SchedulingOutsideAvailabilityException`) are both enforced on `schedule()` and `reschedule()`, e2e-tested (§10.1/§10.3). |
| Reschedule rules deterministic | PASS | Single guarded precondition (`SCHEDULED` + not yet started), same conflict/availability checks as initial scheduling, mandatory reason, DB-level partial-unique-index backstop (§9) — no ambiguity in when reschedule succeeds or fails. |
| ETA adapter exists | PASS | `EtaEstimatorPort` + `DeclaredEtaAdapter` (§3.5) — a real port/adapter boundary, not a hard-coded call, honestly implemented for the no-vendor-configured Release 1 reality. |
| Privacy boundaries tested | PASS | e2e directly asserts the travel-status response carries no `latitude`/`longitude`; no such column exists in either new table; only a declared status + Partner-typed ETA is ever transmitted (§8, §10.1). |
| Notification hooks emitted | PASS (interpreted as event publication, §11.4) | Three new domain events published via the existing outbox pattern; zero `notification/**` files touched, matching the same-stage precedent of MRK-019/020/021's own events. |

## 15. Commits

**Not committed** — git identity (`user.name`/`user.email`) is unset in this environment, and this agent was explicitly instructed not to configure it. All of this IP's changes are left **uncommitted** in the working tree, as instructed.

## 16. Recommended reviewer focus

1. **§3.6/§11.1 — the migration that changes the scheduling uniqueness constraint.** This is the single highest-risk change in this IP. Independently verify: (a) the partial unique index (`idx_marketplace_scheduling_order_active`) is satisfied by every pre-existing row (trivially true — every existing order has at most one row, and it is either `ACTIVE` or the sole `CANCELLED` row from a prior order cancellation); (b) the `saveScheduling` upsert-target change from `orderId` to `id` does not silently break the `cancel()` order-flow's own re-save of an existing `Scheduling` (it does not — the entity's `id` never changes across saves of the same instance); (c) `mrk-015-022.e2e.spec.ts` (the untouched, pre-existing scheduling suite) stays green, which it does (§10.3), as independent proof the original scheduling/conflict-detection behavior is unchanged.
2. **§3.3/§8 — the location-privacy boundary of the arrival-status feature.** Confirm directly (not from this report's prose) that `order-travel-status.ts`, `order-travel-status.schema.ts`, and `marketplace-order.dtos.ts`'s `TravelStatusResponse` genuinely carry no coordinate field, and that the only real GPS in the whole Marketplace module remains `marketplace_order_execution_events` (PACK-03), unmodified by this diff.
3. **§11.4 — the "notification hooks emitted" interpretation.** This is the one place this report reads ambiguous spec language against precedent rather than an unambiguous existing rule. Re-judge independently whether "hooks emitted" was meant more literally (i.e., this IP should have added `notification/**` rules) — if so, that is a scoped, additive follow-up (a `notification-rules.ts` entry per new event), not a rework of this IP's own diff.
4. **§11.5 — reschedule's authorization posture (any participant, not Partner-only).** Re-judge whether letting either buyer or seller reschedule (mirroring the pre-existing `schedule()` posture exactly) is the right call, or whether a real-world "the Partner owns the calendar" business rule should have been added — this was a deliberate choice to avoid inventing an undecided product rule, not an oversight.
5. **§4/§11.6 — `radiusKm`/geocoding still not implemented.** This is now the second IP in a row (after IP-003) to defer this; confirm the reasoning is still sound rather than becoming a permanent, undecided gap that should be escalated as its own product decision before a future IP is asked to "finally" solve it.
