# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## 1. Roles

### Orchestrator
Reads Manifest, starts only eligible IPs, enforces dependencies and ownership.

### Architecture/Integrator Agent
Owns IP-000, integration sequencing, shared-kernel approval, final merge coordination.

### Domain Implementation Agents
Implement assigned IP only.

### Quality/Diff Agent
Must be independent from the implementation reasoning where possible. Reviews full diff against spec and executes tests.

### Release Agent
Owns IP-024 after all required gates.

## 2. Agent bootstrap prompt

Use this prompt for every implementation agent, replacing placeholders:

```text
You are an implementation agent for the Trust Platform.

Read, in order:
1. 00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md
2. 01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md
3. 02_SHARED_ENGINEERING_STANDARDS.md
4. 03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md
5. 04_APPROVED_PRODUCT_DECISIONS.md
6. your assigned IP: <IP FILE>

Before coding, inspect the real repository at the frozen TRUST MULTI-AGENT BASELINE and run the IP preflight.

Do not rebuild closed PACK-00..03 capabilities.
Do not reinterpret approved product decisions.
Do not introduce tenant_id.
Do not implement out-of-scope future enterprise architecture.
Do not modify another agent's owned domain without an approved cross-IP request.
Do not make product assumptions for money, security, privacy, Trust Score, or irreversible data design.

If blocked, create a Conflict Escalation report and stop only the affected item.

If clear, implement only the assigned IP, run all required tests, and generate the required Completion Report.
Do not self-approve or merge to main.
```

## 3. Quality agent prompt

```text
Independently review the full diff for <IP-XXX> against:
- READ_FIRST
- Manifest
- Shared Engineering Standards
- Approved Product Decisions
- the IP specification
- frozen baseline behavior

Do not trust the Completion Report without verification.
Read every changed production file and relevant test.
Run the required test suite.
Classify findings as CRITICAL / BLOCKING / MAJOR / MINOR / OBSERVATION.
Produce IP-XXX-DIFF-REVIEW.md.
Do not modify production code during review.
```

## 4. Integration gate

An IP may merge only when:
- Completion Report exists;
- Diff Review verdict is APPROVED or APPROVED WITH explicitly completed corrections;
- Quality Gate is PASS;
- dependency graph remains valid;
- shared-file conflicts are resolved;
- main regression suite is green.

## 5. Conflict protocol

Use `TEMPLATES/CONFLICT_ESCALATION_TEMPLATE.md`.
Do not send vague questions. Include:
- exact requirement;
- current code behavior;
- files/lines;
- alternatives;
- consequences;
- smallest decision needed.

## 6. Parallelism

Parallelism is allowed by domain, not by optimism.
Do not run two agents against the same migration journal/module wiring/frontend shell simultaneously unless Integrator has reserved merge order.

## 7. Commit discipline
Suggested:
- implementation commit(s)
- test/fix commit(s)
- docs/completion commit
- quality review artifact commit by reviewer/integrator

Commit messages reference IP number.

## 8. No background autonomous expansion
Agents may not create new IPs or broaden scope. New gaps are reported to Orchestrator, which may create a controlled Change Request after product approval.
