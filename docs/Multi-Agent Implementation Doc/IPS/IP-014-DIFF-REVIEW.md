# IP-014 — Independent Diff Review

**Reviewer:** independent Quality/Diff Agent (separate session from both implementing agents).
**Scope:** re-verification of `IP-014-COMPLETION-REPORT.md`'s claims against the actual working tree at commit `5c1a803` + uncommitted changes.

## 1. Working-tree coherence (two-agent handoff)

`git status --short` / `git diff --stat` were captured independently and match the report's file list exactly: 13 modified files, 5 new files (`0036_ip014_safety_abuse_fraud_controls.sql`, `risk-flags.ts`, `apps/api/src/shared/safety/**` [5 files], `ip-014-safety-abuse-fraud-controls.e2e.spec.ts`). No orphaned half-edits, no duplicate class/function definitions, no leftover merge markers were found on read of every changed/new file. `dist/` contains stale compiled artifacts from a prior build (gitignored, not part of the diff — irrelevant). No stray `postgres.exe` processes or `.pgdata-e2e` lockout were present at the start of this review (`tasklist` returned nothing before the review's own e2e run started it fresh). **Verdict: coherent, single-authored-looking diff, no cross-session contamination found.**

## 2. `RateLimitService` (canonical rate limiter)

Read in full (`apps/api/src/shared/safety/rate-limit.service.ts`). Confirmed:
- Counts rows in `audit_logs` filtered by `identityId` + `operation` + `occurredAt >= now - windowMinutes`, via `count(*)::int`.
- Throws `SensitiveActionRateLimitExceededException` (429) when `attempts >= maxAttempts`.
- Applied at exactly 5 call sites, all confirmed by direct read: `forgot-password.usecase.ts` (`ForgotPassword`), `request-data-deletion.usecase.ts` (`RequestDataDeletion`), `manage-dispute.usecase.ts` (`OpenMarketplaceDispute`), `manage-change-order.usecase.ts` (`CreateTrustChangeOrder`, `SubmitTrustChangeOrderEvidence`), `submit-evidence.usecase.ts` (`SubmitVerificationEvidence`).

**Design judgment — counting against append-only `audit_logs`:** sound for this workload. `audit_logs` already has `idx_audit_log_identity (identity_id, occurred_at)` and `idx_audit_log_operation (operation, occurred_at)` indexes (pre-existing, confirmed by reading `audit-logs.ts` schema). The rate-limit query filters on both `identity_id` AND `operation` together with a bounded time range — Postgres can use either existing index as an access path plus a filter, and the bounded `occurredAt >= since` predicate means the scan cost does not grow with total table size, only with one identity's recent activity in the window (bounded, typically single digits to low tens of rows). This does **not** degrade as `audit_logs` grows overall. A composite `(identity_id, operation, occurred_at)` index would be marginally more efficient than relying on the single-column-plus-range indexes available today, but at the tested query pattern and expected per-identity attempt volancy this is a MINOR, non-blocking optimization, not a real scale concern. OBSERVATION, not a finding requiring rework.

## 3. Rate-limiter e2e gap — CONFIRMED, and CLOSED by this review

Confirmed the gap the report itself flagged: `ip-014-safety-abuse-fraud-controls.e2e.spec.ts` never asserts an HTTP 429. `test/setup-env.ts` sets `SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS=100000` for every e2e run specifically so unrelated flows don't trip the limiter — which means, before this review, the entire e2e suite genuinely never proved a 429 came back over real HTTP. Only `rate-limit.service.spec.ts` (unit, mocked DB) exercised the throw path.

