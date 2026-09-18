# IP-009 — Conflict Escalation

## 1. Blocking requirement

IP-009's objective is to implement the **real** Asaas PSP adapter: customer/payment creation, Pix/card/boleto (only where approved/configured), signed webhook verification, incremental charges, release/distribution/split where the provider/account model supports it, and PSP fee capture as separate economics — against Asaas's **actual** API behavior, sandbox first.

`04_APPROVED_PRODUCT_DECISIONS.md` names Asaas as the intended real provider but is explicit: *"Real PSP behavior must never be invented; adapter follows provider capability and legal/account configuration."* IP-009 §4 (Out of scope) repeats this as a hard constraint and gives the explicit fallback: *"if account/product capability is missing, mark BLOCKED_EXTERNAL and keep adapter contract/tests."*

## 2. Current repository behavior

- No Asaas credential of any kind exists in this repository or environment. `grep -rn "ASAAS" apps/api/src` before this IP returned zero matches (confirmed independently by IP-000 §13 and re-confirmed by this IP's own preflight).
- `.env.example` and `apps/api/src/shared/config/env.schema.ts` had no `ASAAS_*` variable before this IP.
- The only working `PaymentGateway` implementation is `SandboxPaymentGateway` (`apps/api/src/modules/payment/infrastructure/gateway/sandbox-payment.gateway.ts`), deterministic and simulated — it has never spoken to a real PSP.
- `PaymentProviderResolver` (`.../gateway/payment-provider.resolver.ts`) registers exactly one gateway (`sandbox`); its own comment says *"hoje há um provedor só."*
- No account/product-capability information exists anywhere in the repo about whether the eventual Asaas account (once created) will be a plan/tier that supports: sub-accounts, payment splits, Pix, boleto, or card capture. Nothing in the codebase or docs states these facts, because no account has ever been opened.

## 3. Exact files / code paths

- `apps/api/src/modules/payment/infrastructure/gateway/payment-provider.resolver.ts` — would need a second entry once Asaas is real.
- `apps/api/src/modules/payment/payment.module.ts:92` — `{ provide: PaymentGateway, useExisting: SandboxPaymentGateway }`, the single line that decides which adapter is "active." Left untouched by this IP (see §8 below).
- New, added by this IP (contract/skeleton only, not wired into the module):
  - `apps/api/src/modules/payment/infrastructure/gateway/asaas-payment.gateway.ts`
  - `apps/api/src/modules/payment/infrastructure/gateway/asaas-gateway-config.service.ts`
  - `apps/api/src/modules/payment/domain/services/asaas-webhook-signature.verifier.ts`
  - `apps/api/src/modules/payment/infrastructure/webhook/unverified-asaas-webhook-signature.verifier.ts`
  - `apps/api/src/modules/payment/infrastructure/webhook/asaas-webhook.controller.ts`
  - `apps/api/src/modules/payment/domain/exceptions/asaas.exceptions.ts`

## 4. Why the two conflict

To implement the real request/response mapping (customer creation payload, payment creation payload with `billingType`, webhook event payload shape, the exact webhook authentication header/scheme, and whether the contracted account plan supports payment split/sub-accounts for distribution to Trust Partners), this agent would have to **guess** Asaas's actual API field names and webhook signature scheme from training-time memory, with no way to verify them against a live account or the current official docs in this environment. That is precisely "inventing real PSP behavior," which both `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` §7 (stop condition: *"an external PSP/API behavior must be invented"*) and IP-009 §4 forbid. There is also no way to know today whether the eventual account/plan supports split-based distribution at all — inventing that capability would violate §4's *"do not invent split capability"* directly.

## 5. Options

### Option A — Build the full real integration anyway, using best-effort recalled API shapes
Impact: Ships code claiming to integrate with "Asaas" that has never been executed against a real endpoint and may not match the actual current API. Silent risk of wrong field names, wrong webhook trust model (accepting a forged payload as a real payment confirmation), and false claims about split/escrow capability the account may not actually have. Directly violates the "never invent PSP behavior" / "never claim escrow if not true" / "never invent split" constraints. **Rejected.**

### Option B — Classify BLOCKED_EXTERNAL, ship contract/skeleton + tests only, keep SandboxPaymentGateway active
Impact: `PaymentGateway` port is proven reusable by a second, real-shaped adapter (`AsaasPaymentGateway`) that structurally cannot silently fabricate a provider response — every method fails closed with a typed exception (`AsaasNotConfiguredException` when no credential exists, which is every environment today; `AsaasIntegrationNotVerifiedException` even if a credential were added, since the field mapping itself is unverified). A webhook receiver contract exists with a fail-closed signature-verification port/stub (`UnverifiedAsaasWebhookSignatureVerifier`, always rejects). No behavior changes for any user — `SandboxPaymentGateway` remains the only live gateway. IP-010 (Ledger/Settlement) and the PSP-callback slice of IP-023 remain blocked transitively, exactly as IP-000 §13 already predicted. **Chosen.**

## 6. Recommended smallest safe option

Option B. It satisfies IP-009 §4's own explicit instruction ("mark BLOCKED_EXTERNAL and keep adapter contract/tests") without inventing anything material, and it is fully reversible/extendable — a future IP replaces two files' worth of "not verified" logic once real credentials + confirmed docs exist, with zero change required anywhere else (same port, same call sites, same module wiring pattern already used to swap `LoggingEmailService`/`BrevoEmailService`).

## 7. Decision required

**Provision a real Asaas account (sandbox is sufficient to start) and hand the founder-controlled credentials to a future implementation agent, together with three confirmations sourced from Asaas's own current official documentation/dashboard at that time: (1) the exact webhook authentication scheme (header name and whether it is a static token or an HMAC signature, and over which exact body bytes); (2) the exact request/response field shapes for customer and payment (Pix/boleto/card) creation for the account's actual approved payment methods; (3) whether the contracted account/plan supports payment split or sub-account transfer for Partner distribution, or whether release will instead be a manual/batch transfer flow outside the PSP's automated split feature.** Until all three are confirmed, IP-009 cannot move past the BLOCKED_EXTERNAL contract/skeleton stage recorded in `IP-009-COMPLETION-REPORT.md`.

## 8. Work that can continue independently

Everything not gated on real Asaas behavior is unaffected: IP-010 (Ledger/Settlement) can still design its schema/consumer shape against `TrustCustody`/`Payment` events already emitted by the sandbox flow, deferring only the "how does money actually leave the platform" question. The PSP-callback slice of IP-023 is blocked; its non-PSP webhook/integration scope (if any) is not. No other active IP's files are touched by this escalation or by IP-009's implementation.
