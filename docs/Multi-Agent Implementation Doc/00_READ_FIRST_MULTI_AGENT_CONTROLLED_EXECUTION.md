# Trust Platform — Multi-Agent Implementation Pack v1.0

**Execution mode:** Controlled Multi-Agent Delivery  
**Product:** Trust Platform — Local Services Marketplace  
**Baseline:** PACK-00, PACK-01, PACK-02 and PACK-03 are CLOSED. IP-000 must resolve and record the exact `origin/main` SHA before any implementation wave starts.  
**Operating rule:** **Sequential where dependent. Parallel where independent.**

## 1. Mission

Complete the Trust Platform from the real repository baseline without rebuilding closed capabilities, reinterpreting approved product decisions, or importing deferred enterprise architecture into the MVP.

This package is executable engineering documentation. It is not a concept deck.

Every agent must read this file, `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md`, `02_SHARED_ENGINEERING_STANDARDS.md`, `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md`, and its assigned IP before changing code.

## 2. Non-negotiable source precedence

When sources disagree, use:

1. This Multi-Agent Implementation Pack v1.0.
2. Explicit approved product decisions recorded in `04_APPROVED_PRODUCT_DECISIONS.md`.
3. Closed PACK-03 implementation and closure artifacts.
4. Closed PACK-02 implementation and closure artifacts.
5. Closed PACK-01 implementation and closure artifacts.
6. Closed PACK-00 v1.1 implementation and closure artifacts.
7. Real code, migrations, tests and runtime contracts at the frozen baseline.
8. Historical TP/feature specifications where non-conflicting.
9. Historical ARCH ADRs only where non-conflicting and appropriate to the current B2C MVP.

A later historical ADR does **not** automatically override the approved MVP baseline.

## 3. Closed baseline — do not rebuild

Treat these as implemented baseline capabilities unless IP-000 proves otherwise:

- Foundation: canonical API/error envelope, JWT ES256, transactional outbox, pg-boss, immutable audit.
- Identity: registration, email verification, login, refresh, logout, password recovery/change.
- Trust Passport and verification foundation.
- Trust Score deterministic engine, event store, explainable timeline, levels, benefits/badges/public reputation primitives.
- Marketplace core: listings, conversations, proposals/counterproposals, order lifecycle, disputes/reviews primitives.
- Notifications foundation.
- PACK-01: Payment custody/release foundation with sandbox gateway.
- PACK-02: commercial amount, FIXED_PRICE/HOURLY, frozen fee policy, material cost/markup separation.
- PACK-03: Trust Change Order, Member approval, time execution, Trust Pause, evidence linkage and Service Summary.

If repository reality differs, IP-000 reports the difference. Do not silently “fix” it.

## 4. Approved MVP architecture boundaries

- B2C-first, identity-centric.
- **No enterprise `tenant_id` retrofit.**
- Architecture may remain extensible for future B2B, but no multi-tenancy implementation unless a future approved change request says so.
- Event-driven contracts may continue using transactional outbox + pg-boss. Kafka is not required.
- External integrations use ports/adapters.
- Binary evidence stays in object storage; metadata stays in database.
- Financial values use deterministic integer/decimal conventions already established. Never floating-point money.
- Initial commercial snapshot is immutable; approved Change Orders are additive history.
- Customer/Member confirmation remains the release trigger, not Payment creation trigger.
- Trust Partner cannot unilaterally increase Trust Member charges.

## 5. Multi-agent rules

### 5.1 Ownership
An agent owns only the files/domain declared by its IP. Shared-kernel changes require either:
- explicit ownership in that IP, or
- a recorded cross-IP change request approved by the Integrator/Architecture Agent.

### 5.2 No assumption rule
If a missing decision can change money, security, privacy, legal responsibility, user rights, Trust Score, or irreversible data shape: **STOP and escalate**.

### 5.3 No opportunistic refactor
Do not rename broad domains, replace frameworks, introduce new infrastructure, or “clean up” unrelated code.

### 5.4 Dependency rule
An IP may start only when every hard dependency in the Manifest is APPROVED. Soft dependencies may run in parallel.

### 5.5 Branch/worktree isolation
Each implementation agent uses its own branch/worktree. Never have two agents write the same files concurrently.

Suggested branch:
`multi-agent/ip-XXX-short-name`

### 5.6 Integration
Agents do not merge themselves to `main`. The Integrator/Quality Agent validates the IP, resolves only approved integration conflicts, runs regression, and records the merge SHA.

## 6. Mandatory IP lifecycle

`PREFLIGHT -> IMPLEMENT -> SELF-TEST -> COMPLETION REPORT -> DIFF REVIEW -> QUALITY GATE -> APPROVED/MERGED`

No IP is “done” because code compiles.

Required artifacts:
- `IP-XXX-COMPLETION-REPORT.md`
- `IP-XXX-DIFF-REVIEW.md`
- `IP-XXX-QUALITY-GATE.md`
- conflict escalation artifact if blocked

## 7. Stop conditions

Stop the affected item when:
- current code contradicts a canonical rule;
- a migration would destructively rewrite closed baseline data;
- an external PSP/API behavior must be invented;
- a security/privacy decision is absent;
- an IP needs to modify another active IP’s owned files;
- test failure suggests a baseline regression not caused by the IP;
- user-facing financial behavior cannot be proven deterministic.

Do not stop unrelated independent work.

## 8. Production environment rule

No agent may apply migrations, create buckets, configure secrets, activate real payments, or change production/shared infrastructure unless the IP explicitly authorizes that environment action and the required credentials/configuration are available.

Repository migrations/configuration code may be created and tested locally.

## 9. Documentation language and product language

Engineering documentation and identifiers may remain in English where established. User-facing product must be PT-BR by default and internationalization-ready. Do not hard-code Portuguese strings inside domain logic.

Canonical product vocabulary:
- Trust Member — customer
- Trust Partner — service provider
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
- Service Summary
- Trust Coin — future concept, **not implemented in this release**

## 10. Final release gate

The platform is not release-ready until IP-024 passes the full end-to-end Release Readiness Gate. Individual IP approval is necessary but not sufficient.
