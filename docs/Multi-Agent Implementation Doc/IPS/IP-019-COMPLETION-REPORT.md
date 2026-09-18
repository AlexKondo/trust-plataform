# IP-019 — Completion Report

**AI Assistance Layer**
Executed 2026-09-16. Owner: AI/Product implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§1, §7, §10, §11) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` §2 > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-019 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-019_AI_Assistance_Layer.md`) > IP-003/IP-004/IP-015/IP-009 Completion Reports/code > real code at the frozen baseline (`37f66ca`, "IP-014: seguranca, abuso e controles antifraude").

**Classification: implemented, with the same honest `BLOCKED_EXTERNAL`-style fail-closed posture IP-009 established for Asaas.** No real LLM provider key exists in this environment, so the port/adapter/prompt-registry/audit/sanitization/timeout scaffolding is fully built and tested, but the adapter that would call a real LLM was deliberately not written — exactly the same boundary IP-009 drew for the Asaas PSP.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `37f66ca` (`main`, "IP-014: seguranca, abuso e controles antifraude" — current HEAD; `git log -1` confirmed). Repo is 14 commits ahead of `origin/main`; none of those commits were touched.
- **Hard dependencies**: IP-003 (service request/discovery/matching), IP-004 (competitive quotes/comparison), IP-015 (search/marketplace retrieval) — all present and shipped on `main` (`apps/api/src/modules/marketplace/**`, `IP-015` completion report present as `docs-extracted`/marketplace code; `ip-003`/`ip-004` e2e spec files present under `apps/api/test/integration/`). Satisfied structurally: this IP never modifies any of their files (§5).
- **Working tree at start**: clean except this agent's own additions (`git status --short` before any edit showed nothing).

## 2. Preflight findings

1. Read all required control documents in the order given, plus IP-019's own spec, IP-009's Completion Report and Asaas exception code, and the `PaymentGateway`/`EtaEstimatorPort` port implementations.
2. **No real LLM provider key exists anywhere in this environment** — independently verified:
   - `grep -rn "OPENAI_API_KEY|ANTHROPIC_API_KEY|LLM_API_KEY|AI_API_KEY" .env.example` (and the whole repo, excluding `node_modules`): zero matches before this IP.
   - `.env.example` before this IP contained only `SUPABASE_SERVICE_ROLE_KEY`, `JWT_*`, `BREVO_API_KEY`, and the commented-out `ASAAS_*` block (IP-009) — no AI/LLM-related variable of any kind.
   - `apps/api/src/shared/config/env.schema.ts` before this IP: no `AI_*` key.
3. Confirmed the exact IP-009 fail-closed pattern to mirror: `AsaasNotConfiguredException` (`apps/api/src/modules/payment/domain/exceptions/asaas.exceptions.ts`) — 503, thrown/rejected whenever the credential is absent, message explicitly says "this is expected in every environment today." Copied this shape (name, `httpStatus`, message style) for `AiAssistanceNotConfiguredException`.
4. Confirmed the port/adapter convention to model on: `PaymentGateway` (`apps/api/src/modules/payment/domain/services/payment-gateway.ts`, abstract class, `providerId` + methods) and `EtaEstimatorPort`/`DeclaredEtaAdapter` (`apps/api/src/modules/marketplace/domain/{ports,infrastructure/eta}/**`, "Release-1 implementation is honest about what's real, swap-in for a real provider later is one module-wiring line").
5. Confirmed the audit mechanism to reuse: `AuditLogService`/`audit_logs` table (`apps/api/src/shared/audit/audit-log.service.ts`, `apps/api/src/shared/database/schema/audit-logs.ts`) — generic `operation`/`resource`/`result`/`metadata` (jsonb) shape, append-only. It fits the AI-suggestion-attempt shape with zero schema change, so **no new migration was needed** (§6).
6. Searched for IP-021 (privacy/LGPD data classification) — **it exists** (`2796018 IP-021: privacidade, LGPD e ciclo de vida de dados` on `main`), but its scope is deletion/consent/retention lifecycle, not a field-level data-classification catalog consumable by this IP. Proceeded with this IP's own data-minimization rules in `sanitize-ai-input.ts`, directly citing `02_SHARED_ENGINEERING_STANDARDS.md` §7 (no precise location beyond product need, no third-party contact leak) as required by the task instructions.
7. Searched for backend i18n precedent beyond `IP-002`'s locale resolver: only `legal-documents.ts` stores locale-variant text as data. No backend message-catalog framework exists. Followed the same convention `AsaasNotConfiguredException`/other `DomainException` subclasses already use — English, system-facing exception messages (never rendered directly to end users; the `GlobalExceptionFilter` envelope is what the frontend consumes) — since there is no existing i18n framework for domain-exception text to plug into, and inventing one would be out of this IP's scope.
8. Baseline test run **before any implementation** (`git stash` isolate, then restore): see §10.2 — reproduced independently, not taken on faith from a prior report.
9. Owned files / collision hotspots: everything new lives under `apps/api/src/modules/ai/**` (new module, new directory — no collision possible). Touched shared files are additive-only: `apps/api/src/shared/config/env.schema.ts`, `apps/api/src/shared/config/app-config.service.ts`, `apps/api/src/app.module.ts` (new import + one line in the `imports` array), `.env.example`. **No file under `payment/**`, `privacy/**`, `notification/**`, `analytics/**`, `identity/**` (business logic), or any `marketplace/**` use case was touched** — confirmed by `git status --short` (§5) and by the dedicated structural test (§9).
10. No conflict found requiring escalation — this IP's own spec (§4) already anticipates the "no key exists" case is normal and expected, exactly like IP-009's own preflight found for Asaas.

