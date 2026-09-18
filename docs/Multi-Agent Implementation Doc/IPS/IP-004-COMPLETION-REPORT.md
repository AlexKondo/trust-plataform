# IP-004 — Completion Report

**Competitive Quotes & Comparison Map**
Executed 2026-09-16. Owner: Marketplace/Experience implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §2, §4, §7, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-004 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-004_Competitive_Quotes_Comparison_Map.md`) > IP-003-COMPLETION-REPORT.md / IP-002-COMPLETION-REPORT.md > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `57fa27e` (`main`, tip after IP-020) — confirmed via `git log --oneline -20`.
- **Hard dependency**: IP-003 (Service Request, Discovery & Matching), status APPROVED and committed to `main` at `dfd9da0`, confirmed by reading `IP-003-COMPLETION-REPORT.md` directly, not assumed.
- **Working tree at start**: `git status --short` was clean (no pre-existing uncommitted files) — unlike IP-002/IP-003's own start state, no other IP's changes were sitting uncommitted in this working tree.
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` §2 lists IP-004's only hard dependency as IP-003, "Parallelizable after deps: yes", release class `CORE`, Wave 3 alongside IP-005/IP-015 "where file ownership is isolated". This IP touched only `apps/api/src/modules/marketplace/**` (declared primary-owner domain, shared with IP-003/other Marketplace IPs) plus the shared documentation collision hotspots (`docs/openapi.yaml`, `CLAUDE.md`, this Completion Report) — no `docs/event-catalog.md` change (§7 explains why), no migration, no `apps/web/**` file, no `apps/api/src/modules/payment/**`/`privacy/**`/`notification/**`/`analytics/**` file.

## 2. Preflight findings

1. Read all 6 required documents in the mandated order, then `IP-003-COMPLETION-REPORT.md` in full and `IP-002-COMPLETION-REPORT.md` in full, before writing any code.
2. Hard dependency IP-003: APPROVED — confirmed by reading its Completion Report directly.
3. **The central preflight question this IP's own brief posed**: can a `ServiceRequest` receive offers from multiple Partners today, or is `EngageServiceRequestUseCase` 1:1? Resolved by reading the actual code, not assumed:
   - `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts` (`SERVICE_REQUEST_STATUS`/`SERVICE_REQUEST_TRANSITIONS`, IP-003's own comment block) and `service-request.ts`'s `markMatched()`: `OPEN -> MATCHED` is **idempotent by design** — "at least one contact happened," never exclusivity. Engaging a second/third Partner after the first is explicitly not an error.
   - `apps/api/src/modules/marketplace/infrastructure/persistence/service-request.schema.ts`: `serviceRequestEngagements` has `UNIQUE(service_request_id, listing_id)` — **one engagement per Partner**, not one engagement per request. A second `engage()` call with a different `listingId` inserts a second row, unconditionally.
   - `apps/api/src/modules/marketplace/application/usecases/engage-service-request.usecase.ts`: calls `ContactListingOwnerUseCase.execute()` (MRK-006) unmodified for **every** engagement — each engagement gets/reuses its own `MarketplaceConversation` (`idx_marketplace_conversation_active` is unique per `(listingId, sellerId, buyerId)`, not per `ServiceRequest`), so N different Partners produce N independent conversations, each with its own independent `MarketplaceOffer` chain (MRK-009..014).
   - **Conclusion**: the 1:N Partner-offer capability this IP was asked to investigate **already existed**, built into IP-003's own design (confirmed by IP-003 §3.1's own text: "engaging a second/third Partner afterward is not an error... it signals 'at least one contact happened,' not exclusivity"). `EngageServiceRequestUseCase` did **not** need to be reopened, and was not touched. What was genuinely missing was the **read-side layer** that joins these N independent negotiations into one side-by-side view for the Member — that is this IP's entire scope.
