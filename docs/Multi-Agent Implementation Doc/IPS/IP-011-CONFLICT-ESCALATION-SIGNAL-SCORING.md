# IP-011 — Conflict Escalation: candidate Trust Score rules found but NOT approved

**Raised by:** IP-011 (Trust Signals & Reputation Completion) implementation agent
**Date:** 2026-09-17
**Status:** OPEN — requires a Product decision before any code implements this as a scoring rule.

## What was found

During the IP-011 preflight (gap analysis of the event catalog against `trust_score_rules`),
two objective, already-emitted domain events were found to have **no approved Trust Score
rule** and **no mention** in `04_APPROVED_PRODUCT_DECISIONS.md` or `INCONSISTENCIAS.md #13`:

1. **`TrustChangeOrder.Rejected`** (and the Submitted/Approved siblings) — a Trust Member
   rejecting a Partner's proposed scope change is a plausible reputation-relevant fact. A
   Partner who is rejected far more often than peers, or who submits many change orders per
   order, could plausibly be a signal of scope-creep/overcharging behavior.
2. **`FundsRefund.Completed`** outside of a dispute (a "voluntary"/negotiated refund) — a
   Partner who triggers refunds frequently, or a Member who requests them frequently, is a
   plausible reputation-relevant fact distinct from `MarketplaceDispute.Resolved` (which
   already scores −60/−30 for the at-fault party when a dispute is adjudicated).

## Why this was NOT implemented as a scoring rule

IP-011 §4 (out of scope) is explicit: *"no automatic fraud conclusion from a single signal;
no unapproved punitive score rule."* `04_APPROVED_PRODUCT_DECISIONS.md` (Trust/reputation
section) is equally explicit: *"Do not auto-penalize Trust Score without an approved
deterministic rule."* Neither event has a `trust_score_rules` row, is not named in
INCONSISTENCIAS #13's enumerated list of what marketplace facts feed the score, and does not
appear in the approved decisions doc. Inventing points for either event — even a small,
"reasonable-looking" penalty — would be exactly the unapproved punitive rule both documents
forbid. A single rejected change order or a single refund is also, on its own, a completely
normal and often Member-protective outcome (per TRS product framing: "a signal is not
automatically fraud") — scoring it naively risks punishing legitimate scope negotiation and
legitimate refund requests.

## What was implemented instead

Both event types were registered as **non-scoring Trust Signals** (see
`apps/api/src/modules/trust-score/domain/services/trust-signal-registry.ts`,
`TRUST_SIGNAL_REGISTRY`), persisted to the new `trust_signals` table, and surfaced on the
owner's private Trust Signals feed (`GET /trust-signals/me`) and, when the owner opts in via
`showSignals` (default true, but the row's own `visibility` defaults to `PRIVATE`), on the
shared public profile. `RecordTrustSignalUseCase` is structurally incapable of touching
`trust_scores`/`trust_level_history` — it has no dependency on `RegisterTrustEventUseCase`,
`trust-score-engine.ts`, or the score repository's `updateScore`/`insertTrustEvent` methods.

## Decision needed from Product/Trust owner

If either fact SHOULD affect Trust Score, the correct next step is:
1. Approve a specific deterministic rule (event name, condition(s), point value, max
   occurrences) the same way INCONSISTENCIAS #13's marketplace rules were approved.
2. Add it via the existing `POST /admin/trust-score-rules` mechanism (TRS-009) — the
   `matchRule`/`calculateScore` engine already supports arbitrary new rules keyed on
   `TrustChangeOrder.Rejected` / `FundsRefund.Completed` with zero code change, only a new
   `trust_score_rules` row.
3. Until that approval exists, these two event families remain **observational only** in
   the platform (visible, explainable, never scored) — this is the safe default this IP
   ships with.
