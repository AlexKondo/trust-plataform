# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## IP-011 — Trust Signals & Reputation Completion

**Primary owner:** Trust  
**Hard dependencies:** IP-003, IP-006

## 1. Objective

Define a controlled Trust Signal registry fed by objective marketplace/execution/payment facts. Complete bilateral reputation flow, signal-to-score rules only where explicitly approved, explainability, anti-gaming protections, public/private visibility, and timeline. Preserve existing deterministic Trust Score engine.

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

No opaque LLM score; no automatic fraud conclusion from a single signal; no unapproved punitive score rule.

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

Signals are typed/versioned/audited; duplicate events do not double-count; score changes explain why; privacy visibility enforced; reviews tied to completed eligible orders.

## 7. Definition of Done

- Preflight documented.
- Implementation limited to IP scope.
- Migrations/config documented.
- Tests green.
- No unresolved blocking conflict.
- `IP-011-COMPLETION-REPORT.md` generated from template.
- Independent Diff Review completed.
- Quality Gate PASS before merge.

## 8. Stop conditions

Stop the affected item for missing product decision involving money/security/privacy/legal/Trust Score; unsafe destructive migration; unknown external provider behavior; or cross-IP ownership conflict.

## 9. Agent instruction

```text
Implement IP-011 only.
Do not self-approve.
Do not merge to main.
If blocked, create a Conflict Escalation artifact.
After implementation and tests, generate IP-011-COMPLETION-REPORT.md.
```
