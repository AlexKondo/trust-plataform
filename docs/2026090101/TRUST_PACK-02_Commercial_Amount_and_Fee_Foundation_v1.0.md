TRUST PLATFORM

# PACK-02

Commercial Amount & Fee Foundation

Implementation Specification • Version 1.0 • Status: READY FOR
IMPLEMENTATION

| Objective \| Create the commercial/pricing foundation required before
  Change Orders, refunds and real PSP distribution. \|

| --- \| --- \|

| Baseline \| PACK-00 and PACK-01 closed. Existing Marketplace
  Proposal/Order and Payments behavior must be preserved unless this
  Pack explicitly changes a financial snapshot field. \|

| Implements now \| Pricing model, fixed/hourly proposal terms,
  financial components, configurable Trust Fee and immutable
  contract/payment economic snapshot. \|

| Does not implement \| Time tracking, Trust Pause, Change Order
  execution, materials reimbursement workflow, refund, split, Asaas,
  settlement or real-money movement. \|

| Key principle \| Trust determines and freezes the commercial
  economics; a future PSP executes money movement. \|

## 1. Purpose

PACK-02 establishes the commercial amount and Trust Fee model that
future financial flows will consume. It must not turn into PACK-03
(time/change orders) or PACK-05 (Asaas/split). The goal is to make every
accepted Trust Contract carry an auditable, immutable economic snapshot.

## 2. Canonical Product Vocabulary

| Canonical concept \| Meaning in this Pack \|

| --- \| --- \|

| Trust Member \| Customer/contracting party. Existing technical
  customer/buyer identifiers may remain unchanged. \|

| Trust Partner \| Service provider. Existing provider/seller
  identifiers may remain unchanged. \|

| Trust Request \| Service need/request. \|

| Trust Proposal \| Commercial proposal sent by a Trust Partner. \|

| Trust Contract \| Accepted commercial agreement/order. \|

| Trust Fee \| Platform commission charged economically to the Trust
  Partner. \|

| Trust Change Order \| Future approved change to scope/time/value. Data
  model may be prepared; workflow is PACK-03. \|

Brand vocabulary must not trigger broad renaming/refactoring of existing
code. Preserve technical names where changing them adds no
implementation value.

## 3. Internationalization Rule

-   Canonical domain concepts remain language-independent.

-   User-facing labels, descriptions, payment/pricing explanations and
    validation messages must use the project's localization/i18n
    mechanism; do not hard-code Portuguese or English UI copy into
    domain logic.

-   PACK-02 does not require adding new languages. It requires that new
    user-facing strings be localizable.

## 4. Canonical Commercial Models

### 4.1 FIXED_PRICE

A Trust Partner proposes a closed service price. Once accepted, that
amount is the initial authorized commercial amount.

``` text

pricingModel = FIXED_PRICE
serviceAmount = 100000  # example: R$ 1,000.00 in minor units
```

### 4.2 HOURLY

A Trust Partner proposes an hourly rate plus an initial minimum billable
duration. PACK-02 calculates only the initial contracted amount; actual
elapsed/billable/paused time belongs to PACK-03.

``` text

pricingModel = HOURLY
hourlyRate = 15000       # R$150.00/hour
minimumMinutes = 60
billingIncrementMinutes = 30  # default MVP value, configurable
initialServiceAmount = 15000
```

-   billingIncrementMinutes must be configurable; 30 minutes is the MVP
    default, not a domain hard-code.

-   Additional time is never automatically billable. It will require an
    approved Trust Change Order in PACK-03.

-   PACK-02 must not implement timers, Trust Check-in/out, Trust Pause
    or additional-time charging.

## 5. Financial Component Model

Amounts must be represented using the existing project money convention
(minor units/integer). Do not introduce floating-point money.

| Component \| Meaning \| Trust Fee treatment in PACK-02 \|

| --- \| --- \| --- \|

| SERVICE \| Labor/service amount, including initial hourly commitment.
  \| Normal Trust Fee base. \|

| MATERIAL_COST \| Verified pass-through material/part cost. \| 0% Trust
  Fee on the cost component. \|

| MATERIAL_MARKUP \| Partner margin/markup over material cost. \|
  Fee-capable component; architecture supports fee application. \|

| OTHER \| Reserved. Must not be used to bypass fee classification. \|
  No implicit rule; reject unsupported use in MVP. \|

PACK-02 does not implement material proof/evidence or purchasing
workflow. It only establishes the financial classification needed by
future Trust Change Orders.

## 6. Trust Fee Policy

-   The MVP has one configurable percentage Trust Fee charged
    economically to the Trust Partner.

-   The fee rate must not be hard-coded in application/domain code.

-   The existing technical 1000 bp seed, if present, is not a business
    decision and must be replaced/isolated behind configurable policy.

