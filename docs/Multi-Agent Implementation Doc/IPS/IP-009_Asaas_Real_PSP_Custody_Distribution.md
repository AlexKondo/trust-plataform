# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## IP-009 — Asaas / Real PSP / Custody / Distribution

**Primary owner:** Payments/Integration  
**Hard dependencies:** IP-007

## 1. Objective

Implement the real PSP adapter for Asaas using official API behavior/configuration available to the project: customer/payment creation, Pix/card/boleto only if approved/configured, webhook verification, idempotency, custody-equivalent state mapping, incremental charges, release/distribution/split where provider/account model supports it, and PSP fee capture as separate economics. Sandbox/test environment first.

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

Never store raw card data; do not claim escrow if provider/legal model is not escrow; do not invent split capability; secrets outside repo; if account/product capability is missing, mark BLOCKED_EXTERNAL and keep adapter contract/tests.

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

Provider adapter passes contract tests; signed/verified webhook path; duplicate webhook safe; provider IDs persisted; real sandbox flow documented; domain remains provider-agnostic; financial state mapping explicit.

## 7. Definition of Done

- Preflight documented.
- Implementation limited to IP scope.
- Migrations/config documented.
- Tests green.
- No unresolved blocking conflict.
- `IP-009-COMPLETION-REPORT.md` generated from template.
- Independent Diff Review completed.
- Quality Gate PASS before merge.

## 8. Stop conditions

Stop the affected item for missing product decision involving money/security/privacy/legal/Trust Score; unsafe destructive migration; unknown external provider behavior; or cross-IP ownership conflict.

## 9. Agent instruction

```text
Implement IP-009 only.
Do not self-approve.
Do not merge to main.
If blocked, create a Conflict Escalation artifact.
After implementation and tests, generate IP-009-COMPLETION-REPORT.md.
```
