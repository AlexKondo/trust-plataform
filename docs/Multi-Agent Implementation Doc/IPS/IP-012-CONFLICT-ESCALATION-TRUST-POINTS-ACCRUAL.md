# IP-012 — Conflict Escalation: Trust Points accrual rate, point value & redemption catalog

**Raised by:** IP-012 (Trust Points, Benefits, Referral & Cashback) implementation agent
**Date:** 2026-09-17
**Status:** OPEN — requires a Product/Founder decision before Trust Points can accrue or be redeemed for anything.

## What was found

Two control documents give **directly conflicting** framing of Trust Points, and neither
supplies the concrete numbers a working feature needs:

1. `04_APPROVED_PRODUCT_DECISIONS.md` (Growth/economy section) says: *"Approved concepts
   include Trust Points, Benefits, Referral and Cashback. Implement only under IP-012 rules.
   Trust Coin is future and excluded from Release 1.0."* — this reads as an approval to build
   Trust Points now.
2. `INCONSISTENCIAS.md` #27 says the opposite about scope: *"Founder Book: Trust Engine com 5
   pilares vs 8 componentes vs 10 capacidades; 'Trust Points' só na V2 ... Para o MVP vale o
   que as specs implementam: Score, Level, Badges, Benefits, Passport, Shares. Trust
   Points/Capital/Coin/Shield ficam pós-MVP (não há spec)."* — this is the canonical,
   already-adjudicated resolution of a Founder-Book ambiguity, and it explicitly defers Trust
   Points past the MVP for lack of a spec.

Per `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md`'s precedence rules, this is a real,
unresolved contradiction between two control documents — not something this agent is allowed
to resolve by assumption. Critically, **neither document, nor any other spec in the repository,
states**:
- an accrual rate (how many points per Real spent, per completed order, per referral, etc.);
- a point-to-currency exchange rate (what 1 point is "worth");
- a redemption catalog (what points can be exchanged for — discount, cashback, product).

## Why this was NOT implemented as a business rule

Inventing any of the three numbers above would be a fabricated business rule with real
implications for platform liability (a point balance is, in effect, a promise), which
`02_SHARED_ENGINEERING_STANDARDS.md` §5 and IP-012 §4 ("no cash-equivalent liability without
ledger treatment") do not authorize without a real decision. IP-009 being BLOCKED_EXTERNAL
also means there is no live PSP path to validate any redemption-to-payout flow even if a rate
existed.

## What was implemented instead — safe, empty-by-default infrastructure

- `points_ledger` (append-only, own ledger — see
  `apps/api/src/modules/growth/domain/entities/points-ledger-entry.ts` for why this is a
  dedicated ledger rather than reusing IP-010's monetary `ledger_entries`): idempotent by
  `source_event_id` (unique index), balance always computed on-demand, never negative by
  construction (`RedeemPointsUseCase` throws `InsufficientPointsBalanceException` before ever
  writing a REDEEM row below zero).
- `points_earning_rules` (admin-config table, `active` defaults to `false`, always has an
  optional `starts_at`/`ends_at` window): **empty by default** — no rule is seeded by the
  migration (`apps/api/drizzle/0041_ip012_trust_points_benefits_referral_cashback.sql`). No
  rule fires until an admin creates one via `POST /admin/growth/points-rules`.
- `AccruePointsFromRuleUseCase`: looks up the active rule for an event name and posts points
  only if one exists — a true no-op today, since the table starts empty.
- `RedeemPointsUseCase` / `GetPointsBalanceUseCase`: generic, rule-agnostic; do not assume any
  catalog or exchange rate.
- Member-facing surface is limited to `GET /growth/points/me/balance` (i18n-ready shell,
  balance only) — no redemption catalog UI, per the brief's explicit exclusion.

## Decision needed from Product/Founder

1. Resolve the `04_APPROVED_PRODUCT_DECISIONS.md` vs. `INCONSISTENCIAS.md` #27 conflict
   explicitly: is Trust Points in-scope for Release 1.0, or does it stay deferred to V2/post-MVP
   as INCONSISTENCIAS #27 states?
2. If in-scope now: supply (a) which domain events accrue points and how many, (b) whether
   points ever convert to Reais/cashback and at what rate, (c) what a point can be redeemed
   for. Each answer maps directly onto the infrastructure already built (`points_earning_rules`
   rows, and a redemption use case/catalog to be added in a follow-up IP).
3. If staying infrastructure-only for Release 1.0 (this agent's recommendation, consistent
   with INCONSISTENCIAS #27): confirm that explicitly so the Checker does not read the empty
   `points_earning_rules` table as an oversight — it is the deliberate, safe default.
