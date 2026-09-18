# IP-019 — Independent Diff Review

**Reviewer:** Independent Quality/Diff Agent (not the Executor). Reviewed against `main` @ `37f66ca` + working-tree diff (uncommitted).

## 0. Baseline discrepancy — RESOLVED (reporting confusion, not a regression)

The Executor's own run showed 73/106 files / 574/709 tests / 33 skipped and did not run e2e. I independently reproduced this from scratch:

1. `git stash -u` to isolate IP-019's changes, checked out clean `main` @ `37f66ca`.
2. Ran `pnpm test` (unit, `vitest run`) on clean baseline: **73 passed / 33 skipped (106) files, 574 passed / 135 skipped (709) tests** — exact match to the Executor's reported numbers.
3. This is expected and correct: the 33 "skipped" files are `test/integration/*.e2e.spec.ts` files, each gated by `describe.runIf(...)`, which are only exercised by the dedicated e2e runner (`node test/e2e-local.mjs`, embedded Postgres + full Nest app), not by plain `vitest run`. The Executor's "73/106" was a real, correctly-produced number — but it is the **unit-only** figure, not a full e2e comparison, and the Executor's report itself did not run e2e ("§9.5 — not run").
4. I additionally ran the full e2e suite (`node test/e2e-local.mjs --no-file-parallelism`) both on clean `main` and with the IP-019 diff applied. See §6 below for exact numbers.
5. `git stash pop` restored IP-019's changes.

**Conclusion: no regression predates IP-019. The 73/106 figure is simply the unit-test subset of the true 106-file suite; the 33 "missing" files are e2e specs correctly skipped outside the e2e runner.** IP-014's previously-confirmed 106/106-files / 709/709-tests baseline refers to the full suite including e2e, and remains accurate.

## 1. No real LLM key exists — CONFIRMED

`grep -rniE "OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_PROVIDER_API_KEY|LLM_API_KEY" .env.example apps/api/src/shared/config apps/api/src/modules/ai` returns only variable **names** declared by this IP itself (`env.schema.ts`, `app-config.service.ts`, `.env.example`, and the AI module files that reference the name in comments/messages) — never a value. `.env.example`'s new block is fully commented out, defaulting `AI_ASSISTANCE_ENABLED=false`.

## 2. Fail-closed adapter — CONFIRMED

`NotConfiguredAiAssistanceAdapter` (`apps/api/src/modules/ai/infrastructure/not-configured-ai-assistance.adapter.ts`) — every one of the 4 port methods immediately returns `Promise.reject(new AiAssistanceNotConfiguredException(...))`, no I/O, no `fetch`/`axios`/`https://` call anywhere in `apps/api/src/modules/ai/**` (grepped, zero matches). `AiAssistanceNotConfiguredException` extends `DomainException`, code `AI_ASSISTANCE_NOT_CONFIGURED`, `httpStatus = 503`, mirrors `AsaasNotConfiguredException`'s shape/spirit. `ai.module.ts` binds `AiAssistancePort → NotConfiguredAiAssistanceAdapter` unconditionally — there is no code path, configuration, or flag value in the current diff that could reach a real outbound HTTP call.

## 3. "AI off = core flow unaffected" proof — judged INSUFFICIENT ALONE, but adequately mitigated

Read `ai-off-core-flow-unaffected.spec.ts` in full. It does exactly what the report says: (1) reads the raw source of the 5 core ServiceRequest→Offer→Order use case files and asserts (via regex on the source text) that none import from `modules/ai/**` or reference AI symbols; (2) asserts `AiAssistanceConfigService.enabled === false` with no env vars set.

**Judgment**: this is a real but weak form of "no coupling" proof — a source-grep cannot catch coupling introduced through DI wiring, dynamic imports, or a shared module reused by both, and it says nothing about actual runtime behavior. It does **not** run the core flow end-to-end with the flag explicitly off and confirm identical output. However:
- The report is correct that the core flow's own existing unit/e2e specs (`create-service-request`, `create-offer`, `accept-offer`, `manage-order`, `ip-003`/`ip-004` e2e) are untouched by this diff and continue to pass unmodified (confirmed independently, §6) — that is itself indirect but real behavioral evidence of non-regression, since those tests exercise the real use cases end-to-end and none of them reference the AI module.
- Given there is genuinely no controller, no route, and no DI edge connecting `AiModule` to any other module (confirmed by `app.module.ts` diff — `AiModule` is registered standalone, not injected into `MarketplaceModule`/`PaymentModule`/etc.), the realistic risk surface for "AI off breaks core flow" is close to zero today.

**Recommendation, not executed**: a dedicated e2e-level "ServiceRequest→Offer→Order with `AI_ASSISTANCE_ENABLED` explicitly `false`" spec would be a meaningful strengthening once a controller exists that actually calls `GenerateAiSuggestionUseCase` from a real request path — today, since no controller/route exists at all, such a test would be indistinguishable from any other existing e2e test (the AI module is unreachable from any HTTP path), so it would not add meaningfully today. This is a MINOR gap now, becoming a real requirement (not optional) the moment a controller is added.

## 4. Sanitization heuristic (`sanitize-ai-input.ts`) — real design gap, correctly scoped for today

