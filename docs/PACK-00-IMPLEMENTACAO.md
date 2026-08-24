# PACK-00 v1.1 — registro de implementação

> Spec vigente: `docs-extracted/Arquitetura-ARCH/TRUST_PACK-00_Foundation_Reconciliation_Engineering_Baseline_v1.1.md`
> (substitui integralmente a v1.0). Revisão que originou a v1.1: [REVISAO-PACK-00.md](REVISAO-PACK-00.md).
> Status: **IMPLEMENTADO** em 2026-08-24.

## 1. O que mudou, em uma frase

O evento de domínio passou a dizer **de qual agregado ele é** (`aggregateType` +
`aggregateId`) e o nome do evento passou a se chamar `eventType`; o corpo de erro
da API passou a carregar `requestId` e `correlationId`.

## 2. Envelope canônico (§5)

`apps/api/src/shared/events/event-envelope.ts`

| campo | antes | agora |
|---|---|---|
| nome do evento | `eventName` | **`eventType`** (campo canônico de escrita) |
| agregado | não existia | **`aggregateType` + `aggregateId`, obrigatórios** |
| `eventVersion` | string `"1.0"` | string `"major.minor"`, validada |
| naming | `<Entity>.<Action>` | inalterado — dois segmentos (§5.1) |
| `producer` | ids atuais | inalterados (§15: sem rename em massa) |

`createEventEnvelope` lança se faltar `aggregateType`/`aggregateId`. O schema
`eventEnvelopeSchema` é **estrito** e serve apenas para escrita nova.

### O agregado não se deduz do produtor

O aceite de proposta (`AcceptOfferUseCase`) grava três eventos na MESMA transação
com três agregados diferentes:

| evento | aggregateType | aggregateId |
|---|---|---|
| `MarketplaceOffer.Accepted` | `MarketplaceOffer` | id da proposta |
| `MarketplaceListing.Reserved` | `MarketplaceListing` | id do anúncio |
| `MarketplaceOrder.Created` | `MarketplaceOrder` | id do pedido |

Por isso cada um dos 55 pontos de publicação informa o seu agregado — não há
derivação automática. Dois casos mereceram decisão explícita:

- `TrustLevel.Changed` → `aggregateType: TrustScore`. Nível é atributo do score,
  não agregado próprio.
- `MarketplaceDispute.Opened/Resolved` passam pelo `OrderLifecycleService` (porta
  única do pedido), mas o fato é da disputa: o serviço ganhou override opcional
  de agregado, com padrão `MarketplaceOrder`.

## 3. Escrita estrita, leitura tolerante (§11)

`apps/api/src/shared/events/legacy-event-compat.ts` — arquivo isolado, com
instrução de remoção no cabeçalho. Aceita `eventName` legado e agregado ausente.
**Nunca** valida escrita nova.

Duas origens reais de evento legado, ambas cobertas:

1. linhas `outbox_events` ainda `PENDING`/`FAILED` no momento do deploy —
   o `OutboxRelayService` publica com agregado `undefined`, sem inventar valor;
2. jobs já enfileirados no pg-boss, cujo payload é o envelope antigo —
   `readPersistedEvent(job.data)` normaliza antes de entregar ao consumer.

Consumers recebem `ConsumedEvent`, tipo em que `aggregateType`/`aggregateId` são
opcionais — é honesto: para evento histórico eles realmente não existem.

## 4. Migration 0024 (§11)

`apps/api/drizzle/0024_pack00_canonical_event_envelope.sql`

- `event_name` → **renomeada** para `event_type` (dados preservados, nada apagado);
- `aggregate_type` / `aggregate_id` adicionadas **anuláveis** — o Pack proíbe
  fabricar identidade de agregado para eventos históricos;
- índice `idx_outbox_event_name` renomeado; novo índice por agregado.

Todos os passos são guardados (`IF EXISTS` / `IF NOT EXISTS`), então reexecutar é
seguro. Não há passo destrutivo.

## 5. Corpo de erro canônico (§6)

`apps/api/src/shared/api/global-exception.filter.ts`

```json
{
  "success": false,
  "error": {
    "code": "IDENTITY_NOT_FOUND",
    "message": "Identity not found.",
    "details": [{ "path": "email", "message": "…" }],
    "requestId": "01a03509-…",
    "correlationId": "01a03509-…"
  }
}
```

- `details` continua **ARRAY** de `{path, message}` (decisão v1.1) — o cadastro em
  [register/page.tsx](../apps/web/app/register/page.tsx) faz `details.map(...)`;
- `requestId`/`correlationId` vêm do `RequestContext`, os mesmos dos headers
  `x-request-id`/`x-correlation-id`, que continuam sendo enviados;
- há fallback para exceções lançadas antes do middleware (ex.: corpo malformado);
- **nenhum `traceId`** foi introduzido — OpenTelemetry ficou adiado (§16.1).

## 6. Tenancy (§7)

Nada feito, por decisão do Pack: nenhum `tenant_id`/`organization_id`, nenhuma
tabela nova. A autorização continua por identidade autenticada + propriedade do
recurso, e agora existe teste de regressão provando isso.

## 7. Testes (§12)

| Requisito do §12 | Onde |
|---|---|
| suítes existentes verdes | 52 suítes / 320 testes |
| envelope de escrita estrito | `shared/events/event-envelope.spec.ts` |
| `eventType` é o campo canônico | idem (assert de que `eventName` não existe no envelope) |
| agregado correto em Payment e Marketplace | `marketplace/.../accept-offer.usecase.spec.ts` + `test/integration/pack-00.e2e.spec.ts` |
| idempotência de consumer | suítes existentes de TPS/TRS/PAY |
| leitura tolerante de evento legado | `event-envelope.spec.ts` + e2e (linha sem agregado é publicada) |
| corpo de erro com code/message/details/requestId/correlationId | `shared/api/global-exception.filter.spec.ts` + e2e |
| body bate com RequestContext e headers | e2e `pack-00` |
| regressão de propriedade/autorização | e2e `pack-00` |
| nenhum teste de tenant | não existe — fora de escopo |

Extra que o Pack não pediu, mas que fecha a garantia: o e2e varre a tabela
`outbox_events` inteira e falha se **qualquer** evento novo tiver ficado sem
agregado.

## 8. Fora de escopo, confirmado

Três campos `event_name` **permaneceram** de propósito, porque não são o envelope
de evento de domínio:

- `trust_events.event_name` — event store do Trust Score;
- `trust_score_rules.event_name` — regra de pontuação (editável em `/admin/trust-rules`);
- o campo `eventName` da timeline em `GET /trust-scores/me/timeline`.

Renomeá-los quebraria contrato de API e tela sem nenhum ganho para o §5, que trata
do envelope de evento entre domínios.
