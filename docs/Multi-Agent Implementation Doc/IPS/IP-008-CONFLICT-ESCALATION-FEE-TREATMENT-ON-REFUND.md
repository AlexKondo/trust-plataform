# IP-008 — Conflict Escalation

## 1. Blocking requirement

IP-008's mandate (`04_APPROVED_PRODUCT_DECISIONS.md`, `02_SHARED_ENGINEERING_STANDARDS.md` §5, and the task brief itself) requires that if a fee/refund business percentage is genuinely undecided, the agent must **escalate rather than invent a business rule** — explicitly naming two candidate questions: "does the Trust Fee get refunded proportionally on a partial refund?" and "who bears the PSP fee on a refund?"

Both questions are genuinely undecided in every document read for this IP (`04_APPROVED_PRODUCT_DECISIONS.md`, `INCONSISTENCIAS.md`, `PLANO-DE-PAGAMENTOS.md` references, PACK-01/02/03 and IP-007 Completion Reports). This is not a request to *make* the decision — it is the record that the decision is missing, exactly as the mandate requires, plus the smallest safe design implemented in the meantime.

## 2. Current repository behavior (after this IP)

`RefundPaymentUseCase` (new, `apps/api/src/modules/payment/application/usecases/refund-payment.usecase.ts`) refunds the **gross amount** requested (the amount a human decided: the full custodied amount on pre-execution cancellation, or the exact `refundAmount` an admin typed when resolving a dispute). It:

- calls `PaymentGateway.refund()` against the **original charge's** `providerTransactionId` for the full requested `amountCents`;
- increments `Payment.refundedCents` by that same gross amount (CAS-protected, never exceeds `Payment.amountCents`);
- does **not** compute, store, or reverse any Trust Fee amount, PSP fee amount, or provider net-to-partner amount.

This is possible, and safe, only because **no fee ledger exists yet to adjust**: `Payment` (PACK-01) has always stored only the gross `amountCents` — no Trust Fee/PSP fee breakdown fields exist on it. Fee computation lives entirely in the Marketplace module (`authorized-commercial.service.ts`, `trust-change-order.ts`, PACK-02) as a **commercial snapshot at contract time**, never as a money-movement record Payments can adjust. `docs-extracted/Payment/MVP - Feature - PAY-006 — Refund Payment.md` itself explicitly scopes chargeback/bank contestation/financial reconciliation **out** of PAY-006 — this IP followed that boundary literally: it reverses the buyer's charge, and stops there.

## 3. Exact files / code paths

- `apps/api/src/modules/payment/domain/entities/payment.ts` — `amountCents` is the only monetary field; no fee breakdown.
- `apps/api/src/modules/marketplace/domain/entities/trust-change-order.ts` — the only place `changeTrustFeeAmount`/`changeProviderNetBeforePspFees` are computed, and only as an immutable snapshot at Change Order approval time, never revisited.
- `apps/api/src/modules/payment/application/usecases/refund-payment.usecase.ts` (new, this IP) — refunds gross only.
- `docs-extracted/Payment/MVP - Feature - PAY-006 — Refund Payment (Reembolsar Pagamento).md`, §2 "Esta Feature NÃO Inclui": Chargeback, Contestação bancária, Conciliação financeira.
- IP-010 "Ledger & Reconciliation" (per `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md`, downstream of IP-009) is the first IP in the program whose name implies a real financial ledger would exist to hold this answer.

## 4. Why the two conflict

