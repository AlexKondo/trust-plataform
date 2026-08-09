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

### Identity.Created (v1.0)

- **Descrição**: identidade **ativada e válida** para os demais módulos — publicado na verificação de e-mail (IDN-002), não no cadastro (decisão INCONSISTENCIAS #11).
- **Produtor**: identity-service
- **Consumidores**: TPS (TPS-001 — cria o Trust Passport automaticamente; ainda não implementado).
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | identityId | UUID | Identity ativada |
- **Exemplo**:
  ```json
  { "eventId": "019fe41e-…", "eventName": "Identity.Created", "eventVersion": "1.0", "occurredAt": "2026-08-08T22:00:00Z", "producer": "identity-service", "correlationId": "019fe41e-…", "payload": { "identityId": "019fe41e-…" } }
  ```

### Identity.EmailVerified (v1.0)

- **Descrição**: e-mail confirmado pelo dono da conta (IDN-002). `causationId` aponta para o `Identity.Created` da mesma transação.
- **Produtor**: identity-service
- **Consumidores**: TPS (TPS-001/TPS-004 — projeção `email_verified` no Passport; ainda não implementado).
- **Payload**:
  | campo | tipo | descrição |
  |---|---|---|
  | identityId | UUID | Identity verificada |
  | verifiedAt | ISO 8601 UTC | momento da confirmação |