4. Read the full `MarketplaceOffer`/`marketplace-offer.repository.ts`/`accept-offer.usecase.ts`/`create-offer.usecase.ts`/`hourly-pricing.service.ts` to understand exactly what "offer" means today (§ IP-004 preflight instruction 9):
   - `MarketplaceOffer` is a single buyer(Member)-seller(Partner) negotiation thread, chained via `parentOfferId` (`counter()` closes the parent as `COUNTERED` and appends the next round). At most one `PENDING` offer per conversation at a time (`assertNoLiveOffer`).
   - PACK-02's `pricingModel` (`FIXED_PRICE`/`HOURLY`) lives on the offer, immutable after creation; `counter()` always **inherits** the parent's `pricingModel`/`hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes` — a Partner cannot switch pricing model mid-negotiation (pre-existing PACK-02 baseline behavior, not something this IP touches or needs to touch).
   - For `HOURLY`, `offer.amount` is **already** the derived minimum committed total (`calculateInitialHourlyAmount = round(hourlyRateCents × minimumMinutes / 60)`, in cents, PACK-02 §4.2) — never a free value. This is exactly the number this IP needed to expose without pretending it means the same thing as a `FIXED_PRICE` total.
   - `AcceptOfferUseCase` (MRK-013) closes competing offers only via `findPendingByConversation(offer.conversationId)` — i.e. only the **other rounds of the same negotiation** (e.g. superseded counters), never offers in a different Partner's conversation. This is the exact mechanism the IP-004 mandate said to preserve, and it was confirmed to still behave this way (§10.3, dedicated e2e assertion).
5. Existing capabilities reused, confirmed by reading the actual files:
   - `ServiceRequestRepository.listEngagements()` (IP-003) — reused unchanged to enumerate the competing negotiations.
   - `MarketplaceOfferRepository.findByConversation()` (MRK-012 §6.2, already used by `GetOffersUseCase`) — reused unchanged; the "current round" of each negotiation is simply the last element of this already-ordered (oldest→newest) array, since `counter()` always appends at the end and closes its parent.
   - `TrustScoreRepository.findScoreByIdentityId()` — the exact same lookup `DiscoverServiceRequestMatchesUseCase` (IP-003) already imports from `apps/api/src/modules/trust-score/infrastructure/persistence/drizzle-trust-score.repository.ts` — reused verbatim, same import path, same injection pattern (no new module wiring for `TrustScoreModule` needed; `MarketplaceModule` already imports it).
   - `ServiceRequestNotFoundException` (404) — reused verbatim for the same "non-owner never learns the request exists" posture IP-003 established for the rest of the aggregate (§8 of IP-003's report).
   - The `ServiceRequestMatchResponse.partner: { identityId, trustScore, trustLevel }` shape (IP-003 §MRK-004 reuse) — mirrored for this IP's own `partner` field for consistency, not reinvented.
6. Exact gap confirmed present: `grep -rn "compare\|comparison" apps/api/src/modules/marketplace` returned zero matches before this IP — no read model joining `ServiceRequestEngagement` + `MarketplaceOffer` + `TrustScore` existed anywhere.
7. Owned files / collision hotspots: `apps/api/src/modules/marketplace/**` (this IP's shared-with-IP-003 domain, per the Manifest — Marketplace/Experience is IP-004's primary owner). `docs/openapi.yaml`/`CLAUDE.md` are shared documentation collision hotspots (Manifest §5), edited only in new, dedicated sections, following IP-003/IP-002's own precedent of never touching another IP's section. No migration, so the migrations journal was not touched. `docs/event-catalog.md` was deliberately **not** touched (§7 explains why — no new event).
8. Baseline tests run before implementation: `npx tsc -p tsconfig.json --noEmit` (0 errors, from `apps/api`) — clean starting point, matching the prior IPs' reported baseline. The full e2e baseline was not re-run a sixth time before starting (IP-000/001/002/003/007/013/020/021 all already independently reproduced a green baseline on this exact lineage, most recently IP-020's own final state — **84/84 files, 593/593 tests**, per its Completion Report §10.3); this agent's own post-implementation full run (§10.3 below) is the authoritative before/after comparison, and it independently reconfirms the pre-existing baseline count.
9. No conflict found requiring escalation. No missing product decision touched money/security/privacy/legal/Trust Score/irreversible data shape in a way this preflight could not resolve from existing code and the Manifest's own explicit instructions (§11 records the judgment calls made, all within the IP's own scope).

## 3. Implemented

### 3.1 Cardinality finding: no change needed to `EngageServiceRequestUseCase`

As established in §2.3, `ServiceRequest`/`EngageServiceRequestUseCase` already support N independent Partner engagements — this was a design decision IP-003 made deliberately (`markMatched()`'s idempotency, the engagement table's `UNIQUE(service_request_id, listing_id)` rather than a request-level exclusivity constraint). **Zero lines of `engage-service-request.usecase.ts`, `service-request.ts`, `service-request.schema.ts`, or any other IP-003-owned file were changed** — confirmed by `git diff --stat` (§5): none of those files appear in this IP's diff. This IP is purely additive on top of a capability that already existed.

