# TRUST PLATFORM --- PACK-03

## Trust Change Order & Time Billing

**Implementation Specification --- Version 1.0**\
**Status: READY FOR IMPLEMENTATION**

------------------------------------------------------------------------

## 1. Purpose

PACK-03 implements the controlled commercial-change and time-billing
layer on top of the immutable initial economic snapshot created by
PACK-02.

The core rule is:

> **The Trust Partner can never unilaterally increase the amount owed by
> the Trust Member.**

Any increase in time, service scope, material cost, material markup or
other supported commercial amount requires an explicit **Trust Change
Order** approved by the Trust Member before the additional charge
becomes authorized.

PACK-03 also introduces the operational time model required for hourly
services:

-   Trust Check-in
-   Trust Pause
-   Trust Resume
-   Trust Check-out
-   elapsed time
-   paused time
-   billable time
-   additional-time request
-   Trust Evidence linkage
-   Service Summary

PACK-03 must preserve PACK-00, PACK-01 and PACK-02 semantics.

------------------------------------------------------------------------

## 2. Authority and precedence

For implementation decisions, use this order:

1.  PACK-03 v1.0
2.  implemented PACK-02
3.  implemented PACK-01
4.  implemented PACK-00
5.  current code and tests
6.  historical architecture/product documents only where they do not
    conflict

Do not revive historical enterprise requirements that were intentionally
deferred.

------------------------------------------------------------------------

## 3. Canonical vocabulary

  -----------------------------------------------------------------------
  Concept                             Canonical meaning
  ----------------------------------- -----------------------------------
  Trust Member                        Customer / contracting party

  Trust Partner                       Service provider

  Trust Contract                      Accepted commercial agreement/order

  Trust Change Order                  Explicit proposed change to the
                                      authorized commercial terms after
                                      contract formation

  Trust Check-in                      Operational start of service
                                      execution

  Trust Pause                         Non-billable interruption of active
                                      work

  Trust Resume                        Return from a Trust Pause to active
                                      work

  Trust Check-out                     Operational end of service
                                      execution

  Trust Evidence                      Evidence associated with execution
                                      or a Change Order

  Trust Confirmation                  Member confirmation/acceptance
                                      after service completion

  Trust Signal                        Objective behavioral/operational
                                      signal; no automatic fraud
                                      conclusion

  Service Summary                     Final transparent
                                      execution/commercial summary
                                      presented to the parties
  -----------------------------------------------------------------------

Existing technical names such as buyer/customer/provider/seller/order
may remain where broad renaming would add risk without implementation
value.

------------------------------------------------------------------------

## 4. Scope boundary

### 4.1 Implement now

-   Trust Change Order lifecycle
-   Member approval/rejection of Change Orders
-   additive financial deltas over PACK-02 initial snapshot
-   hourly-service execution session
-   Trust Check-in / Pause / Resume / Check-out
-   elapsed / paused / billable time
-   configurable billing increment inherited from the accepted contract
-   additional-time Change Orders
-   service/material/markup Change Order components
-   Trust Evidence references for supported changes
-   current authorized commercial amount
-   Service Summary
-   audit trail and events required by these flows
-   tests and regressions

### 4.2 Explicitly out of scope

-   redesign of Trust Dispute
-   cancellation policy implementation
-   refund/full refund/partial refund
-   partial financial release
-   Asaas
-   real PSP integration
-   real split/settlement
-   Trust Wallet
-   Trust Coin implementation
-   automatic fraud punishment
-   automatic Trust Score penalty from time behavior
-   AI adjudication of disputes
-   final legal guarantee model
-   variable Trust Fee by level/category/plan/campaign
-   automatic material receipt/OCR/proof verification
-   background phone-usage detection or invasive device monitoring

Those belong to later Packs.

------------------------------------------------------------------------

## 5. Initial snapshot remains immutable

PACK-02 created the immutable initial commercial snapshot.

PACK-03 MUST NOT mutate that snapshot.

The authorized economics become:

``` text
initialContractSnapshot
+ SUM(approved Trust Change Order deltas)
= currentAuthorizedCommercialSnapshot
```

