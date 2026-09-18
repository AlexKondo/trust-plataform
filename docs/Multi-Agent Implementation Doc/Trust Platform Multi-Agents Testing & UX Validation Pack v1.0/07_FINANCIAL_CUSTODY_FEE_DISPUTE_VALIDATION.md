# 07 — Financial, Custody, Fee & Dispute Validation

Assert: one custody per Payment; custody created only after AUTHORIZED; amount/currency/Member/Partner/order match Payment snapshot; Payment reaches FUNDS_IN_CUSTODY atomically with custody creation; RELEASED only after release gateway confirmation; CustomerConfirmed is completion acceptance and never Payment creation.

Verify frozen Trust Fee policy, deterministic minor-unit rounding, SERVICE fee eligibility, MATERIAL_COST 0% fee, MATERIAL_MARKUP treatment, immutable snapshot, fixed-price and hourly totals, Change Order deltas, and no recalculation from later configuration changes. Open dispute must deny/freeze release. Reconciliation must detect impossible state combinations.
