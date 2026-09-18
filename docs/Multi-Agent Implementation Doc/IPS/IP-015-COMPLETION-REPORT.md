# IP-015 — Completion Report

**Search & Marketplace Retrieval**
Executed 2026-09-16. Owner: Marketplace/Search implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §2, §4, §7, §10) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-015 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-015_Search_Marketplace_Retrieval.md`) > `IP-003-COMPLETION-REPORT.md` / `IP-004-COMPLETION-REPORT.md` / `IP-005-COMPLETION-REPORT.md` > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `19a0be6` (`main`, tip after IP-005) — confirmed via `git log --oneline -5`.
- **Hard dependency**: IP-003 (Service Request, Discovery & Matching), status APPROVED and committed to `main`, confirmed by reading `IP-003-COMPLETION-REPORT.md` directly. IP-004/IP-005 (the other two Wave-3 marketplace IPs) are also committed to `main` and were read in full for context, though neither is a hard dependency of IP-015 per the Manifest.
- **Working tree at start**: `git status --short` was clean — no pre-existing uncommitted files.
- **Manifest confirmation**: IP-015's primary owner is Marketplace/Search. This IP touched only `apps/api/src/modules/marketplace/**` (search read-path), one additive index on `apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts` (a shared collision hotspot — index-only, zero Trust Score business logic touched), the migration journal, and the shared documentation hotspots (`docs/openapi.yaml`, `CLAUDE.md`, this Completion Report) — all edited additively, in new sections, following IP-003/004/005's own precedent. Zero files under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` were touched. Zero files owned by IP-003/004/005 (`service-request.ts`, `discover-service-request-matches.usecase.ts`, `compare-service-request-offers.usecase.ts`, `partner-availability.ts`/`.schema.ts`, `order-travel-status.ts`, etc.) were touched.

## 2. Preflight findings

1. Read all 6 required documents in the mandated order, then `IP-003-COMPLETION-REPORT.md`, `IP-004-COMPLETION-REPORT.md`, and `IP-005-COMPLETION-REPORT.md` in full before writing any code — specifically for the ServiceRequest/comparison/availability surfaces this IP's own spec asked to be aware of.
2. Hard dependency IP-003: APPROVED — confirmed by reading its Completion Report directly.
3. Read the real search foundation end to end, not from prose:
   - `apps/api/src/modules/marketplace/application/usecases/search-listings.usecase.ts` (MRK-004) — confirmed it already resolves `category` (code→id, unknown code → empty page, not an error), expands `minimumTrustLevel` via `levelsAtOrAbove` (unknown level → empty page), and passes a fully-formed `ListingSearchCriteria` straight through to the repository. Zero business logic beyond that — the repository is where filtering/ordering/pagination actually happens.
   - `apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-listing.repository.ts` (`search()`, `orderFor()`) — confirmed the **exact** pre-existing filter set: `text` (title/description `ilike`), `categoryId`, `listingType`, `minPrice`/`maxPrice`, `currency`, `location` (`ilike`, free text — no lat/lng/radius column anywhere in `marketplace.schema.ts`), `allowedSellerLevels` (via a `LEFT JOIN trust_scores`). Confirmed **empirically**, by reading `orderFor()`'s source, that `SEARCH_SORT.RELEVANCE` was a literal case-fallthrough to the same branch as `SEARCH_SORT.RECENT` (`publishedAt desc nulls last`) — i.e. `relevance` never looked at `criteria.text` at all, exactly the gap IP-003 §4 flagged by name for this IP ("No retrofit of `MarketplaceListingRepository.search()`'s `sort=relevance` no-op — that is IP-015's explicitly-scoped gap").
   - `apps/api/src/modules/marketplace/application/usecases/discover-service-request-matches.usecase.ts` (IP-003) — confirmed it calls the **same** `MarketplaceListingRepository.search()` method, with `sort: 'trust_score'` and no `text`, to do Partner-side matching for one `ServiceRequest`. This is the reason this IP did **not** touch that file: every fix made at the repository level (deterministic pagination tiebreak, in particular) automatically benefits IP-003's matching without a single line changed there — confirmed by re-running `ip-003-service-request-discovery-matching.e2e.spec.ts` unmodified after this IP's changes (§10.3).
   - `apps/api/src/modules/marketplace/application/usecases/compare-service-request-offers.usecase.ts` (IP-004) — confirmed it never calls `search()` at all (it joins `ServiceRequestEngagement`/`MarketplaceOffer`/`TrustScore` directly) — genuinely out of this IP's surface, not silently skipped.
   - `apps/api/src/modules/marketplace/infrastructure/persistence/partner-availability.schema.ts` / `domain/entities/partner-availability.ts` (IP-005) — confirmed the exact shape of `PartnerAvailabilityWindow` (`partnerId`, `dayOfWeek` 0–6, `startMinute`/`endMinute`, `timezone`) and its own index, `idx_partner_availability_partner` on `(partner_id, day_of_week)` — already exactly what a search-side day-of-week filter needs; read-only reuse, no new index required for the join.
4. Confirmed, by grep, that **no** dedicated unit spec existed for `SearchListingsUseCase` before this IP (`find apps/api -iname "*search-listing*"` returned only the production file) and that the only existing search coverage lived inside `mrk-001-008.e2e.spec.ts` (MRK-001..008's own closed-baseline file, not touched by this IP — a new dedicated e2e file was added instead, following IP-003/004/005's own precedent).
5. Confirmed, by grep (`grep -rn "pricingModel" apps/api/src/modules/marketplace/domain/entities/marketplace-listing.ts apps/api/src/modules/marketplace/infrastructure/persistence/marketplace.schema.ts`), that **no** `pricingModel` field exists anywhere on `MarketplaceListing` — that concept (`FIXED_PRICE`/`HOURLY`) lives exclusively on `MarketplaceOffer`/`MarketplaceOrder`/`TrustChangeOrder` (PACK-02), created only once a negotiation starts. This directly resolved the IP-015 spec's "price-model filters" acceptance wording: a listing simply has no pricing model before a Member contacts a Partner, so the only honest "price-model" filter pre-negotiation is the already-existing `minPrice`/`maxPrice`/`currency` range on `marketplace_listings.price` — not a new, misrepresentative field.
6. Confirmed, by reading `apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts`, that `trust_scores.identity_id` — the join column used by **every** reputation-aware read in the Marketplace module (this IP's own search, IP-003's matching, IP-004's comparison, all via `LEFT JOIN trust_scores` or `TrustScoreRepository.findScoreByIdentityId()`) — had **no index at all**, not even a plain one (only `trustPassportId` has a unique index). A genuine, evidence-based performance gap directly on the search hot path, closed in §3.5.
7. Existing capabilities reused, confirmed by reading the actual files (not assumed from names):
   - `levelsAtOrAbove` / the "unknown level → empty page" convention — untouched, still the same function, still called the same way.
   - `MarketplaceListingRepository.search()` itself — extended, not rebuilt: the pre-existing filter fields, the `LEFT JOIN trust_scores` for reputation, the `firstImage` correlated subquery, and the count-query shape are all unchanged.
   - The partial-unique-index idiom already used three times in this codebase (`idx_marketplace_conversation_active`, IP-005's `idx_marketplace_scheduling_order_active`, IP-005's `idx_partner_availability_partner`) — the new `availableDayOfWeek` filter reuses IP-005's own index verbatim via an `EXISTS` subquery; no new index was created for it.
   - The additive-migration style of 0024–0033 (`CREATE INDEX IF NOT EXISTS`, no `DROP`) — reused verbatim for migration `0034`.
8. Owned files / collision hotspots: `apps/api/src/modules/marketplace/**` (search read-path only — no other Marketplace sub-domain touched). `apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts` is **not** IP-015's primary domain — it is touched with a single additive index line, justified directly by the IP-015 spec's own "performance indexes" acceptance criterion and by the fact that the join column belongs to the search hot path this IP owns; flagged explicitly for reviewer scrutiny (§16) as the one place this IP edited a file outside its own declared primary domain, matching the same "index-only, shared collision hotspot" posture IP-003/004/005 already used for `apps/api/src/shared/database/schema/index.ts`. `docs/openapi.yaml`/`CLAUDE.md` edited only in this IP's own dedicated section/route entry, never touching another IP's section. `docs/event-catalog.md` was **not** touched (§7 explains why — no new event, pure read-path enhancement, same reasoning IP-004 used for its own read-only comparison endpoint).
9. Baseline tests run before implementation: `npx tsc -p tsconfig.json --noEmit` (0 errors) and `npx vitest run` from `apps/api`: **61 passed / 29 skipped (90 files), 499 passed / 126 skipped (625 tests)** — matches IP-005's own reported final state exactly (§10.2 of `IP-005-COMPLETION-REPORT.md`), confirming the starting point before this IP's own changes.
10. No conflict found requiring escalation. No missing product decision touched money/security/privacy/legal/Trust Score/irreversible data shape in a way this preflight could not resolve from existing code (§11 records the judgment calls made, all within scope).

## 3. Implemented

### 3.1 `sort=relevance` is no longer a no-op alias of `recent` — genuine, deterministic text ranking

`infrastructure/persistence/drizzle-marketplace-listing.repository.ts`, `orderFor()`. When `criteria.text` (the `q` query param) is present and `sort=relevance` (the default), results are now ordered by:

```sql
ts_rank(
  to_tsvector('simple', title || ' ' || coalesce(description, '')),
  plainto_tsquery('simple', :q)
) desc, publishedAt desc nulls last, id asc
```

`ts_rank`/`to_tsvector`/`plainto_tsquery` are **native Postgres functions** — no extension, no external search engine, no AI/embedding call anywhere (IP-015 §4's explicit out-of-scope). The `simple` text-search configuration is used deliberately instead of `portuguese`: it performs no stemming/dictionary lookup, so it carries zero risk of behaving differently across environments with different installed language configurations, and it is guaranteed present in any standard Postgres install (including the disposable embedded instance this program's tests already use). Without `q`, `relevance` still falls back to the same `publishedAt desc nulls last` ordering it always used — this part of the behavior is unchanged, only now it is genuinely branch-conditional on whether there is text to rank, not a blanket alias.

**No hidden paid bias, by construction, not just by policy**: `marketplace_listings` has no `sponsored`/`boosted`/`isPaid`/any placement-related column — confirmed by reading `marketplace.schema.ts` in full (§2.3). Every branch of `orderFor()` (`price_asc`/`price_desc`/`trust_score`/`recent`/`relevance`) is a pure, deterministic function of columns already exposed in the search response itself (`price`, `trust_scores.score`, `publishedAt`, text-match strength) — there is no code path, anywhere in `orderFor()` or `search()`, that could rank one anunciante above another for a reason the Member cannot already see in the result row. This is the direct, code-level answer to the acceptance criterion "no hidden paid bias," documented here and in the function's own doc comment so a future change cannot silently reintroduce a paid-ranking field without this comment becoming visibly wrong.

Proven by a dedicated e2e assertion (§10.1): an **older** listing with a **stronger** text match (the query term repeated multiple times) is ranked **before** a **newer** listing with a **weaker** match (the term appearing once) — the exact scenario that would have failed under the pre-IP-015 "alias of recent" behavior, since the newer listing would have won purely on `publishedAt`.

### 3.2 Deterministic pagination — every sort branch ends in `id asc`

Same function, same file. Before this IP, `price_asc`/`price_desc`/`recent`/`relevance` had **no unique-column tiebreaker at all**, and `trust_score` had only a secondary (`publishedAt`, itself tie-prone). Under `LIMIT`/`OFFSET` pagination, any tie in the primary sort column (common at any real listing volume — many listings share a price, a publish timestamp, or an unset Trust Score) had no guaranteed stable order between two separate paginated queries, which is exactly the "pagination stable" acceptance criterion this IP was asked to satisfy. Every branch now ends in `id asc` as a final, always-unique deterministic tiebreaker. Proven by a dedicated e2e test (§10.1): three listings sharing the exact same price, paginated two-at-a-time across two calls, produce exactly the three distinct ids with no duplicate and no gap.

### 3.3 New filter: `availableDayOfWeek` — a read-only join against IP-005's availability windows

New optional field on `ListingSearchCriteria` (`domain/repositories/marketplace-listing.repository.ts`) and on `searchListingsQuerySchema` (`application/dto/marketplace.dtos.ts`, `z.coerce.number().int().min(0).max(6).optional()`). In `search()`, when set, an `EXISTS` subquery against `marketplace_partner_availability_windows` (IP-005, schema/table untouched — only imported for a read) restricts results to listings whose owner has declared availability on that day of week:

```sql
EXISTS (
  SELECT 1 FROM marketplace_partner_availability_windows w
  WHERE w.partner_id = marketplace_listings.owner_id
    AND w.day_of_week = :availableDayOfWeek
)
```

This reuses IP-005's own `idx_partner_availability_partner` index (`(partner_id, day_of_week)`) verbatim — **no new index was created for this filter**. This is deliberately an **opt-in search filter**, semantically distinct from IP-005's own scheduling rule: IP-005's `fitsAvailability()` treats "no windows declared" as "no restriction whatsoever" (a Partner who never declared availability can still be scheduled any time); this search filter treats "no windows declared for the requested day" as "excluded from the filtered result" — because a Member explicitly asking "show me who works Tuesdays" is asking for an affirmative match, not the absence of a restriction. Both behaviors are documented in-code (both in `ListingSearchCriteria.availableDayOfWeek`'s own doc comment and in `docs/openapi.yaml`) specifically so a future reader does not mistake one behavior for a bug against the other.

Zero new coordinate data anywhere in this path — `availableDayOfWeek` is a plain integer 0–6, the same privacy posture IP-003/IP-005 already established (coarse `locationLabel` text, no lat/lng). This filter does not touch location at all; it touches only weekly time preference.

### 3.4 "Price-model" filters — confirmed as already fully covered by `minPrice`/`maxPrice`/`currency`, not a new field

Per §2.5's finding: `pricingModel` (`FIXED_PRICE`/`HOURLY`) is a PACK-02 concept that exists only on `MarketplaceOffer`/`MarketplaceOrder` — never on `MarketplaceListing`, because a listing has no committed pricing model before a Member and Partner negotiate one. Introducing a `pricingModel` field on the search DTO would misrepresent the data model (implying every listing has already chosen `FIXED_PRICE` or `HOURLY`, which is false — a listing has, at most, a flat optional `price`). The pre-existing `minPrice`/`maxPrice`/`currency` filters on `marketplace_listings.price` are therefore the complete, honest answer to "price-model filters" at the point search operates (pre-negotiation) — documented here rather than silently left unexplained, per this program's "no assumption without evidence" rule.

### 3.5 Performance index: `trust_scores.identity_id`

Migration `0034_ip015_search_marketplace_retrieval.sql` (additive, `CREATE INDEX IF NOT EXISTS`) adds `idx_trust_score_identity` on `trust_scores.identity_id` — the join column used by every reputation-aware read in the Marketplace module (this IP's own `search()`, IP-003's `DiscoverServiceRequestMatchesUseCase`, IP-004's `CompareServiceRequestOffersUseCase` via `TrustScoreRepository.findScoreByIdentityId()`), which had **zero** index before this IP (§2.6). Declared additively in `trust-score.schema.ts` alongside the existing `idx_trust_score_passport` unique index — no Trust Score business logic touched, confirmed by `git diff` showing only the one new `index(...)` line inside the table's own index array.

No other new index was added. `location` remains free-text `ilike` with no trigram/prefix index — adding one would require the `pg_trgm` extension, new infrastructure with no evidence of necessity at the current MVP listing volume (the same proportionality judgment IP-004/IP-005 already made for their own read paths); documented as a deferred optimization, not a silent gap (§12).

## 4. Not implemented / out of scope

Per the IP-015 spec's explicit "Out of scope" (§4) and this program's non-negotiable constraints:

- **No Elasticsearch/vector database, no external search engine of any kind.** Every change in this IP is a parameterized SQL query against existing/native Postgres functionality (`ts_rank`/`to_tsvector`/`plainto_tsquery`, `EXISTS`, `ORDER BY`). No new npm dependency was added — confirmed by `git diff package.json`/`apps/api/package.json` being empty.
- **No semantic/AI search dependency.** Zero embedding/vector/LLM call anywhere in the diff.
- **No rebuild of `SearchListingsUseCase`/`DrizzleMarketplaceListingRepository.search()`.** Both are extended in place — confirmed the existing filter fields (`text`, `categoryId`, `listingType`, `minPrice`/`maxPrice`/`currency`, `location`, `allowedSellerLevels`) and the existing `firstImage` subquery/count-query shape are byte-for-byte unchanged.
- **No change to `DiscoverServiceRequestMatchesUseCase` (IP-003) or `CompareServiceRequestOffersUseCase` (IP-004).** Both benefit automatically from the repository-level fixes (deterministic pagination tiebreak in particular) because both already call the shared `search()` method — confirmed by re-running their own e2e specs unmodified (§10.3). No new `availableDayOfWeek`/relevance behavior was added to `DiscoverServiceRequestMatchesUseCase` itself: it explicitly requests `sort: 'trust_score'` and no `text`, so this IP's relevance change does not alter its behavior, and adding an availability filter to Partner *matching* (as opposed to Member *browsing*) would be a new product decision about `ServiceRequest` discovery semantics, not named in this IP's scope, and would touch a file this IP does not own (§16 flags this for reviewer re-judgment as a possible, but not assumed, future extension).
- **No geometric radius/geocoding for `location`/`radiusKm`.** Same conservative conclusion IP-003 and IP-005 both already reached, independently re-confirmed here for the third time: no pre-engagement, matchable Partner location profile exists anywhere in the repository (only post-hoc execution-event GPS, PACK-03, and now IP-005's own weekly *time* preference — never a *place* one). Building one is materially larger than "minimum safe design" and remains an undecided product feature, not something this IP invents as a side effect of touching the search path.
- **No new event, no new consumer.** This IP performs zero writes anywhere — every change is either a read-path query change or an additive index. `docs/event-catalog.md` is unchanged (confirmed: `git diff docs/event-catalog.md` is empty), following the exact same reasoning IP-004 documented for its own pure-read comparison endpoint (Shared Standards §3: "do not create events for trivial persistence" — inapplicable here since there is no persistence at all).
- **No frontend work.** Consistent with IP-003/004/005's own precedent; confirmed by grep (`grep -rln "marketplace/listings?" apps/web/app apps/web/lib`) that no `apps/web` page calls the search endpoint with query parameters yet — there is no existing UI surface this IP's new query param needed to wire into.
- **No change to `apps/api/src/modules/payment/**`/`privacy/**`/`notification/**`/`analytics/**`.** Confirmed zero files touched in any of those directories.
- **No trigram/`pg_trgm` text index for `location`.** See §3.5 — deferred as a documented, evidence-based simplification, not silently decided as permanent.

## 5. Files changed

**New files (3)**:
```
apps/api/drizzle/0034_ip015_search_marketplace_retrieval.sql                                          26
apps/api/src/modules/marketplace/application/usecases/search-listings.usecase.spec.ts                105
apps/api/test/integration/ip-015-search-marketplace-retrieval.e2e.spec.ts                             227
```
358 lines total.

**Modified files** (`git diff --stat`):
```
CLAUDE.md                                                                                         |  68 +++
apps/api/drizzle/meta/_journal.json                                                              |   7 +
apps/api/src/modules/marketplace/application/dto/marketplace.dtos.ts                              |   2 +
apps/api/src/modules/marketplace/application/usecases/search-listings.usecase.ts                  |   2 +
apps/api/src/modules/marketplace/domain/repositories/marketplace-listing.repository.ts             |   9 +
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-listing.repository.ts | 87 ++++--
apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts                  |   9 +-
docs/openapi.yaml                                                                                   |  14 +
```
8 files changed, 187 insertions(+), 11 deletions(-). Every "deletion" line is a like-for-like replacement inside `orderFor()` (the old single-line switch branches, replaced by the new documented branches with tiebreakers) — no existing filter/query behavior was removed.

Zero files under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` were touched. Zero files owned by IP-003/004/005 (`service-request.ts`, `discover-service-request-matches.usecase.ts`, `compare-service-request-offers.usecase.ts`, `partner-availability.ts`/`.schema.ts`, `order-travel-status.ts`, `manage-order.usecase.ts`) were touched. The incidental `apps/web/tsconfig.tsbuildinfo` build-cache regeneration (from `pnpm -r build`) was reverted with `git checkout --`, following IP-003/004/005's own precedent.

## 6. Migrations / configuration

- **Migration**: `apps/api/drizzle/0034_ip015_search_marketplace_retrieval.sql` — additive, single statement: `CREATE INDEX IF NOT EXISTS "idx_trust_score_identity" ON "trust_scores" ("identity_id")`. No table/column added or removed, no data touched. Not applied to any shared/prod environment — exercised only against the disposable embedded Postgres (`pnpm test:e2e`) and the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.
- **Journal**: `apps/api/drizzle/meta/_journal.json` — new entry, idx 34, tag `0034_ip015_search_marketplace_retrieval`, following the exact same shape as entries 30–33. Checked the highest existing index first (33, IP-005's) before numbering.
- No `.env`/config schema changes — no new runtime configuration surface was needed (no external search provider, no new environment variable).

## 7. APIs / events / jobs

**No new route.** One existing route extended with one new optional query parameter:

| Method | Path | Change |
|---|---|---|
| GET | `/marketplace/listings` | New optional `availableDayOfWeek` (0–6) query param (§3.3); `sort=relevance` behavior changed when `q` is present (§3.1) — same route, same response shape, backward-compatible (no param is required, no existing field removed/renamed). |

Documented in `docs/openapi.yaml` (validated with a direct `js-yaml` load after the edit — 110 paths, 125 unique `operationId`s, both unchanged from IP-005's ending count, since this IP adds no new path/operationId, only a query parameter and an expanded description on the existing `searchMarketplaceListings` operation).

**No new event.** This IP performs zero writes (§4). `docs/event-catalog.md` is unchanged (confirmed: `git diff docs/event-catalog.md` is empty).

**No new consumer/job.**

## 8. Security / authorization / privacy

- **No authorization change.** `GET /marketplace/listings` remains `@Public()` (`security: []` in `docs/openapi.yaml`, unchanged) — the same "anyone, including an anonymous visitor, can browse published listings" posture MRK-004 already established. Nothing in this IP changes who can call the endpoint or what they can see per result row (no new field was added to `ListingSummaryResponse`).
- **Privacy (LGPD / Shared Standards §7 "do not expose precise location beyond product need")**: this IP introduces **zero** new coordinate data anywhere. `availableDayOfWeek` is a plain integer 0–6 (a day-of-week preference, already public via IP-005's own `GET /marketplace/partner-availability/mine`, joined here only to filter, never to expose a new field in the search response). `location` remains exactly the same coarse free-text `ilike` filter MRK-004 already had — no new precision, no new query path toward geometry. Confirmed by reading every changed file end to end: no `latitude`/`longitude`/geocoding call anywhere in the diff.
- **No new PII exposed.** The search response shape (`ListingSummaryResponse`) is unchanged — no new field was added to it; `availableDayOfWeek` only narrows which rows are returned, it does not add a new field to any returned row.
- **No audit entry added.** Consistent with the existing convention: `SearchListingsUseCase` never audited before this IP (it is a public, read-only, anonymous-accessible operation) and still does not — adding audit logging to an anonymous public search would be a new, undecided product/observability decision, not a natural extension of this IP's own scope.

## 9. Data / financial invariants

- **No money is created, mutated, or computed by this IP.** `minPrice`/`maxPrice`/`currency` filtering is unchanged; no arithmetic on any money field was added anywhere in the diff (confirmed by reading `drizzle-marketplace-listing.repository.ts`'s `search()`/`orderFor()` end to end — the only numeric computation added is `ts_rank(...)`, a pure text-relevance score, never persisted, never a money value).
- **No new state machine, no new transition, no write of any kind.** `search()` was, and remains, a pure `SELECT` — confirmed by reading the full diff: every change is inside the `WHERE`/`ORDER BY` clause construction or the new `EXISTS` subquery; `INSERT`/`UPDATE`/`DELETE` do not appear anywhere in the diff.
- **Idempotency**: trivially satisfied — a pure `GET` with no side effect produces the same result for the same underlying data on every call, and is now **more** deterministic than before this IP (§3.2), not less.
- Existing PACK-00..03/IP-001..005/007/013/020/021 invariants are all regression-tested green by the full suite (§10) — none of the files that encode those invariants were touched by this IP.

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `19a0be6`, in this environment. No shared/production database was touched — all DB-dependent tests ran against the embedded, disposable, locally-started Postgres (`embedded-postgres`) or the ephemeral `TEST_DATABASE_URL`.

### 10.1 New tests written (this IP): 5 unit tests in 1 new spec file + 3 e2e tests in 1 new spec file

- `search-listings.usecase.spec.ts` — 5 unit tests: `availableDayOfWeek` is passed through to the repository unmodified; an absent `availableDayOfWeek` becomes `undefined` (no restriction); an unknown category short-circuits to an empty page without calling `search()`; an unknown `minimumTrustLevel` short-circuits to an empty page without calling `search()`; `sort` is passed through verbatim — the use case never decides ranking itself.
- `ip-015-search-marketplace-retrieval.e2e.spec.ts` — 3 e2e tests against a real Postgres instance: (1) `availableDayOfWeek` excludes a Partner with no declared window for that day while including one who declared it, and an unmatched day returns zero results — proving the filter is genuinely opt-in-exclusionary, distinct from IP-005's own "no restriction when undeclared" scheduling rule; (2) an **older, stronger text match** ranks **before** a **newer, weaker text match** under the default `relevance` sort — the concrete scenario that would have failed under the pre-IP-015 "alias of recent" behavior — plus a determinism check (two identical calls return the exact same order); (3) three listings sharing the identical price, paginated two-at-a-time across two separate calls (`sort=price_asc`), produce exactly the three distinct ids with zero duplicates and zero gaps.

### 10.2 Unit/domain suite (`npx vitest run`, no `TEST_DATABASE_URL` — integration/e2e specs skip via `describe.runIf`)

Run from `apps/api`, after implementation:
```
Test Files  62 passed | 30 skipped (92)
     Tests  504 passed | 129 skipped (633)
Duration    94.44s
```
Before this IP (IP-005's own reported final unit-only state, independently reconfirmed in this agent's own preflight run, §2.9): 61 passed/29 skipped (90 files), 499 passed/126 skipped (625 tests). Delta: **+1 file/+5 tests** in the always-run unit suite (this IP's one new unit spec file, 5 tests), **+1 file/+3 tests** in the skipped-without-DB e2e count (the new `ip-015-*.e2e.spec.ts`, 3 test cases). All pre-existing tests unchanged and green — zero regressions.

### 10.3 Targeted e2e verification (regression of the reused search path + this IP's own file)

Run individually, immediately after implementation, before the full-suite run:
- `test/integration/ip-015-search-marketplace-retrieval.e2e.spec.ts` (this IP's own new file): **3/3 passed, 3512ms**.
- `test/integration/mrk-001-008.e2e.spec.ts` (the pre-existing MRK-001..008 suite, the file most likely to regress from any change to `search()`/`orderFor()`): **4/4 passed, 15836ms** — confirms the pre-existing search assertions (category/type/sort=trust_score filter combination, `minimumTrustLevel` exclusion, draft-listing exclusion) are unaffected.
- `test/integration/ip-003-service-request-discovery-matching.e2e.spec.ts` (IP-003, calls the same `search()` method for Partner matching): **4/4 passed, 33403ms** — confirms the repository-level changes (new `EXISTS` branch, new `orderFor()` tiebreakers) do not regress `DiscoverServiceRequestMatchesUseCase`, which this IP never touched directly.
- `test/integration/ip-004-competitive-quotes-comparison.e2e.spec.ts` (IP-004): **1/1 passed, 16993ms** — confirms no regression in the comparison read model (which does not call `search()` at all, but shares the Marketplace module wiring).
- `test/integration/ip-005-scheduling-availability-location-eta.e2e.spec.ts` (IP-005, owns `marketplace_partner_availability_windows`, the table this IP's new filter reads from): **5/5 passed, 29125ms** — confirms this IP's read-only `EXISTS` join does not affect IP-005's own availability-declaration/scheduling-enforcement behavior.

### 10.4 Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

Full run, all 92 files (90 pre-existing + this IP's 2 new ones — 1 unit spec file, already counted in §10.2, plus 1 e2e spec):
```
Test Files  1 failed | 91 passed (92)
     Tests  1 failed | 632 passed (633)
```
The one failure was `ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO, não do remetente"), a file this IP never touches (confirmed: not present in `git status --short`). This is the **exact same test, exact same failure signature**, already independently documented as a known flake in `IP-002-COMPLETION-REPORT.md` §10.5 and reproduced again, transiently, by `IP-003-COMPLETION-REPORT.md` §10.3, `IP-004-COMPLETION-REPORT.md` §10.3, and `IP-005-COMPLETION-REPORT.md` §10.4's own full-suite runs — a sixth independent occurrence of the same environment-timing-sensitive test (WAL checkpoint stall under embedded Postgres), not a new defect. With exactly one failure reported and it being `ip-002-i18n.e2e.spec.ts`, this IP's own `ip-015-search-marketplace-retrieval.e2e.spec.ts` and the four regression-targeted files (`mrk-001-008.e2e.spec.ts`, `ip-003-service-request-discovery-matching.e2e.spec.ts`, `ip-004-competitive-quotes-comparison.e2e.spec.ts`, `ip-005-scheduling-availability-location-eta.e2e.spec.ts`) necessarily passed within this run — independently corroborated by their own standalone runs immediately beforehand (§10.3), all clean.

Re-ran the one failed file in isolation, immediately afterward, against a freshly started embedded Postgres instance:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
Duration    23.08s
```
Clean on the first retry, no code change in between — confirming transient host/checkpoint contention, not a regression, exactly matching the "flakes once on an unrelated file, passes clean in isolation with zero code change" signature every prior Wave 2/3 IP's own full-suite run has already established on this exact environment.

Before this IP (IP-005's own reported final full-suite state): 90/90 files, 625/625 tests. Delta: **+2 files/+8 tests** (1 new unit spec file + 5 tests, 1 new e2e spec file + 3 tests) — exactly this IP's own new test files, no other file's test count changed. **Combined: 92/92 files, 633/633 tests, 0 reproducible failures caused by this IP's diff.**

### 10.5 Typecheck / lint / build (repo root)

```
pnpm typecheck   → apps/api: Done · apps/web: Done (0 errors)
pnpm lint        → eslint . → 0 errors (after fixing 1 @typescript-eslint/no-unnecessary-type-assertion in the new unit spec, caught by the first lint run and fixed before the final run)
pnpm -r build    → apps/api: tsc -p tsconfig.build.json → Done
                   apps/web: next build → 27 routes, all ✓ (unchanged from IP-005 — zero apps/web files touched by this IP)
```

## 11. Deviations / decisions

1. **`ts_rank`/`to_tsvector`/`plainto_tsquery` with the `simple` text-search configuration, not `portuguese`** (§3.1) — chosen deliberately over the language-aware config to avoid any risk of the ranking behaving differently across environments with different installed Postgres language dictionaries, and because the spec's own out-of-scope list explicitly forbids anything resembling a semantic/NLP search layer; `simple` performs pure token matching with no stemming, staying unambiguously inside "native SQL query," not "language understanding." Flagged for reviewer re-judgment (§16) in case a future product decision wants `portuguese` stemming (e.g. matching "elétrica" against "eletricista") — that would be a genuine ranking-quality improvement but is a separate, explicit product/i18n decision, not assumed here.
2. **`availableDayOfWeek` is exclusionary (opt-in filter), not permissive like IP-005's own scheduling rule** (§3.3) — the two behaviors look superficially inconsistent (same underlying data, opposite defaults) but serve different intents: scheduling asks "is there a reason to block this?" (no declared windows = no reason = allowed), while this search filter asks "does this Partner match what the Member is looking for?" (no declared windows = no evidence of a match = excluded). Documented explicitly in three places (domain comment, OpenAPI description, this report) specifically so this is never mistaken for an inconsistency to "fix" later.
3. **`trust_scores.identity_id` index added via a file outside this IP's primary domain** (§2.8, §3.5) — the single largest ownership judgment call in this IP. Justified narrowly: it is an index-only change (zero Trust Score business logic touched), directly required by this IP's own explicit "performance indexes" acceptance criterion, and on a column this IP's own query (`search()`) already joins against. Not a rebuild or reinterpretation of any Trust Score rule. Flagged for reviewer re-judgment (§16) as the one place this IP crossed a domain boundary, even minimally.
4. **No `pg_trgm`/trigram index for `location`** (§3.5, §4) — judged disproportionate to introduce a new Postgres extension for a free-text filter at current MVP listing volume, matching the same proportionality judgment IP-004/IP-005 already made for their own read paths (no bulk-lookup optimization, no caching). Documented as deferred, not silently permanent.
5. **`DiscoverServiceRequestMatchesUseCase` (IP-003) was not extended with `availableDayOfWeek`** (§4) — a Partner-matching-by-availability feature is plausible future value, but adding it would mean deciding new `ServiceRequest` discovery semantics (should a Partner with no declared availability be excluded from matches, the same opt-in-exclusionary choice made for browsing? or should matching keep IP-003's own "declared windows are informational only" posture?) and editing a file this IP does not own. Left as a reviewer-flagged possible follow-up (§16), not assumed or silently added.

## 12. Known issues / technical debt

- **No trigram/prefix index for `location`** (§3.5) — `ilike '%term%'` on `marketplace_listings.location` cannot use a plain btree index; acceptable at current MVP volume, flagged if listing count grows materially.
- **`ts_rank` is computed at query time, not via a stored `tsvector` column/generated index** — for the current small listing volume this is fine (confirmed no query-plan concern was observed in any test run, §10); if listing volume grows enough to matter, a `GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || coalesce(description,''))) STORED` column with a matching GIN index would let the planner use an index for the ranking expression — deliberately not built now, since it would need to track the search plan and generated-column feature availability across this program's target Postgres versions, and there is no evidence yet that current volume needs it.
- **No availability-aware matching in `DiscoverServiceRequestMatchesUseCase`** (§11.5) — carried forward as a possible, explicitly-flagged future extension, not a silent gap.
- Carries forward IP-003/IP-005's own already-documented gap that this IP does not close: no geometric radius/location matching (`location`/`ServiceRequest.locationLabel` stay free text).

## 13. External blockers

None. No new external provider, no production/shared environment action required or taken. No migration was applied anywhere but the disposable local/CI test databases.

## 14. Acceptance criteria matrix

| Criterion (IP-015 spec §6) | Status | Evidence |
|---|---|---|
| Relevant filters work | PASS | Pre-existing filters (category, type, price range, currency, location text, minimum trust level) reused verbatim and regression-tested (§10.3); new `availableDayOfWeek` filter added and e2e-tested (§10.1/§3.3). "Price-model" filters confirmed already fully covered by `minPrice`/`maxPrice`/`currency` — no listing-side pricing-model field exists to filter by (§3.4). |
| Pagination stable | PASS | Every `orderFor()` branch now ends in `id asc`; proven by a dedicated e2e test with tied prices across two paginated calls producing zero duplicates/gaps (§3.2, §10.1). |
| Privacy-safe geo queries | PASS | Zero new coordinate data anywhere in the diff; `location` stays coarse free-text; `availableDayOfWeek` is a day-of-week integer, not a location (§8). |
| Performance indexes | PASS | `idx_trust_score_identity` added for the previously-unindexed reputation join column used by search/IP-003/IP-004 (§3.5); existing search-hot-path indexes (`idx_marketplace_listing_search`, price/status/category/type) confirmed already adequate; `availableDayOfWeek` reuses IP-005's own index, no new index needed for it. |
| Deterministic ranking documented | PASS | Every `orderFor()` branch documented in-code (§3.1) with an explicit "no hidden paid bias" argument grounded in the schema's own column set; this report documents it again in full (§3.1, §11.1). |
| No hidden paid bias | PASS | No sponsored/boosted/paid column exists anywhere in `marketplace_listings`; every ranking branch is a pure function of already-visible columns (§3.1). |

## 15. Commits

**Not committed** — git identity (`user.name`/`user.email`) is unset in this environment, and this agent was explicitly instructed not to configure it. All of this IP's changes are left **uncommitted** in the working tree, as instructed.

## 16. Recommended reviewer focus

1. **§2.8/§3.5/§11.3 — the `trust_scores.identity_id` index, added via a file outside this IP's primary Marketplace/Search domain.** Independently verify this is genuinely index-only (no Trust Score business logic touched — `git diff apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts` should show exactly one new `index(...)` line inside the existing table's index array) and that it is directly justified by this IP's own "performance indexes" acceptance criterion rather than being scope creep into another module.
2. **§3.1/§11.1 — the `simple` vs. `portuguese` text-search configuration choice.** Confirm this is the right conservative default given the explicit "no semantic/AI search" constraint, or re-judge whether a future IP should upgrade to language-aware stemming as its own explicit product decision.
3. **§3.3/§11.2 — the `availableDayOfWeek` filter's opt-in-exclusionary semantics vs. IP-005's own permissive scheduling default.** Confirm the reasoning that these are two different questions (blocking vs. matching) rather than an inconsistency, and that both are clearly documented (domain comment, OpenAPI, this report) so a future reader does not "fix" one to match the other without understanding why they differ.
4. **§4/§11.5 — `DiscoverServiceRequestMatchesUseCase` was deliberately not extended with the new availability filter.** Re-judge whether Partner-availability-aware matching for `ServiceRequest` discovery is valuable enough to warrant its own follow-up IP/change request, given that the read-side plumbing (IP-005's table, this IP's `EXISTS` pattern) already exists and the remaining work would be small — but is a `ServiceRequest`-discovery-semantics decision this IP correctly declined to make unilaterally.
5. **§10.4 — the full e2e suite result**, specifically whether this IP's own new file and the four regression-targeted files (`mrk-001-008`, `ip-003`, `ip-004`, `ip-005`) are among any reported failure, versus an unrelated flake consistent with every prior Wave 2/3 IP's own documented experience of this exact test environment.
