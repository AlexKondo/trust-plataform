# IP-012 — Conflict Escalation: Cashback campaign parameters & disbursement

**Raised by:** IP-012 (Trust Points, Benefits, Referral & Cashback) implementation agent
**Date:** 2026-09-17
**Status:** OPEN — requires a Product/Founder decision before any cashback campaign can go live.

## What was found

`04_APPROVED_PRODUCT_DECISIONS.md` approves "Cashback" as a concept "under IP-012 rules," but
no spec anywhere in the repository states:
- a cashback percentage or fixed amount, for any transaction type;
- which transaction types are eligible (all completed orders? first order only? a specific
  category?);
- a campaign duration, budget cap, or per-member cap;
- how/when the accrued liability is actually disbursed to the Member.

Separately, IP-009 (Payment Gateway) is **BLOCKED_EXTERNAL**: only a fail-closed Asaas adapter
skeleton exists, so no real payout to a Member's bank account/wallet is reachable from this
codebase today regardless of what campaign parameters are decided.

## Why this was NOT implemented as a business rule

IP-012 §4 is explicit: *"no cash-equivalent liability without ledger treatment; no
hard-coded campaign forever."* Inventing a percentage or a "reasonable-looking" campaign would
create a real financial liability (Shared Standards §5) with no product/finance approval behind
it, and would violate "no campaign forever" the moment it shipped hard-coded instead of
admin-configurable.

## What was implemented instead — real ledger integration, empty-by-default campaign config

- `cashback_campaigns` (admin-config table, `active` defaults to `false`, `starts_at`/`ends_at`
  are `NOT NULL` — a campaign can never be defined without an explicit end): **empty by
  default**, nothing seeded by the migration.
- `AccrueCashbackLiabilityUseCase`
  (`apps/api/src/modules/growth/application/usecases/cashback.usecases.ts`): if — and only if —
  an active campaign exists at the moment of the triggering fact, it computes the cashback in
  integer cents (`percentageBps`, basis points — no floating point) and posts a **real,
  balanced entry to IP-010's actual ledger** via the same `LedgerPostingService` every other
  consumer uses (no manual `LedgerEntry` construction anywhere in this module). Two new ledger
  accounts were added to the closed dimension in
  `apps/api/src/modules/payment/domain/entities/ledger-entry.ts`:
  `CASHBACK_LIABILITY` (debit) / `CASHBACK_PAYABLE` (credit) — this is the *only* change made
  to `payment/**`, exactly the "add a new ledger account type/consumer" allowance in the brief.
- With no campaign configured (today's state), this use case is a verified no-op — see
  `apps/api/src/modules/growth/application/usecases/cashback.usecases.spec.ts` ("is a no-op
  when no active campaign exists (never invents a percentage)").
- Disbursement (moving money out of `CASHBACK_PAYABLE` to the Member) is explicitly **out of
  reach** while IP-009 is BLOCKED_EXTERNAL. This IP only accrues and exposes the liability;
  baking it down on real payout is future work for whichever IP re-opens IP-009.

## Decision needed from Product/Founder

1. Confirm whether any cashback campaign is meant to go live in Release 1.0, or whether — given
   IP-009 is blocked and no payout path exists — this also stays infrastructure-only.
2. If a campaign is wanted: supply percentage/eligible transaction types/duration/caps. These
   map directly onto a `cashback_campaigns` row via `POST /admin/growth/cashback-campaigns` —
   no code changes needed, only a decision and a value.
3. Separately from this IP: when IP-009 is unblocked, a follow-up IP must define how
   `CASHBACK_PAYABLE` is settled (real transfer + a ledger entry that closes it) — this IP
   deliberately does not attempt that, since it would require guessing PSP behavior IP-009 has
   not yet integrated.