-   The architecture must allow future fee policies by Trust Level,
    category, plan, volume or campaign without implementing those
    variations now.

-   The Trust Member does not receive an additional Trust platform fee
    on top of the contracted service price in the MVP.

-   PSP/payment-processing fees are a distinct future financial
    component and must not be merged into Trust Fee.

### 6.1 Recommended representation

``` text

trustFeeRateBps = configurable integer basis points
trustFeeBaseAmount = sum(fee-eligible components)
trustFeeAmount = deterministic integer calculation using existing project rounding convention
```

If the current project already has a percentage/rounding utility, reuse
it. Do not create a competing financial rounding convention.

## 7. Economic Snapshot

At Trust Contract formation / Payment creation, freeze the economic
terms used for that transaction.

| Snapshot field \| Required rule \|

| --- \| --- \|

| pricingModel \| FIXED_PRICE or HOURLY. \|

| currency \| Same currency model already used by Payment. \|

| grossAmount \| Total initial amount payable by Trust Member for the
  accepted contract. \|

| serviceAmount \| Initial service/labor amount. \|

| materialCostAmount \| Initial pass-through material cost, if any;
  otherwise zero. \|

| materialMarkupAmount \| Initial declared material markup, if any;
  otherwise zero. \|

| trustFeeRateBps \| Rate effective at contracting. \|

| trustFeeBaseAmount \| Fee-eligible base. \|

| trustFeeAmount \| Trust commission frozen for the initial contract
  snapshot. \|

| providerNetBeforePspFees \| grossAmount - trustFeeAmount; PSP fees
  intentionally excluded at this stage. \|

| hourlyRate \| Required only for HOURLY. \|

| minimumMinutes \| Required only for HOURLY. \|

| billingIncrementMinutes \| Required only for HOURLY; default from
  configuration at proposal/contract time. \|

Changing the platform's default Trust Fee or billing increment later
must not retroactively change an existing Trust Contract/Payment
snapshot.

## 8. Calculation Rules

-   grossAmount = SERVICE + MATERIAL_COST + MATERIAL_MARKUP for
    supported initial components.

-   trustFeeBaseAmount = SERVICE + fee-eligible MATERIAL_MARKUP.

-   MATERIAL_COST is excluded from the Trust Fee base when classified as
    pass-through cost.

-   trustFeeAmount is calculated from trustFeeBaseAmount using
    trustFeeRateBps and the existing deterministic rounding convention.

-   providerNetBeforePspFees = grossAmount - trustFeeAmount.

-   PACK-02 does not subtract Asaas/PSP fees because the actual
    processing cost is not yet known/implemented.

-   All calculated fields must be persisted, not recomputed later using
    the then-current fee configuration.

## 9. Proposal Requirements

### 9.1 FIXED_PRICE proposal

-   pricingModel = FIXED_PRICE.

-   service/commercial amount required.

-   currency required.

-   Existing proposal expiry/negotiation behavior preserved.

### 9.2 HOURLY proposal

-   pricingModel = HOURLY.

-   hourlyRate required.

-   minimumMinutes required and \> 0.

-   billingIncrementMinutes resolved from configuration/default and \>
    0.

-   Initial contract amount must be deterministically derivable from
    hourlyRate and minimumMinutes.

-   Any user-facing proposal comparison should be able to distinguish
    fixed price from hourly pricing, but PACK-02 must not create a large
    new UI if none is needed for current flow.

## 10. Contract Formation

1.  Trust Member accepts a Trust Proposal using the existing Marketplace
    flow.

2.  Load the accepted proposal's commercial terms.

3.  Resolve the effective Trust Fee configuration.

4.  Calculate the immutable economic snapshot.

5.  Create/update the Trust Contract/Marketplace Order financial
    snapshot according to current aggregate boundaries.

6.  Create Payment through the already implemented PAY-001 path using
    the frozen gross amount and economic snapshot/reference.

7.  Do not recalculate Trust Fee during authorization, custody or
    release.

8.  Publish only events actually required by existing architecture; do
    not invent redundant events merely for this Pack.

## 11. Payment Integration Boundary

-   PACK-01 custody/release behavior must remain unchanged.

-   Payment amount used for authorization/custody must equal the frozen
    grossAmount of the current contract snapshot.

-   Trust Fee is commercial accounting metadata in PACK-02; it does not
    yet cause split/settlement.

-   Funds entering Trust Custody remain the full authorized gross amount
    under the current sandbox model.

-   Future PACK-05 will map the frozen snapshot to Asaas
    escrow/distribution.

## 12. Change Order Preparation --- No Workflow Yet

PACK-02 must make the snapshot extensible so PACK-03 can add approved
deltas without mutating historical initial terms. The initial snapshot
is immutable; future Trust Change Orders will append approved financial
adjustments and produce a derived current/final authorized amount.