Rejected, cancelled, expired or pending Change Orders do not affect the
authorized amount.

Historical approved Change Orders are immutable after approval.

------------------------------------------------------------------------

## 6. Trust Change Order lifecycle

Minimum states:

``` text
DRAFT
PENDING_MEMBER_APPROVAL
APPROVED
REJECTED
CANCELLED
EXPIRED
```

### 6.1 Rules

-   Only the Trust Partner may propose a commercial increase in this
    Pack.
-   A DRAFT does not change any authorized amount.
-   Submission moves it to `PENDING_MEMBER_APPROVAL`.
-   Only the Trust Member associated with the Trust Contract may
    approve/reject.
-   `APPROVED` is terminal and immutable.
-   `REJECTED` is terminal.
-   `CANCELLED` is allowed only before approval/rejection and by the
    proposing Partner or an authorized system/admin path already
    consistent with project authorization patterns.
-   `EXPIRED` may be applied when an explicit expiry exists.
-   An approved Change Order cannot be edited or deleted.
-   A new correction requires a new Change Order; do not rewrite
    history.
-   Approval must be explicit and auditable.

------------------------------------------------------------------------

## 7. Change Order types

The model must support at least:

``` text
ADDITIONAL_TIME
SCOPE_CHANGE
MATERIAL
MIXED
```

### 7.1 ADDITIONAL_TIME

Used for hourly services when the Partner needs more billable time than
currently authorized.

Required:

-   requested additional minutes
-   billing increment from the frozen Trust Contract
-   calculated service delta
-   reason/justification

Rules:

-   requested minutes must respect the contract's
    `billingIncrementMinutes`;
-   MVP default may be 30 minutes because PACK-02 freezes that default,
    but PACK-03 must use the value stored on the contract, never a new
    global lookup;
-   the Partner cannot charge the additional interval before Member
    approval;
-   no retroactive unilateral approval.

Example:

``` text
Hourly rate: R$150/hour
billingIncrementMinutes: 30
Additional requested: 30 min
SERVICE delta: R$75
```

### 7.2 SCOPE_CHANGE

Used for additional service/labor not represented only by elapsed time.

Required:

-   description
-   reason
-   SERVICE delta
-   evidence when required by the use case/rule

### 7.3 MATERIAL

Supports separate components:

``` text
MATERIAL_COST
MATERIAL_MARKUP
```

Rules:

-   MATERIAL_COST is pass-through and 0% Trust Fee under the approved
    MVP policy;
-   MATERIAL_MARKUP is separate and fee-eligible using the frozen Trust
    Fee rate from the initial contract;
-   cost and markup must never be collapsed into one opaque amount;
-   PACK-03 allows evidence references/attachments to support the
    declared material cost;
-   automated verification of receipts is out of scope.

### 7.4 MIXED

May combine supported SERVICE + MATERIAL_COST + MATERIAL_MARKUP deltas
in one Change Order when they belong to the same requested change.

------------------------------------------------------------------------

## 8. Change Order economic calculation

Use the **Trust Fee rate frozen in the PACK-02 initial contract
snapshot**.

Do not read the latest global Commercial Policy when calculating a
Change Order for an existing Trust Contract.

For each approved Change Order:

``` text
changeGrossAmount =
    serviceDelta
  + materialCostDelta
  + materialMarkupDelta

changeTrustFeeBase =
    serviceDelta
  + materialMarkupDelta

changeTrustFeeAmount =
    applyFrozenTrustFeeRate(changeTrustFeeBase)

changeProviderNetBeforePspFees =
    changeGrossAmount - changeTrustFeeAmount
```

Current authorized totals:

``` text
currentGrossAmount =
    initialGrossAmount
  + SUM(approved changeGrossAmount)

currentTrustFeeBase =
    initialTrustFeeBase
  + SUM(approved changeTrustFeeBase)

currentTrustFeeAmount =
    initialTrustFeeAmount
  + SUM(approved changeTrustFeeAmount)

currentProviderNetBeforePspFees =
    initialProviderNetBeforePspFees
  + SUM(approved changeProviderNetBeforePspFees)
```

