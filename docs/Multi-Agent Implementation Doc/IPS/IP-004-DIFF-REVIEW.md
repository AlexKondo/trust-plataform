# IP-004 — Diff Review

**Competitive Quotes & Comparison Map**
Independent Quality/Diff Agent. Executed 2026-09-16 against baseline SHA `57fa27e` (`main`). Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §3 > IP-004 spec > `IP-004-COMPLETION-REPORT.md` (verified, not trusted) > `IP-003-COMPLETION-REPORT.md` (for the ServiceRequest/engagement model this builds on) > real code/tests at the frozen baseline.

This review re-derived every material claim in the Completion Report from the actual repository and a from-scratch test run. No claim below is accepted on the strength of the report's own prose alone.

## 1. Scope and footprint — independently confirmed

`git status --short` / `git diff --stat` from a clean working tree at `57fa27e` show exactly:

**New (untracked)**: `compare-service-request-offers.usecase.ts`, `compare-service-request-offers.usecase.spec.ts`, `test/integration/ip-004-competitive-quotes-comparison.e2e.spec.ts`.

**Modified**: `CLAUDE.md` (+34), `service-request.dtos.ts` (+64), `service-request.mapper.ts` (+65), `marketplace-service-request.controller.ts` (+17), `marketplace.module.ts` (+2), `docs/openapi.yaml` (+30). All six diffs were read in full — every change is a pure addition (new interfaces, new mapper functions, one new controller method wired to a new provider, one new documented route). No existing function body, DTO field, or route behavior was altered.

`docs/event-catalog.md` diff is empty — confirmed no new event. No migration file, no `apps/web` file, no file under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, or `identity/**` appears anywhere in the diff. This matches the report's claimed footprint exactly, including the +1 `docs/openapi.yaml` path (verified independently below).

## 2. Cardinality claim (§2.3 of the report) — CONFIRMED TRUE

Read directly, not from the report's prose:

- `apps/api/src/modules/marketplace/domain/entities/service-request.ts`, `markMatched()`: transitions `OPEN -> MATCHED` only on the first call; on a subsequent call with status already `MATCHED` it is a silent no-op (falls through the `else if` guard, which only throws if status is neither `OPEN` nor `MATCHED`). This is genuinely idempotent by design, not accidental.
- `apps/api/src/modules/marketplace/infrastructure/persistence/service-request.schema.ts`: `serviceRequestEngagements` has `uniqueIndex('idx_service_request_engagement_unique').on(table.serviceRequestId, table.listingId)` — one row per **(request, Partner)** pair, not one row per request. A second `listingId` for the same request inserts a second, independent row.
- `apps/api/src/modules/marketplace/application/usecases/engage-service-request.usecase.ts`: calls `ContactListingOwnerUseCase.execute()` unconditionally on every call, for any `listingId` the Member supplies, with no check that a prior engagement exists for a different Partner. This file is unmodified by IP-004 (absent from `git diff --stat`).
- `git diff --stat` confirms zero lines changed in `service-request.ts`, `service-request.schema.ts`, or `engage-service-request.usecase.ts`.

**Verdict**: the report's central factual claim is correct. `ServiceRequest` already supported N independent Partner engagements before IP-004, built into IP-003's own design. IP-004 needed no changes to any IP-003-owned file, and made none.

## 3. Comparison endpoint (`GET /marketplace/service-requests/{id}/offers`) — CONFIRMED

Read `compare-service-request-offers.usecase.ts` in full.

- **Authorization**: `if (!request || !request.isOwnedBy(memberId)) throw new ServiceRequestNotFoundException()` — 404 for a non-owner, identical posture to `GetServiceRequestUseCase`/`DiscoverServiceRequestMatchesUseCase` (IP-003). Controller route has no `@Public()` decorator.
- **No write-path modification**: `buildComparisonItem()` calls only `findById` (listing), `findById` (conversation), `findByConversation` (offers), `findScoreByIdentityId` (Trust Score) — all read methods on repositories whose write paths (`save`, `saveEngagement`, `markMatchedIfOpen`, offer `accept`/`counter`/`reject`) are never imported or called anywhere in this file.
- **`hasOffer: false` modeling**: `toOfferComparisonItem()` sets `hasOffer: current !== null` where `current` is the last element of the (possibly empty) offer chain — an engaged-but-unquoted Partner correctly produces `hasOffer: false, offer: null`, verified by both a unit test and the e2e test's initial (pre-quote) assertion.
- **FIXED_PRICE/HOURLY never converted**: `toOfferComparisonTerms()` in `service-request.mapper.ts` returns `offer.amount` verbatim — no arithmetic performed on it anywhere in either new file. Cross-checked `hourly-pricing.service.ts`'s `calculateInitialHourlyAmount(hourlyRateAmount, minimumMinutes)`, which is exactly the "already-derived minimum committed total" that `create-offer.usecase.ts` writes into `offer.amount` at creation time (never a free client-supplied value for `HOURLY`). `estimatedTotalBasis` is a pure label (`offer.pricingModel === PRICING_MODEL.HOURLY ? 'HOURLY_MINIMUM_COMMITMENT' : 'FIXED_TOTAL'`) computed from the persisted `pricingModel`, not a converted amount. The e2e test proves this with real numbers: `FIXED_PRICE` amount `2400` vs. `HOURLY` amount `480` (`120.00/h × 240min`), both literal, both distinct, asserted `not.toBe()` each other.
- **Ordering**: `execute()` maps `engagements` (from `listEngagements()`, itself ordered by `engagedAt` per IP-003) directly into `items` with no `.sort()` anywhere in the file. A dedicated unit test and the e2e test both assert `engagedAt` ordering is preserved regardless of price/score. No ranking/scoring code exists in the diff.

