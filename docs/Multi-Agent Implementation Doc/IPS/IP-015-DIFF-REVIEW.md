# IP-015 — Diff Review

**Reviewer:** Independent Quality/Diff Agent (not the implementation agent). Every claim in `IP-015-COMPLETION-REPORT.md` was independently re-derived from the repository, migrations, and fresh test runs — the Completion Report was read for orientation only, never trusted at face value.

## A. Executive verdict

**APPROVED.** No CRITICAL/BLOCKING findings. One MINOR finding (test-report accuracy — §J.1) and two OBSERVATIONs (§J.2, §J.3) for reviewer/product awareness, none of which block merge.

## B. Baseline and reviewed commits

- Baseline: `main` @ `19a0be6` (tip after IP-005), confirmed via `git log --oneline -15`.
- IP-015's changes are **uncommitted** in the working tree (consistent with the report's §15 — git identity unset, agent correctly did not configure it). Reviewed via `git diff HEAD` / `git status --short --untracked-files=all` against that same baseline.
- Working tree also carries IP-005's own uncommitted diff at the time of preflight per its own completion report conventions — verified this review's `git diff --stat HEAD` output is IP-015-only (8 modified + 3 new files, matching report §5 exactly, not IP-005's larger diff which is already committed at `19a0be6`).

## C. Files reviewed

Modified (8, matches report exactly):
- `apps/api/src/modules/marketplace/application/dto/marketplace.dtos.ts`
- `apps/api/src/modules/marketplace/application/usecases/search-listings.usecase.ts`
- `apps/api/src/modules/marketplace/domain/repositories/marketplace-listing.repository.ts`
- `apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-listing.repository.ts`
- `apps/api/src/modules/trust-score/infrastructure/persistence/trust-score.schema.ts`
- `apps/api/drizzle/meta/_journal.json`
- `docs/openapi.yaml`
- `CLAUDE.md`

New (3, matches report exactly):
- `apps/api/drizzle/0034_ip015_search_marketplace_retrieval.sql`
- `apps/api/src/modules/marketplace/application/usecases/search-listings.usecase.spec.ts`
- `apps/api/test/integration/ip-015-search-marketplace-retrieval.e2e.spec.ts`

Every file above was read in full (diff or entire content), not sampled. `docs/event-catalog.md` diff confirmed empty. `apps/api/package.json` / `pnpm-lock.yaml` diffs confirmed empty (no new dependency).

## D. Requirement-by-requirement compliance matrix

| IP-015 §6 criterion | Verdict | Independent evidence |
|---|---|---|
| Relevant filters work | PASS | Pre-existing filters (`category`, `listingType`, `minPrice`/`maxPrice`, `currency`, `location`, `minimumTrustLevel`) confirmed byte-for-byte unchanged in `search()`. New `availableDayOfWeek` read via `EXISTS` against `marketplace_partner_availability_windows` — read the actual generated SQL construction (drizzle `exists(...)`), confirmed it reuses IP-005's exact column names (`partnerId`, `dayOfWeek`) with no schema mutation. "Price-model" gap: confirmed by `grep -rn "pricingModel" apps/api/src/modules/marketplace/infrastructure/persistence/marketplace.schema.ts apps/api/src/modules/marketplace/domain/entities/marketplace-listing.ts` → zero matches; `pricingModel` exists only on `marketplace-offer.schema.ts`/`marketplace-order.schema.ts`/`marketplace-commercial-snapshot.schema.ts`. The report's interpretation (a listing has no pricing model pre-negotiation, so `minPrice`/`maxPrice`/`currency` is the complete honest answer) is correct, not an excuse to skip the acceptance criterion. |
| Pagination stable | PASS | Read `orderFor()` before/after via `git diff`. Confirmed: before this IP, **zero** branches (`price_asc`/`price_desc`/`recent`/`relevance`) had a tiebreaker, and `trust_score` had only `publishedAt` (itself tie-prone). After: every one of the 5 branches (`price_asc`, `price_desc`, `trust_score`, `relevance`-with-text, `relevance`-without-text/`recent`) ends in `asc(marketplaceListings.id)`. This is a genuine pre-existing bug, and the fix is complete across every branch, not partial. |
| Privacy-safe geo queries | PASS | Confirmed zero new coordinate/lat-lng column or query anywhere in the diff. `availableDayOfWeek` is `smallint` 0–6 (day-of-week, not location). |
| Performance indexes | PASS | See §G. |
| Deterministic ranking documented | PASS | `orderFor()` carries an in-code doc comment explaining every branch; OpenAPI description updated; Completion Report §3.1 documents it a third time. |
| No hidden paid bias | PASS | `grep -in "sponsor\|boost\|isPaid\|paid_placement\|promoted\|featured" marketplace.schema.ts` → zero matches. Every `orderFor()` branch is a pure function of `price`/`trust_scores.score`/`publishedAt`/`ts_rank(...)` — no code path reads a placement/payment field. |

## E. Security/authorization review

- `GET /marketplace/listings` remains `@Public()` (`security: []` in `docs/openapi.yaml`, unchanged) — same anonymous-browse posture as MRK-004. No authorization logic touched.
- `availableDayOfWeek` narrows the result set only; no new field added to `ListingSummaryResponse` — confirmed by reading the full repository diff (no change to the select projection).
- No new PII, no new audit requirement (pure `SELECT`, consistent with the existing convention that anonymous public search is never audited).

## F. Concurrency/idempotency review

- `search()` remains a pure, side-effect-free `SELECT` — confirmed no `INSERT`/`UPDATE`/`DELETE` appears anywhere in the diff. Idempotency is trivial (same inputs → same outputs, now *more* deterministic than before due to the `id asc` tiebreaker). No concurrency-sensitive state transition is introduced by this IP; N/A for CAS/optimistic-locking requirements.

## G. Migration/data review

`apps/api/drizzle/0034_ip015_search_marketplace_retrieval.sql` — read in full. Single statement: `CREATE INDEX IF NOT EXISTS "idx_trust_score_identity" ON "trust_scores" ("identity_id")`. Confirmed:
- Additive only — no `DROP`/`ALTER COLUMN`/data mutation of any kind.
- `apps/api/drizzle/meta/_journal.json` diff is a clean, correctly-numbered append (`idx: 34`, no renumbering of 0–33).
- **Independently confirmed `trust_scores.identity_id` had no prior index**: grepped every migration 0000–0033 for `identity_id`/`trust_scores`. The only prior touch is `0008_glamorous_sersi.sql:60`, which adds an FK constraint (`trust_scores_identity_id_identities_id_fk`) — Postgres does **not** auto-index FK columns, so this genuinely left the join column unindexed until now. `idx_trust_score_passport` (unique, on `trust_passport_id`) is a different column.
- `trust-score.schema.ts` diff is exactly one new `index('idx_trust_score_identity').on(table.identityId)` line inside the existing table's index array — zero column/business-logic change, confirmed by reading the full diff, not just the hunk header.
- Collision check: `git log --oneline -- .../trust-score.schema.ts` shows the file was last touched by the original TRS module commits (`9d19a3f`, `fe4726a`), long before this multi-agent wave — no other in-flight/recent IP (IP-003/004/005/007/013/020/021, all already on `main`) touches this file. No migration-number collision: `0034` is the next sequential file after IP-005's `0033`.
- Verdict: an index-only, cross-domain-but-behavior-preserving addition, narrowly justified by this IP's own "performance indexes" acceptance criterion and directly used by this IP's own hot-path join. Acceptable per Shared Standards §5.1 (shared-kernel changes require either explicit ownership in the IP or... — here it's justified in-IP and is index-only, the lowest-risk category of shared-file touch).

## H. API/event compatibility

- One new optional query parameter (`availableDayOfWeek`) on an existing route — backward compatible, confirmed no required param added, no field removed/renamed from the response.
- `docs/openapi.yaml` diff reviewed in full: new parameter entry + expanded `description` on `searchMarketplaceListings`, correctly placed inside the existing path block, no other IP's section touched.
- `docs/event-catalog.md` diff confirmed empty — correct, since this IP performs zero writes and creates zero new events.

## I. Tests independently executed

All run from scratch, in this environment, against the disposable embedded/ephemeral Postgres — no shared/prod Supabase touched at any point.

- `pnpm typecheck` (repo root): `apps/api` Done, `apps/web` Done — **0 errors**.
- `pnpm lint` (repo root): `eslint .` — **0 errors**.
- `pnpm -r build`: `apps/api` (`tsc -p tsconfig.build.json`) Done; `apps/web` (`next build`) — 27 routes, all ✓.
- Unit suite (`npx vitest run`, apps/api, no `TEST_DATABASE_URL`): **62 passed / 30 skipped (92 files); 504 passed / 129 skipped (633 tests)** — **exact match** to the Completion Report's claimed numbers.
- Full e2e suite, first independent run (`node test/e2e-local.mjs --no-file-parallelism`): **2 failed / 90 passed (92 files); 2 failed / 631 passed (633 tests)**, 790.18s. Failures: `ip-002-i18n.e2e.spec.ts` (`waitForScore` timeout — the same test/failure mode already documented as a recurring flake in IP-002/003/004/005's own completion reports) **and** `test/integration/mrk-015-022.e2e.spec.ts` ("terceiro não acessa pedido alheio", a `waitForScore`-dependent test in a file this IP never touches — 60000ms test timeout). The embedded Postgres log shows a WAL `checkpoint starting` entry at 10:34:48, inside the failure window, consistent with the same host/checkpoint-contention root cause already documented for `ip-002-i18n` by prior IPs.
- Full suite, independent re-run immediately after (same command, no code change in between): **92/92 files, 633/633 tests, 0 failures.** Both previously-failed files passed clean. This is the same "flakes once, clean on immediate retry with zero code change" signature already established, now reproduced for a second file.
- This IP's own new tests, verified individually within both runs: `search-listings.usecase.spec.ts` (5/5 unit), `ip-015-search-marketplace-retrieval.e2e.spec.ts` (3/3 e2e) — both clean in every run, including the run that had other unrelated failures.
- **Conclusion**: no reproducible failure is attributable to this IP's diff. See Finding §J.1 for the one accuracy gap this independent run surfaced in the report's own test section.

## J. Findings

**J.1 — MINOR (test-report accuracy).** The Completion Report (§10.4) claims the full e2e run produced exactly **one** failure (`ip-002-i18n.e2e.spec.ts`) and frames it as "a sixth independent occurrence of the same environment-timing-sensitive test." This reviewer's independent first full run instead produced **two** failures: the claimed `ip-002-i18n.e2e.spec.ts` plus an additional, previously-undocumented `mrk-015-022.e2e.spec.ts` timeout. Both are consistent with the same underlying root cause (WAL checkpoint stall under the embedded/disposable Postgres, `--no-file-parallelism`, ~13 minute sequential run) and both passed clean on an immediate, zero-change re-run — so the report's core conclusion ("no reproducible regression caused by this IP's diff") still holds and is independently confirmed. But the report's specific claim of "exactly one failure, exact same signature as five prior runs" was not exactly reproduced this time, which matters because a reviewer relying on that specific sentence would under-expect the suite's actual flake rate. Recommendation: no code change needed; the program's test infrastructure (embedded Postgres checkpoint tuning, or `waitForScore` polling budget) is accumulating more flake surface across IPs than any single report currently discloses — worth a cross-IP infrastructure follow-up, not this IP's problem to fix.

**J.2 — OBSERVATION (FTS config choice, `simple` vs `portuguese`).** Independently confirmed the actual mechanics, not just the report's framing: the `WHERE` clause's text filter (`criteria.text` → `ilike '%term%'` on `title`/`description`) is **completely independent** of the `ORDER BY`'s `ts_rank(to_tsvector('simple', ...), plainto_tsquery('simple', ...))`. This means the `simple`-vs-`portuguese` choice affects **only the relative ranking order of already-matched rows**, never which rows are returned — `ilike` substring matching already catches many PT-BR morphological variants for free (e.g. `ilike '%encanador%'` matches "encanadores" as a literal substring, no stemming needed). This substantially lowers the real-world impact of the conservative `simple` choice: it is not a recall/correctness gap, only a ranking-quality nicety foregone (e.g. it would not help rank "eletricista" against a query for "elétrica" — genuine stemming/lemma cases the substring filter also can't catch — but those rows still appear in results, just not optimally ordered). Given IP-015 §4's explicit "no semantic/AI search" constraint and the stated goal of environment-independence (`simple` needs no installed language dictionary), `simple` is a reasonable, conservative, defensible default — not a MAJOR gap. `portuguese` is a legitimate future ranking-quality upgrade but is correctly left as an explicit, separate product decision per the report's own §11.1/§16.2, not something this IP should have silently decided either way.

**J.3 — OBSERVATION (`availableDayOfWeek` exclusionary semantics).** Independently verified `fitsAvailability()` in `apps/api/src/modules/marketplace/domain/services/availability.service.ts` — confirmed line 64-66 (`if (windows.length === 0) { return true; }`) is genuinely permissive: a Partner with zero declared windows is treated as unrestricted for scheduling. This is a real, load-bearing behavioral asymmetry against this IP's own `availableDayOfWeek` filter, which excludes exactly that same Partner from a day-filtered search. The asymmetry is intentional, well-reasoned (scheduling asks "is there a reason to block?"; search asks "does this match what was asked for?"), and is documented in three independent places (domain doc comment on `ListingSearchCriteria.availableDayOfWeek`, the OpenAPI parameter description, and the Completion Report §3.3/§11.2) plus covered by a dedicated e2e assertion that explicitly exercises both a Partner-with-window and a Partner-without-window under the same query. This is sound design, not an inconsistency to "fix" — flagging only as an OBSERVATION because it is exactly the kind of two-similar-looking-but-different-default decision that a future maintainer could plausibly "fix" into a regression without reading the code comment; the triple documentation already mitigates that risk adequately.

No CRITICAL, BLOCKING, or MAJOR findings.

## K. Scope leakage check

- `git status --short` / `git diff --stat HEAD`: zero files touched under `apps/api/src/modules/payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `identity/**`, `apps/web/**`.
- Zero IP-003/004/005-owned files touched: confirmed `git diff --stat HEAD` is empty for `service-request.ts`, `discover-service-request-matches.usecase.ts`, `compare-service-request-offers.usecase.ts`, `partner-availability.ts`/`.schema.ts`, `order-travel-status.ts`, `manage-order.usecase.ts`.
- The one cross-domain touch (`trust-score.schema.ts`) is index-only, justified, and reviewed in full at §G — not scope leakage in the sense the standards intend to prevent (no business-rule reinterpretation).
- No new npm dependency (`package.json`/`pnpm-lock.yaml` diffs empty) — confirms "no external search engine, no AI dependency" (IP-015 §4) is genuinely honored, not just asserted.

## L. Final recommendation

**APPROVED.** Merge-ready. The Completion Report's technical claims about the code (the `sort=relevance` fix, the pagination tiebreaker, the `availableDayOfWeek` semantics and its documented divergence from IP-005, the `pricingModel` non-existence on `MarketplaceListing`, and the `trust_scores.identity_id` index) were all independently re-derived from the actual diff and matched exactly. The one accuracy gap found (§J.1, test-report undercounting a second transient flake) does not change the substantive conclusion that this IP introduces zero reproducible regressions, and is not a reason to block.
