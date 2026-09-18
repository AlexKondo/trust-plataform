# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## 1. Execution graph

```text
IP-000 Baseline Reconciliation
   |
   +--> IP-001 Engineering Hardening / CI
   +--> IP-002 i18n Foundation
   |
   +--> IP-003 Service Request, Discovery & Matching
   |      +--> IP-004 Competitive Quotes & Comparison
   |      +--> IP-005 Scheduling, Availability & ETA
   |               \ 
   |                +--> IP-006 Field Execution & Evidence Hardening
   |
   +--> IP-007 Incremental Payment Authorization
           |
           +--> IP-008 Cancellation, Dispute & Refund
           +--> IP-009 Real PSP / Asaas / Custody / Distribution
                    |
                    +--> IP-010 Ledger & Reconciliation

IP-000 + relevant domain IPs
   +--> IP-011 Trust Signals & Reputation Completion
   +--> IP-012 Trust Economy: Points, Benefits, Referral, Cashback
   +--> IP-013 Notification & Communication Completion
   +--> IP-014 Safety, Abuse & Fraud Controls
   +--> IP-015 Search & Marketplace Retrieval
   +--> IP-016 Trust Member Experience
   +--> IP-017 Trust Partner Experience
   +--> IP-018 Admin, Support & Operations
   +--> IP-019 AI Assistance Layer
   +--> IP-020 Analytics & Operational Intelligence
   +--> IP-021 Privacy, LGPD & Data Lifecycle
   +--> IP-022 Mobile/Responsive/PWA Field Experience
   +--> IP-023 External Integrations & Webhooks

All required release IPs
   |
   +--> IP-024 End-to-End Hardening & Release Readiness
```

## 2. Manifest

| IP | Title | Primary owner | Hard dependencies | Parallelizable after deps? | Release class |
|---|---|---|---|---|---|
| 000 | Current State Baseline & Reconciliation | Architecture/Integrator | none | no | BLOCKING |
| 001 | Engineering Hardening, CI & Concurrency | Platform/Quality | 000 | yes | BLOCKING |
| 002 | Internationalization & Localization Foundation | Experience/Foundation | 000 | yes | BLOCKING |
| 003 | Service Request, Discovery & Matching | Marketplace | 000 | yes | CORE |
| 004 | Competitive Quotes & Comparison Map | Marketplace/Experience | 003 | yes | CORE |
| 005 | Scheduling, Availability, Location & ETA | Marketplace | 003 | yes | CORE |
| 006 | Field Execution & Trust Evidence Hardening | Marketplace | 001,005 | yes | CORE |
| 007 | Incremental Payment Authorization | Payments | 000 | yes | BLOCKING-FIN |
| 008 | Cancellation, Dispute & Refund | Payments/Marketplace | 007 | yes | CORE-FIN |
| 009 | Asaas / Real PSP / Custody / Distribution | Payments/Integration | 007 | yes | CORE-FIN |
| 010 | Ledger, Settlement & Reconciliation | Payments | 009 | no | CORE-FIN |
| 011 | Trust Signals & Reputation Completion | Trust | 003,006 | yes | CORE |
| 012 | Trust Points, Benefits, Referral & Cashback | Trust/Growth | 011,009 | yes | VALUE |
| 013 | Notification & Communication Completion | Communications | 000 | yes | CORE |
| 014 | Safety, Abuse & Fraud Controls | Security/Trust | 001,007 | yes | CORE |
| 015 | Search & Marketplace Retrieval | Marketplace/Search | 003 | yes | CORE |
| 016 | Trust Member Experience | Frontend | 002,004,005,007,013 | yes | CORE |
| 017 | Trust Partner Experience | Frontend | 002,004,005,006,007,013 | yes | CORE |
| 018 | Admin, Support & Operations | Operations | 001,008,009,014 | yes | CORE |
| 019 | AI Assistance Layer | AI/Product | 003,004,015 | yes | VALUE |
| 020 | Analytics & Operational Intelligence | Data/Product | 000,007 | yes | CORE |
| 021 | Privacy, LGPD & Data Lifecycle | Security/Privacy | 001,002 | yes | BLOCKING |
| 022 | Mobile/Responsive/PWA Field Experience | Frontend | 016,017 | no | CORE |
| 023 | External Integrations & Webhooks | Integration | 001,009 | yes | VALUE |
| 024 | End-to-End Hardening & Release Readiness | Integrator/Quality | all BLOCKING + all CORE selected by IP-000 | no | FINAL |

## 3. Wave plan

### Wave 0 — Freeze
Only IP-000.

### Wave 1 — Foundation
IP-001 and IP-002 may run in parallel after IP-000.

### Wave 2 — Core domain expansion
IP-003, IP-007, IP-013, IP-020, IP-021 may run in parallel where file ownership is isolated.

### Wave 3 — Marketplace/Payments branches
Marketplace: 004, 005, 015.  
Payments: 008 and 009.  
Security: 014 after 007.  
AI: 019 after 003/004/015.

### Wave 4 — Execution and money closure
006, 010, 011.

### Wave 5 — Experience and operations
016, 017, 018, 023.

### Wave 6 — Growth/value
012 and 022.

### Wave 7 — Release
024 only after required IPs are approved and integrated.

## 4. Dynamic scope rule

IP-000 may classify an IP as:
- `IMPLEMENT` — material gap exists;
- `PARTIAL` — only listed gaps must be built;
- `VERIFY_ONLY` — capability already exists; tests/docs may be enough;
- `DEFERRED` — explicitly outside Release 1.0 after a documented product decision;
- `BLOCKED_EXTERNAL` — requires credential/provider/legal/business input.

IP-000 may **not delete an approved product requirement**. It may only classify implementation state.

## 5. Shared-file collision policy

Potential collision hotspots:
- marketplace module wiring
- shared auth/exception filters
- OpenAPI/event catalog
- frontend navigation/layout
- notification rules
- migrations journal
- shared storage
- environment schemas

Only one active IP may own a collision hotspot at a time, or the Integrator must sequence the commits.