**Verdict**: every specific sub-claim in this area is independently verified against the actual code and against passing tests that exercise real values, not just type shapes.

## 4. Same-negotiation-only closure (§11.2 of the report) — CONFIRMED AS DESCRIBED, product ambiguity genuinely open

Read `accept-offer.usecase.ts` in full (unmodified by IP-004 — absent from `git diff --stat`). Confirmed: `findPendingByConversation(offer.conversationId)` scopes the "close competing offers" step (MRK-013 BR-004) strictly to the **accepted offer's own conversation**. A different Partner's `MarketplaceOffer`, living in a different `MarketplaceConversation` for the same `ServiceRequest`, is never queried, never touched, and remains `PENDING`. This is proven with a real, executed assertion, not just static reading: the e2e test accepts the `FIXED_PRICE` offer and then re-queries the comparison endpoint, asserting `finalHourly.offer!.status === 'PENDING'` while `finalFixed.offer!.status === 'ACCEPTED'`.

**My own judgment on whether this satisfies "losing offers close consistently" (IP-004 spec §6)**: this is a genuine, unresolved product ambiguity, not a clear-cut compliance pass. Two readings are both defensible:
1. *As implemented*: "losing offers" means the superseded rounds within the negotiation that produced the winner (MRK-013 BR-004's existing scope) — a Member competitively soliciting Partner A, B, and C is not obligated to notify B and C the instant they pick A; they may still be evaluating.
2. *A reasonable alternative product reading*: once a Member commits to a Partner for a `ServiceRequest` (a Change Order/Order now exists), the other Partners' offers for that same need are, by definition, "lost" — leaving them `PENDING` indefinitely is confusing (Partner B has no signal the opportunity is gone) and arguably fails the acceptance criterion's plain English.

The implementing agent chose reading (1), and did so for a defensible reason: the mandate's own wording said to preserve MRK-013's existing accept-pivot mechanism, and inventing a new cross-Partner auto-close rule would itself be new financial/business-rule surface — exactly the class of decision `00_READ_FIRST` §5.2 says should stop and escalate ("if a missing decision can change money... user rights... STOP and escalate") rather than being resolved unilaterally in either direction. Not escalating as a blocking Conflict Escalation, but instead implementing the conservative default (preserve existing behavior, expose it transparently, flag it prominently — §11.2, §16 of the report) is a reasonable way to handle this, but it is not free of risk: a stakeholder could reasonably read the acceptance criterion as failed. **This is a real, product-level gap — not a bug — and should be tracked as a required product decision before this feature's release-readiness gate (IP-024), not silently closed as satisfied.**

## 5. N+1 query pattern (§12 of the report) — CONFIRMED, acceptable at MVP scale

`buildComparisonItem()` issues one `findById` (listing), one `findById` (conversation), one `findByConversation` (offers), and one `findScoreByIdentityId` (Trust Score) **per engagement**, run in parallel within an engagement via `Promise.all`, but not batched *across* engagements — genuinely N+1-shaped (4 queries × N engagements, not 4 queries total). No bulk/`findByIds`-style method exists on any of the three repositories today (confirmed: `marketplace-listing.repository.ts`, `marketplace-offer.repository.ts`, `drizzle-trust-score.repository.ts` expose only single-key lookups).

**Judgment**: acceptable as an MVP tradeoff. Engagement count per `ServiceRequest` is bounded by IP-003's own one-Partner-at-a-time, Member-initiated `engage()` flow — there is no bulk-engage or broadcast path, so realistic N is small (single digits). Classified MINOR, not MAJOR — worth batching if a future IP introduces bulk engagement or if telemetry later shows otherwise, not a merge blocker today.

## 6. No audit log on this read (§8 of the report) — CONFIRMED consistent with convention

Grepped `AuditLogService`/`auditLogService` usage in `get-service-request.usecase.ts` and `discover-service-request-matches.usecase.ts` (IP-003's own read-only use cases): zero matches in either file. `compare-service-request-offers.usecase.ts` likewise never imports `AuditLogService`. This is a consistent convention across the module's read paths, not a defect introduced by IP-004. The report's own §16.5 flags a reasonable secondary concern (competitor-pricing scraping via repeated impersonation) worth a second opinion — noted as an OBSERVATION below, not a finding against this IP, since no such threat model was in scope for any prior read-only route either.

## 7. Test re-run — independently executed from scratch, all numbers reproduced

All commands run fresh, from the working tree at `57fa27e` plus this IP's uncommitted diff, no shared/prod Supabase touched (embedded disposable Postgres / ephemeral `TEST_DATABASE_URL` only):

| Command | Result | Matches report |
|---|---|---|
| `pnpm typecheck` | `apps/api: Done`, `apps/web: Done`, 0 errors | Yes |
| `pnpm lint` | 0 errors | Yes |
| `pnpm -r build` | `apps/api` tsc build Done; `apps/web` `next build` 27 routes, all ✓ | Yes |
| `npx vitest run` (apps/api, unit, no DB) | **58 passed / 28 skipped (86 files); 478 passed / 121 skipped (599 tests)** | Exact match |
| `node test/e2e-local.mjs --no-file-parallelism` (full suite, embedded Postgres) | **1 failed / 85 passed (86 files); 1 failed / 598 passed (599 tests); 684.70s** | Exact match (report: 688.83s) |
| Isolated re-run of the one failed file | `ip-002-i18n.e2e.spec.ts` — **7/7 passed, 21.66s** | Matches report's isolated retry (23.35s) |

The one full-suite failure was `ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO"), `Error: Score não chegou a 25` — the exact same test, exact same error message, the report claims. The embedded Postgres log for this run independently shows a 226.5s WAL checkpoint during the failure window, consistent with the report's own root-cause account (a long checkpoint starving the timing-sensitive poll). This file has zero relationship to IP-004's diff (not touched, not related to Marketplace/ServiceRequest). Re-run in isolation immediately after: clean, 7/7, no code change — confirms transient host/checkpoint contention, not a regression, consistent with this same test's documented flake history across IP-002/003/007/020's own reports.

**IP-004's own new test**: `ip-004-competitive-quotes-comparison.e2e.spec.ts` passed clean both in the full-suite run (16906ms) and in a separate standalone confirmation — 1/1, no flake observed.

**Combined result**: 86/86 files, 599/599 tests, 0 reproducible failures — independently reproduced, not merely re-asserted from the report.

## 8. Additional independent checks

- `docs/openapi.yaml`: counted 104 top-level path keys (`grep -c "^  /"`) — up from the pre-IP-004 103, exactly +1, matching the one new `operationId: compareServiceRequestOffers`. The new route's YAML block was read in full — accurate description, correct `404`/`200` responses, no `@Public()` claim anywhere.
- `apps/web/tsconfig.tsbuildinfo` regenerated incidentally by `pnpm -r build` during this review's own re-run; reverted with `git checkout --`, not left in the diff (same incidental artifact the report itself flags and reverts).
- `HEAD` at review time: `57fa27e`, matching the report's declared start SHA — confirmed via `git rev-parse HEAD`.
- Repository message convention: all new domain-facing comments are in Portuguese (matching repo convention); exception/DTO field names remain English — no user-facing string hardcoded in domain logic, consistent with Shared Standards §8.

## 9. Findings

| # | Finding | Severity |
|---|---|---|
| 1 | Cross-Partner offer closing on acceptance is left unresolved as a genuine product ambiguity. Current behavior (only same-negotiation closure, per MRK-013 BR-004, unchanged) is a defensible reading of "losing offers close consistently" but not the only one; a reasonable stakeholder could read the acceptance criterion as unmet. Correctly flagged by the implementing agent rather than silently decided either way, and not blocking given the explicit mandate to preserve MRK-013's mechanism untouched — but it is a real open product decision, not merely documentation. | MAJOR (non-blocking; requires an explicit product decision before IP-024 release-readiness gate) |
| 2 | N+1-shaped repository calls per engagement (4 queries × N engagements, parallelized within an engagement but not batched across engagements). No bulk-lookup method exists on any of the three repositories involved. Acceptable at IP-003's realistic engagement-count scale (one-Partner-at-a-time, Member-initiated, no bulk/broadcast engage path). | MINOR |
| 3 | No audit log entry on this read. Confirmed consistent with the existing convention (`GetServiceRequestUseCase`/`DiscoverServiceRequestMatchesUseCase` also do not audit reads) — not a regression or inconsistency introduced by this IP. The report's own suggestion (competitor-pricing-scraping detection via repeated impersonation) is a reasonable idea for a future dedicated abuse-detection IP, not a gap specific to this one. | OBSERVATION |
| 4 | No pagination on the comparison endpoint. Judged proportionate today given the bounded, one-at-a-time engagement flow; would need revisiting if a future IP adds bulk/broadcast engagement. | OBSERVATION |

No CRITICAL or BLOCKING finding. No security, authorization, money-computation, or data-integrity defect found anywhere in the diff — every write-path, money-derivation, and authorization claim in the report was independently re-derived from the actual code and, where testable, from an executed test asserting real values.

## 10. Verdict

**APPROVED WITH ONE FLAGGED FOLLOW-UP** — see `IP-004-QUALITY-GATE.md` for the formal gate decision. Finding #1 (cross-Partner closure ambiguity) does not block this IP's merge — the implementation is internally consistent, tested, and does not silently misrepresent its own behavior — but it must be tracked as an open product decision and resolved (one way or the other, with an explicit product decision recorded) before the platform's IP-024 Release Readiness Gate, since it directly bears on one of IP-004's five acceptance criteria.