## 3. Implemented

### 3.1 `AiAssistancePort` — provider-agnostic port

`apps/api/src/modules/ai/domain/ports/ai-assistance.port.ts` — abstract class modeled on `PaymentGateway`/`EtaEstimatorPort`, four methods: `structureServiceRequest`, `suggestClarifyingQuestions`, `assistQuoteDescription`, `explainComparisonFactors`. Every method returns `AiSuggestionResult<T>`, an envelope with `suggestion: T | null`, `unavailableReason`, `promptVersion`, and a `readonly advisory: true` literal — enforced at the type level that no method's output can ever be mistaken for an executed action (spec requirement: "outputs clearly advisory").

### 3.2 Fail-closed adapter — mirrors `AsaasNotConfiguredException`

- `apps/api/src/modules/ai/domain/exceptions/ai-assistance.exceptions.ts` — `AiAssistanceNotConfiguredException` (code `AI_ASSISTANCE_NOT_CONFIGURED`, `httpStatus = 503`), same shape/spirit as `AsaasNotConfiguredException`.
- `apps/api/src/modules/ai/infrastructure/not-configured-ai-assistance.adapter.ts` — `NotConfiguredAiAssistanceAdapter`, `providerId = 'not-configured'`, every method returns a rejected promise with the exception above. **No outbound HTTP call exists anywhere in this diff.**

### 3.3 Feature flag + config service

- `apps/api/src/shared/config/env.schema.ts` / `app-config.service.ts` — new `AI_ASSISTANCE_ENABLED` (default `false`), `AI_PROVIDER_API_KEY` (optional, absent everywhere), `AI_ASSISTANCE_TIMEOUT_MS` (default `8000`).
- `apps/api/src/modules/ai/infrastructure/ai-assistance-config.service.ts` — `AiAssistanceConfigService`, same duck-typed-env-interface pattern as `AsaasGatewayConfigService`, exposes `.enabled`, `.isProviderConfigured`, `.timeoutMs`.

### 3.4 Prompt registry / versioning

`apps/api/src/modules/ai/domain/prompts/prompt-templates.ts` — `PROMPT_TEMPLATES`, one frozen (`Object.freeze`, both root and per-entry) `{version, template}` pair per operation, plus `renderPromptTemplate()` for deterministic `{{field}}` interpolation. Deterministic product rules explicitly documented as staying out of every template (category validity, budget rules, state transitions — untouched, still in the existing use cases/entities).

### 3.5 Audit logging

`GenerateAiSuggestionUseCase` (see 3.6) writes one `AuditLogService.recordSafe()` entry (reusing `audit_logs`, **no new migration**) for every attempt made while the flag is enabled — `SUCCESS` when a suggestion was produced, `FAILURE` otherwise (not-configured, timeout, provider error), with `metadata.provider`/`metadata.promptVersion`/`metadata.unavailableReason`. When the flag is disabled, **no audit entry is written** — it is a true no-op (§3.6), matching the same reasoning IP-009 used for "nothing on the wire, nothing to audit."