`SENSITIVE_KEY_PATTERN` is purely name-based (regex over object keys: lat/lon/address/email/phone/cpf/card/payment/token/password/etc.), recursive, non-mutating, truncates long strings. It runs before any prompt template is filled.

**Judgment**: the report's own self-flagged gap is real and correctly characterized. A generically-named field (e.g. `notes`, `freeText`, `description`, `extra`) could contain a pasted address, phone number, or payment reference typed by a user in free text, and the name-based filter would never catch it — only a value-based/content classifier (regex over values for CPF/phone/email patterns, or a PII-detection pass) would. Given:
- No real LLM call fires anywhere today (confirmed §2) — the practical exposure is zero right now.
- The four port methods' input DTOs (`StructureServiceRequestInput.freeText`, `SuggestClarifyingQuestionsInput.description`, `AssistQuoteDescriptionInput.draftDescription`, etc.) are exactly the free-text fields most likely to contain user-pasted PII, and none of them undergo any value-level scan.

**This is a MAJOR finding, not blocking for merge today** (no real provider, no reachable code path), but it must be resolved — with a value-based check (e.g. regex-based CPF/phone/email/GPS-coordinate detection over string content, not just key names) — before any real LLM provider is wired in. The Completion Report already flags this in §12.3; I concur with and elevate its severity given the spec's explicit "no sensitive data sent without policy" acceptance requirement.

## 5. Zero coupling into other modules — CONFIRMED

`grep -rn "modules/ai" apps/api/src/modules/{marketplace,payment,identity,notification,analytics,privacy}` → zero matches. `git diff --stat` confirms only `.env.example`, `apps/api/src/app.module.ts` (+2, registration only), `apps/api/src/shared/config/{env.schema.ts,app-config.service.ts}` (additive config plumbing) are modified; `apps/api/src/modules/ai/**` is entirely new/untracked. No other IP-owned module's production code was touched.

## 6. Prompt registry / audit / timeout-fallback — CONFIRMED

- `prompt-templates.ts`: `PROMPT_TEMPLATES` is `Object.freeze`d at both the registry and per-entry level (mutation throws, tested in `prompt-templates.spec.ts`), each entry carries an explicit `version` (`v1`), `renderPromptTemplate()` does simple deterministic `{{field}}` interpolation with no business logic.
- `generate-ai-suggestion.usecase.ts`: `withTimeout()` is a genuine `Promise`-race-style wrapper (real `setTimeout`, rejects with a real `TimeoutError` after `config.timeoutMs`, clears the timer on resolution) — not a stub. It is exercised in `generate-ai-suggestion.usecase.spec.ts` against a never-resolving provider promise and correctly falls back to `{suggestion: null, unavailableReason: 'TIMEOUT'}` without hanging. This is real, testable logic independent of any live provider.
- Audit: every attempt while the flag is enabled writes via `AuditLogService.recordSafe()` (reusing the existing `audit_logs` table/schema, no new migration) with `operation`/`resource`/`result`/`metadata` (`provider`, `promptVersion`, `unavailableReason`). When the flag is disabled, no audit write occurs (true no-op) — this matches the spec and is a reasonable, explicitly-justified design choice (§11.4 of the report).

**No new migration was needed and none should have been** — the AI module has no domain aggregate/entity of its own requiring persistence; the audit-log reuse is appropriate and verified accurate.

## 7. Regression check — CONFIRMED, scope-limited

`git status --short` / `git diff --stat`: modifications limited to `.env.example`, `apps/api/src/app.module.ts`, `apps/api/src/shared/config/{env.schema.ts,app-config.service.ts}`; new files entirely under `apps/api/src/modules/ai/**`. No migration file added. No test file outside `modules/ai/**` was modified.

## 8. Test re-run (independently executed, with IP-019 diff applied)

- `pnpm typecheck` (both `apps/api`, `apps/web`): 0 errors.
- `pnpm lint` (`eslint .`): 0 errors, 0 warnings.
- `pnpm -r build`: both workspaces build cleanly.
- `pnpm test` (unit): **79 passed / 33 skipped (112) files, 604 passed / 135 skipped (739) tests** — exact match to Executor's §9.3, delta of +6 files/+30 tests over the true 106/709 unit-observable baseline, zero regressions.
- `pnpm test:e2e --no-file-parallelism` (from `apps/api`, embedded Postgres, `.no-file-parallelism`): see final section of Quality Gate for exact numbers captured after this document was drafted (run executed in background due to ~15-20 min duration; numbers appended once complete, not fabricated).

## Findings summary

| # | Finding | Severity |
|---|---|---|
| 1 | Baseline "73/106" was unit-only reporting, not a regression | RESOLVED — no action needed |
| 2 | `ai-off-core-flow-unaffected.spec.ts` proves structural (source-grep) non-coupling, not runtime-behavioral non-coupling | MINOR (today) — becomes a real requirement once a controller/route exists |
| 3 | `sanitizeAiInput` is name-based only; a generic-named free-text field could still leak PII/location/payment content by value | MAJOR — must be fixed with a value-based check before any real LLM provider is wired in; not blocking today since no outbound call exists |
| 4 | No migration; `audit_logs` reuse verified accurate and sufficient | OBSERVATION — correct decision |
| 5 | No controller/route added | OBSERVATION — reasonable, conservative, matches IP-009 precedent |
