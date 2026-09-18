# 06 — End-to-End Business Journeys

Automate at minimum these golden journeys:
1. Member need → Request → proposals → Match → Contract → Payment authorization → Custody → service → Confirmation → Release.
2. Hourly service with Check-in → Pause → Resume → Check-out → billable-time summary → Confirmation → Release.
3. Service requiring approved Change Order for extra time.
4. Service with MATERIAL_COST + MATERIAL_MARKUP and transparent Member total.
5. Dispute opened before release: release remains blocked.
6. Cancellation before service and during execution according to approved rules.
7. Partner/Member attempts cross-contract access: denied.
8. Mobile journey under degraded network with safe retry/no duplicate action.

Each E2E test captures UI/API/audit evidence and reconciles visible totals with backend economic snapshots.