Use the existing deterministic money/rounding convention. Do not
introduce floating-point financial arithmetic.

------------------------------------------------------------------------

## 9. Payment boundary

PACK-03 changes **commercial authorization**, not real PSP settlement.

Before coding, Claude must identify how PACK-01/PACK-02 Payment
currently represents the authorized amount and whether safely increasing
an existing sandbox Payment amount is already supported.

### Canonical business requirement

After a Change Order is approved, the platform must know the new
`currentAuthorizedCommercialAmount`.

However:

-   do not invent a real PSP reauthorization/capture mechanism;
-   do not implement Asaas;
-   do not silently mutate financial custody semantics if the current
    Payment aggregate does not support additional authorization safely.

If current Payment architecture cannot represent the additional
authorized amount without a new payment authorization design, STOP that
integration item and report the minimum architectural decision required.
The Change Order and commercial snapshot may still be implemented if
independently safe.

------------------------------------------------------------------------

## 10. Hourly execution session

Hourly Trust Contracts may have one active execution session for the
current service instance in the MVP.

Minimum lifecycle:

``` text
NOT_STARTED
ACTIVE
PAUSED
COMPLETED
```

### 10.1 Trust Check-in

-   allowed only for an eligible active Trust Contract;
-   records immutable check-in timestamp;
-   moves session to `ACTIVE`;
-   duplicate/repeated check-in must be idempotent or rejected
    consistently with existing project patterns;
-   does not by itself authorize additional money.

### 10.2 Trust Pause

A Trust Pause represents non-billable interruption.

Examples:

-   personal phone call
-   personal break
-   lunch
-   interruption unrelated to execution

Record at least:

-   pause start timestamp
-   reason code
-   optional note
-   actor
-   correlation/audit metadata

Minimum reason codes:

``` text
PERSONAL_BREAK
PERSONAL_CALL
MEAL
OTHER_NON_BILLABLE
```

Do not attempt to automatically infer personal phone usage.

### 10.3 Trust Resume

-   closes the current open Pause;
-   records resume timestamp;
-   returns session to `ACTIVE`;
-   cannot resume if no Pause is open.

### 10.4 Trust Check-out

-   records immutable end timestamp;
-   if a Pause is open, the implementation must safely close it at
    check-out or reject check-out with a clear deterministic rule
    discovered/declared during preflight;
-   moves session to `COMPLETED`;
-   triggers/calculates the Service Summary;
-   does not automatically approve unauthorized additional time.

------------------------------------------------------------------------

## 11. Time model

Persist/derive:

``` text
elapsedTime = checkOutAt - checkInAt
pausedTime = SUM(closed pause durations)
rawActiveTime = elapsedTime - pausedTime
billableTime = time financially authorized under the contract and approved Change Orders
```

### Critical rule

> **Presence does not automatically equal billable time.**

`billableTime` must never exceed the total time commercially authorized
by the initial hourly commitment plus approved ADDITIONAL_TIME Change
Orders.

Example:

``` text
Check-in: 14:00
Check-out: 15:15
Elapsed: 75 min
Paused: 15 min
Raw active: 60 min
Authorized: 60 min
Billable: 60 min
```

Another example:

``` text
Elapsed: 95 min
Paused: 5 min
Raw active: 90 min
Initial authorized: 60 min
Approved Change Order: +30 min
Billable: 90 min
```

If active execution exceeds authorized time without an approved Change
Order, the system must not silently convert the excess into an
additional charge.

------------------------------------------------------------------------

## 12. Additional-time workflow

For hourly contracts:

1.  Partner is executing an active service.
2.  Partner determines more time is required.
3.  Partner creates `ADDITIONAL_TIME` Trust Change Order.
4.  Requested minutes must align with the frozen billing increment.
5.  System calculates the SERVICE delta.
6.  Partner supplies a reason.
7.  Trust Evidence may be attached where relevant.
8.  Member receives the request.
9.  Member explicitly approves or rejects.
10. Only `APPROVED` additional time increases authorized billable time
    and commercial amount.

The Partner may request more than one increment when justified, e.g. 60
minutes on a 30-minute increment, if validation permits exact multiples.