Judgment: this is a MAJOR gap as flagged (a security control central to this IP's own acceptance criterion "rate limits canonical" had zero end-to-end proof), not a MINOR one to wave through — the "unit-tested only" pattern this program has repeatedly found to hide real gaps applies here structurally: the DI wiring, the HTTP status mapping in `global-exception.filter.ts`, the exact env threshold plumbing, and the interaction with the audit-log write path were all unverified outside the unit boundary.

**Action taken:** wrote `apps/api/test/integration/ip-014-rate-limit.e2e.spec.ts`, a new e2e test file (test-only change, no production code touched). It overrides `SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS=2` via `process.env` before a dynamic `import('../../src/main.js')` (Vitest's default per-file module/isolation model, already relied upon elsewhere in this suite for fresh JWT keypairs per file, makes this safe — it does not leak into other test files) and:
1. Drives 2 successful Change Order creations for one Identity (201 each).
2. Asserts the 3rd attempt from the **same** Identity returns exactly `429` with `error.code === 'SENSITIVE_ACTION_RATE_LIMIT_EXCEEDED'`.
3. Asserts a **different** Identity is unaffected (limiter is per-identity, not global), by successfully creating an unrelated listing right after.

This closes the gap: `pnpm typecheck` and `pnpm lint` both pass clean with the new file included; full e2e run results are in the Quality Gate doc.

## 4. `RiskFlagService` / `risk_flags` admin queue

Read in full (`risk-flag.service.ts`, `risk-flag.controller.ts`, `risk-flags.ts` schema). Confirmed:
- `AdminGuard` gates both endpoints (`@UseGuards(AdminGuard)` at controller level) — same guard already proven for `VerificationController`, not reinvented.
- **Single-decision enforcement is a real DB constraint, not just documented intent**: `review()` does a conditional `UPDATE risk_flags SET ... WHERE id = $1 AND status = 'OPEN'` and checks `.returning()` came back non-empty; if a concurrent review already flipped the status, the conditional update affects 0 rows and `RiskFlagAlreadyReviewedException` (409) is thrown. This is race-safe (not just a pre-check-then-write TOCTOU), confirmed by reading the exact WHERE clause.
- Flags are genuinely explainable: `reason` (free-text, human-readable, always populated by the caller with concrete numbers — verified at the one call site, `detectSuspiciousPattern`) and `signal` (stable rule code) are both stored and returned in `RiskFlagResponse`, not just an internal boolean.

## 5. Suspicious-Change-Order detector

Read in full (`detectSuspiciousPattern`, `manage-change-order.usecase.ts:521-557`). Confirmed:
- Fully deterministic: two plain numeric comparisons (`countAfterThisOne >= threshold`, `ratioBps >= thresholdBps`), no ML, no external scoring service.
- Never blocks: the flag (if any) is raised inside the **same** `db.transaction` as the Change Order's own creation — the change order row is written regardless, and the HTTP response is always `201` (confirmed both by reading the code path and by the e2e assertion `expect(result.status).toBe(201)` inside the loop that crosses the threshold). This satisfies §4's "no black-box blocking without reason/audit" and the false-positive-safe requirement.

**Threshold-justification judgment:** the report is right to flag this but reaches the correct conclusion. `CHANGE_ORDER_SUSPICIOUS_COUNT_THRESHOLD=5` and `CHANGE_ORDER_SUSPICIOUS_AMOUNT_RATIO_BPS=5000` are config-driven (zod-validated, overridable per environment without a code change), conservative in direction (they only ever cause an *additional* admin-queue entry, never a behavior change to the requesting user), and the detector explicitly cannot cause harm if wrong in either direction — a false positive costs an admin a queue item to dismiss; a false negative simply means Release-1 doesn't yet flag that specific edge case. This is the textbook shape of a "safe default extension point," not a business-policy question that changes what a user is allowed to do. It does **not** rise to a Conflict Escalation under §8 of the spec (money/security/privacy/legal/Trust-Score product decisions) because no money movement, access grant, or Trust Score effect depends on the threshold value — only which items appear in an internal admin review queue. OBSERVATION: record the chosen defaults in product backlog for a deliberate business-policy pass later; not a blocker.

## 6. Scope completeness vs. spec §1

Cross-checked against §1's list: rate limits (DONE), suspicious transaction/change-order patterns (DONE), account abuse signals (partial — only the 5 rate-limited operations, no broader login-velocity/device-fingerprint signal — reasonable Release-1 cut, MINOR/OBSERVATION), evidence/upload abuse limits (verified — see below), review abuse (not implemented — see below), referral abuse hooks (correctly N/A, no referral system exists in the baseline — confirmed via repo-wide search, zero `*referral*` files), admin risk flags (DONE), step-up/MFA hooks (correctly N/A — confirmed no MFA infrastructure exists anywhere in the codebase), immutable investigation trail (DONE, see §7).

**Evidence/upload abuse limits — verified which half was actually done:** pre-existing `EVIDENCE_MAX_FILE_MB` (default 10MB, from VRF-002 era, unrelated to this IP) already enforces file **size** limits at both call sites (`submit-evidence.usecase.ts:95-96`, `manage-change-order.usecase.ts:450-451`). IP-014's genuine new contribution here is the submission-**frequency** rate limit (`SubmitVerificationEvidence`, `SubmitTrustChangeOrderEvidence`). Combined, these two independently-sourced controls do cover both dimensions of "evidence/upload abuse limits" (how big, how often) — the report's framing that IP-014 only added frequency limiting is accurate, and pairing it with the pre-existing size cap is a legitimate, non-misleading way to satisfy the acceptance criterion. Not a gap.

**Review abuse — genuinely left out, but with a structural mitigant not mentioned in the report:** `ReviewTransactionUseCase` already enforces one review per participant per order (`MarketplaceReviewAlreadyExistsException`) and requires the order to be in a genuinely completed/resolved state (`REVIEWABLE_STATUSES`) with the reviewer being a real transaction participant (`loadForParticipant`). This makes review-bombing structurally expensive (requires completing/participating in many real transactions) even without a dedicated risk-flag signal. A deliberate scope cut, defensible for Release-1, but should be logged as a named follow-up item rather than silently absent from future planning — MINOR.

## 7. Immutable investigation trail

Confirmed: `RiskFlagService.raise()` calls `auditLogService.record(..., executor)` inside the same transaction/executor as the flag insert; `RiskFlagService.review()` calls `auditLogService.record()` for the human decision. Rate-limit denials write `DENIED` audit entries at each of the 5 call sites before re-throwing (confirmed by reading each catch block). All of this lands in the existing `audit_logs` table, which has a DB-level trigger (`forbid_audit_log_mutation()`, confirmed present and referenced in the completion report, and exercised negatively by an unrelated PACK-03 spec per the e2e log) blocking UPDATE/DELETE — genuinely append-only, no new mutable log was introduced.

## 8. Findings summary

| Finding | Severity | Status |
|---|---|---|
| Rate-limiter had zero e2e/HTTP-level proof of 429 | MAJOR | **CLOSED** — new e2e test added by this review (`ip-014-rate-limit.e2e.spec.ts`) |
| `audit_logs`-backed rate-limit counter could theoretically want a composite index as volume grows | OBSERVATION | Not blocking; existing indexes are adequate for current/expected load |
| Change-order suspicion thresholds chosen without a recorded product decision | OBSERVATION | Safe, conservative, config-driven default; log for later product review, not a Conflict Escalation |
| Review-abuse detection deferred | MINOR | Defensible for Release-1 given structural mitigants (one review per real completed transaction); log as named follow-up |
| Broader account-abuse signals (login velocity, device fingerprinting) deferred | MINOR | Defensible for Release-1; correctly scoped down per spec's "minimum safe design" principle |
| MFA/step-up, referral-abuse hooks | OBSERVATION | Correctly N/A — no baseline infrastructure exists for either |