- **Trust Fee proportional refund**: Trust Fee is charged to the Partner ("Trust Fee economically supported by Partner" per `04_APPROVED_PRODUCT_DECISIONS.md`) and is computed as a percentage of the *service* portion at commercial-agreement time (PACK-02, 1000 bps seed, explicitly "technical placeholder until business decision" per Shared Standards §5). When a buyer is refunded, nothing in any read document says whether the Partner's Trust Fee obligation is also reversed pro-rata, kept in full (Partner absorbs the fee even though the service wasn't fully paid for), or refunded to the Partner by the platform. No percentage, formula, or precedent exists anywhere in the closed baseline for this specific scenario (refund-time fee reversal, as opposed to normal-settlement-time fee charging, which *is* decided).
- **Who bears the PSP fee on a refund**: real payment processors typically do not return their own processing fee on a refund (the merchant/platform absorbs it) — but this program has no real PSP integration yet (IP-009 is `BLOCKED_EXTERNAL` per IP-000), no PSP fee field anywhere in `Payment`/`TrustCustody`, and no ledger construct to record "the platform absorbed X in PSP fees on this refund." Deciding this now, with only a sandbox gateway, would be inventing an accounting policy with no real transaction to attach it to.

Neither question can be answered by extending an *existing*, already-approved rule (the way, for example, this IP safely inferred "zero cancellation fee" from the pre-existing `CANCELLABLE_STATUSES` comment "prazos, multas e taxas são política configurável... fora desta regra" — that one *had* a documented deferral with an obvious safe default of zero; these two do not have an equivalent anchor).

## 5. Options

### Option A — Leave exactly as implemented (gross-only refund, no fee-ledger touch) until IP-010 exists
Impact: Buyers are made whole correctly and safely today (proven end-to-end, `ip-008-cancellation-dispute-refund.e2e.spec.ts`). The platform's own P&L exposure (did it effectively eat the Trust Fee and/or PSP fee on every refund?) is not tracked anywhere — it is implicitly absorbed by the platform with zero visibility, until a ledger IP makes it visible. No incorrect number is ever computed or shown to any user; the gap is an *absence* of a number, not a wrong one.

### Option B — Add a `feeReversalPolicy` config flag now, defaulting to "platform absorbs 100%, no reversal attempted"
Impact: Makes the absence of a decision *explicit and configurable* rather than implicit, at the cost of adding a config surface and a fee-tracking field to `Payment`/`FundsRefund` with no real consumer yet (a genuine scope expansion beyond "reverse the buyer's charge," and arguably premature given IP-009/IP-010 haven't run).

### Option C — Block refund entirely until a ledger exists
Impact: Would leave cancellation and dispute resolution with **no** financial consequence at all — directly contradicting this IP's own acceptance criteria and the explicit gap this IP exists to close (INCONSISTENCIAS #13 confirms dispute resolution had zero financial link before this IP). Rejected — this is a strictly worse outcome for the buyer-protection guarantee the whole platform is built on ("o dinheiro do cliente sai... e não chega ao prestador até..." — and, symmetrically, must be returnable to the buyer when warranted).

## 6. Recommended smallest safe option

**Option A**, exactly as already implemented. It fully satisfies this IP's acceptance criteria (refund exists, is idempotent, never exceeds funded amount, is auditable) without inventing any fee-percentage or fee-bearer policy. The gap is recorded here, explicitly, for IP-010 (Ledger & Reconciliation) — or an earlier founder decision — to close, rather than silently absorbed or guessed.

## 7. Decision required

One sentence, to be copied into a future IP-010 (or an earlier founder decision) preflight: **"On a refund of any amount, does the platform reverse/re-bill the Trust Fee and/or the PSP fee proportionally, keep them unchanged (Partner/platform absorbs), or apply some other formula — and is this the same answer for a cancellation-triggered refund as for a dispute-triggered refund?"**

## 8. Work that can continue independently

Everything else in IP-008 is unblocked and complete independent of this decision: cancellation-before-execution refund/void, dispute-resolution refund with an admin-specified amount, idempotent CAS-protected accounting, the `REFUNDED` custody state, and all tests. No other IP is blocked by leaving this open — IP-009 (Real PSP) and IP-010 (Ledger & Reconciliation) are the natural owners of the eventual answer, and both are already sequenced after IP-008 in the dependency map.