------------------------------------------------------------------------

## 13. Trust Evidence

PACK-03 must reuse the existing evidence/storage architecture where
possible.

A Change Order may reference one or more Trust Evidence records.

Relevant examples:

-   photo of unexpected damage/problem;
-   photo of required replacement part;
-   supplier receipt/quote;
-   document;
-   execution evidence.

Requirements:

-   evidence metadata remains separate from binary storage, consistent
    with existing architecture;
-   evidence linkage must be auditable;
-   do not make photos mandatory for every Change Order;
-   material cost should support evidence because the approved economic
    policy depends on separating verified/pass-through cost from markup;
-   automatic authenticity/OCR validation is out of scope.

If the existing Evidence aggregate cannot be safely linked to Change
Orders without changing its domain semantics, report the conflict before
inventing a parallel evidence system.

------------------------------------------------------------------------

## 14. Material rules

For a material Change Order:

-   `materialCostDelta >= 0`
-   `materialMarkupDelta >= 0`
-   cost and markup shown separately to the Member
-   Member approves the total before it becomes authorized
-   MATERIAL_COST receives 0% Trust Fee
-   MATERIAL_MARKUP is fee-eligible
-   evidence may support material cost
-   no Partner may disguise labor/service as MATERIAL_COST to avoid
    Trust Fee

PACK-03 should provide data/audit structure to detect suspicious
classification later, but must not implement automatic fraud
adjudication.

------------------------------------------------------------------------

## 15. Service Summary

After Trust Check-out, produce a Service Summary for the Trust Member
and Trust Partner.

Minimum fields:

-   Trust Contract/order identifier
-   Partner
-   Member
-   pricing model
-   check-in timestamp
-   check-out timestamp
-   elapsed time
-   paused time
-   billable time
-   initial authorized amount
-   list of approved Change Orders
-   rejected/pending Change Orders where useful for transparency
-   service amount
-   material cost
-   material markup
-   current/final authorized gross amount
-   Trust Fee information only where appropriate for the Partner/admin
    view
-   evidence references
-   completion status

### Member-facing principle

The Member must clearly see:

``` text
what was originally contracted
+ what was additionally approved
= final authorized amount
```

The Service Summary must not expose internal Partner economics
unnecessarily to the Member.

------------------------------------------------------------------------

## 16. Trust Confirmation boundary

PACK-03 may connect the completed Service Summary to the existing
`MarketplaceOrder.CustomerConfirmed` / Trust Confirmation flow, but it
must preserve the semantic established by PACK-01:

> Customer confirmation is the release trigger, not the Payment creation
> trigger.

Do not redesign dispute/release logic here.

If the current confirmation endpoint can display/consume the Service
Summary without semantic change, integrate safely. Otherwise keep the
summary independently retrievable and leave deeper confirmation UX to a
later Pack.

------------------------------------------------------------------------

## 17. Trust Signals

PACK-03 may emit/store objective Trust Signals or source data for future
Trust Intelligence, such as:

-   service completed within initial authorized time;
-   number/frequency of Change Orders;
-   amount of additional time requested;
-   pause duration;
-   punctual completion;
-   repeated material additions.

Rules:

-   no signal by itself equals fraud;
-   no automatic punitive Trust Score change is introduced by this Pack
    unless an existing approved rule already consumes that exact signal;
-   preserve raw auditable facts so future Trust Intelligence can reason
    over them.

Avoid building a new AI engine in PACK-03.

------------------------------------------------------------------------

## 18. Authorization and security

At minimum:

-   only the Partner attached to the Trust Contract can create/submit
    its Change Order;
-   only the Member attached to the Trust Contract can approve/reject
    it;
-   execution actions must validate the actor and contract relationship;
-   admin/system bypasses only if already supported by explicit existing
    authorization patterns;
-   no cross-contract access;
-   all critical state transitions audited;
-   use existing JWT/RBAC/authorization patterns;
-   no tenant retrofit.

------------------------------------------------------------------------

## 19. Idempotency and concurrency

The implementation must protect against:

