# IP-009 — Diff Review (Independent)

**Reviewer:** Quality/Diff Agent (independent from implementation reasoning)
**Date:** 2026-09-16
**Baseline reviewed:** working tree on top of `main` @ `2a20d3d`
**Method:** every changed/added production and test file read in full; claims in the Completion Report re-derived from source, not accepted on prose; full test suite re-executed from scratch in this environment.

## 1. Scope of the diff (independently confirmed)

```
 M .env.example
 M apps/api/src/shared/config/app-config.service.ts
 M apps/api/src/shared/config/env.schema.ts
?? apps/api/src/modules/payment/domain/exceptions/asaas.exceptions.ts
?? apps/api/src/modules/payment/domain/services/asaas-webhook-signature.verifier.ts
?? apps/api/src/modules/payment/infrastructure/gateway/asaas-gateway-config.service.spec.ts
?? apps/api/src/modules/payment/infrastructure/gateway/asaas-gateway-config.service.ts
?? apps/api/src/modules/payment/infrastructure/gateway/asaas-payment.gateway.spec.ts
?? apps/api/src/modules/payment/infrastructure/gateway/asaas-payment.gateway.ts
?? apps/api/src/modules/payment/infrastructure/webhook/  (4 files: controller, controller.spec,
    unverified-verifier, unverified-verifier.spec)
```
`git diff --stat` on the three modified files: 31 insertions, 0 deletions, across `.env.example`, `env.schema.ts`, `app-config.service.ts` — confirmed additive-only by reading the full diff, not just the stat line. No other file in the repository is touched. Scope matches the Completion Report's §5 exactly, including exact `wc -l` per new file (independently re-run and matched line-for-line).

## 2. Claim-by-claim independent verification

### 2.1 No real Asaas credentials exist anywhere
`git grep -n "ASAAS" HEAD -- apps/api .env.example` (i.e. the pre-IP-009 committed baseline) returns **zero matches** — confirmed independently. Current working tree: `ASAAS` only appears in the 10 new/modified files plus one pre-existing, unrelated comment in `finalize-release.consumer.ts` line 12 ("(Asaas) isso prenderia uma conexão...") that predates this IP and was not touched (`git status --short` on that file is empty). **Confirmed.**

### 2.2 `AsaasPaymentGateway` fails closed on every method, under any input
Read `asaas-payment.gateway.ts` in full. All six port methods (`authorize/capture/refund/cancel/release/getStatus`) route through the single private `rejectUnverified()` gate, which either:
1. Rejects with `AsaasNotConfiguredException` if `!config.isConfigured` (no `ASAAS_API_KEY`), or
2. Rejects with `AsaasIntegrationNotVerifiedException` otherwise.

No branch of `rejectUnverified()` returns anything but a rejected `Promise` — there is no `fetch`/`http`/`axios` import anywhere in the file, no conditional path that reaches an HTTP client. **Independently confirmed: no code path in this class can ever issue a real HTTP request, regardless of input or configuration.** The 10-test spec file exercises both gates for `authorize` (all six methods for the not-configured gate; three representative methods for the configured-but-unverified gate) and all pass on an independent re-run.

### 2.3 No fabricated Asaas API details
Read the adapter, config service, exceptions, webhook verifier, and webhook controller in full. The only Asaas-specific strings anywhere in the diff are:
- Two base URLs (`https://api.asaas.com/v3`, `https://sandbox.asaas.com/api/v3`) in `AsaasGatewayConfigService.baseUrl`, used only as a string constant, never dereferenced by an HTTP call. Commented as needing confirmation before real use.
- The word "Idempotency-Key" in a dead, unused, explicitly-commented-as-unconfirmed helper (`buildIdempotencyHeaders()`), which documents a generic REST convention, not an Asaas-specific one, and says so in its own comment.
No field name (`billingType`, `customer`, `split[]`, `walletId`, etc.) appears anywhere in code. **The report's framing is honest, not overconfident** — it explicitly lists the field names it did *not* invent (§4 of the Completion Report), which matches what is and is not present in the diff.

### 2.4 `UnverifiedAsaasWebhookSignatureVerifier` always returns `false`
Read the file in full: `verify()` ignores both parameters and unconditionally `return false;`. No conditional branch. Two unit tests confirm this against both a plausible-looking header and no headers at all. The webhook controller's second test additionally proves the fail-closed property does not depend solely on this stub: swapping in an `AlwaysVerifiedStub` that returns `true` still results in `AsaasIntegrationNotVerifiedException` because the controller never implements event parsing/dispatch. **Confirmed: no forged webhook can be accepted today, by construction, not by convention — two independent gates, not one.**

### 2.5 Active gateway unchanged (the single most important check)
`git diff apps/api/src/modules/payment/payment.module.ts` is **empty** — verified directly, not inferred. Reading the file in full: `providers` still contains only `SandboxPaymentGateway`, `{ provide: PaymentGateway, useExisting: SandboxPaymentGateway }` is unchanged, and none of `AsaasPaymentGateway`, `AsaasGatewayConfigService`, `UnverifiedAsaasWebhookSignatureVerifier`, `AsaasWebhookController` appear anywhere in the module's imports/providers/controllers/exports. A repo-wide grep for `Asaas` outside the new files and `payment/payment.module.ts`'s absence from the results confirms no other module (including `app.module.ts`) references any new class. **Confirmed: zero diff, zero registration — the four new classes are unreachable dead code from the running application's perspective today, exactly as claimed.**

