# 01 — Master Test Manifest

| Workstream | Prefix | Minimum scope | Gate |
|---|---|---|---|
| Baseline & traceability | TV-00 | requirements, IPs, code, decisions | G0 |
| Unit/domain | TV-01 | invariants, calculations, state machines | G1 |
| API/contract/integration | TV-02 | contracts, events, idempotency, failure modes | G2 |
| E2E journeys | TV-03 | Member + Partner complete journeys | G3 |
| Financial | TV-04 | Payment, Custody, Fee, Release, disputes | G3 |
| Security/privacy/audit | TV-05 | authN/Z, OWASP, evidence, LGPD | G4 |
| AI/intelligence | TV-06 | matching, estimates, signals, explainability | G4 |
| UX/UI/accessibility | TV-07 | task success, responsive, WCAG-oriented checks | G5 |
| Performance/reliability | TV-08 | latency, load, concurrency, recovery | G5 |
| Regression/release | TV-09 | full suite, UAT, release decision | G6 |

Every requirement must map to >=1 test; critical financial/security/state-transition requirements require positive, negative, authorization and idempotency/concurrency coverage where applicable.
