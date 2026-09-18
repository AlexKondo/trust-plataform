# IP-021 — Independent Diff Review

**Privacy, LGPD & Data Lifecycle**
Reviewer: independent Quality/Diff Agent. Baseline: `main` @ `dff3ab8`. Working tree at review time: exactly the files listed in the Completion Report §5, plus the pre-existing unrelated `.claude/settings.local.json`. Nothing else uncommitted.

## 1. Scope / file-list verification

`git status --short` / `git diff --stat` reproduced independently — **exact match** with Completion Report §5:

- 19 new files under `apps/api/src/modules/privacy/**`, `apps/api/src/shared/privacy/**`, `apps/api/src/shared/database/schema/legal-consents.ts`, the migration, and the e2e spec.
- 15 modified files, all additive (`app.module.ts` +2 imports/+2 entries, `schema/index.ts` +1 export line, `create-identity.usecase.ts`+spec for consent capture, `identity.ts`/`.spec.ts` for `anonymize()`, `trust-passport.ts`/`.spec.ts` for `anonymizeProfile()`, `drizzle-identity.repository.ts` for the `email` column in `save()`, frontend files, `docs/openapi.yaml`).
- **Confirmed: zero diff under `apps/api/src/modules/payment/**`, `apps/api/src/modules/marketplace/**`, `apps/api/src/modules/verification/**`** (`git diff --stat` against these paths returns empty). No scope violation.

## 2. Data classification inventory (`apps/api/src/shared/privacy/data-classification.ts`)

Read in full and cross-checked against every schema file it claims to summarize (`identities.schema.ts`, `trust-passports.schema.ts`, `verifications.schema.ts`, `payment.schema.ts`, `payment-incremental.schema.ts`, `audit-logs.ts`, `marketplace-order.schema.ts`, `service-request.schema.ts`, `marketplace-review.schema.ts`). Every table/category/`deletionBehavior` triple is accurate. Not aspirational — it matches what the code actually does (`ANONYMIZED` entries correspond 1:1 to what `Identity.anonymize()`/`TrustPassport.anonymizeProfile()` actually mutate; `NOT_TOUCHED_ESCALATED` entries correspond 1:1 to the Conflict Escalation). **Verdict: accurate.**

## 3. `PrivacyRequest` workflow / IDOR check

Read `privacy.controller.ts`, `get-privacy-requests.usecase.ts`, `request-data-export.usecase.ts`, `request-data-deletion.usecase.ts` in full.

- Every route resolves identity strictly from `@CurrentIdentity()` (JWT). `GetPrivacyRequestsUseCase.get()` additionally checks `request.identityId !== identityId` and throws `PrivacyRequestAccessDeniedException` (403) — **no route accepts an identity/owner id from the client**. **No IDOR found.**
- States/transitions (`REQUESTED → PROCESSING → COMPLETED|REJECTED`) match the entity exactly; `rejectionReason` is a stable enum, never free text.

## 4. Deletion is anonymization, not row deletion — line-by-line

`Identity.anonymize()` (`identity.ts:191-197`): sets `fullName` to a fixed pseudonym, `email` to `anonimizado+<id>@anonimizado.trust.invalid` (deterministic from the already-unique id — cannot collide, idempotent on retry), `passwordHash` to `ANONYMIZED:<id>` (never a valid Argon2id hash), `deletedAt`/`updatedAt` to `now`. Nothing else touched.

`TrustPassport.anonymizeProfile()` (`trust-passport.ts:216-225`): nulls `phone`/`addressCountry`/`addressState`/`addressCity`; **deliberately preserves** `emailVerified`/`phoneVerified`/`documentVerified`/`addressVerified`/`profileCompletion` (historical fact, not contact PII, explicitly and correctly reasoned in the docstring); sets `deletedAt`/`updatedAt`.

Both confirmed to touch **only** the fields claimed — no amount/financial/audit field is anywhere near either method. `RequestDataDeletionUseCase` wraps both plus `SessionRepository.revokeAllByIdentity` plus `PrivacyRequest.complete` plus one `AuditLogService.record` in a single `db.transaction()`. **Verdict: matches the claim exactly.**

## 5. "No denormalized PII in financial/audit/execution tables" — independently falsified via grep

