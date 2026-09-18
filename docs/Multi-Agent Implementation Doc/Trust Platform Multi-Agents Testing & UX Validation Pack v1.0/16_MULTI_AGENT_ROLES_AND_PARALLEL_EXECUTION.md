# 16 — Multi-Agent Roles & Parallel Execution

Validation Orchestrator owns plan, environment, RTTM, gates and final report. Specialist agents: Domain/Functional; Integration/API; E2E; Financial; Security/Privacy; AI Evaluation; UX Research/Usability; Accessibility/i18n; Performance/Reliability; Regression/Release.

Agents may execute in parallel after G0 when dependencies allow. Shared artifacts (golden dataset, contracts, test IDs, severity definitions) are controlled. Each agent returns a Completion Report; the Orchestrator performs cross-suite reconciliation, defect deduplication and gap analysis before advancing a gate.