### 3.2 `CompareServiceRequestOffersUseCase` — the comparison read model

New file `apps/api/src/modules/marketplace/application/usecases/compare-service-request-offers.usecase.ts`. Pure read, no state mutation, no event published (§7 explains why none is needed). For a given `serviceRequestId`:

1. Loads the `ServiceRequest`, enforcing the exact same "404, never 403, for anyone but the owner" posture IP-003 established for the rest of the aggregate (`ServiceRequestNotFoundException`).
2. Calls `ServiceRequestRepository.listEngagements()` (IP-003, unchanged) to enumerate every Partner ever engaged for this request.
3. For each engagement, in parallel (`Promise.all`): looks up the listing (title, for display), the conversation (status, as an availability/commercial-condition signal), the full offer chain via `MarketplaceOfferRepository.findByConversation()` (MRK-012, unchanged), and the Partner's Trust Score/level (`TrustScoreRepository.findScoreByIdentityId()`, unchanged).
4. The **current/live offer** of each negotiation is simply the last element of the already-ordered offer chain (oldest→newest) — proven correct by construction: `MarketplaceOffer.counter()` always closes its parent as `COUNTERED` and appends the new round at the end (`§2.4`); a unit test (`compare-service-request-offers.usecase.spec.ts`, "usa a rodada mais recente da cadeia... como oferta viva") verifies this directly against a real counter-offer chain, not just by inspection.
5. **No ranking, no automatic winner** (IP-004 §4, `04_APPROVED_PRODUCT_DECISIONS.md`'s "Member can compare competing offers in a transparent comparison view"): items are returned in `engagedAt` order (order of contact) — never sorted by price, Trust Score, or any other signal. Confirmed by a dedicated unit test assertion and documented in the class's own doc comment so a future reader does not "helpfully" add sorting-by-price later without an explicit product decision.

### 3.3 Normalization without false equivalence (IP-004's core constraint)

`toOfferComparisonTerms()` (new, `service-request.mapper.ts`) returns the offer's **literal** `amount` — for `FIXED_PRICE` this is the closed total; for `HOURLY` this is the already-derived minimum committed amount (`hourlyRateAmount × minimumMinutes`, PACK-02 §4.2) — **never a value invented or converted by this IP**. A new field, `estimatedTotalBasis` (`'FIXED_TOTAL' | 'HOURLY_MINIMUM_COMMITMENT'`), makes explicit what `amount` means in each case, and `hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes` are always included alongside it so the comparison never collapses an hourly quote into an opaque number that looks like a fixed total.

**Deviation from a literal "assumptions" prose field** (§11.3): rather than generating a natural-language "assumption" sentence (which would either be hardcoded Portuguese in domain/application code — forbidden by Shared Standards §8 — or would require inventing a new i18n message-catalog key in a backend-only IP that touches no `apps/web` file), this IP exposes the **structured facts** (`estimatedTotalBasis` + the three hourly fields, all already present) and leaves any human-readable explanatory sentence to whichever future frontend IP (IP-016/017) renders this data, through IP-002's own `apps/web/lib/i18n/` catalog. This mirrors IP-002 §3.3's own precedent exactly ("Backend never hard-codes locale-dependent text in the new use case; it returns structured data, not rendered strings").

### 3.4 Response shape

New interfaces in `apps/api/src/modules/marketplace/application/dto/service-request.dtos.ts`: `OfferComparisonTerms` (offer-level terms, §3.3) and `ServiceRequestOfferComparisonItem` (one row per engaged Partner: `engagementId`, `listingId`, `listingTitle`, `partner: {identityId, trustScore, trustLevel}` — mirroring `ServiceRequestMatchResponse.partner`'s existing shape from IP-003 — `conversationId`, `conversationStatus`, `engagedAt`, `hasOffer`, `offer: OfferComparisonTerms | null`) and `ServiceRequestOfferComparisonResponse` (`serviceRequestId`, `serviceRequestStatus`, `items`). `hasOffer: false` / `offer: null` represents a Partner who was engaged but has not yet received a proposal from the Member (MRK-009 BR-001: only the buyer/Member opens a negotiation) — this is shown, not hidden, for transparency about who has actually quoted versus who was merely contacted.

### 3.5 New route

`GET /marketplace/service-requests/{serviceRequestId}/offers`, added to the existing `MarketplaceServiceRequestController` (`infrastructure/api/marketplace-service-request.controller.ts`) — authenticated, not `@Public()`, same as every other route on this controller. Wired via `CompareServiceRequestOffersUseCase`, registered as a new provider in `marketplace.module.ts` (no new repository binding needed — every dependency it uses was already provided/exported by the existing `MarketplaceModule`/`TrustScoreModule` wiring).

## 4. Not implemented / out of scope

Per the IP-004 spec's explicit "Out of scope" (§4) and this program's non-negotiable constraints:

- **No change to `MarketplaceOffer`'s accept/reject/counter state machine** — `marketplace-offer.ts`, `accept-offer.usecase.ts`, `counter-offer.usecase.ts`, `resolve-offer.usecase.ts`, `create-offer.usecase.ts` are all untouched (confirmed: zero lines in `git diff --stat`, §5). Accepting an offer still closes only the competing rounds of the **same** negotiation (MRK-013 BR-004); it does **not** cross-close other Partners' independent conversations for the same `ServiceRequest` — verified explicitly by a dedicated e2e assertion (§10.3) that a second Partner's `PENDING` offer survives, unaffected, after the Member accepts the first Partner's offer. This was a deliberate scope boundary, not an oversight: the mandate explicitly said "preserve... entirely" and "you're adding a read/comparison layer... not rebuilding acceptance"; auto-closing every other Partner's negotiation on acceptance would be a new business rule with no explicit product decision behind it (flagged for reviewer attention, §16).
- **No hidden ranking / paid placement / automatic winner selection** (IP-004 §4) — confirmed by construction: the use case has no sort-by-price/score anywhere, and a unit test asserts `engagedAt` ordering is preserved.
- **No migration** — this IP reads only entities that already exist (`ServiceRequestEngagement`, `MarketplaceOffer`, `MarketplaceConversation`, `MarketplaceListing`, `TrustScore`); no new table/column was needed.
- **No new event** — pure read, no state change (Shared Standards §3: "do not create events for trivial persistence" — there is no persistence here at all). `docs/event-catalog.md` was deliberately not touched.
- **No frontend work** — consistent with IP-003's own precedent (backend-only; `apps/web` has no Member/Partner marketplace-offer UI yet, that is IP-016/017's job) and with no `apps/web` file being named anywhere in this IP's mandate.
- **No pagination on the comparison endpoint** — a `ServiceRequest`'s engagement count is bounded by how many Partners a single Member manually engages one at a time through `POST .../engage` (a deliberate, rate-limited, one-at-a-time UX per IP-003's own design — there is no bulk-engage or Partner-facing broadcast, IP-003 §4), so unbounded growth is not a realistic near-term concern; flagged as a known simplification (§12), not silently decided as permanent.
- **No change to `apps/api/src/modules/payment/**`/`privacy/**`/`notification/**`/`analytics/**`** — confirmed zero files touched in any of those directories.

