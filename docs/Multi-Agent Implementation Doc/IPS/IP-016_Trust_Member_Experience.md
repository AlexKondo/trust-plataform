# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## IP-016 — Trust Member Experience

**Primary owner:** Frontend  
**Hard dependencies:** IP-002, IP-004, IP-005, IP-007, IP-013

## 1. Objective

Deliver coherent Member journey: onboarding/profile/passport, create need, discover/compare offers, schedule, authorize/pay, follow ETA, approve Change Order, view evidence/summary, confirm service, dispute/refund where available, review Partner, view Trust/rewards. Reuse APIs; close missing screens/states.

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

No duplicate backend rules in frontend; no exposing Partner internal economics.

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

Primary Member E2E is usable mobile-first; all loading/error/empty states; locale-ready; accessibility basics; financial confirmations explicit.

## 7. Definition of Done

- Preflight documented.
- Implementation limited to IP scope.
- Migrations/config documented.
- Tests green.
- No unresolved blocking conflict.
- `IP-016-COMPLETION-REPORT.md` generated from template.
- Independent Diff Review completed.
- Quality Gate PASS before merge.

## 8. Stop conditions

Stop the affected item for missing product decision involving money/security/privacy/legal/Trust Score; unsafe destructive migration; unknown external provider behavior; or cross-IP ownership conflict.

## 9. Agent instruction

```text
Implement IP-016 only.
Do not self-approve.
Do not merge to main.
If blocked, create a Conflict Escalation artifact.
After implementation and tests, generate IP-016-COMPLETION-REPORT.md.
```
