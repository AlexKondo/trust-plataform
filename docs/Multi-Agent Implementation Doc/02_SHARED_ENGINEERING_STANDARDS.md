# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## 1. Architecture
- Preserve current modular/hexagonal/ports-and-adapters patterns.
- Domain code must not import PSP SDKs, storage SDKs, broker libraries or web framework concerns.
- External systems behind interfaces/adapters.
- Use transactional outbox for cross-domain events where established.
- Consumers idempotent; retry/DLQ behavior follows baseline.
- Do not introduce Kafka/Kubernetes/enterprise control plane merely because historical ADRs mention them.

## 2. API
- `/api/v1/...`.
- Canonical PACK-00 error body and correlation behavior.
- Validate DTOs at boundaries.
- Authorization server-side on every protected write/read.
- OpenAPI updated for every public route.
- Backward compatibility unless the IP explicitly changes a contract.

## 3. Events
- Use the PACK-00 canonical envelope.
- Preserve implemented naming convention; do not re-open the old 2-vs-3 segment debate.
- Include aggregate information for new writes as established by PACK-00 v1.1.
- Do not create events for trivial persistence.
- Event catalog updated.

## 4. Data and migrations
- Additive migrations preferred.
- No destructive migration without explicit escalation.
- No `tenant_id`.
- Use FKs/unique/check constraints when they enforce invariants.
- Concurrency-sensitive transitions use compare-and-set/optimistic locking or database constraint, not read-check-write only.
- Migrations must be repeatable/safe according to current project convention.
- Never apply shared/prod migrations without explicit environment authorization.

## 5. Money
- No floating point.
- Preserve cents/basis-points conventions.
- Financial snapshots/history immutable where established.
- Every money mutation has auditability and idempotency.
- PSP fee is distinct from Trust Fee.
- MATERIAL_COST pass-through is distinct from MATERIAL_MARKUP.
- Trust Fee policy must be configurable; no new hard-coded commercial percentage.
- Existing 1000 bps seed remains a technical placeholder until business decision.

## 6. Security
- Least privilege.
- JWT/auth patterns from baseline.
- No secrets in repo/logs.
- Sensitive actions audited.
- File upload validates type/size and uses private storage where required.
- Rate limiting/abuse protection added where exposed public surfaces require it, using existing infrastructure first.
- No hidden admin bypass.

## 7. Privacy/LGPD
- Minimize collection.
- Purpose-bound data use.
- User-facing consent/legal text must be externalized/i18n-ready.
- Do not expose precise location beyond product need.
- Evidence and identity data require access control.
- Deletion/retention behavior must respect financial/audit legal constraints; never erase immutable financial/audit records by naive cascade.

## 8. Internationalization
- PT-BR default.
- User preference may select another supported locale.
- No user-facing strings hard-coded in domain logic.
- Currency, date, time, number and address formatting locale-aware.
- Canonical identifiers remain language-neutral.
- Initial implementation must be structurally ready for multiple languages; do not require every translation language in Release 1.0 unless configured.

## 9. Frontend
- Mobile-first responsive.
- Accessibility basics: labels, keyboard, focus, contrast, semantic controls.
- Loading/empty/error/success states.
- Never trust client-side authorization.
- Financial confirmation screens show original amount + approved changes + final authorized amount.
- Trust Member and Trust Partner roles must be visually understandable without exposing internal technical vocabulary.

## 10. Testing
For each IP:
- unit/domain tests for invariants;
- integration tests for repositories/adapters;
- E2E for primary journeys and security boundaries;
- regression of closed PACKs;
- typecheck;
- lint with baseline-known exceptions documented;
- deterministic fixtures;
- race/idempotency tests for money/state transitions.

A failing test is not waived by code inspection if the behavior can be executed.

## 11. Observability and audit
- Reuse correlation/request identifiers.
- Structured logs; no secrets/evidence payloads.
- Audit critical state transitions.
- Operational metrics only where useful; do not build an enterprise observability platform.

## 12. Documentation
Each IP updates as applicable:
- OpenAPI
- event catalog
- migration journal
- environment example/schema
- README/runbook
- Completion Report

## 13. Technical debt inherited into this program
At minimum track:
- PACK-03 `double Resume` race: add CAS/expected-state protection.
- unique-constraint violations may surface as generic 500 instead of deterministic 409.
- root lint has known pre-existing errors in `tools/extract-docx.mjs`; restore clean CI.
- PACK-03 migration 0027 / evidence bucket shared-environment deployment status must be verified by IP-000.
