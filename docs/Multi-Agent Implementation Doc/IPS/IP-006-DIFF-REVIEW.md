# IP-006 — Diff Review (independent Quality/Diff Agent)

Baseline: `main` @ `a9c9a74`. Reviewed the uncommitted working-tree diff described in
`IP-006-COMPLETION-REPORT.md` by direct inspection of code, schema, migration, and tests —
not by trusting the report's narrative.

## Files touched (verified via `git status --short` / `git diff --stat`)

**New**
- `apps/api/drizzle/0037_ip006_field_execution_evidence.sql`
- `apps/api/test/integration/ip-006.e2e.spec.ts`
- `docs/Multi-Agent Implementation Doc/IPS/IP-006-COMPLETION-REPORT.md`

**Modified**
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/modules/marketplace/application/dto/trust-change-order.dtos.ts`
- `apps/api/src/modules/marketplace/application/mapper/trust-change-order.mapper.ts`
- `apps/api/src/modules/marketplace/application/usecases/service-execution.usecase.ts`
- `apps/api/src/modules/marketplace/domain/entities/marketplace-types.ts`
- `apps/api/src/modules/marketplace/domain/exceptions/marketplace.exceptions.ts`
- `apps/api/src/modules/marketplace/domain/repositories/service-execution.repository.ts`
- `apps/api/src/modules/marketplace/infrastructure/api/marketplace-change-order.controller.ts`
- `apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-service-execution.repository.ts`
- `apps/api/src/modules/marketplace/infrastructure/persistence/service-execution.schema.ts`
- `docs/openapi.yaml`
- `apps/web/tsconfig.tsbuildinfo` (build artifact, no functional change)

Scope confirmed limited to `marketplace/**` + shared docs/migration bookkeeping. Zero touch of
`payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `identity/**`. Matches the
report's own claim (§1/§4).

## 1. Order-scoped vs session-scoped evidence/notes — VERIFIED, judged correct

`service_execution_evidences` and `service_execution_notes` are keyed to `order_id`
(`service-execution.schema.ts` lines 95-139), not `session_id`. Traced why this is safe rather
than accepting the report's framing at face value:

- `service_execution_sessions` carries `UNIQUE(order_id)` (`idx_service_execution_session_order`,
  line 47 of the schema) — **one session per order is a hard DB invariant in the current model**,
  not just a convention.
- `manage-order.usecase.ts` `reschedule()` explicitly refuses to reschedule once
  `order.startedAt !== null` (`OrderNotReschedulableException`), i.e. once check-in has happened.
  Reschedule only replaces the *scheduling* row (`Scheduling.create` + `current.cancel(...)`)
  before any execution session exists; it never touches `service_execution_sessions`.
- Net effect: there is no code path in the current model that produces two execution sessions,
  or two overlapping "in-progress" executions, for the same order. Order-scoped evidence/notes
  therefore cannot become ambiguous about "which session" they belong to, because there is
  categorically at most one session per order today.

Given that, tying evidence/notes to `order_id` is the right call, and strictly better than
`session_id` for the stated reason: it lets a "before" photo exist pre-check-in (no session row
yet) and lets pre-PACK-03 orders (no session table entry ever) still carry evidence. This is a
genuine, justified design choice, not an unexamined shortcut.

**Caveat (OBSERVATION, not a defect in this diff):** if a future IP ever allows multiple
execution sessions per order (e.g. multi-visit services), order-scoped evidence/notes would
silently start conflating photos/notes across visits with no schema-level way to disambiguate.
That is future risk, correctly out of scope for IP-006, but worth a forward note in the spec
backlog so it isn't rediscovered the hard way.

## 2. Access control — VERIFIED by tracing the actual guards, not test names

- `OrderLifecycleService.loadForParticipant` (`order-lifecycle.service.ts:56`) throws
  `MarketplaceOrderNotFoundException` if the order doesn't exist and calls
  `order.assertParticipant(identityId)` — a non-participant is rejected before any evidence/note
  row is ever touched. `listEvidences`/`listNotes` (`service-execution.usecase.ts`) call this
  directly, so a stranger's `GET` correctly resolves to 403 (via `assertParticipant`'s own
  exception — confirmed as `MarketplaceOrderAccessDeniedException`/403 pattern used everywhere
  else in this file).
- `OrderLifecycleService.loadForSeller` (line 69) calls `loadForParticipant` then requires
  `role === 'SELLER'`, else throws `MarketplaceOrderAccessDeniedException` (403). Both
  `uploadEvidence` and `addNote` call `loadForSeller` — confirmed a Member (buyer) gets a
  genuine 403 on write, not merely a test that happens to pass.
- Bucket privacy: `service-execution-evidences` is used only via the shared
  `EvidenceStorageService` abstraction (`shared/storage/*`). `SupabaseEvidenceStorageService`
  uploads with the service-role key directly to the Storage REST API and never generates or
  returns a public URL; reads are always proxied through the authenticated `GET` route, exactly
  the same posture as `verification-evidences`/`change-order-evidences` (same class, same
  pattern, no route exposes a raw storage URL). Actual bucket creation as *private* in Supabase
  is an infra step outside app code for all three buckets alike — this IP does not regress
  that posture, it matches it exactly.

## 3. VERIFY_ONLY concurrency claim — VERIFIED, no additional race found

Both `addEvidence`/`addNote` repository methods are pure `INSERT`s with no `UPDATE`/`UPSERT`
path (confirmed by reading `drizzle-service-execution.repository.ts` and the schema — no
`ON CONFLICT`, no compare-and-set columns on either table). There is no unique constraint to
violate on either table beyond the primary key (a fresh `uuidv7()` per row), so two concurrent
uploads for the same order cannot race into an inconsistent state — worst case is two valid rows
inserted in either order, both individually consistent. This differs materially from
`service_execution_pauses` (which needs the partial unique index on `resumed_at IS NULL` to
prevent two open pauses) precisely because pauses have an invariant to protect
(one-open-pause-at-a-time) and evidence/notes do not. The report's self-assessment holds up
under independent check — no new finding here.

## 4. Missing admin-for-disputes read path — CONFIRMED gap, pre-existing pattern, not new

Grepped the entire `marketplace/**` controller surface: no admin/mediator-scoped route exists
for *any* evidence today, including `manage-dispute.usecase.ts`'s own dispute evidence. The gap
IP-006 declines to close is the same gap that already existed for Change Order evidence and
dispute evidence before this diff — it is not a regression introduced here. See Quality Gate
for severity judgment.

**Finding (MINOR, documentation accuracy):** the completion report (§9.2) attributes this
deferral to "the spec's own acceptance line ('+ admin for disputes')," presented as a literal
quote. `IP-006_Field_Execution_Trust_Evidence_Hardening.md` §6 ("Acceptance criteria") contains
no such text and the string "admin" does not appear anywhere in the spec file. The underlying
engineering judgment (defer, no existing pattern to extend, flag as remaining work) is sound and
independently corroborated above, but the report misquotes the spec to justify it. This should
be corrected in the completion report — cite it as inferred from IP-008/marketplace-review
context, not as a literal spec quote, or drop the quotation marks.

## 5. Optional-evidence proof — VERIFIED as a genuine assertion

`ip-006.e2e.spec.ts` test 1 asserts `GET .../execution-evidences` returns `[]` (i.e., the row
never gets created, not just "no validation error"), then separately asserts
`POST .../complete` returns `200`. This is a real proof that completion does not require
evidence — it is not merely the absence of a required-field check; check-in/checkout/complete
routes never read the evidence table at all (confirmed: no evidence/notes lookups anywhere in
the check-in/pause/resume/complete code paths in `service-execution.usecase.ts` or
`manage-order.usecase.ts`).

## 6. MIME/size validation — VERIFIED

`uploadEvidence` checks `ALLOWED_EXECUTION_EVIDENCE_MIME_TYPES.includes(...)` before touching
storage, throwing `ExecutionEvidenceMediaTypeException` (415) — confirmed by the e2e test
uploading `application/x-msdownload` and asserting 415. Size limit: `input.content.length >
this.config.evidenceMaxFileBytes` throws `ExecutionEvidenceTooLargeException` (413) — this is
the same shared `AppConfigService.evidenceMaxFileBytes` config value already enforced for
Change Order evidence and Verification evidence (`manage-change-order.usecase.ts`,
`submit-evidence.usecase.ts`), and it is also wired at the Fastify multipart layer
(`main.ts:31`, `limits: { fileSize: config.evidenceMaxFileBytes }`), i.e. defense in depth
(early truncation at the HTTP layer, explicit check in the use case). The report did not call
this out explicitly but it is present and correct — not a gap.

## Regression / test re-run (see Quality Gate for numbers)

`pnpm typecheck`, `pnpm lint`, `pnpm -r build` all clean. Unit `pnpm test` unchanged (no
regressions, no new unit spec added — consistent with report's own admission that new logic is
thin orchestration over already-covered primitives). Full e2e run performed separately with a
bounded/monitored approach per instructions; see Quality Gate for the actual result obtained
independently.
