# 04 — Functional, Domain & State-Machine Tests

Validate Trust Request creation/edit/cancel; Proposal creation/accept/reject/expiry; Match eligibility; Contract creation and immutable economic snapshot; Check-in ownership and timing; Pause/Resume rules; Check-out; Evidence; Change Order submit/approve/reject; Service Summary; Trust Confirmation; bilateral ratings; dispute/cancellation status.

Mandatory negative/concurrency cases include duplicate submissions, double approval, approve/reject race, duplicate check-in, simultaneous pauses, double resume, double check-out and duplicate financial delta application. Invalid state transitions must fail closed and leave an auditable result.
