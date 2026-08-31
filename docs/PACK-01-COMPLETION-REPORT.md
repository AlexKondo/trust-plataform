# PACK-01 — Completion Report

> **Spec**: `docs/2026083101/TRUST_PACK-01_Payment_Custody_and_Release_v1.0.docx`
> (extraída em `docs-extracted/Arquitetura-ARCH/`)
> **Escopo**: PAY-003 Hold Funds + PAY-004 Release Funds · **Data**: 2026-08-31
> **Status**: implementado; aguardando revisão do diff (§22).

## 1. Preflight (§5)

Todas as cinco checagens passaram **antes** de qualquer alteração de código:

| # | Verificação | Resultado |
|---|---|---|
| 1 | PAY-001 não usa `CustomerConfirmed` para criar Payment | ✅ `create-payment.consumer.ts:28` → `MarketplaceOrder.Created` |
| 2 | PAY-002 termina em `AUTHORIZED` e publica `Payment.Authorized` | ✅ `authorize-payment.usecase.ts` |
| 3 | `PaymentGateway` é port/adapter extensível | ✅ classe abstrata; sandbox isolado |
| 4 | `CustomerConfirmed` = aceite de serviço concluído | ✅ `IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → CUSTOMER_CONFIRMED` |
| 5 | Dá para saber se o pedido tem disputa ativa | ✅ `MarketplaceReviewRepository.findActiveDisputeByOrder` |

Nenhum item foi bloqueado por preflight.

## 2. Implementado

**PAY-003 — custódia.** `Payment.Authorized` cria uma `TrustCustody` em `IN_CUSTODY` com snapshot financeiro copiado do Payment, move o Payment para `FUNDS_IN_CUSTODY` e publica `TrustCustody.Created` + `Funds.Held` — tudo na mesma transação.

**PAY-004 — liberação em duas fases.**

```
MarketplaceOrder.CustomerConfirmed
  └─ fase 1  política ALLOW/DENY → persiste READY_FOR_RELEASE → Funds.ReadyForRelease
     ── commit ──
     └─ fase 2  gateway.release() FORA de transação
        └─ confirmado → RELEASED + Payment FUNDS_RELEASED + Funds.Released
```

A separação é a garantia central do Pack: **a plataforma nunca marca o dinheiro como liberado sem o provedor ter confirmado**. Falha do gateway deixa a custódia em `READY_FOR_RELEASE`, retentável com a mesma chave.

**Política de liberação** determinística, com 6 regras e motivos legíveis por máquina (`CUSTODY_NOT_IN_CUSTODY`, `PAYMENT_NOT_IN_CUSTODY`, `ORDER_MISMATCH`, `MISSING_CUSTOMER_CONFIRMATION`, `DISPUTE_OPEN`, `SNAPSHOT_MISMATCH`). Retorna **todos** os motivos, não só o primeiro.

## 3. Arquivos alterados

**Novos**

| Arquivo | Papel |
|---|---|
| `payment/domain/entities/trust-custody.ts` | agregado, 3 estados, transições |
| `payment/domain/services/trust-release-policy.service.ts` | política pura ALLOW/DENY |
| `payment/domain/services/order-dispute.query.ts` | port de leitura do Marketplace |
| `payment/domain/repositories/trust-custody.repository.ts` | port de persistência |
| `payment/application/usecases/hold-funds.usecase.ts` | PAY-003 |
| `payment/application/usecases/release-funds.usecase.ts` | PAY-004 (`prepare` + `finalize`) |
| `payment/infrastructure/consumers/hold-funds.consumer.ts` | `Payment.Authorized` |
| `payment/infrastructure/consumers/release-funds.consumer.ts` | `MarketplaceOrder.CustomerConfirmed` |
| `payment/infrastructure/consumers/finalize-release.consumer.ts` | `Funds.ReadyForRelease` |
| `payment/infrastructure/persistence/drizzle-trust-custody.repository.ts` | adapter Drizzle |
| `payment/infrastructure/marketplace/marketplace-dispute.query.ts` | adapter da porta de disputa |
| `payment/application/usecases/custody-release.usecase.spec.ts` | 21 testes unitários |
| `test/integration/pack-01.e2e.spec.ts` | 3 testes e2e |
| `drizzle/0025_pack01_trust_custody.sql` | migration |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `payment/domain/services/payment-gateway.ts` | + operação `release` (§12) |
| `payment/infrastructure/gateway/sandbox-payment.gateway.ts` | + `release` determinístico |
| `payment/infrastructure/persistence/payment.schema.ts` | + tabela `trust_custodies` |
| `payment/domain/exceptions/payment.exceptions.ts` | + 3 exceções de custódia |
| `payment/payment.module.ts` | fiação + `imports: [MarketplaceModule]` |
| `shared/events/event-consumer.ts` | + `managesOwnTransaction` (ver desvio D1) |
| `shared/events/outbox-relay.service.ts` | + caminho sem transação para esse caso |
| `docs/event-catalog.md` | + 4 eventos |

## 4. Migration

`0025_pack01_trust_custody.sql` — **aditiva e não destrutiva**: cria `trust_custodies`, 4 FKs, `UNIQUE(payment_id)`, índices em `order_id` e `status`. Todos os passos guardados (`IF NOT EXISTS`), reexecutável com segurança.

`payments` **não foi alterada**: `FUNDS_IN_CUSTODY` e `FUNDS_RELEASED` já existiam no enum de domínio desde a migration 0022, com as transições já mapeadas.

Aplicada e verificada: **26 migrations**, 12 colunas, 4 índices.

## 5. Eventos