-   double approval;
-   approval + rejection race;
-   duplicate submission;
-   duplicate Check-in;
-   multiple simultaneous open Pauses;
-   double Resume;
-   double Check-out;
-   duplicate application of an approved financial delta.

Use database constraints/transactions and existing idempotency patterns
where appropriate.

An approved Change Order must affect current authorized totals exactly
once.

------------------------------------------------------------------------

## 20. Persistence principles

Prefer additive schema changes.

Likely concepts/entities may include:

``` text
trust_change_orders
trust_change_order_evidence_links
service_execution_sessions
service_execution_pauses
service_summaries
```

Exact names are not mandatory. Claude must first inspect current
aggregate/table conventions and choose the minimum safe additive design.

Requirements:

-   no destructive migration;
-   no `tenant_id`;
-   immutable approval history;
-   foreign keys to current Marketplace Order/Contract and identities
    where consistent;
-   timestamps in existing project convention;
-   money in existing module conventions with deterministic conversion
    at boundaries;
-   indexes for order/contract, status and actor lookup where needed.

------------------------------------------------------------------------

## 21. API surface

Exact route names must follow existing `/api/v1/...` conventions and
current Marketplace routing style.

Required capabilities:

-   create Change Order
-   submit Change Order
-   get/list Change Orders for a Trust Contract
-   approve Change Order
-   reject Change Order
-   Check-in
-   Pause
-   Resume
-   Check-out
-   get Service Summary

Do not create duplicate APIs if current order/action endpoints can
safely host the behavior.

All new error responses must comply with PACK-00 canonical error
behavior.

------------------------------------------------------------------------

## 22. Events

Use the PACK-00 canonical event envelope.

Create only events that are necessary for decoupled behavior.

Expected domain/business events may include:

``` text
TrustChangeOrder.Submitted
TrustChangeOrder.Approved
TrustChangeOrder.Rejected
ServiceExecution.CheckedIn
ServiceExecution.Paused
ServiceExecution.Resumed
ServiceExecution.CheckedOut
```

Exact canonical naming must be reconciled with the currently implemented
two-segment event naming convention established after PACK-00.

Do not introduce redundant events for every database write.

Event consumers must remain idempotent.

------------------------------------------------------------------------

## 23. Preflight --- MUST RUN BEFORE CODING

Claude must report these checks before implementation:

1.  Locate the exact PACK-02 immutable commercial snapshot schema/entity
    and how its totals are exposed.
2.  Confirm where `pricingModel`, `hourlyRateAmount`, `minimumMinutes`
    and `billingIncrementMinutes` are frozen on the accepted order.
3.  Locate the existing Payment aggregate and determine whether
    additional commercial authorization can safely change Payment amount
    without violating PACK-01. Do not assume.
4.  Locate the existing Trust Evidence/VRF/storage abstractions and
    determine whether they can link to a Change Order without semantic
    corruption.
5.  Locate the existing order execution states and current
    `MarketplaceOrder.CustomerConfirmed` flow.
6.  Identify current authorization patterns for buyer/member and
    seller/partner order actions.
7.  Identify existing idempotency/concurrency patterns used for critical
    transitions.
8.  Identify existing audit service usage.
9.  Confirm the exact money conventions at Marketplace and Payment
    boundaries.
10. Confirm whether any existing check-in/check-out or service-execution
    model already exists and must be reused.
11. Confirm current i18n/user-facing error strategy.
12. Confirm CI status. The known pre-existing lint problem in
    `tools/extract-docx.mjs` is not PACK-03 scope unless separately
    authorized.

### Stop condition

If any preflight result conflicts with a canonical rule above and safe
reconciliation would change existing product/payment semantics:

**STOP the affected item and report:**

-   exact conflict;
-   files/current behavior;
-   why it conflicts;
-   minimum decision required.

Do not guess.

------------------------------------------------------------------------

## 24. Validation rules

At minimum reject:

-   Change Order for wrong/closed/ineligible contract state;
-   actor not belonging to the contract;
-   empty Change Order;
-   negative deltas;
-   zero-value commercial increase when a commercial delta is required;
-   ADDITIONAL_TIME not aligned to frozen billing increment;
-   additional time on FIXED_PRICE unless explicitly represented as
    SCOPE_CHANGE rather than hourly billing;