Grepped `payment.schema.ts`, `payment-incremental.schema.ts` (all tables), `audit-logs.ts`, `marketplace-order.schema.ts` (orders, schedulings, **execution events**, confirmations), `marketplace-commercial-snapshot.schema.ts`, `trust-change-order.schema.ts`, `service-execution.schema.ts` for `name`/`email`/`phone`/`cpf`/`document_number`/`address` (broad, case-insensitive). **One hit**: `marketplace_order_execution_events.address` — inspected in context (schema lines 112-136): this is the reverse-geocoded text companion to the row's own `latitude`/`longitude`/`accuracy` columns, i.e. **where the GPS check-in/check-out occurred**, referenced only by `performed_by` (UUID). It is not a person's mailing/contact address and is already correctly classified separately as `LOCATION_PRECISE` in the inventory, not silently folded into `IDENTIFYING_PII`. No other hit anywhere in the financial/audit/execution schema set. Also independently grepped every `auditLogService.record(...)`/`.recordSafe(...)` call site's `metadata:` block repo-wide for `email`/`fullName`/`phone` — zero PII values found (one match, `{ reason: 'UNKNOWN_EMAIL' }`, is a reason code, not a value). **Verdict: the claim holds, genuinely falsifiable-and-not-falsified.**

## 6. TOCTOU race on the deletion eligibility gate — INVESTIGATED EMPIRICALLY, CONFIRMED REAL

`DeletionEligibilityService.checkEligibility()` runs **before and outside** `RequestDataDeletionUseCase`'s `db.transaction()` (`request-data-deletion.usecase.ts:58` vs. `:83`). The transaction itself never re-checks eligibility, never re-reads the orders/custody tables, and takes no lock related to them — it only mutates `identities`/`trust_passports`/`sessions`/`privacy_requests`. `AcceptOfferUseCase` (the only path that creates a new `marketplace_order`) never reads or checks the identity's `deletedAt`/anonymization state at all.

**This was verified empirically, not just by inspection.** A throwaway test was written (temporarily appended to `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts`, run against the real embedded Postgres via `node test/e2e-local.mjs`, then fully reverted — the file is back to its original 275 lines, confirmed by line count and content). The test used `vi.spyOn` on `DeletionEligibilityService.checkEligibility` to deterministically inject a concurrent `AcceptOfferUseCase.execute()` call (creating a brand-new non-terminal order for the buyer being deleted) in the exact instant between the real eligibility check resolving and the anonymization transaction starting.

**Result (all assertions passed):**
```
deletionStatus: 'COMPLETED'
rejectionReason: null
identityDeletedAt: <set>
orderStatus: 'CREATED'   // non-terminal
```
The identity was anonymized while a brand-new, non-terminal order (buyer role) existed for it — exactly the scenario `DeletionEligibilityService` exists to prevent. This is not a theoretical concern; it is a reproducible bypass of the IP's own core safety invariant.

Additional reasoning: the codebase's established concurrency precedent for critical transitions (IP-001/IP-007, `drizzle-incremental-trust-custody.repository.ts:90-115`, comment "CAS fase 1"/"CAS fase 2") is a **conditional `UPDATE ... WHERE status = X`** pattern — not a transaction-isolation-level change. No `SERIALIZABLE`/`FOR UPDATE` usage exists anywhere in this codebase (grepped, zero hits). Even if the anonymization transaction were bumped to `SERIALIZABLE`, it would **not** catch this race by itself, because the anonymization transaction never reads the `marketplace_orders` table — Postgres has nothing to detect a write-skew against. The only correct fix is a **re-check inside the transaction** (re-run `checkEligibility` using the transaction's own executor immediately before mutating, and abort/rollback if now ineligible), following the same "the last read before the write is the one that counts" discipline the CAS methods already use elsewhere in this repository.

