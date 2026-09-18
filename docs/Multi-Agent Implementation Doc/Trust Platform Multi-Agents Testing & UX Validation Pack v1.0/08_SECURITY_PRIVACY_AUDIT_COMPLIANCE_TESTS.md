# 08 — Security, Privacy, Audit & Compliance Tests

Test authentication, authorization, object-level ownership, session/token handling, privilege escalation, injection, XSS/CSRF where applicable, rate limiting, secret leakage, secure headers, file/evidence upload validation and abuse cases. Verify Member/Partner can only access their permitted contracts and evidence.

Critical actions must produce reconstructable audit evidence: actor type, actor ID, action, resource, outcome, policy version where applicable, correlation ID and timestamp. Audit evidence must be tamper-evident/append-oriented according to architecture. Logs must not contain passwords, tokens, secrets or unnecessary personal data. Include privacy access/minimization/retention checks appropriate to the implemented MVP.
