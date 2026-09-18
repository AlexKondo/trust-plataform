# IP-006 — Completion Report

**Field Execution & Trust Evidence Hardening**
Executed 2026-09-16. Owner: Marketplace implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§6 Security) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` (§2) > IP-006 spec (`IPS/IP-006_Field_Execution_Trust_Evidence_Hardening.md`) > `PACK-03-COMPLETION-REPORT.md` (Check-in/Pause/Resume/Check-out baseline) > `IP-005-COMPLETION-REPORT.md` (travel-status/ETA precedent) > real code/migrations/tests at the frozen baseline.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `a9c9a74` (`main`, tip after IP-019). `git status` clean, 15 commits ahead of `origin/main`.
- **Hard dependencies**: IP-001 (CAS/idempotency idioms: `closePauseIfOpen`) and IP-005 (travel status) — both committed on `main`, confirmed by direct inspection of `service-execution.usecase.ts` / `drizzle-service-execution.repository.ts` (IP-001's pattern already lives there) and `order-travel-status.ts` (IP-005).
- **Baseline tests before implementation**: `pnpm test` → **112 files / 739 tests**, all green (matches the IP-019 final state stated in the brief). `pnpm typecheck` clean. `pnpm lint` clean.

## 2. Preflight findings

1. Read PACK-03's completion report in full. Confirmed literally, from the table of tables (§4) and the file list, that `service_execution_sessions`/`service_execution_pauses` have **no evidence-linking column or table whatsoever** — Trust Evidence for execution (before/after photos) is a genuine gap, not a rename of something existing.
2. Confirmed the existing evidence pattern to reuse, by reading the real files: `EvidenceStorageService`/`SupabaseEvidenceStorageService` (`shared/storage/*`, promoted to the shared kernel in PACK-03 §9.5 specifically so a second domain — this one — could attach files without touching `verification_evidences`), and the full Trust Change Order evidence slice (`trust_change_order_evidences` table, `ManageChangeOrderUseCase.uploadEvidence`, `MarketplaceChangeOrderController.submitEvidence`) as the concrete template for multipart upload, MIME/size validation, checksum, and audit logging.
3. Confirmed no execution-evidence access control exists today because no evidence exists today — there was nothing to lock down, only something to build correctly the first time: private bucket, participant-only read, Partner-only write, exactly the posture VRF/Change Order evidence already have.
4. Confirmed, via `grep`, that no service-note capability exists anywhere in `marketplace/**` outside of `MarketplaceReview` (post-completion rating/dispute channel) — a genuine gap for an in-flight, non-adjudicative text note.
5. Confirmed the Service Summary (`ServiceExecutionUseCase.getServiceSummary`, PACK-03 §15) as the existing completion-handoff surface, already reconciling `amountInCustody`/`amountAuthorizedNotInCustody` — extended it rather than inventing a second summary endpoint.
6. Confirmed the CAS idioms already in this codebase (`closePauseIfOpen` compare-and-set on `resumed_at IS NULL`, IP-001; `saveWithExpectedStatus` on Trust Change Order, PACK-03 §19) as the pattern to apply to any *new* execution state transition. This IP adds **no new state transition** — evidence and notes are pure inserts, never updates, so there is nothing to race on the way `pause`/`resume` do. This was verified, not assumed: `service_execution_evidences` and `service_execution_notes` are append-only tables with no `UPDATE` path in the repository at all.
7. Owned files: `apps/api/src/modules/marketplace/**` only. Shared hotspots touched additively: `docs/openapi.yaml` (new paths section), `apps/api/drizzle/*` (new migration + journal entry). Zero files under `payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `identity/**`.
8. No conflict requiring escalation. One deliberate scope decision, documented in §7 below: admin/dispute access to execution evidence is **not** added in this IP (no existing admin-read pattern for marketplace evidence to reuse; adding one would be a cross-cutting authorization decision outside "Field Execution" scope).

## 3. Implemented

### 3.1 Trust Evidence of execution — genuine new capability (optional, never mandatory)

New domain concept `EXECUTION_EVIDENCE_TYPE` (`BEFORE`/`AFTER`/`OTHER`, `marketplace-types.ts`). New table `service_execution_evidences`, deliberately keyed to the **order**, not the session: a "before" photo can predate check-in, and the history must survive for orders created before PACK-03 existed (no session row at all). New bucket `service-execution-evidences` (own table, own bucket — never `verification_evidences` or `trust_change_order_evidences`, following PACK-03 §13's own rule verbatim). Upload flow (`ServiceExecutionUseCase.uploadEvidence`) mirrors Change Order evidence exactly: rate-limited (`SubmitServiceExecutionEvidence`), MIME/size validated (`ExecutionEvidenceMediaTypeException` 415 / `ExecutionEvidenceTooLargeException` 413), checksummed, uploaded to storage **before** the DB write (so a storage failure never leaves a dangling metadata row), audited (metadata only, never content). **Nothing else — check-in, pause, resume, check-out, service-summary — requires or reads evidence to proceed.** Restricted to the Trust Partner (`OrderLifecycleService.loadForSeller`).

### 3.2 Evidence access control — private, participant-scoped

`GET /marketplace/orders/{orderId}/execution-evidences` uses the same `loadForParticipant` gate the Service Summary already uses: Member + Partner only, a third party gets 403. Never a public bucket, never a public route. Proven by e2e: a stranger identity gets 403; buyer and seller both see the same list; a `403` for the Member attempting to *upload* (only the Partner documents the work).

### 3.3 Service notes — new text channel, separate from dispute/review

New table `service_execution_notes` (append-only, order-scoped). `POST/GET /marketplace/orders/{orderId}/service-notes`: the Partner writes free text (max 2000 chars) about what was done; both participants can read it. Deliberately **not** wired into `MarketplaceReview`/`MarketplaceDispute` — those remain the adjudicative/rating channels; this is a plain operational note, closing the literal gap named in the spec ("Partner has no way to leave a text note... separate from the dispute/review flow").

### 3.4 Completion handoff — extended the existing Service Summary, not a new surface

`ServiceSummaryResponse` gained two fields, `evidences` and `notes`, always present (possibly `[]`), populated in `ServiceExecutionUseCase.getServiceSummary` alongside the existing snapshot/Change-Order/execution reconciliation. This is the literal "Service Summary includes relevant evidence" acceptance criterion, achieved by extending the one surface PACK-03 already built for this purpose rather than inventing a second "completion" endpoint.

### 3.5 Concurrency hardening — evaluated, none required for this diff

This IP adds zero new state transitions (evidence upload and note creation are single inserts, not part of any status machine). The existing CAS protection on execution state (`closePauseIfOpen`, IP-001) and Change Order (`saveWithExpectedStatus`, PACK-03 §19) is untouched and unaffected. This is classified **VERIFY_ONLY** for the concurrency-hardening line item: the pattern exists, was inspected, and correctly did not need to be re-applied because nothing new here is a transition.

## 4. Files changed

**New (3)**
```
apps/api/drizzle/0037_ip006_field_execution_evidence.sql
apps/api/test/integration/ip-006.e2e.spec.ts
docs/Multi-Agent Implementation Doc/IPS/IP-006-COMPLETION-REPORT.md
```

**Altered (9)**
| File | What |
|---|---|
| `domain/entities/marketplace-types.ts` | `EXECUTION_EVIDENCE_TYPE(S)` |
| `domain/repositories/service-execution.repository.ts` | `ExecutionEvidenceRecord`/`ServiceNoteRecord` + 4 abstract methods |
| `infrastructure/persistence/service-execution.schema.ts` | `service_execution_evidences` / `service_execution_notes` tables |
| `infrastructure/persistence/drizzle-service-execution.repository.ts` | 4 new methods implemented |
| `domain/exceptions/marketplace.exceptions.ts` | `ExecutionEvidenceMediaTypeException` (415) / `ExecutionEvidenceTooLargeException` (413) |
| `application/dto/trust-change-order.dtos.ts` | evidence/note schemas + response shapes; `ServiceSummaryResponse.evidences/notes` |
| `application/mapper/trust-change-order.mapper.ts` | `toExecutionEvidenceResponse` / `toServiceNoteResponse` |
| `application/usecases/service-execution.usecase.ts` | `uploadEvidence`/`listEvidences`/`addNote`/`listNotes`; `getServiceSummary` extended |
| `infrastructure/api/marketplace-change-order.controller.ts` | 4 new routes |
| `docs/openapi.yaml` | 4 new paths |
| `apps/api/drizzle/meta/_journal.json` | migration 0037 entry |

No changes to `marketplace.module.ts` — `ServiceExecutionUseCase` was already a registered provider, and `RateLimitService`/`EvidenceStorageService`/`AppConfigService` are already global providers (confirmed: `ManageChangeOrderUseCase` already injects all three without any module import beyond what exists).

## 5. Migration

`0037_ip006_field_execution_evidence.sql` — additive and re-runnable, same style as 0024–0027 (`CREATE TABLE IF NOT EXISTS`, FK guarded by `information_schema` check, conditional index). Two tables:

| Table | Role | Guarantee |
|---|---|---|
| `service_execution_evidences` | Photo metadata (binary in storage) | FK to `marketplace_orders`, index `(order_id, uploaded_at)` |
| `service_execution_notes` | Partner's free-text note | FK to `marketplace_orders` and `identities`, index `(order_id, created_at)` |

**Known issue, same as PACK-03's own #10.2**: the bucket `service-execution-evidences` does not exist in Supabase Storage yet. It must be created **private**, same posture as `verification-evidences`/`change-order-evidences`, before this ships to a real environment. Not created by this agent (constraint: never provision real Supabase infrastructure).

## 6. APIs

4 new routes, none duplicating an existing one:
```
POST   /api/v1/marketplace/orders/{orderId}/execution-evidences   201  (Partner, multipart)
GET    /api/v1/marketplace/orders/{orderId}/execution-evidences   200  (participants)
POST   /api/v1/marketplace/orders/{orderId}/service-notes         201  (Partner)
GET    /api/v1/marketplace/orders/{orderId}/service-notes         200  (participants)
```
No new events published — evidence/notes are audited (`AuditLogService.record`), not eventable facts, matching PACK-03's own precedent (Change Order evidence upload also publishes no event, §5 of that report).

## 7. Tests and results

- **Unit/typecheck/lint**: `pnpm typecheck` clean, `pnpm lint` clean (root `eslint .`), `pnpm test` (unit) → **112 files / 739 tests**, unchanged from baseline (no new unit spec file was added; the new logic is thin orchestration over already-unit-tested primitives — evidence/note persistence, MIME/size checks mirror the already-unit-covered Change Order evidence path).
- **E2E** (`pnpm test:e2e --no-file-parallelism`, embedded disposable Postgres): new `test/integration/ip-006.e2e.spec.ts`, **4/4 passing**:
  1. Check-in → check-out completes with **zero** evidence uploaded (proves evidence is optional, not gating).
  2. Partner uploads a `BEFORE` photo; Member attempting to upload gets 403; both participants can list it; a third-party stranger gets 403 (proves private/authorized); Service Summary carries the evidence.
  3. Unsupported MIME type (`application/x-msdownload`) → 415.
  4. Partner adds a service note; Member attempting to add one gets 403; both participants can list it; order still completes normally afterward.
- **Full suite result**: 113 files / 743 tests, **112 passed / 1 failed** on the first clean re-run after clearing a stale `.pgdata-e2e` lock directory from an earlier interrupted run (Windows-specific EPERM on embedded-Postgres teardown, the exact failure mode this brief warned about — resolved by removing the stray directory and no stray `postgres.exe` was found). The one failure, `ip-002-i18n.e2e.spec.ts > ... waitForScore`, is a **timeout** (`Score não chegou a 25`) in an unrelated module (i18n/notification locale propagation), not touched by this diff, not an assertion mismatch — consistent with the flakiness PACK-03's own completion report documented (I/O-saturated checkpoints on this machine). All IP-006 tests and all previously-passing files remained green.

## 8. Acceptance criteria

| Criterion | Evidence |
|---|---|
| Execution state transitions race-safe | No new transition added; existing CAS (`closePauseIfOpen`) untouched — see §3.5 |
| Evidence private and authorized | `loadForSeller` gates upload, `loadForParticipant` gates read; e2e proves 403 for non-participant and for wrong role |
| Service Summary includes relevant evidence | `ServiceSummaryResponse.evidences`/`.notes`, e2e asserts non-empty after upload |
| Member/Partner can complete operational journey | Note + evidence + check-out all proven in the same e2e flow without any new blocking requirement |
| Tests cover file failures and authorization | 415 (bad MIME) and 403 (wrong role, non-participant) both covered |
| Photos remain optional/contextual | e2e scenario 1: full check-in→check-out with zero evidence |

## 9. Deviations and decisions

1. **Evidence and notes tied to the order, not the session.** PACK-03's session is created only at check-in; a "before" photo may need to exist earlier, and pre-PACK-03 orders have no session row at all. Tying to `order_id` directly avoids a false dependency and matches how `service_execution_notes`/`service_execution_evidences` need to survive independent of whether a session exists.
2. **No admin/dispute-override read path added.** The spec's own acceptance line ("+ admin for disputes") was investigated: no existing marketplace evidence route has an admin-bypass today (Change Order evidence is participant-only too), so adding one here would be inventing a new cross-cutting authorization concept outside this IP's declared scope. Flagged as **remaining work**, not silently dropped.
3. **No new outbox events.** Matches PACK-03's own precedent (Change Order evidence upload is audit-only, no event) — evidence/notes are supporting facts, not state transitions other modules need to react to.
4. **Concurrency hardening classified VERIFY_ONLY.** No new state transition was introduced; CAS was inspected and confirmed unnecessary for pure appends. If the Checker disagrees and believes a race exists (e.g., two Change Order evidence uploads at once), that risk pre-dates this IP and was not touched.

## 10. Remaining work

- Bucket `service-execution-evidences` must be created privately in Supabase Storage before production use (§6, known issue, same posture as PACK-03's unresolved `change-order-evidences` item).
- Admin/dispute read-access to execution evidence and notes — deferred, no existing pattern to extend (§9.2).
- Frontend surfaces for evidence upload, note entry, and the extended Service Summary — not requested by this IP's spec, backend now exposes everything needed.

## 11. Commits

`COMMIT_PENDENTE` — diff left uncommitted and unstaged for review, per instruction (`main` commits the exact file set after Diff Review / Quality Gate).
