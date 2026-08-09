---
name: trust-events
description: Padrões de eventos da Trust Platform (naming Entity.Action, envelope, outbox, idempotência, catálogo). Use ao criar/alterar qualquer evento de domínio, publisher, consumer ou integração assíncrona entre módulos. Fonte - DOC-005, ID-005.
---

# Event Architecture Standards — Trust Platform

## Naming

- Formato **`<Entity>.<Action>`**, PascalCase, verbo no **passado** (fato ocorrido): `Identity.Created`, `Verification.Approved`, `TrustScore.Calculated`, `MarketplaceOffer.Accepted`
- Nome é **imutável após publicação**. Correção/mudança = novo evento ou nova versão.

## Envelope obrigatório

```json
{
  "eventId": "uuid",
  "eventName": "Identity.Created",
  "eventVersion": "1.0",
  "occurredAt": "2026-08-03T18:30:25Z",
  "producer": "identity-service",
  "correlationId": "uuid",
  "causationId": "uuid",
  "payload": { }
}
```
- `occurredAt` sempre UTC ISO 8601
- Payload: mínimo necessário, estável, autoexplicativo. **Nunca** senhas, hashes, tokens, segredos ou PII desnecessária.

## Regras de publicação

1. Publicar **só após a transação de negócio concluída** — usar **Transactional Outbox** quando a consistência persistência↔publicação importar (padrão da plataforma).
2. Eventos são imutáveis; não há update/delete de evento.
3. Breaking change → nova `eventVersion`; consumidores declaram versões suportadas.
4. Falha de publicação: registrar e permitir reprocesso — nunca descartar silenciosamente.

## Regras de consumo

1. **Consumers idempotentes** — dedupe por `eventId` (a plataforma é at-least-once).
2. Validar envelope e versão antes de processar.
3. Falhas irrecuperáveis → DLQ, preservando o evento original.
4. Não assumir ordenação global; garantir ordem por entidade quando relevante.

## Quando usar eventos (e quando não)

- Usar: notificar fato ocorrido, múltiplos consumidores, desacoplamento (ex.: `Verification.Approved` → TPS projeta + TRS pontua).
- NÃO usar: consultas, ou quando o resultado é necessário na mesma transação.

## Catálogo obrigatório

Todo evento documentado em `docs/event-catalog.md`: nome, versão, descrição, produtor, **consumidores**, payload com exemplo. Nenhum evento sem entrada no catálogo. Decisões já registradas:
- `Identity.Created` é publicado na **verificação de e-mail** (IDN-002), não na criação — marca identidade ativada.
- `MarketplaceOrder.Completed` (check-out do prestador) renomeado para `MarketplaceOrder.ExecutionCompleted` — o estado `COMPLETED` só ocorre após confirmação do cliente.
- Só o TRS publica eventos `TrustScore.*`, `TrustLevel.*`, `TrustBadge.*` — nenhum módulo de negócio emite eventos de confiança.

## Testes por evento

Publicação, (de)serialização, compatibilidade de versão, idempotência do consumer, cenário de falha.