### 3.6 Timeout/fallback wrapper — the single entry point

`apps/api/src/modules/ai/application/usecases/generate-ai-suggestion.usecase.ts` — `GenerateAiSuggestionUseCase`, the only class other code is meant to call. Per-call behavior:
1. If `!config.enabled` → return `{suggestion: null, unavailableReason: 'AI_DISABLED', ...}` immediately, no adapter call, no audit write, no prompt rendered.
2. Otherwise, sanitize input (§3.7), resolve prompt version, call the port via `Promise.race`-style `withTimeout()` (`config.timeoutMs`, default 8000ms).
3. Any rejection (timeout, `AiAssistanceNotConfiguredException`, any other provider error) is caught, classified (`TIMEOUT` / `PROVIDER_NOT_CONFIGURED` / `PROVIDER_ERROR`), audited, and converted to `{suggestion: null, ...}` — **never re-thrown to the caller.**

### 3.7 Data-minimization / sanitization

`apps/api/src/modules/ai/domain/sanitization/sanitize-ai-input.ts` — pure, recursive, non-mutating `sanitizeAiInput()`. Drops any object key matching a sensitive-name pattern (GPS/lat/lon/address, e-mail/phone/whatsapp, CPF/CNPJ, card/payment/token/password/secret, etc.) at any nesting depth, and truncates long strings (payload-size mitigation). Runs **before** any prompt template is filled — this is the IP's prompt-injection/data-leak coverage for the current no-live-LLM scope (§7 of the task brief).

### 3.8 Module wiring

`apps/api/src/modules/ai/ai.module.ts` — registers `AiAssistanceConfigService` (factory from `AppConfigService`), binds `AiAssistancePort` → `NotConfiguredAiAssistanceAdapter`, provides `GenerateAiSuggestionUseCase`. Registered in `apps/api/src/app.module.ts` (one import + one line in `imports`). **No controller was added** — consistent with the spec's advisory-only scope and with IP-009's own precedent of not exposing a route for functionality that is fail-closed end-to-end today; a future IP wiring a real provider can add a controller calling `GenerateAiSuggestionUseCase` without touching this diff.

## 4. Not implemented / out of scope (matches IP-019 spec §4 + task brief)

- No real outbound LLM HTTP call anywhere (`grep -rn "fetch(\|https://api\." apps/api/src/modules/ai` → no matches).
- No autonomous purchase/acceptance, no AI Trust Score, no AI dispute verdict, no agent marketplace/runtime — none of these concepts appear anywhere in this diff.
- No controller/HTTP route — advisory suggestions are generated only through `GenerateAiSuggestionUseCase`, callable by a future controller or use case; wiring it into a live endpoint is left to a future IP once a real provider exists (same conservative boundary IP-009 drew for its unregistered webhook controller).
- No change to any existing marketplace use case (`create-service-request`, `create-offer`, `accept-offer`, `manage-order`, etc.) — confirmed by `git status` and the structural test (§9).
- No new i18n framework invented — followed the existing `DomainException` convention (§2.7).

## 5. Files changed

**New files (12)**, `wc -l`:
```
apps/api/src/modules/ai/domain/ports/ai-assistance.port.ts                                    107
apps/api/src/modules/ai/domain/exceptions/ai-assistance.exceptions.ts                          29
apps/api/src/modules/ai/domain/prompts/prompt-templates.ts                                     73
apps/api/src/modules/ai/domain/prompts/prompt-templates.spec.ts                                48
apps/api/src/modules/ai/domain/sanitization/sanitize-ai-input.ts                               58
apps/api/src/modules/ai/domain/sanitization/sanitize-ai-input.spec.ts                          82
apps/api/src/modules/ai/infrastructure/ai-assistance-config.service.ts                         38
apps/api/src/modules/ai/infrastructure/ai-assistance-config.service.spec.ts                    50
apps/api/src/modules/ai/infrastructure/not-configured-ai-assistance.adapter.ts                 56
apps/api/src/modules/ai/infrastructure/not-configured-ai-assistance.adapter.spec.ts             53
apps/api/src/modules/ai/application/usecases/generate-ai-suggestion.usecase.ts                225
apps/api/src/modules/ai/application/usecases/generate-ai-suggestion.usecase.spec.ts           178
apps/api/src/modules/ai/ai.module.ts                                                           39
apps/api/src/modules/ai/ai-off-core-flow-unaffected.spec.ts                                    56
```
(exact line counts may vary by a few lines from final formatting; all files are small, single-purpose)