**Severity: BLOCKING.** The operation being protected is irreversible (anonymization cannot be undone), the gap is proven exploitable (not merely "untested" as the report's own self-flagged framing suggested), and it directly undermines the one safety property (§9 of the Completion Report) that this IP explicitly claims to guarantee — "the deletion eligibility check is itself a money-adjacent invariant guard." A narrow race window does not reduce the severity of an irreversible-operation safety-invariant bypass; it only reduces the probability of a given single attempt succeeding, and the window can be widened adversarially (e.g., a user submitting deletion while simultaneously having a counterparty accept a pending offer — plausible, not exotic).

## 7. `save()` extension to include `email`

Grepped every call site of `identityRepository.save(...)` (9 total). Every caller other than `RequestDataDeletionUseCase` invokes only domain methods that never mutate `props.email` (`activate`, `changePassword`, `registerFailedLogin`, `registerSuccessfulLogin`, `changePreferredLocale`). Since the entity's `email` getter always reflects `props.email`, and no other method mutates it, including `email` in `onConflictDoUpdate.set` is a provable no-op (re-writes the same unchanged value) for every caller except `anonymize()`. **No regression found.**

## 8. Frontend

`DataLifecycleSection` in `apps/web/app/settings/privacy/page.tsx`: delete button is `disabled={!confirmDelete || busy === 'delete'}`, gated behind an explicit checkbox with a full-sentence consequence statement (`privacy.deleteConfirmLabel`) — genuine two-step confirmation, not a single accidental click. Every new string in this component routes through `t(...)`; both `en-US.ts`/`pt-BR.ts` carry the same 23 `privacy.*` keys, both files end in `satisfies Messages`, which fails the build on key drift (independently confirmed: `apps/web` typecheck is clean, §Test results). The rest of `/settings/privacy` (pre-existing visibility toggles) correctly left untouched with its pre-existing hardcoded strings, as IP-002 already decided for that screen.

## 9. Conflict Escalation artifact review

`IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md` reads as a genuine, well-scoped legal/product question: whether KYC evidence (ID scans) must be retained after deletion, for how long, under what legal basis. Checked `04_APPROVED_PRODUCT_DECISIONS.md` directly — no existing decision addresses this; it is not answerable from anything already in the repo. The three options presented are fairly stated with honest trade-offs (including that Option C, the "safest privacy" option, is flagged as the one most likely to need reversal if legal disagrees — appropriately cautious, not padding). The "do nothing, flagged" default is a defensible interim posture: it does not silently drop PII protection below where it already was (evidence was never deletable before this IP either), and the gap is documented in the data-classification inventory, the Completion Report, and this artifact — not hidden. **Verdict: legitimate escalation, correctly scoped, not a disguised implementation gap.** It also does not overlap with or paper over the TOCTOU finding above — that is a separate, purely engineering concurrency defect the report itself acknowledges but underweights, not a legal ambiguity.

## 10. Findings summary

| # | Finding | Severity |
|---|---|---|
| 1 | Deletion eligibility gate has a proven, empirically-reproduced TOCTOU race: an identity can be anonymized while a brand-new non-terminal order (financial obligation) exists, because the anonymization transaction never re-checks eligibility inside its own transaction boundary. | **BLOCKING** |
| 2 | `GET /verifications/queue/pending` (admin bulk queue) has no audit entry — real, pre-existing, correctly identified as out of `privacy`'s ownership, correctly reported not silently fixed. | MINOR (tracked, not this IP's to fix) |
| 3 | KYC evidence retention undecided — correctly escalated, not a gap in this IP's execution. | OBSERVATION (informational) |
| 4 | No admin override, no async export/deletion queue, no free-text PII redaction — all explicitly and reasonably scoped out for a foundation IP, matches Shared Standards §1 "minimum safe design." | OBSERVATION |

No CRITICAL or MAJOR findings beyond #1. Everything else in the diff (classification accuracy, IDOR protection, anonymization correctness, financial/audit isolation, migration safety, i18n discipline, scope discipline) independently verified and matches the Completion Report's claims exactly.

## 11. Diff Review verdict (original pass)

**CHANGES REQUESTED.** Fix finding #1 (re-check eligibility inside the anonymization transaction, using the transaction's own executor, before mutating) and re-verify with a concurrency test before this merges. Everything else in the diff is approved as-is.

---

## 12. Confirmation pass — independent re-verification of the TOCTOU fix

Reviewer: independent Quality/Diff Agent (confirmation pass). Baseline unchanged: `main` @ `dff3ab8` + this IP's uncommitted working tree. Scope: re-verify finding #1's fix specifically, and re-run everything from scratch. No shared/production Supabase touched.

### 12.1 The fix — read end to end, independently

Read `request-data-deletion.usecase.ts`, `deletion-eligibility.service.ts`, `marketplace-order.repository.ts` (interface + `DrizzleMarketplaceOrderRepository`), and `service-request.repository.ts` (interface + `DrizzleServiceRequestRepository`) in full, line by line, without relying on the Completion Report's own description.

