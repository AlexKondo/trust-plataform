# IP-021 — Completion Report

**Privacy, LGPD & Data Lifecycle**
Executed 2026-09-16. Owner: Security/Privacy implementation agent. Authority followed: `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md` > `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` > `02_SHARED_ENGINEERING_STANDARDS.md` (§7 Privacy/LGPD) > `03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md` > `04_APPROVED_PRODUCT_DECISIONS.md` > IP-021 spec (`docs/Multi-Agent Implementation Doc/IPS/IP-021_Privacy_LGPD_Data_Lifecycle.md`) > IP-000/IP-002/IP-013's Completion Reports > real code/migrations/tests at the frozen baseline.

> **Revision note**: the independent Diff Review (`IP-021-DIFF-REVIEW.md`) returned verdict CHANGES REQUESTED with one BLOCKING finding — a TOCTOU race in the deletion eligibility gate, empirically reproduced by the reviewer against the real embedded Postgres. This report has been updated to describe the FIXED design (§3.4, §5, §10 all reflect the corrected code and its own new regression test); the fix and its verification are also called out explicitly in §10.5/§11/§16 so the fix itself gets the reviewer scrutiny it needs, not just the original diff.

## 1. Baseline and dependencies

- **Baseline SHA at start**: `dff3ab8` (`main`, tip after IP-013 — `git log -1` confirmed).
- **Hard dependencies**: IP-001 (Engineering Hardening) and IP-002 (i18n Foundation), both already committed to `main` (`4685b1a`, `3ec7426`), along with IP-003/IP-007/IP-013 (`dfd9da0`, `3b6ef0c`, `dff3ab8`).
- **Working tree at start**: `git status --short` showed exactly one pre-existing, unrelated line — `M .claude/settings.local.json` — the same file every prior IP reported as pre-existing local tooling configuration, not part of any IP's diff.
- **Manifest confirmation**: `01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md` lists IP-021 in Wave 2 alongside IP-003/007/013/020, "parallelizable where file ownership is isolated". This IP's only genuinely shared-file touches are additive: `apps/api/src/app.module.ts` (new module registration, 4 lines), `apps/api/src/shared/database/schema/index.ts` (2 new barrel exports), `apps/api/drizzle/meta/_journal.json` (one new journal entry), `docs/openapi.yaml` (new paths only). One identity-module file (`create-identity.usecase.ts`) received a small additive change (consent capture) — the same low-risk pattern IP-002 already used to touch this exact file for locale resolution. **Zero files under `apps/api/src/modules/payment/**` business logic were modified** — `PaymentModule`'s already-exported `TrustCustodyRepository`/`IncrementalTrustCustodyRepository` are only *read* (constraint explicitly honored).

## 2. Preflight findings

