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

_Nenhum ainda — o primeiro será `Identity.Created` (Módulo 1 / IDN-002)._
