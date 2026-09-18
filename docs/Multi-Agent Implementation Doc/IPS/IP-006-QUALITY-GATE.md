# IP-006 — Quality Gate

Independent Quality/Diff Agent. Baseline `main` @ `a9c9a74`. All checks below were re-run from
scratch by this agent, not copied from the completion report.

## Verdict: **PASS**

## Checks

| Check | Result |
|---|---|
| `pnpm typecheck` (root, both workspaces) | Clean |
| `pnpm lint` (`eslint .`) | Clean |
| `pnpm -r build` (api + web) | Clean |
| Unit `pnpm test` | 79 files passed / 34 skipped (113 total incl. e2e-only files); 604 passed / 139 skipped tests. No regressions vs. baseline; consistent with report's "112/739, unchanged" framing (skipped files are the e2e specs, not run under `pnpm test`). |
| Full e2e `pnpm test:e2e --no-file-parallelism` (`apps/api`, embedded disposable Postgres) | **113 files: 112 passed / 1 failed. 743 tests: 742 passed / 1 failed.** Failure is `test/integration/ip-002-i18n.e2e.spec.ts` ("notificação resolve o locale do DESTINATÁRIO..."), an unrelated, previously-documented flaky i18n/notification timing test — not touched by this diff. `test/integration/ip-006.e2e.spec.ts` itself: 4/4 passed. Matches the completion report's claimed numbers and failure exactly. |
| Regression scope (`git status --short`, `git diff --stat`) | Limited to `marketplace/**` (execution/evidence slice) + `docs/openapi.yaml` + `apps/api/drizzle/{0037_*.sql, meta/_journal.json}` + `apps/web/tsconfig.tsbuildinfo` (build artifact, no functional change). Zero touch of `payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `identity/**`. |
| No stray `postgres.exe` / `.pgdata-e2e` lock before run | Verified clean before starting; e2e run completed and exited normally (exit code 0), no manual intervention needed this time. |

## Findings

1. **[OBSERVATION]** Order-scoped (not session-scoped) evidence/notes is the correct design for
   the current data model. `service_execution_sessions` enforces `UNIQUE(order_id)` at the DB
   level and `reschedule()` is hard-blocked once `startedAt !== null`, so multiple execution
   sessions per order are architecturally impossible today — there is no ambiguity risk. This is
   forward-looking only: if a future IP ever introduces multi-visit/multi-session orders,
   order-scoped evidence will need revisiting. Not a defect in this diff; worth a note in the
   backlog so it isn't rediscovered blind.

2. **[OBSERVATION]** Access control verified by tracing actual guard code
   (`OrderLifecycleService.loadForSeller`/`loadForParticipant`), not by trusting test names.
   Non-participant → 403 via `assertParticipant`; wrong-role write → 403 via the `SELLER` role
   check. Both correct. Bucket privacy matches the existing `verification-evidences`/
   `change-order-evidences` posture exactly (service-role upload, no public URL ever returned).

3. **[OBSERVATION]** VERIFY_ONLY concurrency classification is correct. Both new tables are
   pure-insert, no `UPDATE`/`UPSERT` path, no shared invariant to protect (unlike
   `service_execution_pauses`, which genuinely needs its partial unique index — and which this
   agent observed firing correctly, as `duplicate key value violates unique constraint
   "idx_service_execution_pause_open"`, during the e2e run's normal retry path, confirming that
   pre-existing CAS protection is intact and untouched by this diff). No new race was found that
   the report's self-assessment missed.

4. **[MAJOR]** Missing admin-for-disputes read path on execution evidence/notes. Confirmed by
   independent grep: no admin/mediator-scoped read route exists anywhere in `marketplace/**`
   today, including for dispute evidence itself (`manage-dispute.usecase.ts`). This is a
   pre-existing gap, not introduced or worsened by IP-006, and disclosed openly in the report's
   §9.2/§10. Severity judgment: this is a real product gap given IP-008 (cancellation/dispute
   flow) already ships and a mediator resolving a dispute today has no backend route to see
   execution evidence/notes attached to the order — but it is **not** a regression and **not**
   blocking for this IP, because (a) it was already true before this diff for Change Order and
   dispute evidence, (b) closing it is explicitly a cross-cutting authorization decision the
   spec's own "Out of scope"/principles sections do not assign to IP-006, and (c) the report is
   honest about deferring it rather than silently dropping it. Recommend a follow-up IP
   (admin/mediator evidence read access across all marketplace evidence tables at once, not
   patched per-IP) rather than blocking this one.

5. **[MINOR]** Completion report §9.2 misquotes the spec. It attributes the admin-read deferral
   to `IP-006_Field_Execution_Trust_Evidence_Hardening.md`'s "own acceptance line ('+ admin for
   disputes')" — that exact phrase does not appear anywhere in the spec file (verified by direct
   read and grep). The engineering decision itself is sound and independently corroborated in
   this review; only the citation is inaccurate. Recommend fixing the report's wording (drop the
   quotation marks / cite it as inferred context) rather than reopening the implementation.

6. **[OBSERVATION]** MIME/size validation is real and layered: MIME allow-list checked before
   any storage write (`ExecutionEvidenceMediaTypeException`, 415, proven by e2e), size checked
   against the same shared `AppConfigService.evidenceMaxFileBytes` used by Change
   Order/Verification evidence (`ExecutionEvidenceTooLargeException`, 413) plus a Fastify-layer
   multipart size limit (`main.ts`) as defense in depth. The completion report did not explicitly
   call out the size-limit reuse; it exists and is correct.

7. **[OBSERVATION]** Optional-evidence proof (e2e test 1) is a genuine assertion: it checks
   `GET .../execution-evidences` returns `[]` (row never created) and separately asserts
   `POST .../complete` → 200. Confirmed no code path in check-in/pause/resume/complete reads the
   evidence or notes tables — evidence is genuinely never load-bearing for state transitions.

## No CRITICAL or BLOCKING findings.

## Summary judgment

The implementation matches its own completion report's claims in every load-bearing respect:
access control, optional-evidence behavior, MIME/size validation, concurrency non-issue, and
test numbers were all independently re-verified, not just trusted. The one substantive gap
(admin/mediator read access) is real but pre-existing, openly disclosed, and correctly scoped
out of this IP rather than silently dropped — it should be tracked as a follow-up, not treated as
a blocker. The one documentation defect found (misquoted spec citation) is cosmetic and does not
affect the shipped code.

**Verdict: PASS.** Safe to commit the diff described in §4 of the completion report.
