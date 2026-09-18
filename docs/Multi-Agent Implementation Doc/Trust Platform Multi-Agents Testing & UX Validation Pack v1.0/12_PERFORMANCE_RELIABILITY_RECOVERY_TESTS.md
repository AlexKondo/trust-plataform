# 12 — Performance, Reliability & Recovery Tests

Define baselines from actual architecture and SLOs; where no approved numeric SLO exists, measure and report rather than invent one. Test p50/p95/p99 latency for critical reads/writes, concurrent Request/Proposal activity, event backlog, payment/custody transitions, evidence upload, matching/AI calls and notification fan-out.

Test graceful degradation, retry storms, duplicate events, process restart, database transient failure, provider outage and recovery/reconciliation. Financial and irreversible operations must prefer safe failure over ambiguous success.