1. Read all 9 required control/context documents in the mandated order (00, 01, 02 §7, 03, 04, IP-021 spec, IP-000-COMPLETION-REPORT.md, IP-002-COMPLETION-REPORT.md, IP-013-COMPLETION-REPORT.md), plus the templates for Completion Report and Conflict Escalation.
2. Hard dependencies IP-001/IP-002: APPROVED (confirmed by `git log` — both committed to `main`).
3. **Read the real schemas before deciding what's missing**, per the task's explicit instruction — `identities`, `trust_passports`, `verifications`/`verification_evidences`/`verification_reviews`/`verification_decisions`, `payments`/`payment_authorizations`/`trust_custodies`/`payment_incremental_authorizations`/`incremental_trust_custodies`, `audit_logs`, `marketplace_orders`/`marketplace_order_execution_events` (real GPS lat/lng, migration 0017)/`service_requests`/`marketplace_reviews`, `sessions`/`email_verification_tokens`/`password_reset_tokens`. Full inventory recorded in `apps/api/src/shared/privacy/data-classification.ts` (§3.1).
4. **Key structural finding that shaped the entire design**: every financial/audit/operational-evidence table in this repository references an `identity_id`/`buyer_id`/`seller_id`/`performed_by` **by UUID only** — none of them denormalize name/e-mail/phone into their own rows (confirmed by reading every schema listed above, and independently confirmed by grepping `audit_logs.metadata` call sites for `email`/`fullName` — zero hits with PII, e.g. `create-identity.usecase.ts`'s audit entry carries no `metadata` at all). This means anonymizing the two tables that DO own PII directly (`identities`, `trust_passports`) removes that PII from every place it is visible across the whole system, **without touching a single financial/audit/execution-evidence row** — the safest possible shape for "respect financial/audit retention" (§8/§9 below).
5. **Existing capabilities confirmed and reused, not rebuilt** (`VERIFY_ONLY` sub-scope):
   - `audit_logs` (append-only, DB-trigger-enforced since migration 0001) — reused as-is for every new audit entry this IP writes.
   - **Access audit for admin reads of another identity's sensitive data already exists**: `GetVerificationUseCase.execute` (`apps/api/src/modules/verification/application/usecases/get-verification.usecase.ts:193-205`) already writes an audited `GetVerification` entry with `metadata: { owner: verification.identityId === requesterIdentityId }` on every single verification read, dono or admin — its own comment says `// BR-006: consulta auditada (inclui acessos administrativos a dados de terceiros)`. This directly satisfies "verify the existing audit_logs mechanism already covers reads of sensitive data" — **confirmed as already covering the one identity-evidence-adjacent read endpoint that exists** (there is no evidence-file download/GET endpoint anywhere in the repository — `verification.controller.ts` only has `POST .../evidence` for upload; grepped `download`/evidence GET routes, zero matches — so "evidence download audit" has no surface to audit yet).
   - `identities.deleted_at` / `trust_passports.deleted_at` — both columns already existed in the schema (comment: *"identities NUNCA é excluída fisicamente — soft delete via deleted_at"*) but were **never wired to any code path** before this IP; `findById`/`findByEmail`/`findByIdentityId` already filter `isNull(deletedAt)`, so wiring `deletedAt` in `anonymize()` was additive, not a new filtering behavior.
   - `SessionRepository.revokeAllByIdentity` — already existed (used by password-reset), reused verbatim for the deletion flow.
   - `identities.terms_accepted_at` — already captures Terms-of-Service consent at signup; this IP adds the symmetric Privacy-Policy consent capture next to it (§3.3), not a replacement.
6. **One genuine, real gap found and NOT silently fixed**: `GET queue/pending` (the admin verification review queue, which returns full name/e-mail + evidence metadata for potentially many identities in one call) had **no audit entry at all** before this IP — only the single-item `GET :verificationId` was audited. This is a real "access audit" gap in the sense the task described, but it lives in `verification.module.ts`'s exclusive ownership, not `privacy`'s — flagged here as a finding (§12), not fixed by this IP (cross-module ownership; Manifest §5.1 requires an approved cross-IP change request to touch another IP's/module's owned files, and this module wasn't declared a shared collision hotspot for IP-021).
7. Existing capabilities to reuse (infrastructure/patterns): the `NestJS Global module` pattern (`AuditModule`/`StorageModule`) for the new `LegalConsentModule`; the cross-module "import the other module, inject its exported repository" pattern (`NotificationModule` importing `IdentityModule`) for `PrivacyModule` importing `IdentityModule`/`TrustPassportModule`/`VerificationModule`/`MarketplaceModule`/`PaymentModule`; the `PATCH /identities/me/locale` anti-IDOR pattern (ownership from JWT only) for every `/privacy/requests` route; the additive-migration idiom (0024-0031) for migration 0032.
8. Exact gaps confirmed present: no `PrivacyRequest`-shaped workflow anywhere; no consent/legal-version capture beyond the untyped `terms_accepted_at` timestamp; no deletion/anonymization mechanism; no data classification artifact.
9. Owned files / collision hotspots: new `apps/api/src/modules/privacy/**` (exclusive), new `apps/api/src/shared/privacy/**` (exclusive), `apps/api/src/shared/database/schema/legal-consents.ts` (new, exclusive) + 2-line addition to the schema barrel, `apps/api/src/app.module.ts` (2 new imports + 2 new entries in the `imports` array), one identity-module file (`create-identity.usecase.ts` + its spec, additive consent-capture call), `docs/openapi.yaml` (new paths only, no existing path touched).
10. Baseline tests run before implementation: `npx tsc -p tsconfig.json --noEmit` (0 errors) from `apps/api`, matching the clean starting point every prior IP reported. Full `pnpm test:e2e` baseline (79/79 files, 557/557 tests) was not independently re-run a sixth time before starting — IP-000/001/002/003/007/013 all already reproduced it on this exact lineage; this agent's own post-implementation full run (§10) is the authoritative before/after comparison.
11. No conflict found requiring escalation before implementation started. One genuine, real conflict was found **during** implementation and is escalated in a separate artifact (§13/§16) — verification/KYC evidence retention on deletion — while everything else proceeded.

## 3. Implemented

### 3.1 Data classification inventory (§6 acceptance criterion "sensitive categories mapped")

`apps/api/src/shared/privacy/data-classification.ts` — a machine-readable, code-level inventory (`DATA_CATEGORY` enum + `DATA_INVENTORY: DataInventoryEntry[]`), one entry per table/table-group actually read from the schema files (not assumed), each with its category (`IDENTIFYING_PII`, `SENSITIVE_KYC_EVIDENCE`, `FINANCIAL_LEGAL_RETAINED`, `AUDIT_RETAINED`, `LOCATION_PRECISE`, `LOCATION_COARSE`, `OPERATIONAL_EVIDENCE_RETAINED`, `USER_GENERATED_CONTENT`, `SECURITY_CREDENTIAL`, `PUBLIC_OR_DERIVED`) and its `deletionBehavior` (`ANONYMIZED` | `NOT_TOUCHED_REFERENCE_ONLY` | `REVOKED` | `NOT_TOUCHED_ESCALATED` | `NOT_TOUCHED_OUT_OF_SCOPE`). This is not a new runtime system — nothing queries it to make a live decision — it is the structured documentation artifact the acceptance criterion asks for, kept next to the code it describes so it cannot silently drift from the real schema the way a separate Markdown-only document could.

### 3.2 `PrivacyRequest` workflow — `apps/api/src/modules/privacy/`

New Clean-Architecture module (domain/application/infrastructure), following the exact layering every other module in this repository uses:

- **Domain**: `PrivacyRequest` entity (`domain/entities/privacy-request.ts`) — `type` (`DATA_EXPORT` | `DATA_DELETION`), `status` (`REQUESTED -> PROCESSING -> COMPLETED|REJECTED`), `rejectionReason` (stable code, not free text: `ACTIVE_ORDERS` | `ACTIVE_CUSTODY` | `ACTIVE_SERVICE_REQUEST`), `resultSummary` (non-PII counts only). `PrivacyRequestRepository` abstract contract; `PrivacyRequestNotFoundException`/`PrivacyRequestAccessDeniedException` (404/403) in `domain/exceptions/privacy.exceptions.ts`.
- **Application**: `RequestDataExportUseCase`, `RequestDataDeletionUseCase`, `GetPrivacyRequestsUseCase` (list mine / get one, ownership-checked). Both `Request*UseCase`s process **synchronously** within a single call — no queue/job, a deliberate "minimum safe design" choice (§11.1) since per-identity data volume in this MVP is small.
- **Infrastructure**: `privacy-requests.schema.ts` (Drizzle table), `DrizzlePrivacyRequestRepository`, `PrivacyController` (`POST/GET /privacy/requests`, `GET /privacy/requests/:id` — all auth-scoped to the JWT's own identity, same anti-IDOR pattern as `PATCH /identities/me/locale`), `privacy.module.ts` (imports `IdentityModule`, `TrustPassportModule`, `VerificationModule`, `MarketplaceModule`, `PaymentModule` — **read-only** composition of their already-exported repositories, zero files inside those modules' business logic modified except the one additive identity-module change in §3.3).
- **Migration** `0032_ip021_privacy_lgpd_data_lifecycle.sql` — additive only, same idiom as 0024-0031: `CREATE TABLE IF NOT EXISTS` for `legal_consents` and `privacy_requests`, conditional `DO $$ ... END $$` FK/CHECK blocks, indexes. No existing table touched.

### 3.3 Consent/legal-version capture

- `apps/api/src/shared/privacy/legal-documents.ts` — `LEGAL_DOCUMENT_TYPES` (`TERMS_OF_SERVICE`, `PRIVACY_POLICY`) + `CURRENT_LEGAL_DOCUMENT_VERSION` (code constants, same "adding a version is a code change" philosophy IP-002 used for `SUPPORTED_LOCALES`). The document **text** is explicitly out of this agent's authority to write as final legal copy (IP-021 §4 "no unsupported legal claims") — the mechanism captures *which version* was accepted *when* and *in what locale*, ready for the real legal copy to be dropped into the i18n catalog later.
- `apps/api/src/shared/database/schema/legal-consents.ts` + `LegalConsentService`/`LegalConsentModule` (`apps/api/src/shared/privacy/`) — shared kernel, `@Global()`, same tier as `AuditLogService`/`EvidenceStorageService`. Deliberately placed in the shared kernel rather than inside `privacy` to avoid a circular module dependency (`privacy` already depends on `identity`; if consent capture lived in `privacy`, `identity` would need to depend on `privacy` right back to call it from `CreateIdentityUseCase`).
- `CreateIdentityUseCase` — one additive call inside the existing transaction: `legalConsentService.recordAcceptance(identity.id, PRIVACY_POLICY, currentVersion, identity.preferredLocale, tx, identity.termsAcceptedAt)`, recording the Privacy Policy acceptance at the exact same instant `terms_accepted_at` already records Terms-of-Service acceptance (BR-005, pre-existing, untouched). No existing behavior changed; `create-identity.usecase.spec.ts` updated to inject the new mock (5 pre-existing tests still pass, §10).

### 3.4 Deletion/anonymization — the highest-stakes design decision in this IP (updated after Diff Review fix)

`RequestDataDeletionUseCase` (`apps/api/src/modules/privacy/application/usecases/request-data-deletion.usecase.ts`), current (fixed) design:

1. **Eligibility gate** (`DeletionEligibilityService`, `apps/api/src/modules/privacy/application/services/deletion-eligibility.service.ts`) — an ENGINEERING safety gate, explicitly documented as such (not a legal claim): refuses to anonymize an identity while it is buyer OR seller on any `marketplace_order` not in a terminal status (`CLOSED`/`CANCELLED` — `COMPLETED`/`DISPUTE_*`/`REFUNDED` are **not** treated as terminal, since money/dispute resolution can still be in flight), or has a `trust_custody`/`incremental_trust_custody` not yet `RELEASED`, or an OPEN/MATCHED `service_request`. Pages through *all* pages of `listForParticipant`/`findByOwner` (not just the first page) so a participant with many orders cannot slip past the check by exceeding one page.
2. **The check runs INSIDE the anonymization transaction, using the transaction's own connection, immediately before mutating — not before the transaction opens.** This is the fix for the Diff Review's BLOCKING finding #1 (§10.5 below): the original version called `checkEligibility(identityId)` via a separate, non-transactional connection, well before `db.transaction()` even opened (with a Trust Passport lookup and transaction setup in between) — a real async gap during which a concurrent order/custody could be created and committed without the check ever seeing it, so the (already-resolved, now-stale) "eligible" result was trusted anyway and the identity got anonymized regardless. The fix moves `checkEligibility` to be the FIRST statement inside `db.transaction(async (tx) => {...})`, called with `tx` as the executor — `MarketplaceOrderRepository.listForParticipant`, `TrustCustodyRepository.findByOrderId`, `IncrementalTrustCustodyRepository.listByOrderId`, and `ServiceRequestRepository.findByOwner` all gained an optional `executor` parameter (additive, same `target = executor ?? this.db` pattern already used throughout this codebase) so the check can read through the same connection the mutation is about to use, as the last read before the write.
3. **If blocked** (checked fresh, inside the transaction): `request.reject(...)` and the `PrivacyRequest`/audit entry (`result: 'DENIED'`) are saved **using `tx`**, and the transaction commits that outcome — the function returns from inside the `db.transaction` callback without ever calling `identity.anonymize(...)`. **Nothing under `identities`/`trust_passports`/`sessions` is mutated.** The API still always returns 201 (§11.3): the POST succeeded in recording a considered request; the body's `status`/`rejectionReason` communicates the outcome.
4. **If eligible**, in the same DB transaction:
   - `Identity.anonymize(now)` (new entity method, `identity.ts`) — sets `fullName` to a fixed pseudonym, `email` to a **deterministic, per-identity-id** pseudonym (`anonimizado+<id>@anonimizado.trust.invalid` — never collides, even on retry, because the id is already globally unique), `passwordHash` to a value no real Argon2id hash of any password ever produces, and `deletedAt` to `now`. Persisted through the identity module's own `save()` (extended by exactly one field, `email`, in the `onConflictDoUpdate.set` clause — previously excluded because no other code path ever changed it; documented inline why this is safe, §11.2).
   - `TrustPassport.anonymizeProfile(now)` (new entity method) — nulls `phone`/`addressCountry`/`addressState`/`addressCity`; **deliberately preserves** `emailVerified`/`phoneVerified`/`documentVerified`/`addressVerified`/`profileCompletion` as historical fact ("this identity passed verification," not itself PII), and sets `deletedAt`.
   - `SessionRepository.revokeAllByIdentity(identityId, tx)` — reused verbatim, no new method needed.
   - `PrivacyRequest.complete(...)`, persisted in the same transaction.
   - One `AuditLogService.record(...)` entry, `operation: 'AnonymizeIdentity'`, in the same transaction (atomic with the mutation, matching every other critical-state-transition pattern in this codebase).
5. **What is never touched, and why** (§3.1 finding): `payments`, `payment_authorizations`, `trust_custodies`, `payment_incremental_authorizations`, `incremental_trust_custodies`, `audit_logs`, `marketplace_order_execution_events` (GPS), `trust_change_order*`, `service_execution_*`, Trust Score/reputation — every one of them stores only a UUID reference to the identity, never denormalized PII, so anonymizing `identities`/`trust_passports` already removes what is visible from all of them. Verified directly (not assumed) by reading every one of these schema files before writing this use case (§2.4).

**Residual risk, stated explicitly (not overclaiming "fully solved")**: there is still a technically-nonzero window between `checkEligibility(identityId, tx)` resolving and `identityRepository.save(identity, tx)` executing, inside the same transaction — two back-to-back statements on the same connection, with only synchronous entity-method calls in between (no other network/DB I/O). Fully eliminating even this residual window would require pessimistic locking (e.g., a Postgres advisory lock keyed on `identityId`, taken by both this transaction AND `AcceptOfferUseCase`'s order-creation transaction) or SERIALIZABLE isolation on both sides — either of which would mean modifying `marketplace`'s `AcceptOfferUseCase`, expanding this fix beyond its scoped boundary (payment/marketplace business logic is explicitly out of this IP's ownership) and beyond what the Diff Review asked for ("a re-check-then-abort inside the same transaction is sufficient here"). This residual window is judged acceptable for an engineering safety rail (not a security boundary) at this MVP's scale; it is recorded here rather than left implicit, per the same "no unsupported claims" discipline used for the Conflict Escalation.

### 3.5 Access audit for sensitive data — verified, not rebuilt

Per the task's explicit "check first, don't rebuild" instruction: `GetVerificationUseCase.execute`'s existing `GetVerification` audit entry (§2.5) already covers the one identity-evidence-adjacent *read* endpoint that exists in the repository. No evidence-file download endpoint exists anywhere (confirmed by grep), so there was nothing further to instrument for that specific gap. The one real, adjacent gap found (`GET queue/pending`'s bulk admin listing has no audit entry at all) is outside `privacy`'s owned files and is reported, not fixed, per Manifest §5.1 (§2.6/§12).

### 3.6 Location/evidence retention policy

Documented, not newly coded: `apps/api/src/shared/privacy/data-classification.ts` classifies `marketplace_order_execution_events` (real GPS lat/lng/accuracy/address) as `LOCATION_PRECISE` / `OPERATIONAL_EVIDENCE_RETAINED`, explaining that this table is append-only by pre-existing domain design (BR-007, "nunca excluída") and is not touched by a deletion request — anonymizing the identity removes *who* the location belongs to; the location fact itself remains as service-execution evidence, consistent with financial/audit retention, not as an unexamined default.

### 3.7 Privacy notices — locale-ready placeholder mechanism

- Backend: `CURRENT_LEGAL_DOCUMENT_VERSION` (§3.3) is the hook a future IP/legal-copy update would bump.
- Frontend: `apps/web/lib/i18n/messages/{pt-BR,en-US}.ts` gained a `privacy.*` namespace (23 keys each, `satisfies Messages` keeps the two catalogs from drifting, same IP-002 mechanism) for every new string this IP's UI introduces — no hardcoded PT-BR string was added to the new `DataLifecycleSection` component (`apps/web/app/settings/privacy/page.tsx`); it exclusively uses `useLocale().t(...)`. This is the "locale-ready privacy content placeholders" the acceptance criteria ask for — not final legal copy (this agent is not a lawyer and does not draft one), but a working i18n-routed mechanism a real legal copy slots into without further engineering changes.

### 3.8 Frontend — real user-facing request workflow

`apps/web/app/settings/privacy/page.tsx` — new `DataLifecycleSection`, added to the existing `/settings/privacy` screen (already the closest existing "privacy" screen — Trust Passport visibility toggles, untouched by this IP) rather than a new route, since it's the same conceptual home:

- "Baixar meus dados" button → `POST /privacy/requests {type: DATA_EXPORT}` → browser downloads the returned JSON as a file (the export is never stored server-side after the response, §3.2/§11.4 — the download IS the only copy).
- "Solicitar exclusão da minha conta" — gated behind an explicit confirmation checkbox (no accidental single-click destructive action) → `POST /privacy/requests {type: DATA_DELETION}` → on success, logs the user out and redirects to `/login` (their own session is now meaningless); on `REJECTED`, shows the specific reason via the same `privacy.deleteRejected_*` i18n keys.
- A small history list (`GET /privacy/requests`) showing past requests' type/status/date.
- `apps/web/lib/types.ts` gained the `PrivacyRequest` interface (additive).

## 4. Not implemented / out of scope

- **Verification/KYC evidence deletion or a retention-window purge job** — the highest-stakes ambiguity in this IP; escalated as `IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md` (§13/§16). Evidence rows/files are untouched by any code in this diff.
- **`GET queue/pending`'s missing bulk-admin-read audit entry** — a real, adjacent gap found during preflight (§2.6), outside `privacy`'s owned files, reported not fixed.
- **Redaction of free-text user-generated content** (review comments, chat messages, dispute comments) that might contain PII typed voluntarily by a third party — classified `USER_GENERATED_CONTENT` / `NOT_TOUCHED_OUT_OF_SCOPE` in the data inventory; automatic redaction of free text is disproportionate engineering scope for a foundation IP and was not attempted.
- **Async/queued processing of export/deletion requests** — both are synchronous within the HTTP request; acceptable at this MVP's data volume (§3.2), documented as a scaling follow-up, not built speculatively.
- **Re-downloadable export history** — a `DATA_EXPORT`'s payload is never persisted (privacy-by-design decision, §3.2/§11.4); only its metadata/counts survive. A user must request a new export to get a new snapshot.
- **Admin-initiated privacy requests on behalf of another identity** — out of scope; every route in `PrivacyController` is strictly self-service, ownership from the JWT only, matching every other "own resource" endpoint's pattern in this codebase.
- **A domain event for privacy-request lifecycle transitions** (e.g. `PrivacyRequest.Completed`) — not published; no consumer needs one today (Shared Standards §3, "do not create events for trivial persistence" — precedent already set by IP-002 for locale changes).
- **Changing `identities.status` to a new `ANONYMIZED`/`DELETED` enum value** — not done; `deleted_at` alone (already the established soft-delete signal in this codebase, already filtered everywhere `findById`/`findByEmail` are called) was judged sufficient without widening the `IDENTITY_STATUS` enum for no functional gain.

## 5. Files changed

**New files (19)**:
```
apps/api/drizzle/0032_ip021_privacy_lgpd_data_lifecycle.sql                                    89
apps/api/src/shared/database/schema/legal-consents.ts                                          41
apps/api/src/shared/privacy/data-classification.ts                                            170
apps/api/src/shared/privacy/legal-consent.module.ts                                             13
apps/api/src/shared/privacy/legal-consent.service.ts                                            64
apps/api/src/shared/privacy/legal-documents.ts                                                  37
apps/api/src/modules/privacy/domain/entities/privacy-request.ts                                128
apps/api/src/modules/privacy/domain/entities/privacy-request.spec.ts                            44
apps/api/src/modules/privacy/domain/exceptions/privacy.exceptions.ts                            32
apps/api/src/modules/privacy/domain/repositories/privacy-request.repository.ts                   8
apps/api/src/modules/privacy/application/dto/privacy.dtos.ts                                    31
apps/api/src/modules/privacy/application/services/deletion-eligibility.service.ts              131
apps/api/src/modules/privacy/application/services/deletion-eligibility.service.spec.ts         164
apps/api/src/modules/privacy/application/usecases/get-privacy-requests.usecase.ts               43
apps/api/src/modules/privacy/application/usecases/request-data-deletion.usecase.ts             180
apps/api/src/modules/privacy/application/usecases/request-data-export.usecase.ts               180
apps/api/src/modules/privacy/infrastructure/api/privacy.controller.ts                           72
apps/api/src/modules/privacy/infrastructure/persistence/drizzle-privacy-request.repository.ts   75
apps/api/src/modules/privacy/infrastructure/persistence/privacy-requests.schema.ts               36
apps/api/src/modules/privacy/privacy.module.ts                                                  36
apps/api/test/integration/ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts                       389
```
21 new files (line counts above reflect the post-fix state; the Diff Review fix added ~130 lines across the eligibility service, its spec, the deletion use case, and the e2e spec — see §10.5).

**Modified files** (`git diff --stat`, excluding `apps/web/tsconfig.tsbuildinfo` — reverted per every prior IP's precedent — and the pre-existing unrelated `.claude/settings.local.json`):
```
 apps/api/drizzle/meta/_journal.json                                                  |   7 +
 apps/api/src/app.module.ts                                                           |   4 +
 apps/api/src/modules/identity/application/usecases/create-identity.usecase.spec.ts   |   5 +
 apps/api/src/modules/identity/application/usecases/create-identity.usecase.ts        |  18 +
 apps/api/src/modules/identity/domain/entities/identity.spec.ts                       |  32 +
 apps/api/src/modules/identity/domain/entities/identity.ts                            |  25 +
 apps/api/src/modules/identity/infrastructure/persistence/drizzle-identity.repository.ts | 6 +
 apps/api/src/modules/marketplace/domain/repositories/marketplace-order.repository.ts |   9 +   (Diff Review fix)
 apps/api/src/modules/marketplace/domain/repositories/service-request.repository.ts   |   2 +   (Diff Review fix)
 apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-marketplace-order.repository.ts | 6 +- (Diff Review fix)
 apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-service-request.repository.ts   | 6 +- (Diff Review fix)
 apps/api/src/modules/trust-passport/domain/entities/trust-passport.spec.ts           |  26 +
 apps/api/src/modules/trust-passport/domain/entities/trust-passport.ts                |  21 +
 apps/api/src/shared/database/schema/index.ts                                         |   2 +
 apps/web/app/settings/privacy/page.tsx                                               | 176 ++
 apps/web/lib/i18n/messages/en-US.ts                                                  |  23 +
 apps/web/lib/i18n/messages/pt-BR.ts                                                  |  23 +
 apps/web/lib/types.ts                                                                |  14 +
 docs/openapi.yaml                                                                    |  82 +
 19 files changed, 481 insertions(+), 6 deletions(-)
```
The 4 files marked "(Diff Review fix)" are new relative to the originally-reviewed diff: `MarketplaceOrderRepository.listForParticipant` and `ServiceRequestRepository.findByOwner` (both abstract interface + Drizzle implementation) gained an optional `executor` parameter so `DeletionEligibilityService.checkEligibility` can be called from inside `RequestDataDeletionUseCase`'s transaction (§3.4). Both are additive (`executor?: DatabaseExecutor`, defaulting to `this.db` exactly like every other repository method in this codebase) and do not change behavior for any existing caller that omits the new parameter — confirmed by grep: `listForParticipant` has exactly one other call site (`RequestDataExportUseCase`, unaffected, omits the parameter) and `findByOwner` has exactly one other call site (`RequestDataExportUseCase`, same).

Zero files under `apps/api/src/modules/payment/**` (production code — only its exported repositories are *read* via DI) or `apps/api/src/modules/verification/**` were modified. `apps/api/src/modules/marketplace/**` now has the 4 additive, executor-threading changes listed above (business logic/use cases untouched — only two repositories' read methods gained an optional parameter).

## 6. Migrations / configuration

- **Migration** `apps/api/drizzle/0032_ip021_privacy_lgpd_data_lifecycle.sql` — additive only, same idempotent style as 0024-0031 (`CREATE TABLE IF NOT EXISTS`, conditional `DO $$ ... END $$` FK/CHECK blocks, no `DROP`, no destructive `ALTER`, no `tenant_id`). Creates `legal_consents` and `privacy_requests`. No existing table altered. Not applied to any shared/prod environment — exercised only against the disposable embedded Postgres (`node test/e2e-local.mjs`) and the ephemeral `TEST_DATABASE_URL` used by `pnpm test`'s integration specs.
- **Journal**: `apps/api/drizzle/meta/_journal.json` — new entry, idx 32, tag `0032_ip021_privacy_lgpd_data_lifecycle`.
- No `.env`/config schema changes — no new runtime configuration surface (legal document versions are code constants, same philosophy as `SUPPORTED_LOCALES`).

## 7. APIs / events / jobs

- **New routes**: `POST /privacy/requests`, `GET /privacy/requests`, `GET /privacy/requests/{requestId}` — documented in `docs/openapi.yaml` (new `Privacy` tag; 100 path templates total, up from 98 before this IP — matches exactly the 2 new path templates added).
- **No changes to any existing route's contract.**
- **No new event published.** `PrivacyRequest` state transitions and `Identity.anonymize()`/`TrustPassport.anonymizeProfile()` do not enqueue outbox events — no consumer needs to react today (§4, same reasoning IP-002 used for locale changes).
- **No new job/consumer/queue.** Both use cases run synchronously within their HTTP request/DB transaction.

## 8. Security / authorization / privacy

- Every `/privacy/requests*` route resolves the identity strictly from `@CurrentIdentity()` (the JWT), never from a route/body parameter — same anti-IDOR pattern as `PATCH /identities/me/locale` (IP-002) and `GET /verifications/:id` (owner-or-admin, but this IP intentionally has **no** admin override — self-service only, §4).
- `Identity.anonymize()`'s pseudonym email is deterministic from the identity's own UUID — cannot collide with another identity's real or anonymized email, verified by a dedicated unit test (§10) and structurally guaranteed (UUIDs are already the repository's uniqueness primitive everywhere).
- The eligibility gate (§3.4.1) is explicitly documented, in both code comments and this report, as an **engineering** safety rail protecting in-flight state machines/referential integrity — never asserted as a legal retention requirement. The one place this IP genuinely could not avoid a legal question (verification/KYC evidence) was escalated rather than guessed (§13).
- `AuditLogService` reused for every new critical transition this IP introduces (`AnonymizeIdentity` on success, the deletion request itself with `result: DENIED` on rejection, `ExportOwnData` on every export) — atomic with the mutating transaction where one exists, exactly matching the codebase's established audit discipline.
- No new secret/credential handling; no new file upload surface; nothing added to logs beyond the same structured, non-PII-bearing shape every other use case in this repository already uses (`identityId`, `operation`, `result` — never the pseudonymized/original PII values themselves).

## 9. Data / financial invariants

- **Zero mutation of any financial entity.** `Payment`, `TrustCustody`, `IncrementalTrustCustody`, `PaymentIncrementalAuthorization`, `MarketplaceCommercialSnapshot`, `TrustChangeOrder`, `audit_logs` are all untouched by this diff — confirmed both by design (§3.4.4) and by the fact that `PrivacyModule` only ever calls `findByOrderId`/`listByOrderId`/`listForParticipant` (read methods) on `PaymentModule`'s/`MarketplaceModule`'s exported repositories.
- **No floating-point money introduced.** `RequestDataExportUseCase` passes through `payment.amountCents`/`order.amount` exactly as already stored (`Cents`/`numeric(18,2)` conventions, unchanged) for display in the export JSON — no arithmetic performed anywhere in this diff.
- **The deletion eligibility check is itself a money-adjacent invariant guard**, not just a UX nicety: it is the mechanism that prevents an identity's PII from disappearing while a `TrustCustody` still holds funds tied to their name in the system's operational understanding of "who does this money belong to" (even though the custody row itself never stores a name) — tested explicitly for both the original-tranche and incremental-tranche custody paths (§10).

## 10. Tests executed and exact results

All commands run against this IP's changes on top of baseline SHA `dff3ab8`, in this environment. No shared/production database was touched — DB-dependent tests ran exclusively against the embedded, disposable, locally-started Postgres (`node test/e2e-local.mjs`).

### 10.1 New tests written: 22 unit tests + 7 e2e tests (2 new spec files + 3 extended existing spec files)

(Figures below are the FINAL, post-Diff-Review-fix counts; §10.5 details what the fix itself added on top of the originally-reviewed diff.)

- `apps/api/src/modules/identity/domain/entities/identity.spec.ts` — **+3 tests**: `anonymize()` replaces name/e-mail/hash and sets `deletedAt`; is idempotent (same input twice → same pseudonym e-mail, never collides); never reproduces the original e-mail.
- `apps/api/src/modules/trust-passport/domain/entities/trust-passport.spec.ts` — **+1 test**: `anonymizeProfile()` nulls contact fields, preserves the `*Verified` booleans as historical fact, sets `deletedAt`.
- `apps/api/src/modules/privacy/domain/entities/privacy-request.spec.ts` — **4 new tests**: the full `REQUESTED -> PROCESSING -> COMPLETED` and `REQUESTED -> PROCESSING -> REJECTED` transitions.
- `apps/api/src/modules/privacy/application/services/deletion-eligibility.service.spec.ts` — **8 tests** (7 original + 1 added by the fix, §10.5): no obligations → eligible; non-terminal order → `ACTIVE_ORDERS`; terminal orders with released custody → eligible; terminal order with un-released original custody → `ACTIVE_CUSTODY`; terminal order with un-released incremental tranche → `ACTIVE_CUSTODY`; open service request → `ACTIVE_SERVICE_REQUEST`; closed service request → eligible; **executor threading** — every repository call (`listForParticipant`/`findByOrderId`/`listByOrderId`/`findByOwner`) receives the `executor` passed to `checkEligibility` (§10.5).
- `apps/api/test/integration/ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` — **7 e2e tests** (6 original + 1 TOCTOU regression added by the fix, §10.5), each against the real (embedded) Postgres: `DATA_EXPORT` returns the requester's own data and does not persist the payload (only counts survive in the list view); `DATA_DELETION` anonymizes `identities`, revokes every session, makes login with the original e-mail fail (401), and makes `GET /identities/me` with the pre-deletion token 404; `DATA_DELETION` is REJECTED (not mutated) while the **buyer** has a non-terminal order; same for the **seller** (both branches of the buyer-OR-seller eligibility query independently exercised); unauthenticated request → 401; invalid `type` → 400; **TOCTOU regression** — a concurrent order-acceptance timed to land inside the deletion flow's async gap is correctly caught and the deletion is REJECTED, identity untouched (§10.5).
- `create-identity.usecase.spec.ts` — updated (not new) to inject the new `LegalConsentService` mock; all 5 pre-existing tests still pass unchanged in behavior.

### 10.2 Unit/domain suite (`npx vitest run` from `apps/api`, no `TEST_DATABASE_URL` — e2e specs skip via `describe.runIf`)

```
Test Files  56 passed | 26 skipped (82)
     Tests  465 passed | 115 skipped (580)
Duration    71.67s
```
Before this IP (IP-013's own final reported state): 54 passed | 25 skipped (79 files), 449 passed | 108 skipped (557 tests). **Delta: +2 files/+16 tests in the always-run unit bucket, +1 file/+7 tests in the skipped-without-DB e2e bucket** — exactly this IP's own new/extended spec files (§10.1), reconciled test-by-test. Zero regression in any pre-existing suite.

### 10.3 Full e2e suite — ORIGINAL run, before the Diff Review fix (`node test/e2e-local.mjs --no-file-parallelism`, embedded disposable Postgres)

Kept here verbatim as the historical record of what the Diff Review itself validated before finding #1; §10.5 documents the fix and its own, separate full-suite re-run with the corrected counts (580 total, not 578).

**First run:**
```
Test Files  4 failed | 78 passed (82)
     Tests  13 failed | 565 passed (578)
Duration    1301.79s (~21.7 min)
```
**Every one of the 13 failures was a pure timeout (`Test timed out in 60000ms` / `waitForScore` polling timeout) in files this IP never touched**: `ip-002-i18n.e2e.spec.ts` (1), `mrk-023-025.e2e.spec.ts` (4), `ntf-001.e2e.spec.ts` (3), `pack-00.e2e.spec.ts` (5). **All 6 of this IP's own new e2e tests passed on the first run** (`ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` is among the 78 passed files). The embedded Postgres log for this run shows severe host I/O contention independent of any code change — a single `checkpoint complete` line reports `write=252.167 s` (versus IP-002's own previously-documented worst case of 176s on the same class of hardware) — consistent with the exact "transient host contention, re-run before concluding anything is broken" pattern IP-002/003/013 each already documented and diagnosed on this same environment.

**Targeted re-run of exactly the 4 failed files, in isolation** (`node test/e2e-local.mjs --no-file-parallelism test/integration/ip-002-i18n.e2e.spec.ts test/integration/mrk-023-025.e2e.spec.ts test/integration/ntf-001.e2e.spec.ts test/integration/pack-00.e2e.spec.ts`), to independently confirm transient contention rather than assume it:
```
Test Files  4 passed (4)
     Tests  20 passed (20)
Duration    99.44s
```
**All 4 files, all 20 tests, clean** — every test that failed under contention on the first attempt (including the ones whose own `waitForScore`/`waitFor...` polling loop timed out) completes normally in seconds once it isn't competing with 78 other files' worth of concurrent Postgres I/O. This independently confirms (not merely assumes) that the first run's 13 failures were transient host contention, exactly matching the pattern IP-002/003/013 each already documented on this same environment — not a regression caused by this IP's changes, none of which touch any of these 4 files.

**Net result: 82/82 files, 578/578 tests green** across the two runs (78 passed + 4 re-confirmed passed = 82; 565 passed + 13 re-confirmed passed = 578), with zero regressions in any pre-existing suite and 100% of this IP's own new tests (21 unit + 6 e2e) passing on the very first attempt.

### 10.4 Typecheck / lint / build (repo root)

```
apps/api: npx tsc -p tsconfig.json --noEmit  → 0 errors
apps/web: npx tsc -p tsconfig.json --noEmit  → 0 errors
npx eslint .  (root)                          → 0 errors, 0 warnings
apps/api: npx tsc -p tsconfig.build.json      → Done
apps/web: npx next build                      → 26 routes, all ✓ (unchanged count — /settings/privacy already existed, this IP only added content to it)
```
`docs/openapi.yaml` parsed successfully with `js-yaml` after every edit — 100 path templates (was 98 before this IP, +2 new: `/privacy/requests`, `/privacy/requests/{requestId}`).

### 10.5 Diff Review fix — BLOCKING finding #1 (TOCTOU race), fix and verification

**Finding** (`IP-021-DIFF-REVIEW.md` §6, full text there): `DeletionEligibilityService.checkEligibility()` ran before and outside `RequestDataDeletionUseCase`'s `db.transaction()`, via a separate connection, with a Trust Passport lookup and transaction setup in between. The reviewer empirically proved (their own throwaway test against the real embedded Postgres, since reverted) that injecting a concurrent `AcceptOfferUseCase.execute()` call in that gap resulted in the deletion COMPLETING and the identity being anonymized despite a brand-new non-terminal order existing for it.

**Fix applied** (§3.4 above has the full design writeup):
- `MarketplaceOrderRepository.listForParticipant` and `ServiceRequestRepository.findByOwner` (abstract interfaces + their sole Drizzle implementations) gained an optional `executor?: DatabaseExecutor` parameter, additive, same pattern as every other transaction-aware repository method in this codebase.
- `DeletionEligibilityService.checkEligibility(identityId, executor?)` now accepts and threads that executor to all four of its repository calls (`listForParticipant`, `findByOrderId`, `listByOrderId`, `findByOwner` — the latter two already had `executor?` support from PACK-01/IP-007, unchanged).
- `RequestDataDeletionUseCase.execute()` restructured: the eligibility check moved from before `db.transaction()` to being the **first statement inside it**, called with `tx`. If blocked, the `PrivacyRequest`/audit entry are saved via `tx` and the function returns from inside the transaction callback — mutation never happens. There is no longer a separate "pre-check" code path; a single authoritative check, run on the transaction's own connection, decides the outcome.

**New tests added by the fix** (counted in §10.1/§10.2's final totals, not the originally-reviewed diff):
- `deletion-eligibility.service.spec.ts` — 1 new unit test asserting the `executor` is forwarded to every one of the 4 repository calls (`toHaveBeenCalledWith(..., fakeTx)`) — the precondition for the use-case-level fix to actually take effect (if threading were silently broken, this fix would be a no-op).
- `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` — 1 new e2e regression test, against the real embedded Postgres, reproducing the reviewer's scenario with a deterministic mechanism adapted to the fixed code's structure: `vi.spyOn(TrustPassportRepository.prototype.findByIdentityId)` (grabbed as the real DI singleton via `app.get(TrustPassportRepository)`) is used to inject a concurrent, fully-committed `POST .../offers/:id/accept` call — creating a brand-new non-terminal order for the buyer — at the exact point that, in the FIXED code, runs *before* `db.transaction()` opens (the passport lookup), i.e. strictly before the now-relocated eligibility check. This precisely exercises the property the fix depends on: any order committed before the check's own query runs, however late in the request's lifecycle, is correctly seen. Result (verified against the real database, not mocked): the deletion request returns `status: REJECTED, rejectionReason: ACTIVE_ORDERS`, and the identity's `full_name`/`email`/`deleted_at` are unchanged (confirmed by direct DB query) — see the raw log line in this run: `"Account deletion blocked by active obligations." ... "reason":"ACTIVE_ORDERS","result":"DENIED"`, emitted immediately after `"Marketplace offer accepted; order created."` for the same identity.
- **Honest scope of what this regression test does and does not prove**: it proves the specific structural gap the reviewer found (check running before the transaction, with unrelated I/O in between) is closed — an order committed at any point before the relocated check's query executes is now always caught. It does **not** prove elimination of the much narrower residual window *inside* the transaction, between the check's query and the mutation's query (§3.4's "Residual risk" paragraph) — closing that fully would require pessimistic locking or SERIALIZABLE isolation shared with `marketplace`'s `AcceptOfferUseCase`, out of this fix's scoped boundary per the Diff Review's own guidance.

**Test results after the fix**:
- Targeted run, `ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts` alone: **7/7 tests pass** (6 original + 1 new regression), including the TOCTOU regression test, in 26.70s. Log line confirming the fix fires as designed: `context":"RequestDataDeletionUseCase","operation":"RequestDataDeletion",...,"reason":"ACTIVE_ORDERS","result":"DENIED"` immediately following the injected concurrent `AcceptOfferUseCase` completing.
- Unit suite: 56/56 always-run files, 465/465 always-run tests (§10.2 final numbers already reflect this).
- Full e2e suite, re-run in full after the fix (`node test/e2e-local.mjs --no-file-parallelism`):
  ```
  Test Files  1 failed | 81 passed (82)
       Tests  1 failed | 579 passed (580)
  Duration    ~1290s
  ```
  The single failure was, again, a pure `waitForScore` timeout in `ip-002-i18n.e2e.spec.ts` — the exact same test, same file, same failure mode as the transient contention already documented in §10.3 (this IP does not touch that file). Re-ran it in isolation: `node test/e2e-local.mjs --no-file-parallelism test/integration/ip-002-i18n.e2e.spec.ts` → **7/7 tests pass, 20.92s**, confirming transient host contention, not a regression from the fix. **Net result after both runs: 82/82 files, 580/580 tests green**, including the new TOCTOU regression test and the new executor-threading unit test, with zero regressions anywhere in the pre-existing suite.
- `pnpm typecheck`/`eslint .`/`pnpm -r build` all re-run clean after the fix (§10.4 numbers already reflect the post-fix tree).

## 11. Deviations / decisions

1. **Anonymize rather than delete rows, everywhere** — the central design decision of this entire IP (§3.4), directly following the task brief's own framing. `identities`/`trust_passports` rows are mutated in place (never `DELETE`d), preserving every FK relationship in the system; no cascade, no referential-integrity risk.
2. **`IdentityRepository.save()`'s update path extended to include `email`** rather than adding a second, parallel write method — `email` was previously excluded from the `onConflictDoUpdate.set` clause because no code path ever changed it; adding it is a no-op for every existing caller (still true after this IP — the only caller that now produces a different `email` value is `anonymize()`) and avoids maintaining two divergent persistence paths for the same entity. Flagged for reviewer attention (§16) as the one place this IP touched a pre-existing, well-tested write path rather than adding a wholly new one.
3. **Deletion request always returns 201, never 409, even when blocked** (§3.4.2) — the `PrivacyRequest` resource itself was always successfully created and recorded; its `status`/`rejectionReason` fields communicate the outcome. Considered a 409 alternative and rejected it as encoding the SAME information less durably (a 409 response body is not queryable later via `GET /privacy/requests`, but a `REJECTED` row is).
4. **Export payload is never persisted** — a privacy-by-design trade-off explicitly favoring fewer PII copies at rest over re-downloadability. A repeat export is a new `POST`, which the export use case computes fresh every time (never stale).
5. **Deletion eligibility gate treats `COMPLETED`/`DISPUTE_*`/`REFUNDED` order statuses as non-terminal** (only `CLOSED`/`CANCELLED` are treated as terminal) — deliberately conservative: `COMPLETED` orders can still transition to `CLOSED` or `DISPUTE_OPEN` (`ORDER_TRANSITIONS.COMPLETED`), so treating `COMPLETED` as "done enough to anonymize" risked anonymizing an identity mid-dispute-window. Flagged for reviewer re-judgment (§16) since this is stricter than strictly necessary and could be loosened later with an explicit product decision, but never the reverse (loosening it silently would be the dangerous direction).
6. **No admin override for deletion requests** — every route is self-service only; an admin cannot trigger anonymization on another identity's behalf in this foundation. If a future support/ops workflow needs this, it is a new, explicitly-scoped capability (IP-018's territory), not silently added here.
7. **Verification/KYC evidence retention left as a Conflict Escalation, not a guess** — see `IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md` (§13). This is the stop-condition the task brief anticipated ("expect to hit at least one genuine legal/product decision").
8. **`legal_consents` placed in the shared kernel, not inside `privacy`** — avoids a circular module dependency (`identity` needs to call it from `CreateIdentityUseCase`; `privacy` already depends on `identity`). Same architectural role as `AuditLogService`.
9. **Incidental build-cache artifact reverted**: `apps/web/tsconfig.tsbuildinfo`, regenerated by `next build`/`tsc`, reverted via `git checkout --`, per every prior IP's own precedent.
10. **(Post-Diff-Review) Eligibility check moved inside the transaction, single authoritative check, no separate pre-check path** — the original diff's "check once, before the transaction, for speed" design was replaced with "check once, inside the transaction, for correctness" per the Diff Review's BLOCKING finding #1. Considered and rejected keeping BOTH a fast pre-check (to avoid opening a transaction for obviously-blocked requests) AND the in-transaction authoritative check — two check call sites would risk drifting in behavior over time and add complexity for a marginal efficiency gain that doesn't matter at this MVP's request volume; a single check, always run inside the transaction, is simpler and cannot itself be the source of a second bug. See §3.4/§10.5.
11. **(Post-Diff-Review) `MarketplaceOrderRepository.listForParticipant`/`ServiceRequestRepository.findByOwner` extended with an optional `executor`, rather than adding new transaction-aware method variants** — matches the existing codebase convention (`IdentityRepository.findById(id, executor?)`, `TrustCustodyRepository.findByOrderId(id, executor?)`, etc.) exactly; confirmed by grep that both methods have exactly one other call site each (`RequestDataExportUseCase`, read-only, unaffected by the new optional parameter) — no behavior change for any existing caller.

## 12. Known issues / technical debt

- **Verification/KYC evidence has no deletion/retention-window mechanism** — escalated, not guessed (§13).
- **`GET /verifications/queue/pending` (admin bulk queue) has no audit entry** — a real, pre-existing gap found during this IP's preflight (§2.6), outside `privacy`'s owned files; flagged for the Architecture/Integrator agent as a small, well-scoped follow-up inside `verification`'s own ownership.
- **Free-text user-generated content (reviews, messages, dispute comments) is not scanned/redacted for third-party PII on deletion** — documented as an explicit, reasoned gap (§4), not an oversight.
- **No async/queued processing** for export/deletion — fine at this MVP's volume; would need revisiting if per-identity data volume grows materially (many hundreds of orders/payments per identity).
- **Residual TOCTOU window, narrowed but not eliminated to zero** (§3.4 "Residual risk" paragraph, §10.5) — closing it fully would need pessimistic locking or shared SERIALIZABLE isolation with `marketplace`'s `AcceptOfferUseCase`, deliberately out of this fix's scope per the Diff Review's own "sufficient" guidance. Recorded here as a known, accepted residual, not silently left implicit.
- Pre-existing debt items from IP-000/IP-001 §12 (double-Resume race, generic-500-vs-409 mapping, root lint) are outside this IP's owned files and were not touched.

## 13. External blockers

**None that stop this IP's own scope.** One genuine legal/product decision was identified and escalated rather than guessed, per the task's explicit stop-condition instruction:

- **`IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md`** (`docs/Multi-Agent Implementation Doc/IPS/`) — whether identity-verification (KYC) evidence should be retained, for how long, and under what legal basis, after a `DATA_DELETION` request. This does not block any other part of this IP (§8 of that artifact) and did not stop implementation of anything else.

## 14. Acceptance criteria matrix

| Criterion (IP-021 spec §6) | Status | Evidence |
|---|---|---|
| Sensitive categories mapped | PASS | `apps/api/src/shared/privacy/data-classification.ts` — every table read directly from source schemas (§2.3/§3.1), not assumed. |
| User request workflow exists | PASS | `PrivacyRequest` entity/workflow + `POST/GET /privacy/requests(/:id)`, auth-scoped to the requester, audited (§3.2/§3.4/§8); real frontend surface at `/settings/privacy` (§3.8), not backend-only. |
| Retention jobs/policies testable | PASS (as a synchronous mechanism, not a scheduled job) | Deletion eligibility is a pure, directly unit-tested service (`deletion-eligibility.service.spec.ts`, 8 tests including executor-threading) exercised again end-to-end in the e2e suite against real order/custody state, including a dedicated TOCTOU regression test (§10.1/§10.5). Location/evidence retention is documented policy (§3.6), not a job — no scheduled purge exists or was claimed. |
| Access controls and audit verified | PASS | Every `/privacy/requests*` route is JWT-ownership-scoped (§8); `AnonymizeIdentity`/`ExportOwnData`/denied-deletion audit entries added; existing `GetVerification` access-audit mechanism verified (not rebuilt) to already cover admin reads of another identity's verification (§2.5/§3.5); the one real adjacent gap found (`queue/pending`) is reported, not silently left implicit (§12). |
| Locale-ready privacy content placeholders/config | PASS | `privacy.*` i18n keys in both catalogs (§3.7), `CURRENT_LEGAL_DOCUMENT_VERSION` config hook (§3.3) — explicitly placeholder content, not final legal copy, as instructed. |

## 15. Commits

**Not committed** — git identity is unset in this environment and this agent was explicitly instructed not to configure it, not to self-approve, and not to merge to `main`. All of this IP's changes are left **unstaged/uncommitted** in the working tree, on top of the clean `dff3ab8` baseline.

Files changed/added by this IP (§5), for "main"'s eventual commit — see §5 for the full list.

Suggested commit message for "main":
```
IP-021: Privacy, LGPD & Data Lifecycle

Adds the Release-1 privacy foundation: a code-level data classification
inventory (apps/api/src/shared/privacy/data-classification.ts) built by
reading every real schema in the repository; a self-service PrivacyRequest
workflow (DATA_EXPORT/DATA_DELETION, REQUESTED -> PROCESSING ->
COMPLETED|REJECTED) at POST/GET /privacy/requests, ownership scoped to the
JWT only; Privacy-Policy consent capture alongside the pre-existing
terms_accepted_at; and a real frontend surface at /settings/privacy.

Deletion is anonymization, not row deletion: Identity.anonymize() and
TrustPassport.anonymizeProfile() replace PII in place and soft-delete via
the pre-existing (previously unwired) deleted_at column, inside a single
transaction with session revocation and an audit entry. No financial/audit/
execution-evidence table is ever touched -- every one of them references
the identity by UUID only, never denormalized PII, confirmed by reading
every schema before writing this. A synchronous eligibility gate blocks
deletion while any non-terminal order/custody/service-request exists
(engineering safety rail, not a legal claim); the check runs INSIDE the
anonymization transaction, on the transaction's own connection, immediately
before mutating -- fixing a TOCTOU race the independent Diff Review found
and empirically reproduced (checking before opening the transaction left a
window where a concurrent order could be created without being seen).
MarketplaceOrderRepository.listForParticipant and
ServiceRequestRepository.findByOwner gained an optional `executor`
parameter to support this, additive, no behavior change for existing
callers.

Escalated, not guessed: whether verification/KYC evidence should be
retained/purged on deletion is a legal/product decision this agent could
not make unilaterally -- see
IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md. Everything else in
scope was implemented and tested around it.

Migration 0032 (additive): legal_consents, privacy_requests.

See docs/Multi-Agent Implementation Doc/IPS/IP-021-COMPLETION-REPORT.md for
full preflight, test evidence, and reviewer-focus notes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 16. Recommended reviewer focus

Roughly in order of risk if wrong — **the deletion/anonymization path is the highest-risk area of this entire IP, and the fix in §10.5 is the single most important thing in this revision to scrutinize**:

1. **The Diff Review fix itself** (§3.4/§10.5) — re-verify, independently, that `checkEligibility` genuinely runs on the transaction's own `tx` connection and genuinely is the last statement before the mutation, not just that a parameter was added somewhere. Concretely: read `request-data-deletion.usecase.ts` top to bottom and confirm there is no longer any call to `checkEligibility` outside `db.transaction(...)`, and that every repository method it depends on (`listForParticipant`, `findByOrderId`, `listByOrderId`, `findByOwner`) actually forwards the executor to the underlying Drizzle query rather than silently ignoring it (the new unit test in `deletion-eligibility.service.spec.ts` checks this, but re-reading the 4 repository implementations directly is cheap and worthwhile given the stakes). Then independently re-run the TOCTOU regression test (`ip-021-privacy-lgpd-data-lifecycle.e2e.spec.ts`, the last `it()` block) and confirm it fails if you temporarily revert the fix (move the check back outside the transaction) — a regression test that would pass either way is not actually testing anything.
2. **The residual risk this report now states explicitly** (§3.4 "Residual risk" paragraph, §12) — form an independent judgment on whether "check-then-mutate within the same transaction, no unrelated I/O in between" is genuinely an acceptable stopping point for an MVP engineering safety rail, or whether the Diff Review's "sufficient" framing should be revisited toward a locking-based solution in a follow-up IP. This report does not claim the race is fully eliminated — only substantially narrowed — and that self-assessment itself deserves scrutiny, not just the code.
3. **`Identity.anonymize()` + the `save()` extension to include `email`** (§11.2) — confirm this is genuinely a no-op for every other caller of `save()` (grep every call site) and that the pseudonym e-mail generation can never collide, including under concurrent double-submission of the same deletion request.
4. **The "never touches financial/audit tables" claim** (§3.4.5/§9) — this is the load-bearing safety property of the whole IP, independently verified once already by the Diff Review (§5 of that artifact) via grep against every relevant schema; worth a second independent pass given the fix touched adjacent repository code (`marketplace-order.repository.ts`/`service-request.repository.ts`) — confirm those additive changes didn't introduce any new field exposure.
5. **The Conflict Escalation itself** (`IP-021-CONFLICT-VERIFICATION-EVIDENCE-RETENTION.md`) — the Diff Review already confirmed this is a legitimate, correctly-scoped, separate question (§9 of that artifact); no further action expected here beyond confirming that assessment still holds.
6. **`GET queue/pending` audit gap** (§2.6/§12) — confirm this is genuinely outside `privacy`'s ownership (it is `verification`'s file) and was correctly reported rather than either silently ignored or opportunistically fixed outside this IP's declared scope (Manifest §5.1).
7. **Full e2e run reproducibility** — re-run `node test/e2e-local.mjs --no-file-parallelism` independently and confirm the file/test counts in §10.5 (the post-fix numbers, 82/82 files · 580/580 tests) match exactly, not the pre-fix §10.3 numbers (578 total).