| Evento | aggregateType | aggregateId | Produtor |
|---|---|---|---|
| `TrustCustody.Created` | `TrustCustody` | id da custódia | payment-service |
| `Funds.Held` | `TrustCustody` | id da custódia | payment-service |
| `Funds.ReadyForRelease` | `TrustCustody` | id da custódia | payment-service |
| `Funds.Released` | `TrustCustody` | id da custódia | payment-service |

Todos no envelope canônico do PACK-00. **Nenhum endpoint REST novo** (§15) e nenhuma rota de frontend.

## 6. Testes

| Camada | Resultado |
|---|---|
| Unitários PACK-01 | 21 testes |
| E2E PACK-01 | 3 testes |
| **Suíte completa** | **54 suítes / 342 testes verdes** |

Os 13 casos do §20.1 estão cobertos, incluindo os quatro que mais importam: gateway falha não libera; retry usa a mesma chave; `CustomerConfirmed` duplicado não duplica liberação; disputa aberta bloqueia sem chamar o gateway.

O e2e do §20.3 percorre o ciclo inteiro e confirma que **a custódia existe antes de o serviço ser concluído** — que é a inversão semântica que o Pack veio corrigir.

## 7. Desvios e decisões

**D1 — `managesOwnTransaction` no shared kernel.** *Conflito real, reportado e decidido antes de codificar.*
O §11.1/§17 exige `commit → gateway → commit`, mas o `OutboxRelayService` (baseline PACK-00) envolve todo consumer numa transação junto com o registro de idempotência — um consumer não conseguiria chamar o gateway fora de transação. Foi acrescentado um opt-in: quando `managesOwnTransaction` é `true`, o relay chama `handle` fora de transação e grava o dedupe só após o sucesso. **Nenhum consumer existente muda de comportamento.** A garantia passa a ser "ao menos uma vez + handler idempotente", que o próprio PACK-00 §5.3 já exige. Seguro aqui porque `finalize` é idempotente por desenho: chave determinística `release:{custodyId}` e `RELEASED` terminal.
*Decisão confirmada com o Kondo, com o dado de que o provedor real será o **Asaas** — uma chamada HTTP de 0,5–2s tornaria a alternativa concretamente perigosa (conexão presa e, no pior caso, rollback do banco depois de o dinheiro já ter se movido).*

**D2 — nível de log em "confirmou sem custódia".** O §18 manda tratar como erro de consistência. No produto atual, porém, confirmar um pedido que ninguém pagou pela plataforma é **rotina** — o pagamento não é exigido antes do agendamento. Logar tudo como `ERROR` afogaria a inconsistência real no ruído. Ficou: `WARN` quando não há Payment em custódia; `ERROR` quando o Payment diz `FUNDS_IN_CUSTODY` e não existe custódia — que é a inconsistência de verdade. Dois testes cobrem a distinção.

**D3 — representação do dinheiro.** O §13.1 fala em "minor units" para `amount`, mas a regra que prevalece no mesmo parágrafo é "mesmo tipo/semântica de `payments.amount`", e §23.8 é condicional. `payments.amount` é `numeric(18,2)` em reais no banco, com centavos inteiros no domínio. `trust_custodies.amount` **espelha exatamente isso** — nenhum segundo modelo de dinheiro foi criado, que é a proibição de fato.

**D4 — leitura Payments → Marketplace.** A política precisa saber de disputa ativa. Em vez de importar entidades do Marketplace no domínio financeiro, foi criada a porta `OrderDisputeQuery` com adapter na infraestrutura. O Marketplace continua sem conhecer Payments; a direção contrária segue só por evento.

## 8. Fora de escopo (confirmado, §4.2)

Nada de liquidação bancária, taxa/split, reembolso, ledger, casos financeiros, conciliação, provedor real, PCI, KYC, frontend de pagamento, liberação automática por tempo ou tenancy. A seed técnica de 10% **não** foi usada como regra de negócio.

## 9. Pendências conhecidas

1. **Provedor real (Asaas)** — o Kondo definiu o Asaas, com pagamento e split feitos lá dentro. Não entra neste Pack (§4.2). Será um adapter novo do port `PaymentGateway`; o domínio não muda.
2. **Impacto no PACK-02** — se o split acontecer dentro do Asaas, PAY-005/007 deixam de ser "calcular o rateio" e passam a ser "registrar o que o provedor fez". Vale decidir isso **antes** de escrever o próximo Pack.
3. **Ambiente publicado** — a API segue suspensa no Render (cota do plano free esgotada). Não afeta o código nem os testes; afeta a validação em produção.
4. **Sem liberação por tempo** — se o cliente nunca confirmar, o dinheiro fica em custódia indefinidamente. É o desenho pedido pelo §10, mas é uma lacuna de produto a endereçar em Pack futuro.

## 10. Critérios de aceite (§21)

| Critério | Resultado |
|---|---|
| Todo Payment autorizado gera exatamente uma custódia | PASS |
| Custódia criada antes da confirmação de conclusão | PASS |
| Payment vira `FUNDS_IN_CUSTODY` só com custódia criada | PASS |
| `CustomerConfirmed` é aceite de serviço, não cria Payment | PASS |
| Disputa aberta impede a liberação | PASS |
| `READY_FOR_RELEASE` persistido antes da chamada externa | PASS |
| Falha do gateway não marca como liberado | PASS |
| Sucesso no sandbox → `RELEASED` + `FUNDS_RELEASED` | PASS |
| Os 4 eventos com envelope canônico correto | PASS |
| Duplicatas não geram custódia nem liberação dupla | PASS |
| Nada de provedor real, liquidação, split, taxa, reembolso, ledger | PASS |
| Todos os testes passam | PASS — 54 suítes / 342 testes |

## 11. Commit

`docs/2026083101` → implementação registrada no commit desta entrega (ver `git log` em `main`).