Plus this report (`docs/Multi-Agent Implementation Doc/IPS/IP-019-COMPLETION-REPORT.md`).

**Modified files** (additive only):
```
.env.example                                        | +7
apps/api/src/app.module.ts                          | +2
apps/api/src/shared/config/app-config.service.ts     | +11
apps/api/src/shared/config/env.schema.ts             | +11
```
Zero deletions, zero existing lines changed — confirmed by `git status --short`/`git diff --stat`.

**No migration.** `audit_logs` (from IP-014/earlier) already fits the AI-suggestion-audit shape (§2.5, §3.5) — no new table needed.

## 6. Migrations / configuration

- **No migration.**
- **Configuration**: `AI_ASSISTANCE_ENABLED` (default `false`), `AI_PROVIDER_API_KEY` (optional, unset everywhere), `AI_ASSISTANCE_TIMEOUT_MS` (default `8000`) — all optional/defaulted, zero risk to any existing `.env`/CI config (confirmed by the full regression run, §10.3, passing with these fields absent).

## 7. APIs / events / jobs

None. No new HTTP route, no new event type, no new job/consumer — advisory generation is only reachable by direct use-case injection (§3.8), not yet wired to any controller.

## 8. Security / authorization / privacy

- **No secret in repo/logs** — `AI_PROVIDER_API_KEY` is declared only as a variable name in `env.schema.ts`/`.env.example`, exactly like every other secret in that file; no value exists anywhere.
- **Privacy/data-minimization**: `sanitizeAiInput()` (§3.7) strips GPS/precise-address, third-party contact, and payment-related fields recursively, before any prompt template is filled — directly satisfies `02_SHARED_ENGINEERING_STANDARDS.md` §7 ("no sensitive data sent without policy", "do not expose precise location beyond product need").
- **Fail-closed by construction, not by convention** — `NotConfiguredAiAssistanceAdapter` cannot reach an "attempt an HTTP call" code path under any configuration; every method rejects before any I/O.
- **Audit trail** — every attempt while the flag is enabled is recorded in `audit_logs` (§3.5), including failed/blocked attempts, same posture as IP-009's webhook rejection logging philosophy.
- No new authenticated user-facing surface was introduced (no controller); no identity/session/authorization code touched.

## 9. Tests executed and exact results

### 9.1 New tests written (this IP): 30 total, across 6 new spec files, all in `apps/api/src/modules/ai/`

- `domain/sanitization/sanitize-ai-input.spec.ts` — **7 tests**: strips GPS/location, strips third-party contact, strips payment data, recursive sanitization of nested objects/arrays, truncates long strings, does not mutate input, preserves non-sensitive primitives. **This is the prompt-injection/data-leak coverage for this IP's scope** (no live LLM exists to run an injection test against).
- `domain/prompts/prompt-templates.spec.ts` — **4 tests**: registry has exactly the 4 in-scope operations, each versioned; registry and each entry are frozen (`Object.freeze`, mutation throws); `renderPromptTemplate` selects the correct version/text and interpolates variables without mutating the original template.
- `infrastructure/ai-assistance-config.service.spec.ts` — **5 tests**: flag-off short-circuits regardless of credential; `isProviderConfigured` false for missing/blank key (the real state today); true for a non-empty key; timeout getter.
- `infrastructure/not-configured-ai-assistance.adapter.spec.ts` — **6 tests**: `providerId === 'not-configured'`; all 4 port methods reject `AiAssistanceNotConfiguredException`; the exception carries `code = 'AI_ASSISTANCE_NOT_CONFIGURED'` and `httpStatus = 503` — proves the fail-closed adapter behavior required by the task brief.
- `application/usecases/generate-ai-suggestion.usecase.spec.ts` — **6 tests**: flag OFF is a true no-op (adapter never called, no audit write); flag ON + real fail-closed adapter → `PROVIDER_NOT_CONFIGURED`, never propagates the exception to the caller; a hanging (never-resolving) provider call falls back to `{suggestion: null, unavailableReason: 'TIMEOUT'}` within the configured timeout instead of hanging/throwing; an audit entry is written via `AuditLogService.recordSafe` for every attempt; output `advisory` is always `true`.
- `ai-off-core-flow-unaffected.spec.ts` — **2 tests, the dedicated proof for "AI can be disabled with no core-flow breakage"**:
  1. Reads the actual source of the 5 core ServiceRequest→Offer→Order use cases (`create-service-request.usecase.ts`, `create-offer.usecase.ts`, `accept-offer.usecase.ts`, `manage-order.usecase.ts`, `order-lifecycle.service.ts`) and asserts none of them import anything from `modules/ai/**` or reference any AI symbol — i.e. the core flow's correctness cannot depend on the AI flag's value, structurally, not just by convention.
  2. Confirms `AiAssistanceConfigService.enabled` is `false` when no env var is set (the real default in every environment today).