## 5. Files changed

**New files (3)**:
```
apps/api/src/modules/marketplace/application/usecases/compare-service-request-offers.usecase.ts        95
apps/api/src/modules/marketplace/application/usecases/compare-service-request-offers.usecase.spec.ts   264
apps/api/test/integration/ip-004-competitive-quotes-comparison.e2e.spec.ts                             264
```

**Modified files** (`git diff --stat`):
```
CLAUDE.md                                                                                 +27
apps/api/src/modules/marketplace/application/dto/service-request.dtos.ts                  +56
apps/api/src/modules/marketplace/application/mapper/service-request.mapper.ts             +59
apps/api/src/modules/marketplace/infrastructure/api/marketplace-service-request.controller.ts +16
apps/api/src/modules/marketplace/marketplace.module.ts                                    +2
docs/openapi.yaml                                                                          +25
```

Zero files under `apps/api/src/modules/payment/**`, `apps/api/src/modules/identity/**`, `apps/web/**`, any IP-003-owned entity/schema/use-case file, or any other module were touched. Zero existing Marketplace file's *behavior* changed — every modified file received only additive edits (new interfaces, new mapper functions, one new controller method, one new provider registration). The incidental `apps/web/tsconfig.tsbuildinfo` regeneration (a build-cache artifact from running `pnpm -r build`, same as IP-003 §11.8's own finding) was reverted with `git checkout --`, not left in the diff.

