# 15 — Evidence, Reporting & Quality Gates

Every suite emits machine-readable result + human summary. Evidence should include build/commit, environment, dataset version, test version, timestamps, relevant correlation IDs, screenshots/video for UX failures, API/event traces for integration failures and audit records for critical transitions.

G0 Baseline reconciled → G1 domain green → G2 integration green → G3 E2E/financial green → G4 security/AI green → G5 UX/accessibility/performance green → G6 full regression/UAT/release acceptance. A gate cannot be waived silently; exceptions require explicit owner, rationale, risk and expiry/remediation.