### 9.2 Baseline confirmed before implementation (`git stash` isolation, `pnpm vitest run` from `apps/api`)

```
Test Files  73 passed | 33 skipped (106)
     Tests  574 passed | 135 skipped (709)
```
Matches the expected ~106/709 baseline from IP-014's final state exactly.

### 9.3 Full unit suite after implementation (`git stash pop`, `pnpm vitest run` from `apps/api`)

```
Test Files  79 passed | 33 skipped (112)
     Tests  604 passed | 135 skipped (739)
```
Delta: **+6 files / +30 tests, all passing** — exactly this IP's 6 new spec files (§9.1), zero change to the skipped count (no test was newly skipped or newly broken), zero regression anywhere else.

### 9.4 Typecheck / lint

```
apps/api: pnpm exec tsc --noEmit -p tsconfig.json   → 0 errors
apps/api: pnpm exec eslint src                      → 0 errors, 0 warnings
```

### 9.5 e2e suite — not run for this IP

`pnpm test:e2e` was **not** run for this diff. Reasoning, consistent with IP-009's own conservative footprint: this IP adds no controller, no route, no DB migration, and touches no code path any existing e2e spec exercises (confirmed structurally by §9.1's `ai-off-core-flow-unaffected.spec.ts` and by `git status` showing zero changes under `marketplace/**`, `payment/**`, `identity/**`, `notification/**`, `analytics/**`, `privacy/**`). The full unit regression (§9.3) is the relevant proof surface for a module with zero DB/HTTP wiring; running the ~19-minute embedded-Postgres e2e suite would not exercise any of this IP's new code. A reviewer who wants e2e confirmation can run `pnpm test:e2e --no-file-parallelism` from `apps/api` — it should be unaffected since no reachable code path changed.

## 10. Acceptance criteria matrix

| Criterion (IP-019 spec §6) | Status | Evidence |
|---|---|---|
| AI can be disabled with no core-flow breakage | **PASS** | `AI_ASSISTANCE_ENABLED` defaults `false`; `GenerateAiSuggestionUseCase` short-circuits to a true no-op with the flag off (§9.1); dedicated structural test proves zero core-use-case coupling (§9.1 item 6). |
| Outputs clearly advisory | **PASS** | `AiSuggestionResult.advisory: true` (literal type, always present); no method of any kind creates/mutates a domain aggregate. |
| Structured validation | **PASS** | Every port method has a typed input/output DTO (`ai-assistance.port.ts`); `sanitizeAiInput` validates/strips at the boundary before any prompt use. |
| Timeout/fallback | **PASS** | `GenerateAiSuggestionUseCase.withTimeout()`, default 8000ms, tested against a never-resolving provider call (§9.1). |
| Prompt-injection/data-leak tests appropriate to scope | **PASS (scope-appropriate)** | No live LLM exists to inject into; `sanitize-ai-input.spec.ts` (7 tests) is the data-minimization coverage the task brief explicitly names as the correct substitute for this scope. |
| Deterministic product rules stay outside the LLM | **PASS** | Prompt registry doc comment + design: no category/budget/state-transition logic appears in any template or in the AI module; all of that remains in existing marketplace use cases, untouched. |

## 11. Deviations / decisions