``` text

initialContractSnapshot (immutable)
+ approvedChangeOrders[] (future PACK-03)
= currentAuthorizedCommercialAmount
```

Do not implement Change Order endpoints, timers, additional-time
approvals, material evidence or final service summary in PACK-02.

## 13. Persistence

Claude must prefer additive changes to existing Proposal/Order/Payment
schemas. Exact table placement depends on the current code discovered
during preflight.

-   Persist proposal pricing model and required terms.

-   Persist contract/order economic snapshot or a dedicated one-to-one
    snapshot entity if current aggregate/schema makes that safer.

-   Persist rate and calculated fee amounts, not only the current global
    fee configuration.

-   Use current ID, timestamp and money conventions.

-   No tenant_id/organization_id retrofit.

-   Migration must be additive and non-destructive.

## 14. Preflight Checks --- MUST RUN BEFORE CODING

1.  Locate the current Proposal, MarketplaceOrder/Contract and Payment
    amount fields and document their money representation.

2.  Identify exactly what event/use case currently creates Payment after
    proposal acceptance. Confirm PACK-02 will not reintroduce
    MarketplaceOrder.CustomerConfirmed as Payment-creation semantics.

3.  Locate the current 1000 bp fee seed/configuration, if present.
    Report where it is used.

4.  Identify whether Proposal already supports fixed/hourly price types.
    Preserve compatible existing behavior rather than duplicating
    models.

5.  Identify the existing rounding/percentage helper used for money
    calculations.

6.  Confirm PACK-01 Payment statuses, TrustCustody and release consumers
    remain independent from fee calculation.

7.  Identify existing i18n/localization mechanism for any user-facing
    fields/messages changed by this Pack.

If any preflight result contradicts a canonical business rule in this
Pack and reconciliation would change already-running product semantics,
STOP the affected item and report the exact conflict. Do not guess.

## 15. Validation Rules

| Condition \| Required behavior \|

| --- \| --- \|

| Unsupported pricingModel \| Reject. \|

| FIXED_PRICE without valid amount \| Reject. \|

| HOURLY without hourlyRate/minimumMinutes \| Reject. \|

| billingIncrementMinutes \<= 0 \| Reject. \|

| Negative financial component \| Reject. \|

| MATERIAL_COST classified as fee base \| Reject under MVP pass-through
  rule. \|

| Snapshot totals inconsistent \| Reject before Payment creation. \|

| Current fee config changes after contract \| Existing snapshot remains
  unchanged. \|

## 16. Auditability

-   Audit the effective Trust Fee rate used when the contract snapshot
    is created.

-   Audit calculated gross, fee base, fee amount and provider net before
    PSP fees.

-   Preserve proposal/contract identifiers and correlationId/request
    context where available.

-   Do not log payment credentials or secrets.

-   Future changes to global fee configuration must be independently
    auditable; PACK-02 may reuse the current configuration/audit
    mechanism.

## 17. Events

Do not create an event proliferation. If the current Marketplace
contract/order acceptance event already carries enough identity to
retrieve the snapshot, keep it. Any event payload extended by PACK-02
must remain backward compatible and comply with PACK-00.

-   Payment.Created/Payment.Authorized semantics remain unchanged except
    that Payment now consumes the frozen gross amount/snapshot reference
    as needed.

-   No TrustFee.Collected event in PACK-02: the fee is not financially
    collected/distributed yet.

-   No Funds.Split/Settlement events in PACK-02.

## 18. Required Tests

### 18.1 Unit

-   FIXED_PRICE snapshot calculation.

-   HOURLY initial amount calculation from rate/minimum duration.

-   30-minute default resolved through configuration, not hard-coded in
    domain calculation.

-   Custom billing increment is persisted in snapshot.

-   Trust Fee rate is read from configuration/policy and frozen.

-   Changing fee configuration after snapshot does not alter existing
    snapshot.

-   SERVICE is fee-eligible.

-   MATERIAL_COST pass-through is excluded from fee base.

-   MATERIAL_MARKUP can be included in fee base.

-   Integer/minor-unit rounding is deterministic.

-   providerNetBeforePspFees calculation.

-   Invalid/negative/inconsistent amounts rejected.

### 18.2 Integration / regression

-   Accepted proposal → contract/order snapshot → Payment created with
    matching grossAmount.

-   Payment authorization → PACK-01 custody still holds full
    grossAmount.

-   CustomerConfirmed release flow remains green and does not
    recalculate fee.

-   Existing Marketplace proposal/order flows remain green.

-   PACK-00 canonical event envelope tests remain green.

-   All current tests plus PACK-02 tests pass.

## 19. Explicitly Out of Scope

