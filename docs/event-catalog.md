# Catálogo de Eventos — Trust Platform

> Regra (DOC-005 / skill trust-events): **nenhum evento existe sem entrada aqui.**
> Formato do nome: `<Entity>.<Action>` em PascalCase, verbo no passado.
> Envelope canônico: ver `apps/api/src/shared/events/event-envelope.ts`.

## Decisões já registradas (antes de qualquer implementação)

- `Identity.Created` é publicado na **verificação de e-mail** (IDN-002), não na criação da conta — marca a identidade como ativada.
- `MarketplaceOrder.Completed` foi renomeado para `MarketplaceOrder.ExecutionCompleted` (check-out do prestador); o estado `COMPLETED` só ocorre após confirmação do cliente.
- Só o TRS publica `TrustScore.*`, `TrustLevel.*` e `TrustBadge.*` — nenhum módulo de negócio emite eventos de confiança.

## Template de entrada

```markdown
### <Entity>.<Action> (vX.Y)

- **Descrição**: fato de negócio que ocorreu.
- **Produtor**: <modulo>-service
- **Consumidores**: lista de consumidores e o que cada um faz.
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
- **Exemplo**:
  ```json
  { "eventId": "…", "eventName": "…", "eventVersion": "1.0", "occurredAt": "…", "producer": "…", "correlationId": "…", "payload": { } }
  ```
```

## Eventos ativos

### Verification.Created (v1.0) · Verification.EvidenceSubmitted (v1.0) · Verification.ReviewStarted (v1.0)

- **Descrição**: ciclo de vida da verificação (VRF-001/002/003). `EvidenceSubmitted` é publicado quando TODAS as evidências obrigatórias foram enviadas (status → PENDING_REVIEW).
- **Produtor**: verification-service
- **Consumidores**: nenhum no MVP (auditoria/analytics).
- **Payloads**: `Created {verificationId, trustPassportId, identityId, type, attempt, createdAt}`; `EvidenceSubmitted {verificationId, trustPassportId, type, submittedAt}`; `ReviewStarted {verificationId, reviewId, reviewType, startedAt}`

### Verification.Approved (v1.0) · Verification.Rejected (v1.0) · Verification.ReviewCompleted (v1.0)

- **Descrição**: decisão irreversível da verificação (VRF-004/005). `ReviewCompleted` sempre acompanha a decisão (causationId → evento de decisão).
- **Produtor**: verification-service
- **Consumidores**: ✅ `tps.sync-verification-approved` / `tps.sync-verification-rejected` (TPS-004 — projetam o atributo no Passport e recalculam a completude; INCONSISTENCIAS #7). TRS consumirá para pontuação (futuro).
- **Payloads**: `Approved {verificationId, trustPassportId, type, approvedAt}`; `Rejected {verificationId, trustPassportId, type, reasonCode, rejectedAt}`; `ReviewCompleted {verificationId, reviewId, decision, completedAt}`

### TrustPassport.Created (v1.0)

- **Descrição**: Trust Passport criado para uma Identity ativada (TPS-001). `causationId` aponta para o `Identity.Created` que o originou.
- **Produtor**: trust-passport-service
- **Consumidores**: TRS (TRS-001 — cria o Trust Score; ainda não implementado).
- **Payload**: `{ trustPassportId: UUID, identityId: UUID, status: "ACTIVE", createdAt: ISO 8601 }`

### TrustPassport.Updated (v1.0)

- **Descrição**: atributos EDITABLE alterados pelo dono (TPS-003). Atributo verificável alterado tem a verificação revogada.
- **Produtor**: trust-passport-service
- **Consumidores**: nenhum no MVP (auditoria/analytics).
- **Payload**: `{ trustPassportId: UUID, identityId: UUID, updatedFields: string[], updatedAt: ISO 8601 }`

### Identity.Created (v1.0)

- **Descrição**: identidade **ativada e válida** para os demais módulos — publicado na verificação de e-mail (IDN-002), não no cadastro (decisão INCONSISTENCIAS #11).
- **Produtor**: identity-service
- **Consumidores**: ✅ `tps.create-trust-passport` (TPS-001) — cria o Trust Passport automaticamente.
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | identityId | UUID | Identity ativada |
- **Exemplo**:
  ```json
  { "eventId": "019fe41e-…", "eventName": "Identity.Created", "eventVersion": "1.0", "occurredAt": "2026-08-08T22:00:00Z", "producer": "identity-service", "correlationId": "019fe41e-…", "payload": { "identityId": "019fe41e-…" } }
  ```

### Identity.Authenticated (v1.0)

- **Descrição**: login bem-sucedido; sessão criada (IDN-003).
- **Produtor**: identity-service
- **Consumidores**: TRS (futuro — sinal de atividade para o Trust Engine); auditoria/analytics.
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | identityId | UUID | Identity autenticada |
  | sessionId | UUID | sessão criada |
  | authenticatedAt | ISO 8601 UTC | momento do login |

### Session.Refreshed (v1.0)

- **Descrição**: sessão renovada com rotação do refresh token (IDN-004).
- **Produtor**: identity-service
- **Consumidores**: auditoria/analytics (nenhum consumidor de negócio no MVP).
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | sessionId | UUID | sessão renovada |
  | identityId | UUID | dona da sessão |
  | refreshedAt | ISO 8601 UTC | momento da renovação |

### Session.LoggedOut (v1.0)

- **Descrição**: sessão encerrada pelo usuário (IDN-006). Afeta só a sessão atual.
- **Produtor**: identity-service
- **Consumidores**: auditoria/analytics (nenhum consumidor de negócio no MVP).
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | sessionId | UUID | sessão revogada |
  | identityId | UUID | dona da sessão |
  | loggedOutAt | ISO 8601 UTC | momento do logout |

### Identity.PasswordRecoveryRequested (v1.0)

- **Descrição**: pedido de recuperação de senha para conta existente (IDN-007). Nunca publicado para e-mails desconhecidos.
- **Produtor**: identity-service
- **Consumidores**: auditoria/analytics; sinal antifraude (futuro).
- **Payload**: `{ identityId: UUID, requestedAt: ISO 8601 UTC }`

### Identity.PasswordReset (v1.0)

- **Descrição**: senha redefinida via token de recuperação (IDN-008). Todas as sessões foram revogadas na mesma transação.
- **Produtor**: identity-service
- **Consumidores**: auditoria/analytics.
- **Payload**: `{ identityId: UUID, resetAt: ISO 8601 UTC }`

### Identity.PasswordChanged (v1.0)

- **Descrição**: senha alterada pelo usuário autenticado (IDN-009). Demais sessões revogadas; a sessão atual permanece.
- **Produtor**: identity-service
- **Consumidores**: auditoria/analytics.
- **Payload**: `{ identityId: UUID, changedAt: ISO 8601 UTC }`

### Identity.EmailVerified (v1.0)

- **Descrição**: e-mail confirmado pelo dono da conta (IDN-002). `causationId` aponta para o `Identity.Created` da mesma transação.
- **Produtor**: identity-service
- **Consumidores**: TPS (TPS-001/TPS-004 — projeção `email_verified` no Passport; ainda não implementado).
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | identityId | UUID | Identity verificada |
  | verifiedAt | ISO 8601 UTC | momento da confirmação |