1. **No controller/HTTP route was added.** Same reasoning as IP-009's unregistered `AsaasWebhookController`: exposing a route for functionality that is fail-closed end-to-end today (every call would return "not configured") would document a contract not actually usable yet. `GenerateAiSuggestionUseCase` is fully wired and testable; adding a controller is a small, low-risk follow-up once a real provider exists.
2. **No new i18n message catalog was invented** for AI-related exception text — followed the existing `DomainException` English-message convention, since no backend i18n framework for exception/system text exists in this codebase today (§2.7).
3. **`AiAssistanceNotConfiguredException` is caught internally by `GenerateAiSuggestionUseCase`**, not propagated to any future caller — deliberately stronger than IP-009's Asaas exception (which does propagate to its caller, since Payments has no equivalent "always fall back gracefully" requirement). IP-019's acceptance criteria explicitly require "timeout/fallback... never breaking the underlying flow," so every failure mode collapses to `{suggestion: null, unavailableReason}`.
4. **Audit entries use `AuditLogService.recordSafe` (best-effort, never throws)**, not the transactional `record()` variant — appropriate because AI suggestions are read-only/advisory, not a financial or state-changing operation; a failed audit write must not block or corrupt any user-facing flow (mirrors `recordSafe`'s own documented purpose: "operações de leitura onde falha de auditoria não deve derrubar a requisição").
5. **`e2e` was not run** (§9.5) — a deliberate scope/time decision given zero DB/route wiring, not an oversight; flagged explicitly for reviewer re-judgment.

## 12. Known issues / technical debt

1. No real LLM provider is wired — by design, until a key/provider is contracted (same posture as IP-009/Asaas). Swapping in a real adapter is one `ai.module.ts` binding change; no use case/controller changes needed.
2. No controller exists yet, so no frontend surface can call this layer today — intentional (§11.1); a future IP should add the controller + minimal OpenAPI entry once a provider is real, following the exact pattern `payment.module.ts`/`marketplace.module.ts` already use for controllers.
3. `sanitizeAiInput`'s sensitive-key pattern is a name-based heuristic, not a value-based classifier — it will not catch a sensitive value stored under an unexpected key name. Acceptable for the current advisory-only, no-live-LLM scope; should be revisited once IP-021-style field-level data classification (if it is extended) or a real provider integration exists.

## 13. External blockers

Same underlying blocker class as IP-009: **no real LLM provider account/credential exists in this environment.** Unlike IP-009, this is not filed as a separate Conflict Escalation artifact, because IP-019's own spec (§4, out-of-scope) and the task brief both already anticipate and authorize exactly this outcome ("Expect NONE to exist — this determines scope") — no founder decision is blocked by proceeding with the fail-closed scaffold; a future decision (which provider, budget, data-processing agreement) is only needed if/when the flag is turned on for real.

## 14. Commits

**Not committed**, per explicit instruction for this task. `git status --short` shows exactly the file set in §5 and nothing else — no `git add`, no commit, no push, `main` and all 14 prior IP commits untouched.

## 15. Recommended reviewer focus for the independent Diff Review agent

1. **Confirm the "no LLM key exists" claim independently**: `grep -rniE "OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_PROVIDER_API_KEY|LLM_API_KEY" .env.example apps/api/src/shared/config` should show only the *names* this IP declares, never a value.
2. **Confirm zero coupling into the core flow**: `grep -rn "modules/ai" apps/api/src/modules/marketplace apps/api/src/modules/payment apps/api/src/modules/identity apps/api/src/modules/notification apps/api/src/modules/analytics apps/api/src/modules/privacy` should return no matches. This is the structural half of the "AI off = core flow unaffected" proof; the behavioral half is `ai-off-core-flow-unaffected.spec.ts`.
3. **Re-run `pnpm vitest run` from `apps/api`** and confirm the exact delta (+6 files/+30 tests over the pre-IP-019 baseline of 106 files/709 tests), with zero newly-skipped and zero newly-failing tests elsewhere.
4. **Judge the §11.1/§11.5 deviations** (no controller, no e2e run) — both are conservative-by-design choices this agent made given the fail-closed, unreachable-from-HTTP state of the module; a reviewer may reasonably decide a stub controller (still fail-closed) or an e2e confirmation run is worth the extra footprint.
5. **Re-check `sanitizeAiInput`'s pattern list** (`SENSITIVE_KEY_PATTERN` in `sanitize-ai-input.ts`) against the exact field names used by `ServiceRequest`/`Offer`/`Order` DTOs elsewhere in the codebase — confirm no sensitive field that this IP's future callers would pass through has a name the current pattern misses.