- **Confirmed**: `checkEligibility(identityId, tx)` is the **first statement inside `db.transaction(async (tx) => {...})`** (`request-data-deletion.usecase.ts:90-96`). There is no other call to `checkEligibility` anywhere in the file, and no path from `execute()` to `identity.anonymize(...)` that does not pass through this check first — traced the control flow directly: the `if (blockingReason) { ...; return; }` branch returns from inside the transaction callback before `identity.anonymize(now)` is ever reached (line 119). There is no world in which the check runs, fails, and the mutation still executes.
- **Confirmed the executor is genuinely threaded, not silently dropped**: both `DrizzleMarketplaceOrderRepository.listForParticipant` and `DrizzleServiceRequestRepository.findByOwner` use `const target = executor ?? this.db;` and issue their Drizzle queries through `target`, not `this.db` — read directly in the implementation files, not inferred from the interface comments. Same pattern independently confirmed for `TrustCustodyRepository.findByOrderId` and `IncrementalTrustCustodyRepository.listByOrderId` (pre-existing from IP-007, unchanged).
- **Call-site count claim, minor inaccuracy found**: the Completion Report (§5, §11.11) states both `listForParticipant` and `findByOwner` have "exactly one other call site" (`RequestDataExportUseCase`). Grep found this understates it: `listForParticipant` is also called from `manage-order.usecase.ts:50` (`ManageOrderUseCase.list`), and `findByOwner` is also called from `get-service-request.usecase.ts:42` (`GetServiceRequestUseCase.listMine`) — both pre-existing, both call the method without an executor. This does not weaken the fix: `executor` is an optional trailing parameter, so both extra call sites remain unaffected regardless of how many there are (confirmed by the green typecheck/build/unit suite below, which would have caught any signature break). Flagged as a documentation-accuracy nit, not a functional or safety finding.
- **`Identity.anonymize()` / `save()`'s `email` extension**: re-read independently, matches the original Diff Review's own findings exactly — no change here from the fix.

### 12.2 Residual-window claim — independently judged

The Completion Report (§3.4 "Residual risk") states the fix narrows but does not fully eliminate the TOCTOU window: between `checkEligibility(identityId, tx)` resolving and `identityRepository.save(identity, tx)` executing, both on the same transaction connection with only synchronous entity-method calls in between (no network/DB I/O).

