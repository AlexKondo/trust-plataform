# IP-021 — Conflict Escalation

**Verification / KYC evidence retention vs. DATA_DELETION requests**

## 1. Blocking requirement

IP-021's objective requires a "deletion/anonymization workflow respecting financial/audit retention" and explicitly instructs: *"if you're not sure some category of data can be safely anonymized vs. must be retained, treat that as a stop-condition-worthy question, not a guess."* Manifest §7 / Shared Standards §7 add: *"deletion/retention behavior must respect financial/audit legal constraints; never erase immutable financial/audit records by naive cascade."*

The question this raises but does **not** answer: when a Trust Member/Partner submits a `DATA_DELETION` request, what happens to their **identity-verification evidence** — the KYC documents (ID/CNH scans, proof-of-address, etc.) they uploaded to complete Trust Passport verification?

## 2. Current repository behavior

This IP does **not** touch `verifications`, `verification_reviews`, `verification_decisions`, or `verification_evidences` (metadata rows or the underlying Supabase Storage objects) in any way. `RequestDataDeletionUseCase` (`apps/api/src/modules/privacy/application/usecases/request-data-deletion.usecase.ts`) only mutates `identities` (via `Identity.anonymize()`) and `trust_passports` (via `TrustPassport.anonymizeProfile()`), and revokes sessions. Verification rows keep referencing the (now-anonymized) `identity_id`/`trust_passport_id` unchanged, and the evidence files remain in Storage exactly as uploaded, including the original `file_name` a user may have chosen (which can itself contain PII, e.g. `rg_joao_silva.jpg`).

## 3. Exact files / code paths

- `apps/api/src/modules/verification/infrastructure/persistence/verifications.schema.ts` — `verifications`, `verification_evidences` (has `file_name`, `storage_key`, `checksum` — no `deleted_at`, explicitly documented as immutable: *"Evidências (VRF-002). Imutáveis — exceção documentada: sem updated_at/soft delete."*), `verification_reviews`, `verification_decisions`.
- `apps/api/src/shared/storage/supabase-evidence-storage.service.ts` — the storage adapter; has no delete method at all today (`upload` only).
- `apps/api/src/shared/privacy/data-classification.ts` — this IP's own inventory marks these tables `SENSITIVE_KYC_EVIDENCE` / `deletionBehavior: 'NOT_TOUCHED_ESCALATED'`, pointing back to this document.

## 4. Why the two conflict

- On one hand, LGPD's deletion right (art. 18, VI) is not absolute: controllers may retain data necessary for compliance with a legal obligation, fraud prevention, or the exercise of rights in legal proceedings — identity-verification documents are a textbook example of data a marketplace may be required (or at least strongly justified) to retain for a defined period even after the account is deleted, to prevent the same document from being used to re-register under a new identity, and to support dispute/fraud investigations tied to past orders.
- On the other hand, the KYC document itself (a photo of a government ID) is some of the most sensitive PII a person can hand over, and the platform has no documented retention period, no legal basis on file, and no data-protection-officer sign-off for holding it after the person has asked to leave.
- Deciding this requires knowing: (a) whether Trust Platform's legal/compliance posture actually claims a fraud-prevention/legal-obligation basis for retaining KYC evidence, (b) for how long, and (c) whether "anonymize the evidence metadata but keep the file" vs. "delete the file entirely after N days" vs. "keep everything indefinitely" is the intended posture. None of this is stated anywhere in `04_APPROVED_PRODUCT_DECISIONS.md` or the IP-021 spec. Guessing a retention period or a deletion behavior here is exactly the kind of unsupported legal claim IP-021 §4 forbids ("no unsupported legal claims").

## 5. Options

### Option A — Retain KYC evidence indefinitely, anonymize nothing extra
Verification evidence stays exactly as-is forever, referenced by the now-anonymized identity. Simplest, and defensible as "the account owner's KYC history is bound to the account, not to the display name."

Impact: the sensitive document (and its possibly-PII-bearing `file_name`) survives the person's explicit deletion request indefinitely, with no stated legal basis and no scheduled purge. This is the weakest privacy posture of the three options and the one most likely to need correction once legal guidance exists.

### Option B — Anonymize evidence metadata (file_name only) immediately, delete the underlying Storage object after a fixed legal/product-approved retention window (e.g. 30/90/180 days), keep the `verifications`/`verification_decisions` fact rows (decision, reason code, timestamps) permanently as an audit trail
Balances "the fact that this identity was verified/rejected is retained for fraud-prevention history" against "the actual document doesn't outlive its legitimate purpose."

Impact: requires (1) a retention-window product/legal decision this agent cannot make, (2) a delete method on `EvidenceStorageService`/`SupabaseEvidenceStorageService` that does not exist today, (3) a scheduled job (pg-boss, following the existing outbox/job infrastructure) to sweep expired evidence — all real, buildable engineering work, but only once the retention window is decided.

### Option C — Delete evidence immediately on DATA_DELETION, keep only the decision fact rows
Strongest privacy posture; matches "the person asked to leave, so leave nothing sensitive behind."

Impact: may conflict with a fraud-prevention/legal-obligation basis the business has not yet ruled out — if Trust Platform later needs to demonstrate why a specific account was verified/rejected (e.g. a regulator inquiry, a fraud investigation spanning multiple accounts), the source document would already be gone. This is the option most likely to need to be *reversed* if legal guidance says otherwise, which is worse than staying paused.

## 6. Recommended smallest safe option

Option B, but only after the retention window is decided by product/legal — it is the only option that doesn't require guessing a number (30 vs 90 vs 180 days) or asserting a legal basis this agent cannot verify. Until then, the safest engineering default is **Option A's current behavior (do nothing) treated as a known, explicitly-flagged gap** — not a silent gap, but not a guessed fix either.

## 7. Decision required

Does Trust Platform retain identity-verification evidence (ID/proof-of-address scans) after an account's `DATA_DELETION` is processed, and if so, for how long and under what documented legal basis (fraud prevention / legal obligation / other)? This decision gates building the evidence-purge mechanism (Option B) in a future IP; it does not block anything else in this IP's scope, which is why implementation continued around it rather than stopping entirely.

## 8. Work that can continue independently

Everything else in IP-021 — data classification inventory, the `PrivacyRequest` export/deletion workflow, identity/trust-passport anonymization, session revocation, the deletion-eligibility guard against active financial/order obligations, and consent capture — does not depend on this decision and has been implemented and tested (see `IP-021-COMPLETION-REPORT.md`).