-   approval/rejection by Partner;
-   edit of approved Change Order;
-   duplicate financial application;
-   Pause when session is not ACTIVE;
-   Resume when session is not PAUSED;
-   Check-out before Check-in;
-   second active execution session where MVP permits only one;
-   billable time above authorized time;
-   material cost/markup totals inconsistent;
-   Trust Fee calculated with current global policy instead of frozen
    contract rate.

------------------------------------------------------------------------

## 25. Required tests

### 25.1 Unit/domain

-   Change Order lifecycle transitions.
-   terminal-state immutability.
-   ADDITIONAL_TIME increment validation.
-   30-minute frozen default from contract works.
-   custom frozen increment works.
-   additional-time SERVICE delta calculation.
-   material cost excluded from fee base.
-   material markup included in fee base.
-   frozen Trust Fee rate reused for Change Orders.
-   global fee-policy change does not alter existing contract Change
    Order fee.
-   current authorized totals include approved changes only.
-   rejected/pending changes do not affect totals.
-   approved delta applied exactly once.
-   elapsed/paused/raw-active calculation.
-   billable time capped by authorized time.
-   multiple Pause intervals.
-   invalid Pause/Resume transitions.
-   Check-in/out lifecycle.
-   Service Summary totals.

### 25.2 Integration/E2E

At minimum:

1.  **HOURLY --- no additional charge without approval**
    -   create eligible actors/order;
    -   Check-in;
    -   execute beyond initial authorized time;
    -   no approved Change Order;
    -   final authorized amount remains initial amount;
    -   billable time does not exceed authorized time.
2.  **HOURLY --- approved +30 min**
    -   initial 60 min;
    -   Partner requests +30;
    -   Member approves;
    -   authorized billable time becomes 90 min;
    -   SERVICE delta and Trust Fee delta correct;
    -   Service Summary shows original + approved addition.
3.  **Trust Pause**
    -   Check-in;
    -   Pause;
    -   Resume;
    -   Check-out;
    -   paused duration excluded from billable/raw-active calculation as
        designed.
4.  **Material**
    -   Change Order with MATERIAL_COST + MATERIAL_MARKUP;
    -   Member approves;
    -   cost excluded from fee base;
    -   markup included;
    -   summary shows them separately.
5.  **Rejection**
    -   Member rejects Change Order;
    -   no financial/authorized-time change.
6.  **Concurrency/idempotency**
    -   repeated approval cannot apply delta twice.
7.  **PACK-02 regression**
    -   immutable initial snapshot remains unchanged.
8.  **PACK-01 regression**
    -   existing custody/release tests remain green.
9.  **PACK-00 regression**
    -   canonical event/error tests remain green.

Run the full existing test suite plus PACK-03 tests.

------------------------------------------------------------------------

## 26. Acceptance criteria

PACK-03 is accepted only when all are true:

-   initial PACK-02 snapshot remains immutable;
-   approved Change Orders append commercial deltas;
-   rejected/pending Change Orders do not change authorized economics;
-   Partner cannot unilaterally increase Member charge;
-   hourly billing increment comes from the frozen contract;
-   additional time requires Member approval;
-   Trust Check-in/Pause/Resume/Check-out work with valid state
    transitions;
-   elapsed, paused and billable time are distinguishable;
-   presence is not automatically billable time;
-   billable time cannot exceed commercially authorized time;
-   MATERIAL_COST remains 0% Trust Fee;
-   MATERIAL_MARKUP remains separately fee-eligible;
-   frozen contract Trust Fee rate is reused;
-   Service Summary transparently reconciles original + approved
    changes;
-   evidence can be linked without duplicating storage architecture;
-   no refund/dispute/Asaas/split implementation leaks into this Pack;
-   no regression in PACK-00/01/02;
-   all required tests pass.

------------------------------------------------------------------------

## 27. Definition of Done