Independent assessment: this is accurate, not overclaimed. Two sequential statements on one connection, in READ COMMITTED (this codebase's default, confirmed — grepped for `SERIALIZABLE`/`FOR UPDATE`, zero hits, same as the original Diff Review's own finding), do leave a microsecond-scale gap that pessimistic locking (a Postgres advisory lock keyed on `identityId`, held by both this transaction and `AcceptOfferUseCase`'s order-creation transaction) or a shared `SERIALIZABLE` isolation level would be needed to close completely. Both would require modifying `marketplace`'s `AcceptOfferUseCase`, which is explicitly out of `privacy`'s file ownership per the Manifest, and genuinely out of proportion for an MVP engineering safety rail (not a security boundary) protecting against a race that requires an adversary to time a real, committed HTTP request to land inside a sub-millisecond window on every attempt. This is judged an honest and adequately narrow residual, not a reason to block again. It is also correctly recorded as a known residual in §3.4/§12 of the Completion Report rather than left implicit.

### 12.3 Regression test — verified genuine, gold-standard method used

Read the new e2e test (`ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts`, last `it()` block) and the new unit test (`deletion-eligibility.service.spec.ts`, "executor threading" describe block) in full.

- The unit test asserts, via a `Symbol('tx')` sentinel, that `checkEligibility(identityId, fakeTx)` forwards that exact sentinel to all 4 underlying repository calls (`listForParticipant`, `findByOrderId`, `listByOrderId`, `findByOwner`) — genuinely exercises executor propagation, not just presence of the parameter.
- The e2e test injects a concurrent, fully-committed `POST .../offers/:id/accept` (via `vi.spyOn(TrustPassportRepository.prototype.findByIdentityId)`) at the exact point that, in the fixed code, runs **before** the relocated eligibility check. This is the correct injection point to exercise the fix's guarantee.
- **Did the gold-standard revert-and-confirm approach**, as recommended: temporarily edited `request-data-deletion.usecase.ts` to restore the pre-fix design (`checkEligibility` called via a separate, non-transactional read, before the Trust Passport lookup and before `db.transaction()` opens — reconstructed directly from the original Diff Review's own description of the bug, §6 of this document), ran `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` in isolation against the real embedded Postgres, and then restored the fix exactly (re-read afterward to confirm the file is byte-identical to the pre-revert version).
  - **Against the reverted (pre-fix) code**: 6/7 tests passed, **1 failed — exactly the TOCTOU regression test**, with the actual result `status: "COMPLETED"` where `"REJECTED"` was expected — i.e., the identity was anonymized despite the concurrently-created non-terminal order, precisely reproducing the original Diff Review's empirical finding.
  - **Against the restored (fixed) code**: 7/7 passed again, including the same regression test.
  - This is direct, empirical proof — not just code-reading inference — that the regression test is real and would have failed against the old code.

### 12.4 Tests re-run from scratch

- `pnpm typecheck` (root, both `apps/api`/`apps/web`): **0 errors**.
- `pnpm lint` (root, eslint): **0 errors, 0 warnings**.
- `pnpm -r build`: **both apps build clean** (`apps/api` tsc, `apps/web` next build — 26 routes, unchanged count).
- Unit suite (`npx vitest run`, apps/api, no `TEST_DATABASE_URL`): **56 files passed | 26 skipped (82); 465 tests passed | 115 skipped (580)** — exact match to the Completion Report's post-fix claim.
- `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` in isolation: **7/7 pass** (confirmed twice — once standalone, once as the post-restore sanity check after the revert experiment), including the TOCTOU regression test, with the log line `"reason":"ACTIVE_ORDERS","result":"DENIED"` immediately following `"Marketplace offer accepted; order created."` for the same identity, matching the Completion Report's claim exactly.
- Full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres): first attempt **3 files failed / 8 tests failed (79/82 files, 572/580 tests)** — all 8 failures were pure `waitForScore`/60s timeouts in `ip-002-i18n.e2e.spec.ts`, `mrk-023-025.e2e.spec.ts`, `ntf-001.e2e.spec.ts`, none of which this IP touches. Re-ran exactly those 3 files in isolation: **3/3 files, 14/14 tests pass** in 87s (vs. ~484s combined under full-suite contention) — confirms transient host contention, not a regression, matching the exact pattern the Completion Report itself documents. **Net result: 82/82 files, 580/580 tests green**, matching the Completion Report's claimed post-fix totals exactly.
  - Note: two earlier attempts at the full suite failed to even start (`FATAL: pre-existing shared memory block is still in use`), caused by an orphaned `postgres.exe` process left behind by a previous embedded-Postgres invocation in this same review session not releasing its shared-memory segment before the next run started (confirmed via `Get-Process`, killed, retried successfully). This is a local review-session artifact of running several embedded-Postgres invocations back-to-back, not a defect in the IP's code, migration, or test harness — reported here for transparency, not as a finding.

### 12.5 Regression / footprint check

`git status --short` / `git diff --stat` reproduced independently — **exact match** to the Completion Report §5 footprint (15 modified + 4 additional marketplace-repository files from the fix + 19 new files under `privacy/**`, `shared/privacy/**`, `shared/database/schema/legal-consents.ts`, the migration, and the e2e spec). `git diff --stat -- apps/api/src/modules/payment/` and `-- apps/api/src/modules/verification/` both return empty — **zero touch of `payment/**` or `verification/**` confirmed**, including after the fix's additional changes to `marketplace/**` repositories. (One unrelated observation: `.claude/settings.local.json`, previously noted as a pre-existing unrelated local-tooling diff, no longer shows as modified at the time of this confirmation pass — a session-local artifact unrelated to this IP's scope, not investigated further.)

`IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md` re-read — unaffected by the TOCTOU fix, content unchanged, still a legitimate and correctly-scoped escalation (consistent with §9 of the original review pass).

### 12.6 Confirmation-pass verdict

**PASS.** The TOCTOU fix is genuine: the eligibility check now runs as the authoritative, first statement inside the anonymization transaction, on the transaction's own connection, with no code path that can mutate `identities`/`trust_passports` without passing through a fresh check first. The executor-forwarding plumbing through all 4 repository calls is real, not cosmetic (confirmed by reading the Drizzle implementations and by the sentinel-based unit test). The new e2e regression test was independently proven — by literally reverting the fix, re-running the test, and observing it fail with the exact bug the original review reproduced, then restoring the fix and confirming it passes again — to be a real regression test, not a test that would pass either way. The residual-window claim in §3.4 of the Completion Report is accurate and honestly scoped, not overclaimed; closing it fully is legitimately out of this fix's boundary. One minor documentation-accuracy nit (call-site count for `listForParticipant`/`findByOwner`) does not affect correctness or safety. All previously-approved findings from the original pass (§1-10 above) still hold unchanged. Full test suite reconciles to 82/82 files, 580/580 tests green, matching the Completion Report's claims exactly.
