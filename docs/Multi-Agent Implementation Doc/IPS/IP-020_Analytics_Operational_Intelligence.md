# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## IP-020 — Analytics & Operational Intelligence

**Primary owner:** Data/Product  
**Hard dependencies:** IP-000, IP-007

## 1. Objective

Implement operational/product analytics sufficient for Release 1: funnel Request→Offer→Contract→Execution→Confirmation→Payment, conversion, time-to-first-offer, completion, cancellation/dispute, payment success, Trust adoption, partner response, cohort/retention basics. Use operational projections/events before building a warehouse.

## 2. Mandatory preflight

Before coding:
1. Read all control documents.
2. Verify hard dependencies are APPROVED.
3. Inspect real repository implementation relevant to this IP.
4. List existing capabilities to reuse.
5. List exact gaps to implement.
6. Identify owned files and shared collision hotspots.
7. Run relevant baseline tests.
8. Report any conflict before implementation.

If the capability already exists completely, classify `VERIFY_ONLY`; do not rebuild it.

## 3. Required implementation principles

- Reuse closed baseline.
- Add the minimum safe design that satisfies this IP.
- Preserve API/event/error/money/security standards.
- Use additive migrations.
- Protect state transitions and financial effects against duplication/concurrency.
- Update OpenAPI/event catalog/config docs where applicable.
- User-facing behavior must be i18n-ready.

## 4. Out of scope

No enterprise data warehouse unless required by proven scale; no sensitive raw-data dump.

## 5. Required tests

At minimum:
- domain/unit invariants for every new rule;
- repository/integration tests for persistence;
- authorization negative tests;
- idempotency/concurrency tests for critical transitions;
- E2E primary happy path;
- E2E meaningful failure path;
- regression of PACK-00..03 and all hard dependencies affected by the diff;
- typecheck and lint according to shared standards.

## 6. Acceptance criteria

Metrics definitions documented; event-derived where possible; dashboard/API available to authorized ops; numbers reconcile with source transactions; privacy constraints applied.

## 7. Definition of Done

- Preflight documented.
- Implementation limited to IP scope.
- Migrations/config documented.
- Tests green.
- No unresolved blocking conflict.
- `IP-020-COMPLETION-REPORT.md` generated from template.
- Independent Diff Review completed.
- Quality Gate PASS before merge.

## 8. Stop conditions

Stop the affected item for missing product decision involving money/security/privacy/legal/Trust Score; unsafe destructive migration; unknown external provider behavior; or cross-IP ownership conflict.

## 9. Agent instruction

```text
Implement IP-020 only.
Do not self-approve.
Do not merge to main.
If blocked, create a Conflict Escalation artifact.
After implementation and tests, generate IP-020-COMPLETION-REPORT.md.
```