-   Trust Change Order workflow.

-   Trust Check-in / Check-out / Trust Pause.

-   elapsed_time, billable_time and paused_time runtime tracking.

-   Trust Evidence requirements for material cost.

-   Service Summary.

-   Cancellation/refund/dispute redesign.

-   Partial release.

-   Asaas integration.

-   Real escrow, split or settlement.

-   PSP processing-fee calculation.

-   Installment financing rules.

-   Trust Wallet.

-   Trust Coin implementation.

-   Variable Trust Fee by Trust Level/category/plan/volume/campaign.

## 20. Acceptance Criteria

-   PASS --- Both FIXED_PRICE and HOURLY commercial models are
    represented without breaking existing proposal flow.

-   PASS --- Hourly billing increment is configurable and frozen per
    accepted contract; default is 30 minutes.

-   PASS --- One configurable MVP Trust Fee rate exists without business
    hard-code.

-   PASS --- Initial contract economic snapshot is immutable and
    auditable.

-   PASS --- Trust Fee is calculated on fee-eligible components only.

-   PASS --- Pass-through MATERIAL_COST is excluded from full Trust Fee.

-   PASS --- Payment gross amount matches the frozen contract gross
    amount.

-   PASS --- PACK-01 custody/release behavior remains unchanged.

-   PASS --- No PSP/split/refund/change-order workflow is introduced.

-   PASS --- All existing and new tests pass.

## 21. Definition of Done

-   Preflight completed with no unresolved blocking conflict.

-   Additive migration(s) applied.

-   Proposal pricing terms and contract economic snapshot implemented.

-   Configurable Trust Fee policy implemented.

-   Payment creation uses frozen gross amount.

-   Required tests green.

-   No unrelated PACK-03/04/05 scope introduced.

-   Claude produces PACK-02-COMPLETION-REPORT.md.

-   Kondo reviews implementation diff after completion.

## 22. Claude AI Implementation Instructions

``` text

Implement PACK-02 only.

Sources of authority:
1. PACK-02 v1.0
2. implemented PACK-01
3. implemented PACK-00
4. current code/tests
Historical documents are reference only where they do not conflict.

Run §14 preflight before coding.

Canonical decisions:
- Trust Member pays the contracted price; no additional Trust platform fee is added to the Member in MVP.
- Trust Fee is economically charged to Trust Partner.
- MVP Trust Fee = one configurable percentage, not hard-coded.
- Freeze fee rate and calculated economic snapshot at contract/payment creation.
- Later global fee changes never alter existing transactions.
- Pricing models: FIXED_PRICE and HOURLY.
- HOURLY uses configurable billingIncrementMinutes; default 30.
- Additional time is NOT implemented here and will require Member-approved Trust Change Order in PACK-03.
- SERVICE is fee-eligible.
- verified/pass-through MATERIAL_COST is 0% Trust Fee; evidence workflow is future scope.
- MATERIAL_MARKUP is separate and architecture must allow it to be fee-eligible.
- Use existing minor-unit/integer money convention and existing deterministic rounding.
- PSP fees are separate and not calculated in this Pack.
- Do not implement Asaas, split, settlement, refund, timers, Pause, Change Orders or Service Summary.
- Preserve PACK-01 custody/release behavior.

If current code conflicts with a canonical decision and the safe reconciliation is not explicit:
STOP the affected item and report:
- exact conflict
- files/current behavior
- minimum decision required

Do not make product assumptions.

After implementation generate PACK-02-COMPLETION-REPORT.md with:
Implemented
Files Changed
Migrations
APIs/Events
Tests & Results
Acceptance Criteria
Deviations/Decisions
Known Issues
Remaining Work
Commit
```

## 23. Consistency Gate

| Check \| Result \|

| --- \| --- \|

| PACK-00 engineering baseline preserved \| PASS \|

| PACK-01 custody/release semantics preserved \| PASS \|

| CustomerConfirmed not reused as Payment creation trigger \| PASS \|

| Trust Fee model matches approved business decision \| PASS \|

| Fee snapshot frozen at contracting \| PASS \|

| Fixed/hourly models separated from future time tracking \| PASS \|

| 30-minute increment configurable, not hard-coded \| PASS \|

| Material cost vs markup separated \| PASS \|

| No Asaas/split/refund scope \| PASS \|

| Multi-language requirement respected at architecture/UI-string
  boundary \| PASS \|

| No unresolved business decision required to implement this Pack \|
  PASS \|

## 24. Pack Status

STATUS: READY FOR IMPLEMENTATION

PACK-02 is intentionally limited to commercial amount and fee
foundation. It prepares the Trust Platform for PACK-03 Change Orders &
Time Billing without prematurely implementing operational time tracking
or real PSP distribution.

END OF PACK-02