## 6. Migrations / configuration

None. This IP introduces no new table, column, index, or constraint — it is a read model composed entirely from entities `ServiceRequest`/`ServiceRequestEngagement`/`MarketplaceOffer`/`MarketplaceConversation`/`MarketplaceListing`/`TrustScore` already persisted by IP-003 and the closed Marketplace/Trust-Score baseline. No `.env`/config schema change.

## 7. APIs / events / jobs

**One new route**, added to the existing `marketplace/service-requests` group:
| Method | Path | Purpose |
|---|---|---|
| GET | `/marketplace/service-requests/{serviceRequestId}/offers` | Side-by-side comparison of every Partner's live offer for this request (§3) |

Documented in `docs/openapi.yaml` (validated with a `js-yaml` parse after the edit, following IP-003's own precedent — path count went from 103 to 104, exactly +1, reconciled directly against the one new `operationId` (`compareServiceRequestOffers`) added).

**No new event.** This use case performs zero writes — there is nothing for an event to announce, and Shared Standards §3 explicitly says not to create events for trivial persistence (which does not even apply here, since there is no persistence at all). `docs/event-catalog.md` is unchanged (confirmed: `git diff docs/event-catalog.md` is empty).

**No new consumer/job.**

## 8. Security / authorization / privacy

- **Authenticated, not `@Public()`** — same as every other route on `MarketplaceServiceRequestController`.
- **Ownership enforced at the use-case layer, 404 (not 403) for a non-owner** — identical posture to every other `ServiceRequest` read route (`GetServiceRequestUseCase`, `DiscoverServiceRequestMatchesUseCase`): `!request || !request.isOwnedBy(memberId)` throws `ServiceRequestNotFoundException`, so a non-owner cannot confirm even that the request exists. Verified by a dedicated e2e assertion (a `stranger` identity gets 404, §10.3).
- **No new PII exposed.** The comparison response surfaces, per engaged Partner: `identityId`, Trust Score/level (already public information under IP-003/MRK-004's own existing exposure — `ServiceRequestMatchResponse.partner` already returns the identical shape to the Member), the listing title (already public — the listing is `PUBLISHED`), and the negotiation terms of a conversation the Member is themselves a participant in (already visible to the Member today via `GET /marketplace/conversations/{id}/offers`, MRK-012). This IP does not expose anything to the Member that was not already independently visible to them through existing routes; it only **joins** those existing, already-authorized views into one response.
- **Purpose-bound**: this endpoint is Member-facing only; there is no symmetric Partner-facing "see how I compare to other Partners" route (would leak one Partner's commercial terms to a competitor — never built, never considered, consistent with IP-003's own "no Partner-facing browse feed" scope boundary).
- No new audit entry was added — this is a read-only operation with no state change to audit (consistent with every other GET-only use case in this module, e.g. `GetServiceRequestUseCase`, `DiscoverServiceRequestMatchesUseCase`, `GetOffersUseCase`, none of which call `AuditLogService`).

## 9. Data / financial invariants

- **No money is created, mutated, or computed by this IP.** `amount`/`hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes` are read verbatim from the persisted `MarketplaceOffer` (already validated/derived by PACK-02's own domain code at creation/counter time) — this IP performs no arithmetic on money anywhere (confirmed by reading `compare-service-request-offers.usecase.ts`/`service-request.mapper.ts` end to end: no `+`, `-`, `*`, `/` on any amount field).
- **PACK-02's commercial snapshot logic is completely untouched** — `AcceptOfferUseCase`, `MarketplaceCommercialSnapshot`, `CommercialPolicyRepository` are not imported anywhere in this IP's new files. The accepted-offer's terms freeze exactly as they did before this IP (verified by a dedicated e2e assertion: `order.amount === 2400`, the exact countered `FIXED_PRICE` amount, after acceptance, §10.3).
- **No new state machine, no new transition.** `ServiceRequest`/`MarketplaceOffer`/`MarketplaceConversation` all keep their exact pre-existing transition rules; this IP's use case never calls `.save()`/`.markMatched()`/`.accept()`/`.transitionTo()` on any of them.
- **Idempotency**: the endpoint is a pure `GET` with no side effect — calling it any number of times produces the same result for the same underlying state, trivially idempotent by construction (no CAS/concurrency concern applies to a read-only operation).

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `57fa27e`, in this environment (`pnpm`/`npx` directly usable). No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`embedded-postgres`, `node test/e2e-local.mjs`).

### 10.1 New tests written (this IP): 5 unit tests + 1 e2e test

- `compare-service-request-offers.usecase.spec.ts` — 5 unit tests: (1) non-owner/non-existent request → 404; (2) zero engagements → empty list, not an error; (3) an engagement with no offer yet appears with `hasOffer: false`/`offer: null`; (4) `FIXED_PRICE` and `HOURLY` offers, engaged for the same request, are normalized side by side without one being converted into the other — `estimatedTotalBasis` differs, `amount` differs, `hourlyRateAmount` is populated only for the `HOURLY` item, Trust Score/level are per-Partner, and items are ordered by `engagedAt`, never by price/score; (5) the live offer of a negotiation with a counter-offer is the **last** element of the chain, and `roundCount` reflects the full chain length.
- `ip-004-competitive-quotes-comparison.e2e.spec.ts` — 1 e2e test covering the full journey end to end against a real Postgres instance: a Member creates a `ServiceRequest`, engages three Partners (one that will quote `FIXED_PRICE`, one `HOURLY`, one that never quotes); a non-owner gets 404 on the comparison endpoint; before any offer, all three items show `hasOffer: false`; the Member opens each negotiation (MRK-009 BR-001), the `FIXED_PRICE` Partner counters with a real quote, the comparison endpoint then shows both pricing models normalized (`FIXED_TOTAL` amount `2400` vs. `HOURLY_MINIMUM_COMMITMENT` amount `480` — literal, unconverted values, `120.00/h × 240min`), items still ordered by `engagedAt`; the Member accepts the `FIXED_PRICE` offer (MRK-013, unmodified) — the order is created with `amount: 2400`/`status: 'CREATED'` exactly as PACK-02 would produce without this IP; a final comparison call confirms the accepted offer's status is now `ACCEPTED` **while the other Partner's `HOURLY` offer is still `PENDING`, untouched** — the explicit proof that this IP did not introduce cross-Partner auto-closing.

### 10.2 Unit/domain suite (`npx vitest run`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Run from `apps/api`, after implementation:
```
Test Files  58 passed | 28 skipped (86)
     Tests  478 passed | 121 skipped (599)
```
Before this IP (IP-020's own reported final unit-only state, reconstructed from its full-suite §10.2/§10.3 baseline): 57 passed / 27 skipped (84 files), 473 passed / 120 skipped (593 tests). Delta: **+1 file / +5 tests** in the always-run unit suite (this IP's one new unit spec file, 5 tests), **+1 file / +1 test** in the skipped-without-DB e2e count (the new `ip-004-*.e2e.spec.ts`, 1 test case). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

**First full run, all 86 files** (84 pre-existing + this IP's 2 new ones):
```
Test Files  1 failed | 85 passed (86)
     Tests  1 failed | 598 passed (599)
Duration    688.83s (~11.5 min)
```
The one failure was `ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO"), `Error: Score não chegou a 25` — a trust-score-calculation timing wait exceeding its poll window. **This is a file this IP never touched, and the exact same failure signature (same test, same error message) is already independently documented in `IP-002-COMPLETION-REPORT.md` §10.5 (root-caused there to a connection-pool/WAL-checkpoint timing issue, already fixed once) and reproduced again, transiently, by both `IP-003-COMPLETION-REPORT.md` §10.3 and `IP-020-COMPLETION-REPORT.md` §10.3's own full-suite runs** — a fifth independent occurrence of the same known-flaky, environment-timing-sensitive test, not a new defect.

Re-ran the one failed file in isolation, immediately afterward, against a freshly started embedded Postgres instance:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    23.35s
```
Clean on the first retry, no code change in between — confirming transient host contention, consistent with every prior IP's own documented experience of this exact file.

**This IP's own `ip-004-competitive-quotes-comparison.e2e.spec.ts` passed clean, both in the full-suite run and in an earlier standalone run performed during implementation: 1/1 test, ~15–17s.**

Before this IP (IP-020's own reported final full-suite state, §10.3 of its report): 84/84 files, 593/593 tests. Delta: **+2 files / +6 tests**, exactly this IP's own new test files (§10.1) — no other file's test count changed. Combined evidence across this agent's own two full runs of the affected file: **86/86 files, 599/599 tests, 0 reproducible failures**, the same "flakes once on an unrelated file, passes clean in isolation with zero code change" signature every prior Wave 2/3 IP's own full-suite run has already established on this exact environment.

### 10.4 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors (after fixing 4 no-await-in-async-arrow lint errors in the new unit spec's mock factories, caught by the first lint run and fixed before the final run)
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 27 routes, all ✓ (unchanged from IP-020 — zero apps/web files touched by this IP)
```

### 10.5 IP-003 regression, specifically

IP-003's own `ip-003-service-request-discovery-matching.e2e.spec.ts` is included in, and passed clean within, the full-suite run above (§10.3) — no isolated re-run was needed beyond that, since this IP touched none of IP-003's own files (§3.1, §5) and the full-suite run is authoritative. (An earlier attempt to run it in isolation while the full-suite run was still executing in the background failed with a Windows file-lock `EPERM` on the shared embedded-Postgres data directory — expected, given two embedded-Postgres instances cannot share one data directory concurrently; not a code issue, and superseded by the full-suite run's own inclusion of that file.)

## 11. Deviations / decisions

1. **`EngageServiceRequestUseCase` was not reopened** (§3.1, §2.3) — the task brief explicitly anticipated this might be needed ("this IP may need a genuinely new capability... if it's currently 1:1"). Preflight found it is not 1:1 today; IP-003 already built the N-Partner capability as part of its own design. Re-verified by the reviewer's own reading of `service-request.ts`'s `markMatched()` doc comment and the `UNIQUE(service_request_id, listing_id)` constraint is the fastest way to confirm this claim independently.
2. **No cross-Partner offer closing on acceptance** (§4, §9) — the mandate's own wording ("the existing MRK-013 'accept' pivot logic... should still be the mechanism; you're adding a read/comparison layer... not rebuilding acceptance") was read as forbidding this, and the IP-004 spec's own acceptance criterion ("losing offers close consistently") was read as referring to MRK-013 BR-004's existing same-negotiation closure, not a new cross-Partner rule. This is the single largest judgment call in this IP; flagged for reviewer re-judgment (§16), with the e2e test in §10.1/§10.3 making the actual behavior fully explicit and inspectable rather than asserted only in prose.
3. **`estimatedTotalBasis` as a structured enum instead of a natural-language "assumptions" sentence** (§3.3) — chosen to satisfy the IP-004 mandate's "expose your assumptions" instruction without violating Shared Standards §8 ("no user-facing strings hard-coded in domain logic") in a backend-only IP that adds no `apps/web` i18n catalog entries. A future frontend IP renders the explanatory copy from this structured data through IP-002's own catalog.
4. **No pagination on the comparison endpoint** (§4) — judged proportionate given IP-003's own one-Partner-at-a-time, Member-initiated `engage()` flow (no bulk-engage, no Partner-facing broadcast) bounds realistic engagement counts per request; recorded as a known simplification (§12) rather than a silent permanent decision.
5. **`conversationStatus` included as a commercial-condition/availability signal** (§3.2, §3.4) — the IP-004 spec asks the comparison to show "availability and commercial conditions." No new availability/scheduling data exists yet (that is IP-005's job, not started); the one true signal already available today is whether the underlying negotiation is still `OPEN` — included as-is, not invented.

## 12. Known issues / technical debt

- **No bulk/batch repository lookups** — `CompareServiceRequestOffersUseCase.buildComparisonItem()` issues one `findById`/`findByConversation`/`findScoreByIdentityId` call per engagement, run in parallel via `Promise.all` across engagements but not batched into a single multi-row query. No bulk `findByIds`-style method exists on any of the three repositories involved today (confirmed by reading `marketplace-listing.repository.ts`, `marketplace-offer.repository.ts`, `drizzle-trust-score.repository.ts`) — adding one would be new repository surface across three different repositories' ownership, judged disproportionate to "minimum safe design" for an IP whose realistic engagement-per-request count is small (§11.4). Flagged for a future IP (or IP-024 hardening) if per-request engagement counts ever grow materially.
- **No caching** — every call recomputes the comparison from scratch; acceptable for a Member-facing, low-frequency read (a Member does not call this endpoint at request-per-second rates), consistent with every other read-only use case in this module.
- Carries forward IP-003's own already-documented gap that this IP does not change: no geometric radius/location matching (`locationLabel` stays free text), no real availability/scheduling data (IP-005), no Partner-facing browse feed.

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken. No migration was applied anywhere.

## 14. Acceptance criteria matrix

| Criterion (IP-004 spec §6) | Status | Evidence |
|---|---|---|
| One request can receive multiple eligible offers | PASS (pre-existing, confirmed not newly built) | IP-003's own `ServiceRequestEngagement` model already supports N Partners (§2.3); this IP's e2e test exercises three concurrent Partner engagements against one request. |
| Member sees side-by-side comparison | PASS | `GET /marketplace/service-requests/{id}/offers` (§3.2/§3.5), e2e-tested end to end (§10.1/§10.3). |
| Accepted offer freezes PACK-02 terms | PASS | `AcceptOfferUseCase`/`MarketplaceCommercialSnapshot` untouched (§9); e2e asserts `order.amount === 2400` (the exact countered amount) after acceptance. |
| Losing offers close consistently | PASS, scoped to same-negotiation closure (MRK-013 BR-004), not cross-Partner (§11.2) | e2e asserts the accepted negotiation's superseded rounds close per existing MRK-013 behavior (implicitly, via the untouched `AcceptOfferUseCase`) and explicitly asserts a **different** Partner's offer remains `PENDING`, unaffected — the deliberate scope boundary this report flags for reviewer re-judgment. |
| E2E covers competition and acceptance | PASS | `ip-004-competitive-quotes-comparison.e2e.spec.ts` covers engagement of 3 Partners, two pricing models, comparison before/after quoting, acceptance, and post-acceptance comparison. |
| No hidden ranking / paid placement / automatic winner (§4) | PASS | No sort-by-price/score anywhere in the use case; items ordered by `engagedAt` only, asserted by a dedicated unit test. |
| FIXED_PRICE/HOURLY normalized without false equivalence (§4) | PASS | `estimatedTotalBasis` + literal `amount` + full hourly fields, never converted (§3.3), asserted by both unit and e2e tests. |

## 15. Commits

**Not committed** — git identity (`user.name`/`user.email`) is unset in this environment, and this agent was explicitly instructed not to configure it. All of this IP's changes are left **uncommitted** in the working tree, as instructed ("leave everything uncommitted/staged").

## 16. Recommended reviewer focus

1. **§11.2 / §4 — no cross-Partner offer closing on acceptance.** This is the single largest judgment call in this IP. Re-read the IP-004 spec's exact wording on "losing offers close consistently" independently and confirm whether it was intended to mean only MRK-013 BR-004's existing same-negotiation closure (what was implemented) or a new cross-Partner auto-close/auto-notify rule (which would be a genuinely new business rule requiring its own product decision, not silently added here). The e2e test in §10.1 makes the actual current behavior fully inspectable either way.
2. **§2.3 — the cardinality finding itself.** Independently verify, from `service-request.ts`'s `markMatched()` and the `UNIQUE(service_request_id, listing_id)` constraint in `service-request.schema.ts`, that `EngageServiceRequestUseCase` genuinely already supported N Partners before this IP, so that "zero lines of IP-003-owned files changed" is not mistaken for an incomplete implementation of the IP-004 mandate's own explicitly-anticipated "may need a genuinely new capability" branch.
3. **§3.3 / §11.3 — `estimatedTotalBasis` as a structured field instead of a prose "assumptions" sentence.** Confirm this satisfies the spirit of "expose your assumptions" (IP-004 §Objective) given the constraint that this is a backend-only IP with no `apps/web` i18n catalog entry to hang a translated sentence on.
4. **§12 — N+1-shaped repository calls per engagement.** Confirm the judgment that this is acceptable at MVP engagement-count scale (a handful of Partners per request, all Member-initiated one at a time) rather than premature-optimization-avoidance being used to excuse a real scale concern.
5. **§8 — no new audit log entry for this read.** Confirm this matches the existing convention (no other read-only `ServiceRequest`/Offer use case in this module audits) rather than being an oversight specific to a competitive-pricing-visibility feature that a reviewer might judge should be audited for a different reason (e.g. detecting a Partner scraping competitor pricing through repeated Member-impersonation attempts) — no such threat model was named in this IP's scope, but it is worth an explicit second opinion given the "competitive quotes" subject matter.
