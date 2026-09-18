# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## Product baseline

### Positioning
Trust Platform is a B2C-first, identity-centric platform for local services. It connects a **Trust Member** needing a service with a **Trust Partner** who can perform it.

### Naming
Canonical brand vocabulary:
- Trust Member
- Trust Partner
- Trust Score
- Trust Passport
- Trust Points
- Trust Benefits
- Trust Payment
- Trust Change Order
- Trust Pause
- Trust Evidence
- Trust Signal
- Trust Confirmation
- Trust Coin — future only

### Marketplace
- Member can describe a need and receive offers.
- Partners may quote fixed price or hourly price.
- Member can compare competing offers in a transparent comparison view.
- Hourly contracts use a configurable billing increment; 30 minutes is the current MVP default frozen on contract.
- Partner cannot unilaterally increase the charge.
- Additional time/scope/material requires Member-approved Trust Change Order.
- Trust Pause excludes non-billable interruptions such as personal calls/breaks.
- Service Summary reconciles original contract + approved changes.

### Materials and fees
- SERVICE is fee-eligible.
- MATERIAL_COST is pass-through and not charged the same full Trust Fee.
- MATERIAL_MARKUP is separate and fee-eligible.
- Trust Fee is configurable, economically supported by Partner under current approved policy.
- 10%/1000 bps is a technical seed, not a final business decision.
- PSP cost is separate from Trust Fee.

### Payment
- Payment is created from accepted commercial agreement according to closed baseline.
- Customer/Member confirmation is the release trigger.
- Custody/release is foundationally implemented in sandbox.
- Incremental Change Order authorization is commercially implemented but additional money is not yet safely represented in custody; this must be solved before real-money release.
- Real provider selection for this program is Asaas unless IP-009 preflight proves a product/business decision is still required.
- Real PSP behavior must never be invented; adapter follows provider capability and legal/account configuration.

### Trust/reputation
- Trust is identity-centric and explainable.
- Trust Score, Passport, levels, badges and reputation primitives already exist.
- Trust Signals are objective facts; a signal is not automatically fraud.
- Do not auto-penalize Trust Score without an approved deterministic rule.
- Reviews are bilateral where current model supports them.
- Evidence and completion history may inform future trust intelligence.

### Experience
- Mobile-first.
- GPS/ETA and execution visibility are part of the service experience where relevant.
- Evidence before/after and operational traceability should be available without making photos mandatory for every normal action.
- User-facing platform must support PT-BR as default and be architecture-ready for multiple languages selectable by user.

### Growth/economy
Approved concepts include Trust Points, Benefits, Referral and Cashback. Implement only under IP-012 rules.
Trust Coin is future and excluded from Release 1.0.

### Architecture
- No enterprise multi-tenancy in MVP.
- No mandatory B2B organization between Member and Partner.
- Enterprise SSO/control plane/multi-region/agent marketplace are future target architecture, not Release 1.0 backlog.
