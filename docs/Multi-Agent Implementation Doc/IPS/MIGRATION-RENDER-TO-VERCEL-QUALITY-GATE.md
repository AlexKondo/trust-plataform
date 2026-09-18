# MIGRATION — Render → Vercel — Quality Gate

**Verdict: PASS**

## Basis

- Full independent diff review completed — see `MIGRATION-RENDER-TO-VERCEL-DIFF-REVIEW.md`.
- No CRITICAL or BLOCKING findings. No MAJOR findings. 2 MINOR (stale pg-boss references in comments/docstrings, cosmetic) + several OBSERVATIONs (all either already disclosed by the report itself or informational).
- Core safety property (no silent event loss, no double-processing under normal or partial-failure conditions) independently traced through the actual code, not accepted on the report's word — confirmed correct.
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @trust/api build`, `pnpm --filter @trust/web build` all reproduced clean.
- Unit tests reproduced: 85 files / 630 tests passed, 36 files / 147 tests skipped — matches report.
- **Full e2e suite reproduced independently: 121/121 test files passed, 777/777 tests passed, 0 failed** — matches the report's claimed number exactly, with live log evidence of `drainOnce()`/`EventConsumed` flowing through every domain module during the run.
- pg-boss removal confirmed complete at the dependency/lockfile/functional-code level (only stale comments remain — MINOR).
- `INTERNAL_JOB_SECRET` timing-safe comparison verified correct, including the length-mismatch dummy-comparison path.
- Fastify-serverless bridge (`apps/api/api/index.ts`) verified by code review only, consistent with the report's own disclosure that it is unverified against a real Vercel deployment — not a gate blocker given no serverless credentials exist in this sandbox, but flagged for a pre-production smoke test.
- A new throwaway concurrency test targeting the `FOR UPDATE SKIP LOCKED` overlapping-invocation scenario was written; its first run caught a bug in the test's own seed data (unrelated to the migration), and a clean re-run was not obtained within this review's time budget due to a test-runner filtering issue in this environment. This is disclosed as an OBSERVATION, not treated as a finding against the migration, because the underlying `SKIP LOCKED` mechanism is unchanged from the pre-migration code (per the report) and is a standard, well-understood PostgreSQL guarantee independent of this codebase.

## Conditions / recommendations (non-blocking)

1. Update stale pg-boss references in `event-consumer.ts`, `legacy-event-compat.ts`, and `vitest.config.ts` comments for accuracy (MINOR, cosmetic).
2. Smoke-test the real Vercel `api/index.ts` handler against a preview deployment before relying on it in production (report's own disclosed risk #1).
3. Re-run `apps/api/test/integration/outbox-relay-concurrency.e2e.spec.ts` (added by this review) in isolation to get a clean confirmation of the overlapping-invocation guarantee; delete it afterward if the founder doesn't want it kept as a permanent regression test, or move it into the permanent suite if useful.
4. Founder to complete the manual Vercel/GitHub Actions setup steps already listed in the Completion Report §5 before cutover.

## Scope note

This gate covers only the migration's own files as scoped by the task. IP-018 (Admin/Support/Operations) files present in the same working tree were explicitly out of scope and were not touched or re-reviewed here.