-   preflight completed and documented;
-   no unresolved blocking conflict;
-   additive migration(s) applied;
-   Trust Change Order implemented;
-   time execution lifecycle implemented;
-   financial delta calculation implemented;
-   evidence linkage implemented/reused safely;
-   Service Summary implemented;
-   authorization/idempotency/concurrency protections implemented;
-   audit/events implemented as required;
-   full tests green;
-   Completion Report generated;
-   implementation diff reviewed by Kondo before final close.

------------------------------------------------------------------------

## 28. Claude AI implementation instruction

``` text
Implement PACK-03 only.

Read this specification completely before changing code.

Authority:
PACK-03 > implemented PACK-02 > implemented PACK-01 > implemented PACK-00 > current code/tests > historical docs where non-conflicting.

Run and report §23 Preflight BEFORE coding.

Core rules:
- Never mutate the PACK-02 initial economic snapshot.
- Trust Partner cannot unilaterally increase the Trust Member's authorized amount.
- Only APPROVED Trust Change Orders affect authorized time or money.
- ADDITIONAL_TIME must use the billing increment frozen on the accepted contract.
- Default 30 minutes is not re-read from global configuration for an existing contract.
- Presence is not automatically billable time.
- Track elapsed, paused and billable time separately.
- Personal/non-billable interruptions use Trust Pause.
- Billable time cannot exceed initial authorized time + approved additional time.
- Use the frozen Trust Fee rate from the initial contract snapshot for Change Order fee calculations.
- SERVICE and MATERIAL_MARKUP are fee-eligible.
- MATERIAL_COST pass-through is excluded from Trust Fee.
- Keep cost and markup separate.
- Reuse existing Trust Evidence/storage architecture if semantically safe.
- Preserve MarketplaceOrder.CustomerConfirmed as release trigger, never Payment creation trigger.
- Do not implement refund, dispute redesign, cancellation engine, Asaas, real split/settlement, Wallet or Coin.
- Do not change production Payment semantics by assumption.
- No tenant retrofit.
- Use PACK-00 event/error conventions.
- Protect all critical transitions against duplicate/concurrent execution.

Payment integration gate:
Inspect current Payment architecture. If safely representing an approved additional commercial amount would require a new payment authorization/PSP design, STOP only that integration item and report the minimum decision required. Do not fake or silently mutate custody behavior.

If any canonical rule conflicts with current code:
STOP the affected item and report exact conflict/files/current behavior/minimum decision required.
Do not make product assumptions.

After implementation generate:
PACK-03-COMPLETION-REPORT.md

Required sections:
1. Preflight
2. Implemented
3. Files Changed
4. Migrations
5. APIs/Events
6. Financial/Time Model
7. Tests & Results
8. Acceptance Criteria
9. Deviations/Decisions
10. Known Issues
11. Remaining Work
12. Commits
```

------------------------------------------------------------------------

## 29. Consistency gate

  Check                                                          Result
  -------------------------------------------------------------- --------
  PACK-00 canonical event/error foundation preserved             PASS
  PACK-01 custody/release semantics preserved by specification   PASS
  PACK-02 immutable initial snapshot preserved                   PASS
  Trust Change Order is additive, not mutative                   PASS
  Additional time requires Member approval                       PASS
  Billing increment uses frozen contract value                   PASS
  Trust Pause is non-billable                                    PASS
  Presence != billable time                                      PASS
  Material cost vs markup remains separated                      PASS
  Frozen Trust Fee rate reused                                   PASS
  Service Summary included                                       PASS
  Trust Evidence reused rather than duplicated where safe        PASS
  Dispute/refund/cancellation engine excluded                    PASS
  Asaas/split/settlement excluded                                PASS
  Multi-language boundary preserved                              PASS
  No enterprise multi-tenancy retrofit                           PASS

------------------------------------------------------------------------

## 30. Pack status

**STATUS: READY FOR IMPLEMENTATION**

PACK-03 is intentionally limited to controlled commercial changes and
time-based execution/billing. It prepares the Trust Platform for PACK-04
Dispute / Cancellation / Refund and PACK-05 Asaas Integration &
Distribution/Split without prematurely implementing those domains.

**END OF PACK-03**
