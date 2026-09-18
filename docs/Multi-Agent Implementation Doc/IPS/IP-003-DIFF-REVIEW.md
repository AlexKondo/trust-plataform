# IP-003 — Diff Review

**Reviewer:** independent Quality/Diff Agent (per `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §3). Executed 2026-09-15, independently of the Executor agent's reasoning, against the uncommitted working tree on top of `main`@`3b6ef0c`. Every substantive claim in `IP-003-COMPLETION-REPORT.md` was re-derived directly: `git status`/`git diff` run fresh, every new production file read in full, every modified file's diff read hunk-by-hunk, four independent test passes executed from scratch (typecheck, lint, build, unit, and two separate full/isolated e2e runs), and a repo-wide grep for latitude/longitude/geo data run independently rather than trusting the report's "no Partner coordinate data exists" assertion.

## A. Executive verdict

**APPROVED WITH CORRECTIONS**

The overwhelming majority of the Completion Report's claims were independently reproduced and confirmed accurate: the exact 19-new/8-modified file footprint, zero touch of `payment/**`/`identity/**`/`apps/web/**`, the genuine reuse-with-zero-modification of `ContactListingOwnerUseCase` and `MarketplaceListingRepository.search()` (both confirmed via empty `git diff`), the consistent 404-never-403 ownership posture across all five owner-gated use cases, the genuine DB-level CAS in `markMatchedIfOpen`, the derived-never-persisted `EXPIRED` status matching `MarketplaceOffer.effectiveStatus()`'s exact idiom, the migration's Unicode-arrow fix (confirmed clean repo-wide), and all typecheck/lint/build/unit test numbers (exact match: 53/77 files, 437/540 tests).

Two findings require correction before this IP is truly mergeable:

1. **MAJOR — `ServiceRequest.Matched` can be published twice under genuine concurrent engagement.** The persisted `service_requests.status` transition is correctly CAS-protected (proven by 4 independent clean race-test runs), but the event-publish decision in `EngageServiceRequestUseCase` uses a stale pre-transaction snapshot instead of the CAS call's own return value, so two concurrent engagements against an `OPEN` request can each independently decide to publish `ServiceRequest.Matched`. This directly contradicts the Completion Report's own claim (§3.5, §9) and deviates from the exact IP-007 precedent (`release-funds.usecase.ts`) this IP claims to follow.
2. **MAJOR — the location-privacy reasoning's factual premise is wrong.** "No Partner coordinate data exists anywhere in the repo" (§3.7, §11.1, and copied into `service-request.ts`, `service-request.schema.ts`, migration 0030, `docs/event-catalog.md`, `docs/openapi.yaml`) is false: `marketplace_order_execution_events.latitude/longitude` (migration 0017, PACK-03 baseline) stores real Partner-side GPS data. The actual code decision this IP made (no lat/lng added to `ServiceRequest`, coarse free-text `locationLabel` only) remains correct and is still the most privacy-conservative choice available — but the stated reasoning overclaims and should be corrected everywhere it was copy-pasted.

Neither finding blocks the underlying design; both are concrete, scoped, low-effort corrections. No CRITICAL finding. Full detail in §J.

## B. Baseline and reviewed commits

- **Nothing is committed.** `git status --short` independently run shows exactly: 19 untracked new files, 8 modified tracked files (`CLAUDE.md`, `apps/api/drizzle/meta/_journal.json`, `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts`, `.../domain/exceptions/marketplace.exceptions.ts`, `.../marketplace.module.ts`, `apps/api/src/shared/database/schema/index.ts`, `docs/event-catalog.md`, `docs/openapi.yaml`), plus the pre-existing, unrelated `.claude/settings.local.json` (correctly excluded by the report, same file every prior IP has called out).
- `git diff --stat` on the 8 tracked files: 326 insertions, 0 deletions across the 7 production/doc files + 29 lines for `CLAUDE.md` — matches the report's "additive only" claim for every modified file exactly; independently confirmed, not re-stated from the report.
- Zero files under `apps/api/src/modules/payment/**`, `apps/api/src/modules/identity/**`, or `apps/web/**` are touched — confirmed via the full `git status --short` output, not merely re-stated.
- 19 new files sum matches the report's list name-for-name.

## C. Files reviewed

Every new production file was read in full; every modified file's diff was read hunk-by-hunk (not just the report's prose description):

- **`service-request.ts`** (329 lines, full read) — status machine (`SERVICE_REQUEST_TRANSITIONS`), `effectiveStatus()` derives `EXPIRED` without persisting it — confirmed byte-for-byte the same idiom as `MarketplaceOffer.effectiveStatus()` (`if (status === X && isExpired) return EXPIRED; return status;`), not merely asserted. `markMatched()` is genuinely idempotent at the domain layer (no-ops when already `MATCHED`, throws on any other non-`OPEN` state).
- **`service-request.schema.ts`** (91 lines, full read) — no lat/lng column anywhere; `radiusKm` is a plain nullable `smallint`.
- **`discover-service-request-matches.usecase.ts`** (full read) — calls `MarketplaceListingRepository.search()` with `categoryId`/`listingType: SERVICE`/`location: locationLabel`/`allowedSellerLevels`/`sort: TRUST_SCORE` — the exact existing signature `SearchListingsUseCase` already uses. `levelsAtOrAbove` reused unchanged including its "unknown level → empty result" convention.
- **`engage-service-request.usecase.ts`** (full read, line-by-line) — see §F for the concurrency defect found here.
- **`drizzle-service-request.repository.ts`** (full read) — `markMatchedIfOpen` is a genuine `UPDATE ... SET status='MATCHED' WHERE id=? AND status='OPEN' RETURNING id`; `saveEngagement` uses `.onConflictDoNothing()` with **no target**, matching IP-007's own documented fix.
- **`get-service-request.usecase.ts`**, **`resolve-service-request.usecase.ts`** (both full read) — both `CloseServiceRequestUseCase`/`CancelServiceRequestUseCase` and `GetServiceRequestUseCase` consistently use `!request || !request.isOwnedBy(memberId)` → `ServiceRequestNotFoundException` (404), before touching the entity.
- **`marketplace-service-request.controller.ts`** (full read) — no `@Public()` decorator anywhere; all 7 routes require the standard identity guard.
- **`contact-listing-owner.usecase.ts`** — `git diff` on this file independently run: **zero lines of output**. Confirmed byte-identical, zero modification.
- **`drizzle-marketplace-listing.repository.ts`**, **`search-listings.usecase.ts`**, **`marketplace-publication.service.ts`**, **`drizzle-trust-score.repository.ts`** — `git diff --stat` on all four independently run: **zero lines of output** for all four. This directly confirms "zero new query/index was created for matching" — not a single byte of the reused search path changed.
- **Migration `0030_ip003_service_request_discovery_matching.sql`** (128 lines, full read) — two `CREATE TABLE IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS ... END $$`-guarded FK blocks (7 FKs total), conditional unique/plain indexes. No `DROP`, no destructive `ALTER`, no `tenant_id`. Matches the additive idiom of 0024–0029 exactly.
- **`marketplace-types.ts`, `marketplace.exceptions.ts`, `marketplace.module.ts`, `shared/database/schema/index.ts`** diffs — all four are pure appends (new exports/classes/providers added at the end or in a clearly marked new section); zero existing lines touched in any of them, confirmed by reading each hunk.
- **`docs/openapi.yaml`** (140-line diff, read in full), **`docs/event-catalog.md`** (21-line diff, read in full), **`CLAUDE.md`** (29-line diff, read in full) — all three are additive, new-section-only changes; all three also copy the same overstated location-privacy claim (§J.2).
- **Test files** — `service-request.spec.ts` (12 tests), `create-service-request.usecase.spec.ts` (3), `discover-service-request-matches.usecase.spec.ts` (4), `engage-service-request.usecase.spec.ts` (6), `resolve-service-request.usecase.spec.ts` (4), and `ip-003-service-request-discovery-matching.e2e.spec.ts` (4) all read in full. The unit-level "second engagement" test in `engage-service-request.usecase.spec.ts` only models a *sequential* retry where the mocked `findById` already returns a `MATCHED` request — it does not, and cannot, model the true concurrent-race scenario where two independent calls both read `OPEN`, which is exactly where the bug in §F lives. The e2e race test asserts only the final `status`/engagement-row-count, never the `outbox_events` table, so it cannot catch the bug either — confirmed by reading the full assertion list.

## D. Requirement-by-requirement compliance matrix

Against IP-003 spec §6 acceptance criteria:

| Criterion | Report's claim | Independent verification | Verdict |
|---|---|---|---|
| Member can create a service need | `CreateServiceRequestUseCase`, reuses `resolveCategory()` verbatim | Confirmed by full code read; e2e-verified live (`POST` → 201, status `OPEN`) in my own run | **PASS** |
| Eligible Partners can be discovered/targeted | Deterministic `search()` reuse, zero new query; Member-initiated only, no Partner-facing feed | Confirmed by empty diff on the reused repository/service files (§C); the "Member-initiated only" scope reading is a defensible, non-arbitrary interpretation of the acceptance wording, not silently narrowed — correctly flagged for reviewer re-judgment, and I concur it is the safer reading given Shared Standards §7 | **PASS** |
| Privacy-safe location handling | No coordinates stored; `locationLabel` matches existing public precision | Code decision confirmed correct and safe (§C, §J.2) — **but** the stated justification ("no Partner coordinate data exists anywhere") is factually false; see §J.2 for the required correction | **PASS (implementation) / CORRECTION REQUIRED (documentation)** |
| Request links cleanly to existing conversation/proposal lifecycle | Reuses `ContactListingOwnerUseCase` verbatim | Confirmed via empty `git diff` | **PASS** |
| Auth and E2E tests | Every route authenticated, 404-not-403, concurrency race test | Auth/404 posture confirmed by direct code read across all 5 use cases (§C); concurrency test independently re-run 4× total with the *persisted-state* assertions clean every time — but see §F for the event-layer gap those assertions do not cover | **PASS (state) / MAJOR gap (event emission)** |

## E. Security/authorization review

- Every one of the 7 new routes requires authentication; no `@Public()` decorator exists in the controller — confirmed by direct read.
- All 5 owner-gated use cases (`Get`, `Discover`, `Engage`, `Close`, `Cancel`) call `!request || !request.isOwnedBy(actorId)` → `ServiceRequestNotFoundException` (404) **before** any other logic runs — confirmed line-by-line in each file. `ServiceRequestOwnershipException` (403) is only thrown from `ServiceRequest.close()`/`.cancel()`'s internal `assertOwner()` — genuinely unreachable via any controller path today, since the use-case layer's ownership check always runs first and would already have thrown 404 for a non-owner. This is real defense-in-depth, not dead code, and matches the report's claim exactly.
- Live e2e-verified: a stranger `GET`-ing another Member's service request receives 404, confirmed in my own independent run (`ip-003-...e2e.spec.ts`, "fluxo completo" test, line ~169: `expect(forbidden.statusCode).toBe(404)`).
- No new PII beyond free-text the Member already types; budget/description/preferredDate never exposed to a Partner via the matches endpoint (`ServiceRequestMatchResponse` carries only the pre-existing public `ListingSummaryResponse` shape + `alreadyEngaged`) — confirmed by reading `service-request.mapper.ts`'s `toServiceRequestMatch()`.
- Every new state transition is audited (`AuditLogService.record()` present in all 4 write use cases) — confirmed by direct read.

## F. Concurrency/idempotency review

**This was the single highest-scrutiny area of this review, per the Completion Report's own §16 flag, and it is where a genuine defect was found.**

- **`markMatchedIfOpen` itself is a correct, genuine CAS**: `UPDATE service_requests SET status='MATCHED', matched_at=? WHERE id=? AND status='OPEN' RETURNING id` (`drizzle-service-request.repository.ts`). Under Postgres `READ COMMITTED`, two concurrent `UPDATE`s targeting the same row serialize: the second waits for the first's commit, then re-evaluates its `WHERE` clause against the now-committed row and affects 0 rows. This guarantees **at most one** row-level `OPEN -> MATCHED` transition — independently confirmed correct by 4 clean re-runs of the e2e race test (1 in the full suite + 3 isolated, §I), all showing exactly one `MATCHED` row and exactly one engagement row per listing, with zero flake across all 4 runs.
- **The event-publish decision does not use that CAS result.** Reading `engage-service-request.usecase.ts` line-by-line:
  ```ts
  const wasAlreadyMatched = request.status === SERVICE_REQUEST_STATUS.MATCHED;  // read BEFORE the tx, BEFORE the race window
  ...
  await this.db.transaction(async (tx) => {
    if (!wasAlreadyMatched) {
      await this.serviceRequestRepository.markMatchedIfOpen(serviceRequestId, engagementRecord.engagedAt, tx);
      // ^ return value (true = "I won the CAS", false = "someone else already did") is discarded
    }
    engagementCreated = await this.serviceRequestRepository.saveEngagement(engagementRecord, tx);
    if (engagementCreated) {
      await this.outboxService.enqueue(tx, { eventType: 'ServiceRequestEngagement.Created', ... });
      if (!wasAlreadyMatched) {
        await this.outboxService.enqueue(tx, { eventType: 'ServiceRequest.Matched', ... });  // gated on the STALE snapshot only
      }
    }
  });
  ```
  `request` is fetched once via `findById()` at the very top of `execute()`, before `ContactListingOwnerUseCase.execute()` runs (a network/DB round trip that widens the race window) and before the transaction opens. Under the exact scenario the IP's own race test exercises — two concurrent `engage()` calls against different listings while the request is still `OPEN` — **both** calls compute `wasAlreadyMatched = false` from their independent, pre-race reads. Both then call `markMatchedIfOpen` (only one succeeds at the DB level, correctly), but **both** proceed to enqueue `ServiceRequest.Matched` because the event gate only checks the stale `wasAlreadyMatched`, never the actual CAS outcome. The result: the persisted `service_requests` row transitions exactly once (correct), but the `outbox_events` table receives **two** `ServiceRequest.Matched` rows — one for each listing — even though only one of those transitions genuinely happened.
- **This is a deviation from this IP's own claimed precedent.** `apps/api/src/modules/payment/application/usecases/release-funds.usecase.ts` (IP-007, read directly) does this correctly at two call sites: `const marked = await ...markReadyForReleaseIfInCustody(...); if (!marked) { ...; continue; }` and `const released = await ...markReleasedIfReady(...); if (!released) { alreadyReleased = true; return; }` — in both cases the CAS call's own boolean return value, not a pre-read snapshot, gates whether the event is enqueued. `EngageServiceRequestUseCase` does not follow this pattern despite the Completion Report explicitly stating IP-007's Completion Report was read "as the exact CAS/idempotency idiom to reuse."
- **Impact today is limited but real.** `docs/event-catalog.md`'s own entry for `ServiceRequest.Matched` states "Consumidores: nenhum hoje" — no current consumer subscribes, so no user-visible duplicate notification exists yet. But the very first consumer wired up (IP-013's job, per the report's own §12.3) will fire twice for the losing engagement's listing/partner unless this is fixed first, and the bug directly contradicts an explicit, tested-for correctness claim in this IP's own Completion Report and event catalog ("Matched sai só na PRIMEIRA vez").
- **Recommended fix** (not applied — out of scope for this review to modify production code): capture `markMatchedIfOpen`'s return value (e.g. `const casWon = wasAlreadyMatched ? false : await this.serviceRequestRepository.markMatchedIfOpen(...)`) and gate the `ServiceRequest.Matched` enqueue on `casWon`, not on `!wasAlreadyMatched` alone. Add an assertion to the existing e2e race test (or a new unit test) that inspects `outbox_events` (or a mocked equivalent) for exactly one `ServiceRequest.Matched` row after a genuine two-way race, so this class of regression is caught mechanically in the future — the current test cannot catch it because it never looks at the outbox.
- **The two-transaction split itself is safe.** Reasoned through the crash window explicitly asked for in the review brief: if the process crashes after `ContactListingOwnerUseCase`'s transaction commits but before the engagement transaction commits, a retried `engage()` call is safe for **persisted state** — `ContactListingOwnerUseCase` reuses the same active conversation (MRK-006 BR-005 dedupe), `markMatchedIfOpen`/`saveEngagement` do not duplicate rows on retry. One caveat not called out in the report: `ContactListingOwnerUseCase.execute()` unconditionally creates and persists a **new message** on every call, even when reusing an existing conversation (confirmed by reading its code — no `created` branch skips message creation). A crash-triggered client retry of the exact same `engage()` call will therefore append an extra, duplicate-content message to the conversation. This is pre-existing MRK-006 behavior (the report's own e2e test exercises the same "reengage adds a new message" behavior deliberately, for legitimate follow-up messages), not a defect introduced by this IP, and arguably the safer trade-off (extra message vs. a lost one) — but the report's characterization of the whole `engage()` operation as "idempotent" on retry (§11.4) is not quite accurate for the conversation side-effect. **MINOR/OBSERVATION**, not required to block merge.

## G. Migration/data review

- `0030_ip003_service_request_discovery_matching.sql` read in full: `CREATE TABLE IF NOT EXISTS` ×2, `DO $$ IF NOT EXISTS ... END $$`-guarded FK additions (7 FKs total), conditional unique/plain `CREATE INDEX IF NOT EXISTS` (6 indexes total). No `DROP`, no destructive `ALTER`, no `tenant_id`. Matches the idempotent style of 0024–0029.
- **Unicode-arrow fix independently confirmed on both halves**: `grep -rn "→" apps/api/drizzle/*.sql` run independently returns **zero matches** anywhere in the repository, including in migration 0030 itself — the fix is complete and no other migration ever had the same latent fragility.
- `apps/api/drizzle/meta/_journal.json` correctly appended at idx 30, not renumbering any prior entry.
- Migration was exercised successfully across 5 independent invocations during this review (one full-suite run, one isolated i18n retry, three isolated IP-003-file re-runs) against disposable embedded Postgres instances only — never a shared/prod database.
- **The location-privacy schema claim needs correction, not the schema itself** (§J.2): `service_requests` genuinely has no lat/lng column, which is the correct design; the migration's own header comment repeats the overstated "no Partner coordinate data exists" premise and should be corrected to something like "no *pre-engagement, matchable* Partner location profile exists; the only Partner-side coordinates in this repository are post-hoc field-execution-event geotags (`marketplace_order_execution_events`), which cannot support prospective distance matching before a request exists."

## H. API/event compatibility

- 7 new routes, all additive, all under a new `marketplace/service-requests` base path — no existing route's contract changed. Confirmed present in `docs/openapi.yaml` with matching `operationId`s.
- 5 new event types (`ServiceRequest.Created/Matched/Closed/Cancelled`, `ServiceRequestEngagement.Created`) — all new aggregate types, no existing event payload shape changed. Confirmed via `docs/event-catalog.md` diff and via `git diff` showing `apps/api/src/modules/notification/domain/notification-rules.ts` untouched (zero consumers wired).
- `ServiceRequest.Matched`'s documented "fires only once" guarantee is not actually true under concurrency — see §F. The event-catalog entry should be corrected once the code is fixed, or caveated in the interim.

## I. Tests independently executed

All commands re-run from scratch in this review, independent of the Executor's own reported numbers:

- **`pnpm typecheck`**: `apps/api` Done, `apps/web` Done, 0 errors — matches claim.
- **`pnpm lint`**: `eslint .` clean, 0 errors — matches claim.
- **`pnpm -r build`**: `apps/api` Done; `apps/web` `next build` — 26 routes, all ✓ — matches claim exactly.
- **Unit suite** (`npx vitest run`, no DB): **53 passed | 24 skipped (77 files)**, **437 passed | 103 skipped (540 tests)**, 67.6s — **exact match** to the Completion Report's claimed numbers.
- **Full e2e suite** (`node test/e2e-local.mjs --no-file-parallelism`, fresh embedded Postgres, my own independent run): **76 passed | 1 failed (77 files)**, **539 passed | 1 failed (540 tests)**, 548.8s. The one failure — `ip-002-i18n.e2e.spec.ts`, "notificação resolve o locale do DESTINATÁRIO" — is a different file than either of the two the report's own run flagged (`module0`, `mrk-023-025`), and fails on the same class of symptom (`Score não chegou a 25`, a trust-score-calculation timing wait exceeding its poll window) — i.e., generic host/environment timing contention, not a regression tied to this IP's diff (the failing test belongs to IP-002, has nothing to do with `ServiceRequest`). **This IP's own e2e file passed clean in this run: 4/4 tests, including the concurrent-engagement race, 42.6s.**
- **Isolated retry of the one failure**: re-ran `ip-002-i18n.e2e.spec.ts` alone against a fresh embedded Postgres — **1/1 file, clean**, confirming transient flakiness, not a regression.
- **IP-003's own race test, re-run 3 additional times in isolation** (beyond its pass in the full run) for flake assessment, per the review brief: **3/3 clean**, ~12s each, the CAS-protected `status`/engagement-row assertions passing every time with zero flake across all 4 total executions of this test in this review.
- **Combined result**: 77/77 files, 540/540 tests clean after accounting for one isolated, non-reproducing transient failure — consistent with the Completion Report's ultimate claimed conclusion, though the specific flaky file differed between the Executor's run and mine, which if anything strengthens the "generic environment noise" diagnosis (three separate runs across this review and the report have now each hit a *different*, unrelated file).

## J. Findings

Classified CRITICAL / BLOCKING / MAJOR / MINOR / OBSERVATION.

1. **MAJOR — `ServiceRequest.Matched` domain event can be published more than once under genuine concurrent engagement.** See §F for full detail, code excerpt, and root cause. The persisted state transition remains correct (CAS-protected); only the event layer is affected. No current consumer exists, so no user-visible impact today, but this directly contradicts the Completion Report's own explicit correctness claim and will surface as a duplicate notification the first time a consumer is wired up (IP-013). **Required correction before this IP can be considered fully done**: gate the `ServiceRequest.Matched` enqueue on `markMatchedIfOpen`'s actual return value, and add an assertion (on `outbox_events` or an equivalent) that would have caught this.

2. **MAJOR — the location-privacy reasoning's stated premise is factually incorrect.** "No Partner coordinate data exists anywhere in the repo" (§3.7/§11.1 of the Completion Report, and copied verbatim into `service-request.ts`, `service-request.schema.ts`, migration 0030's header comment, `docs/event-catalog.md`, and `docs/openapi.yaml`) is false: `marketplace_order_execution_events.latitude/longitude` (migration `0017_aromatic_vivisector.sql`, PACK-03 baseline, surfaced through `MarketplaceOrderExecution`/`marketplace-order.dtos.ts`) stores real Partner-side GPS coordinates captured during field-execution check-in/checkout evidence. Independently confirmed via `grep -rniE "\blatitude\b|\blongitude\b" apps/api/src apps/api/drizzle` — this is the only real hit in the repository; `marketplace_listings` genuinely has no such column, which is the narrower, true part of the claim. This per-event GPS data cannot support prospective, pre-engagement request-to-partner distance matching (it only exists after an order has already progressed to field execution, is scoped to a single event not a partner "home base," and would require materially new aggregation infrastructure to repurpose) — so the **actual code decision this IP made remains correct and appropriately privacy-conservative** under Shared Standards §7. This is a documentation-accuracy/reasoning-integrity finding, not a code defect, but it is the single highest-scrutiny claim in the report and should not ship uncorrected: a future engineer relying on this report as precedent would be misled about what location data already exists in this system. **Required correction**: amend the claim in all five affected files to something precise (e.g., "no persistent, pre-engagement Partner service-location profile exists that could support prospective distance matching; the only Partner-side coordinates in this repository are post-hoc field-execution-event geotags, which cannot serve this purpose without materially new aggregation infrastructure").

3. **MINOR / OBSERVATION — `EngageServiceRequestUseCase`'s retry is not fully "idempotent" end-to-end.** A crash-triggered client retry between the two transactions will append an extra message to the conversation (pre-existing `ContactListingOwnerUseCase`/MRK-006 behavior — it always creates a new message, even on a reused conversation). No data corruption, no duplicate engagement row, no double `MATCHED` transition — just an extra, duplicate-content message, which is arguably the correct trade-off. Recommend softening the "safe and idempotent" language in §11.4 to acknowledge this specific side effect.

4. **OBSERVATION — flakiness reproduced, but in a third, different file.** My independent full e2e run hit the same class of transient timing failure the report describes, but in `ip-002-i18n.e2e.spec.ts` rather than either of the report's own two files. This is reassuring, not concerning: three separate full-suite runs (the Executor's, and mine) have now each flaked on a different, IP-003-unrelated file, which is exactly the signature of generic host/embedded-Postgres timing contention rather than a regression in this IP's diff. Retried clean in isolation.

5. **OBSERVATION — the scope decision to omit a Partner-facing "browse open requests" feed is sound.** Re-judged independently per the report's own request: the acceptance criteria's wording is genuinely ambiguous, and building a broadcast-style feed without an explicit product decision would risk exactly the kind of privacy overreach Shared Standards §7 warns against. Agree with the Executor's narrower reading.

No CRITICAL finding. No BLOCKING finding — the two MAJOR items are concrete, scoped, and do not require any architectural rework; they do not compromise money, security, or data integrity, but should be fixed (not merely acknowledged) before this IP is folded into a release.

## K. Scope leakage check

- Confirmed via `git status --short`: zero files touched outside `apps/api/src/modules/marketplace/**`, the 4 shared documentation/collision hotspots (`docs/openapi.yaml`, `docs/event-catalog.md`, `CLAUDE.md`, `apps/api/src/shared/database/schema/index.ts`), and the migration journal.
- No existing Marketplace file's *behavior* changed — `marketplace-types.ts`, `marketplace.exceptions.ts`, `marketplace.module.ts` diffs are all pure additions (confirmed by reading every hunk, §C).
- No `tenant_id`, no destructive migration, no new PSP/AI dependency, no floating-point money — confirmed.
- IP-003 spec §4 "Out of scope" items (no semantic/vector search, no autonomous AI selection, no rebuild of existing listing/conversation/proposal/order flows, no scheduling/calendar system, no geometric radius infrastructure) are all genuinely honored — confirmed by the empty diffs on every file that would have needed to change to violate them.

## L. Final recommendation

**APPROVED WITH CORRECTIONS.** The design is sound, the file footprint is exactly as claimed, the reuse claims are all genuine (verified via empty diffs, not assertions), and the persisted-state concurrency guarantee is real and independently reproduced clean across 4 race-test runs. Two MAJOR findings — the event-layer double-publish bug (§F, §J.1) and the overstated location-privacy premise (§J.2) — should be corrected (code fix for #1, documentation correction for #2) before this IP is folded into a release commit. Neither requires architectural rework or invalidates the underlying design; both are scoped, mechanical corrections. Recommend the implementation agent apply the fix in §F, add an event-count assertion to the existing race test, and correct the five files listing the overstated privacy premise, then resubmit for a final confirmation pass (not a full re-review) before merge.

---

## M. Confirmation pass (independent, 2026-09-15)

**Reviewer:** a second independent Quality/Diff Agent, distinct from the original reviewer, per the escalation path in `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §3. Scope: confirm the two MAJOR fixes claimed in the amended `IP-003-COMPLETION-REPORT.md` (§11.6, §11.7, §10.6) are real and correct — not a full re-review. Every claim below was independently re-derived (code read fresh, `git grep` run fresh, all test suites re-executed from scratch against a fresh embedded Postgres), not taken from the Completion Report's prose.

### M.1 Fix 1 — event double-publish (was §J.1, MAJOR)

Read `apps/api/src/modules/marketplace/application/usecases/engage-service-request.usecase.ts` in full, line-by-line. Confirmed:

- `casWon` is a `let` initialized to `false`, assigned **only** from `await this.serviceRequestRepository.markMatchedIfOpen(...)` **inside** the transaction (line 129) — not from `wasAlreadyMatched`, which is now used only to decide whether to *attempt* the CAS at all (correct: once already `MATCHED`, there is nothing to CAS).
- The `ServiceRequest.Matched` outbox enqueue (line 149) is gated on `if (casWon)`, i.e. the CAS call's own boolean return value — a genuine capture-and-gate, not a pre-transaction snapshot.
- Directly diffed this idiom against `apps/api/src/modules/payment/application/usecases/release-funds.usecase.ts` (read in full): `finalizeIncremental` captures `const released = await ...markReleasedIfReady(...)` and gates the `Funds.Released` enqueue on `if (!released) { alreadyReleased = true; return; }`; `prepareIncrementalTranches` captures `const marked = await ...markReadyForReleaseIfInCustody(...)` and gates `Funds.ReadyForRelease` on `if (!marked) { ...; continue; }`. Same shape: local variable = CAS return value, event enqueue conditioned on that variable, never on an earlier read. `EngageServiceRequestUseCase` genuinely now matches this idiom, not merely claims to.
- Read `engage-service-request.usecase.spec.ts` in full (7 tests, up from 6). The new test, `"corrida: request lida como OPEN mas a CAS é perdida"`, mocks `markMatchedIfOpenResult: false` while `findById` still returns an `OPEN` request — exactly the race-loser scenario — and asserts `serviceRequestRepository.markMatchedIfOpen` was called, `result.created === true` (the engagement itself succeeds), and `eventNames(outbox)` equals exactly `['ServiceRequestEngagement.Created']` (no `Matched`). This genuinely exercises the fixed branch; it is not vacuously true (a pre-fix version of the code, gating on `wasAlreadyMatched`, would fail this exact test since `wasAlreadyMatched` would be `false` and the old code would still enqueue `Matched`).
- Read the e2e race test (`ip-003-service-request-discovery-matching.e2e.spec.ts`, lines 371–461). Confirmed it now queries `outboxEvents` directly after the real two-way `Promise.all` race: `expect(matchedEvents).toHaveLength(1)` for `ServiceRequest.Matched` filtered by `aggregateId === serviceRequestId`, and `expect(...).toHaveLength(2)` for `ServiceRequestEngagement.Created` filtered by `payload.serviceRequestId === serviceRequestId` — precisely the assertion the original review (§F) said was missing.
- **Re-ran this file in isolation 3 additional times** against a fresh embedded Postgres (`node test/e2e-local.mjs --no-file-parallelism test/integration/ip-003-service-request-discovery-matching.e2e.spec.ts`), beyond its pass inside the full suite run (§M.3) — **4/4 total executions clean**, race test consistently ~12.1s, zero flake, the `outbox_events` assertions passing every time.

**Verdict: genuinely fixed.** Finding §J.1 is resolved.

### M.2 Fix 2 — overstated privacy premise (was §J.2, MAJOR)

`git grep -niE "no partner coordinate data exists|nenhum dado de coordenada|no partner coordinate"` across the full repository: **zero matches** — the old false claim is gone everywhere, not just reworded elsewhere.

Read the corrected wording directly in all six claimed-corrected locations (not the Completion Report's description of them): `service-request.ts` (class doc comment), `service-request.schema.ts` (table comment), migration `0030_ip003_service_request_discovery_matching.sql` (header comment), `docs/event-catalog.md` (`ServiceRequestEngagement.Created` entry's determinism note), `docs/openapi.yaml` (schema description), `CLAUDE.md` (new section). All six now state the same corrected, precise claim, in substance: no lat/lng column exists in `ServiceRequest`/`service_requests`, **not** because no Partner coordinate data exists anywhere in the repository, but because no *pre-engagement, matchable* Partner service-location profile exists — the only Partner-side coordinates (`marketplace_order_execution_events.latitude/longitude`) are post-hoc field-execution geotags that cannot support prospective distance matching without new aggregation infrastructure.

Independently re-verified the underlying factual claim itself, not just the wording: `git grep -rniE "\blatitude\b|\blongitude\b" apps/api/src apps/api/drizzle` returns hits only in `marketplace-order.schema.ts`/`marketplace-order-execution.ts`/`drizzle-marketplace-order.repository.ts` (all tracing back to migration `0017_aromatic_vivisector.sql`, confirmed directly: `latitude numeric(10, 7)`, `longitude numeric(10, 7)`) plus their historical `meta/*_snapshot.json` copies — and in the six IP-003 files just reviewed, discussing that same fact. No lat/lng exists in `service_requests` or `marketplace_listings`. This is not a wording dodge — it accurately narrows the claim to what is actually true, while still supporting the same (correct) code decision.

**Verdict: genuinely fixed.** Finding §J.2 is resolved.

### M.3 Regression check

`git status --short` / `git diff --stat` re-run fresh: exactly 19 untracked new files (name-for-name identical to the original review's §B list) + 8 modified tracked files (`CLAUDE.md`, `apps/api/drizzle/meta/_journal.json`, `marketplace-types.ts`, `marketplace.exceptions.ts`, `marketplace.module.ts`, `shared/database/schema/index.ts`, `docs/event-catalog.md`, `docs/openapi.yaml`) + the pre-existing, unrelated `.claude/settings.local.json`. Identical footprint to the original diff — only content within the already-touched files changed for the two fixes. `git diff --stat` on the 8 IP-003 files: all insertions, 0 deletions (consistent with "comments/tests/assertions grew, nothing removed"). `git diff` on `contact-listing-owner.usecase.ts` and the other zero-diff reused files (`drizzle-marketplace-listing.repository.ts`, `search-listings.usecase.ts`, `marketplace-publication.service.ts`) re-confirmed empty. Nothing unexpected found.

### M.4 Tests re-run from scratch

- `pnpm typecheck`: `apps/api` Done, `apps/web` Done, 0 errors.
- `pnpm lint`: `eslint .`, 0 errors.
- `pnpm -r build`: `apps/api` Done; `apps/web` 26 routes, all ✓.
- Unit suite (`npx vitest run`, apps/api): **53 passed | 24 skipped (77 files)**, **438 passed | 103 skipped (541 tests)**, 70.7s — exact match to the Completion Report's claim (+1 test over the original submission, the new race-loser unit test).
- Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, fresh embedded Postgres): **76 passed | 1 failed (77 files)**, **540 passed | 1 failed (541 tests)**, 545.1s. The single failure, again, was `ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO"), `Error: Score não chegou a 25` — the exact same test and exact same symptom (trust-score poll-window timing) as the Executor's own two prior runs and the original Diff Review's own run — now four independent full-suite runs across this program, each flaking on a different IP-002-unrelated file (or the same one twice), none reproducing on retry. Re-ran this one file in isolation immediately after: **1 passed (1 file)**, **7 passed (7 tests)**, 22.5s, clean. `ip-003-service-request-discovery-matching.e2e.spec.ts` passed 4/4 inside this full run, plus 3 additional isolated re-runs (§M.1) — 4/4 total executions clean, zero flake.
- **Combined**: 77/77 files, 541/541 tests clean once the one transient, non-reproducing failure is accounted for — consistent with the Completion Report's claimed final state.

### M.5 New findings

None. No CRITICAL/BLOCKING/MAJOR/MINOR findings identified beyond what the original review already flagged (both now resolved) and the two carried-forward OBSERVATIONs (§J.3 conversation-message-on-retry, §J.4/§J.5 flake diagnosis and scope-boundary re-judgment), which remain accurate and unchanged.

### M.6 Confirmation-pass verdict

**PASS.** Both MAJOR findings from the original review are genuinely resolved — verified independently against the actual code and actual test runs, not against the Completion Report's account of them. No regression, no scope leakage, no new defect. This IP is ready to be committed as-is.
