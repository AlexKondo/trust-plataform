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

### MarketplaceReview.Created (v1.0)

- **Descrição**: avaliação da transação (MRK-025). Fecha o ciclo de reputação: a opinião de quem contratou vira score de quem prestou (e vice-versa — os dois lados se avaliam).
- **Produtor**: marketplace-service
- **Consumidores**: ✅ `trs.score-review-created` (INCONSISTENCIAS #13 — pontua **quem foi avaliado**: 4–5 → +30, 3 → +5, 1–2 → −30).
- **Payload**: `{ reviewId, orderId, listingId, reviewerId, reviewedUserId, overallScore, recommended, createdAt }`
- **Exemplo**:
  ```json
  { "eventId": "019fe8f0-…", "eventName": "MarketplaceReview.Created", "eventVersion": "1.0", "occurredAt": "2026-08-10T18:00:00Z", "producer": "marketplace-service", "correlationId": "019fe8f0-…", "payload": { "reviewId": "019fe8f0-…", "orderId": "019fe8f0-…", "listingId": "019fe8f0-…", "reviewerId": "019fe41e-…", "reviewedUserId": "019fe41e-…", "overallScore": 5, "recommended": true, "createdAt": "2026-08-10T18:00:00Z" } }
  ```

### MarketplaceDispute.Opened (v1.0) · MarketplaceDispute.Resolved (v1.0)

- **Descrição**: ciclo da disputa (MRK-023/024). `Opened` leva o pedido a `DISPUTE_OPEN`; `Resolved` traz a decisão definitiva da mediação e leva o pedido a `DISPUTE_RESOLVED`.
- **Produtor**: marketplace-service
- **Consumidores**: `Resolved` → ✅ `trs.score-dispute-resolved` (penaliza a parte culpada: `UPHELD` −60, `PARTIALLY_UPHELD` −30). `Opened` não tem consumidores — abrir disputa não é prova de culpa e por isso não pontua.
- **Payloads**: `Opened {disputeId, orderId, listingId, buyerId, sellerId, openedBy, category, openedAt}`; `Resolved {disputeId, decisionId, orderId, buyerId, sellerId, openedBy, decisionType, faultIdentityId, decidedBy, decidedAt}`
- **Nota**: `faultIdentityId` é `null` quando a decisão não atribui culpa (improcedente, acordo, cancelamento) — nesse caso o Trust Engine simplesmente ignora o evento.

### MarketplaceOrder.Scheduled (v1.0) · MarketplaceOrder.Started (v1.0) · MarketplaceOrder.ExecutionCompleted (v1.0)

- **Descrição**: marcos da execução (MRK-019/020/021). `ExecutionCompleted` é o **check-out do prestador**, que leva o pedido a `AWAITING_CUSTOMER_CONFIRMATION` — não é a conclusão do pedido (INCONSISTENCIAS #24).
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (agenda, notificações e SLA são pós-MVP).
- **Payloads**: `Scheduled {orderId, listingId, buyerId, sellerId, schedulingId, scheduledStart, scheduledEnd, status}`; `Started {orderId, listingId, buyerId, sellerId, startedBy, startedAt, status}`; `ExecutionCompleted {orderId, listingId, buyerId, sellerId, completedBy, completedAt, actualDuration, status}`

### MarketplaceOrder.CustomerConfirmed (v1.0)

- **Descrição**: o cliente confirmou a entrega (MRK-022). **É o fato de negócio mais importante da plataforma**: fecha o ciclo confiança → trabalho → confiança. Não encerra o pedido (BR-006) — dispara os processos obrigatórios.
- **Produtor**: marketplace-service
- **Consumidores**: ✅ `trs.score-order-confirmed` (INCONSISTENCIAS #13 — registra Trust Event e pontua **o prestador**, +40) · ✅ `mrk.complete-confirmed-order` (transiciona `CUSTOMER_CONFIRMED` → `COMPLETED`). Fan-out real: cada consumer tem fila própria.
- **Payload**: `{ orderId, listingId, conversationId, buyerId, sellerId, confirmedBy, amount, currency, confirmedAt, status }`
- **Exemplo**:
  ```json
  { "eventId": "019fe8f0-…", "eventName": "MarketplaceOrder.CustomerConfirmed", "eventVersion": "1.0", "occurredAt": "2026-08-10T16:00:00Z", "producer": "marketplace-service", "correlationId": "019fe8f0-…", "payload": { "orderId": "019fe8f0-…", "listingId": "019fe8f0-…", "buyerId": "019fe41e-…", "sellerId": "019fe41e-…", "confirmedBy": "019fe41e-…", "amount": 1100, "currency": "BRL", "confirmedAt": "2026-08-10T16:00:00Z", "status": "CUSTOMER_CONFIRMED" } }
  ```

### MarketplaceOrder.Completed (v1.0)

- **Descrição**: pedido concluído após os processos obrigatórios (MRK-022 BR-007). Publicado pelo consumer, não por requisição.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP. `CLOSED` (pós-janela de avaliação) fica para o Módulo 9.
- **Payload**: `{ orderId, listingId, buyerId, sellerId, amount, currency, status: "COMPLETED", completedAt }`

### MarketplaceOrder.Cancelled (v1.0) · MarketplaceListing.Released (v1.0)

- **Descrição**: cancelamento do pedido (MRK-018) e a liberação do anúncio que ele provoca. Sem o `Released`, o anúncio ficaria `RESERVED` para sempre (INCONSISTENCIAS #12).
- **Produtor**: marketplace-service
- **Consumidores**: `Cancelled` → ✅ `mrk.release-listing-on-cancel` (devolve o anúncio para `PUBLISHED`) · ✅ `trs.score-order-cancelled` (penaliza **quem cancelou**, −20). `Released` não tem consumidores.
- **Payloads**: `Cancelled {orderId, listingId, conversationId, buyerId, sellerId, cancelledBy, cancelledByRole, previousStatus, reason, cancelledAt, status}`; `Released {listingId, ownerId, orderId, status: "PUBLISHED", releasedAt}`

### MarketplaceOffer.Created (v1.0) · MarketplaceOffer.Updated (v1.0) · MarketplaceOffer.Withdrawn (v1.0) · MarketplaceOffer.Rejected (v1.0)

- **Descrição**: rodadas da negociação (MRK-009/010/011/014). `Withdrawn` é a desistência de quem propôs; `Rejected` é a recusa de quem recebeu — a conversa segue aberta nos dois casos.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP. As notificações às partes (MRK-011/014 §11) entram quando o módulo Notifications existir — estes eventos já são o ponto de integração.
- **Payloads**: `Created {offerId, conversationId, listingId, buyerId, sellerId, amount, currency, status: "PENDING", createdAt}`; `Updated {offerId, conversationId, buyerId, updatedFields: string[], updatedAt}`; `Withdrawn {offerId, conversationId, listingId, buyerId, sellerId, status: "WITHDRAWN", withdrawnAt}`; `Rejected {offerId, conversationId, listingId, buyerId, sellerId, rejectedBy, rejectedAt}`

### MarketplaceOffer.Countered (v1.0)

- **Descrição**: contraoferta criada por quem recebeu a proposta (MRK-012). O `payload.offerId` é a **nova** rodada; `parentOfferId` é a proposta que virou `COUNTERED`.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (notificação ao comprador é pós-MVP).
- **Payload**: `{ offerId, parentOfferId, conversationId, listingId, buyerId, sellerId, amount, currency, status: "PENDING", createdAt }`

### MarketplaceOffer.Accepted (v1.0) · MarketplaceListing.Reserved (v1.0) · MarketplaceOrder.Created (v1.0)

- **Descrição**: os três fatos do aceite (MRK-013), publicados **na mesma transação** em que a proposta vira `ACCEPTED`, o anúncio vira `RESERVED` e o pedido nasce (BR-008/BR-009). Se qualquer etapa falhar, nenhum dos três existe.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP. Ponto de integração declarado das specs para Orders, Notifications, Trust Score e Analytics — a pontuação de confiança por transação entra com `MarketplaceOrder.CustomerConfirmed` e reviews (Módulos 8–9, INCONSISTENCIAS #13).
- **Payloads**: `Accepted {offerId, conversationId, listingId, buyerId, sellerId, acceptedBy, orderId, acceptedAt}`; `Reserved {listingId, ownerId, orderId, status: "RESERVED", reservedAt}`; `OrderCreated {orderId, offerId, conversationId, listingId, buyerId, sellerId, amount, currency, status: "CREATED", createdAt}`
- **Exemplo**:
  ```json
  { "eventId": "019fe8f0-…", "eventName": "MarketplaceOrder.Created", "eventVersion": "1.0", "occurredAt": "2026-08-10T12:00:00Z", "producer": "marketplace-service", "correlationId": "019fe8f0-…", "payload": { "orderId": "019fe8f0-…", "offerId": "019fe8f0-…", "conversationId": "019fe8f0-…", "listingId": "019fe8f0-…", "buyerId": "019fe41e-…", "sellerId": "019fe41e-…", "amount": 540, "currency": "BRL", "status": "CREATED", "createdAt": "2026-08-10T12:00:00Z" } }
  ```

### MarketplaceListing.Created (v1.0) · MarketplaceListing.Updated (v1.0) · MarketplaceListing.Published (v1.0)

- **Descrição**: ciclo de vida do anúncio (MRK-001/002/003). `Created` sai com `status: DRAFT` (o anúncio ainda não é visível); `Published` é o marco que o torna pesquisável.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (auditoria/analytics). Pontuação de confiança por atividade no Marketplace só entra com pedidos/reviews (Módulos 8–9, INCONSISTENCIAS #13).
- **Payloads**: `Created {listingId, ownerId, status: "DRAFT", createdAt}`; `Updated {listingId, ownerId, updatedFields: string[], updatedAt}`; `Published {listingId, ownerId, category, status: "PUBLISHED", publishedAt}`
- **Exemplo**:
  ```json
  { "eventId": "019fe8f0-…", "eventName": "MarketplaceListing.Published", "eventVersion": "1.0", "occurredAt": "2026-08-09T18:00:00Z", "producer": "marketplace-service", "correlationId": "019fe8f0-…", "payload": { "listingId": "019fe8f0-…", "ownerId": "019fe41e-…", "category": "HOME_REPAIRS", "status": "PUBLISHED", "publishedAt": "2026-08-09T18:00:00Z" } }
  ```

### MarketplaceListing.Viewed (v1.0)

- **Descrição**: visualização do detalhe de um anúncio publicado (MRK-005 BR-004). Publicado também para visitante anônimo (`viewerId: null`) e nunca para o próprio dono.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (analytics de vitrine).
- **Payload**: `{ listingId: UUID, viewerId: UUID | null, viewedAt: ISO 8601 }`

### MarketplaceConversation.Created (v1.0) · MarketplaceConversation.Closed (v1.0) · MarketplaceConversation.Read (v1.0)

- **Descrição**: ciclo da conversa de negociação (MRK-006/007/008). `Created` só sai quando uma conversa nova nasce — reaproveitar uma conversa ativa (BR-005 do MRK-006, INCONSISTENCIAS #9) publica apenas `MarketplaceMessage.Sent`. `Read` só sai quando alguma mensagem realmente mudou de estado.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (notificações são pós-MVP).
- **Payloads**: `Created {conversationId, listingId, buyerId, sellerId, startedAt}`; `Closed {conversationId, listingId, closedBy, closedAt}`; `Read {conversationId, readerId, messagesRead, readAt}`

### MarketplaceMessage.Sent (v1.0)

- **Descrição**: mensagem registrada na conversa (MRK-006/007). Mensagens são imutáveis — não existe evento de edição ou exclusão.
- **Produtor**: marketplace-service
- **Consumidores**: nenhum no MVP (notificação ao destinatário é pós-MVP).
- **Payload**: `{ conversationId: UUID, messageId: UUID, senderId: UUID, sentAt: ISO 8601 }`

### TrustBadge.Awarded (v1.0) · TrustBadge.Revoked (v1.0)

- **Descrição**: badge concedido/revogado pelo motor (TRS-013). PERMANENT nunca é revogado; DYNAMIC reflete o estado atual. SÓ o TRS publica `TrustBadge.*`.
- **Produtor**: trust-engine
- **Consumidores**: ✅ `trs.award-badges` consome `TrustScore.Calculated` para avaliar o catálogo; os eventos de badge não têm consumidores no MVP (analytics/notificações futuras).
- **Payloads**: `{ trustPassportId, identityId, badgeCode, awardedAt|revokedAt }`

### TrustScore.Created (v1.0) · TrustScore.Calculated (v1.0) · TrustLevel.Changed (v1.0)

- **Descrição**: ciclo do Trust Engine (TRS-001/003/004). SÓ o TRS publica eventos `TrustScore.*`/`TrustLevel.*` (regra de ouro TP-001).
- **Produtor**: trust-engine
- **Consumidores**: TrustPassport.Created → ✅ `trs.create-trust-score` (cria score 0/UNVERIFIED) e pontua; Verification.Approved/Rejected → ✅ `trs.score-verification-approved/-rejected` (registram Trust Events e recalculam).
- **Payloads**: `Created {trustPassportId, identityId, score: 0, createdAt}`; `Calculated {trustPassportId, identityId, score, level, calculatedAt}`; `Changed {trustPassportId, identityId, previousLevel, newLevel, score, changedAt}`

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
