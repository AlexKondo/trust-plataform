# 03 — Test Data, Environments & Golden Dataset

Use synthetic/pseudonymized personas and deterministic clocks/IDs where possible. Maintain personas: new Member, established Member, new Partner, established Partner, unauthorized outsider, support/admin only where approved. Include fixed-price and hourly contracts, material cost/markup, change orders, pauses, disputes, cancellation, failed/retried payment gateway, duplicate events, stale AI inputs, poor network/mobile scenarios.

Golden dataset must define expected economic snapshots, fee base, custody state, billable time, change-order totals and final authorized gross amount. No production credentials, secrets or real payment instruments. External providers use sandbox/simulator unless a separately approved controlled test explicitly says otherwise.