### 2.6 New env vars are additive/optional
`env.schema.ts` diff: `ASAAS_API_KEY: z.string().optional()`, `ASAAS_ENVIRONMENT: z.enum(['sandbox','production']).default('sandbox')`, `ASAAS_WEBHOOK_TOKEN: z.string().optional()` — all optional or defaulted, zero new required field. `app-config.service.ts` adds three pure getters with no side effects. `.env.example` adds a fully commented-out block. `pnpm typecheck`/full test suite (below) both pass with these vars absent from the environment, confirming no existing deployment can break by pulling this diff. **Confirmed.**

### 2.7 No raw card data storage
Grepped the new Asaas files for `cvv`/`card_number`/`cardNumber`/`rawCard` — zero matches. The only hits repo-wide for those terms are pre-existing, unrelated sanitization tests/entities (`funds-refund.spec.ts`, `payment-authorization.ts`) that strip CVV from gateway responses — infrastructure this IP did not touch. The adapter reuses the port's existing `paymentMethodToken: string | null` contract unchanged. **Confirmed.**

## 3. Deviation judgment (§16.3 of the Completion Report, flagged for reviewer re-judgment)

The webhook controller/verifier/config service are written and tested but **not registered** in `payment.module.ts`, so no live route exists and no OpenAPI entry was added. Given `00_READ_FIRST §7` stop conditions include "an external PSP/API behavior must be invented" and the alternative (registering a controller whose only implementation always answers 401, and documenting it in OpenAPI as if it were a real, finished public contract) would overstate the state of the work, **this reviewer agrees the more conservative choice was correct.** It is the smaller blast radius, fully reversible, and does not violate Shared Standards §2 in spirit — the route is not reachable, so documenting it as a "public route" would itself be a form of overclaiming. This is a judgment call, correctly disclosed as one, not a silently swept gap.

## 4. Test re-run (from scratch, independent)

- `pnpm typecheck` → 0 errors (apps/api, apps/web).
- `pnpm lint` → 0 errors, repo-wide.
- `pnpm -r build` → both packages build clean (apps/api `tsc`, apps/web `next build`, 27 routes).
- `pnpm -r test` (unit, Vitest) → **71 files passed / 31 skipped (102 total), 567 passed / 133 skipped (700 total)**. All four new Asaas spec files present and green: `asaas-payment.gateway.spec.ts` (10), `asaas-gateway-config.service.spec.ts` (5), `asaas-webhook.controller.spec.ts` (2), `unverified-asaas-webhook-signature.verifier.spec.ts` (2) — 19 new tests total, matching the report's claim exactly.
- `apps/api: node test/e2e-local.mjs --no-file-parallelism` (full e2e, embedded disposable Postgres, no shared/prod DB, no real Asaas endpoint touched — confirmed by design, §2.2/§2.5 above): **101/102 files passed, 699/700 tests passed.** The single failure, `test/integration/ip-002-i18n.e2e.spec.ts` ("Score não chegou a 25" — a polling-timeout assertion on eventual trust-score recalculation), is in a file this IP does not touch (confirmed via `git status`) and is unrelated to payments/Asaas. The suite's own log shows a Postgres WAL checkpoint stall concurrent with the run, consistent with the report's documented transient-infra class from IP-002/007/008. This single flake does not implicate this IP's diff.

No shared/production Supabase instance and no real Asaas endpoint were reachable at any point — confirmed structurally (§2.2, §2.5) rather than merely assumed.

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | OBSERVATION | `buildIdempotencyHeaders()` on `AsaasPaymentGateway` is dead code (never called). Acceptable as documentation of intended pattern; flagged only for future cleanup once a real call path exists. |
| 2 | OBSERVATION | Webhook controller/verifier exist as tested-but-unregistered classes, with no OpenAPI entry, technically diverging from Shared Standards §2's "OpenAPI updated for every public route" — justified because the route is not, in fact, reachable/public. Judgment call, correctly disclosed, reviewer concurs. |
| 3 | OBSERVATION | One unrelated, pre-existing e2e flake (`ip-002-i18n.e2e.spec.ts`) observed on independent re-run, consistent with previously documented transient infra timing issues on this machine; not attributable to this IP's diff. |
| 4 | MINOR | `AsaasWebhookController.receive()` builds `rawBody` via `JSON.stringify(body ?? {})` rather than true raw bytes — correctly self-documented in a comment as a known future gap (needed once a real signature scheme requiring raw bytes is confirmed), not attempted to be hidden. No current risk since the verifier always rejects regardless. |
| 5 | none found | No CRITICAL, BLOCKING, or MAJOR findings. No fail-open path exists. No accidental wiring into any live module. No fabricated PSP behavior. No card data handling. No money code touched. |

## 6. Verdict

**APPROVED.** The `BLOCKED_EXTERNAL` classification is correct and independently substantiated: no Asaas credential exists anywhere in the repository or environment (re-confirmed by direct grep against the pre-IP-009 baseline), the fallback the IP spec explicitly authorizes ("mark BLOCKED_EXTERNAL and keep adapter contract/tests") is exactly what was built, the active `PaymentGateway` binding is provably unchanged (`payment.module.ts` diff is empty), and every new code path fails closed by construction rather than by convention. The Conflict Escalation artifact is well-scoped: it names the exact three facts needed (webhook auth scheme, request/response field shapes, split/sub-account capability), does not pad the ask, and correctly identifies Option B (contract/skeleton only) as the smallest safe path forward.
