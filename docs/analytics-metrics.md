# Métricas de Analytics & Inteligência Operacional (IP-020)

> Fonte de verdade executável: `apps/api/src/modules/analytics/domain/metrics-definitions.ts`
> (catálogo machine-readable — este documento é a versão para leitura humana,
> **derivada** dele; qualquer divergência entre os dois é bug de documentação,
> não uma segunda definição). A implementação exata de cada fórmula é
> `apps/api/src/modules/analytics/infrastructure/persistence/analytics.repository.ts`.

## Princípios (IP-020 §1/§4)

- **Nenhum data warehouse novo.** Toda métrica é uma agregação SQL (`count`,
  `sum`, `avg`) calculada **sob demanda**, direto sobre as tabelas
  operacionais que já existem (Marketplace/Payment/Trust/Identity) — não
  existe uma tabela de contadores paralela que possa divergir da fonte.
  "Reconciliar com a transação de origem" é garantido por construção: o
  número **é** a soma/contagem real na hora da chamada.
- **Derivado de evento onde possível.** Cada métrica cita o(s)
  `eventType`(s) do `docs/event-catalog.md` cujo fato de negócio ela mede —
  mesmo quando, na prática, a implementação lê a TABELA que aquele evento
  também alimenta (mais barato que reprocessar o `outbox_events`, e o mesmo
  fato: a tabela é a projeção durável do evento).
- **Só agregado.** Nenhum endpoint devolve uma linha identificável por
  pessoa (nome, e-mail, localização precisa). Ver `AnalyticsController`'s
  comentário de cabeçalho e a IP-021 (`data-classification.ts`) para a
  fronteira de privacidade que este módulo respeita.
- **Dinheiro em centavos, inteiro.** Todo valor monetário na resposta da API
  (`grossOrderValueCents`, `releasedCustodyValueCents`) é um inteiro em
  centavos, convertido de `numeric(18,2)` via `shared/money.fromReais` — nunca
  ponto flutuante.

## API

Todas as rotas são **admin-only** (`AdminGuard`, mesma flag `is_admin`
reavaliada a cada requisição — DOC-002). Ver `docs/openapi.yaml`, tag
`Analytics`.

| Rota | O que devolve |
|---|---|
| `GET /admin/analytics/overview?from&to` | Funil, conversão entre estágios, desfechos (conclusão/cancelamento/disputa), sucesso de autorização de pagamento e tempo médio — todos para a janela `[from, to)` (default: últimos 30 dias). |
| `GET /admin/analytics/trust-adoption` | Snapshot atual: adoção do Trust Passport, distribuição por nível, parcela com documento verificado. |
| `GET /admin/analytics/cohorts?months` | Retenção básica por coorte mensal de cadastro (mês+1 e mês+2). |

## Funil: Request → Offer → Contract → Execution → Confirmation → Payment

| Estágio | Campo | Evento de origem | Fórmula |
|---|---|---|---|
| Request | `requestsCreated` | `ServiceRequest.Created` | `count(service_requests)` criados na janela |
| Match | `requestsMatched` | `ServiceRequest.Matched` | `count(service_requests)` com `matched_at` na janela |
| Offer | `offersCreated` | `MarketplaceOffer.Created`/`.Countered` | `count(marketplace_offers)` criados na janela (toda rodada, inicial ou contraproposta) |
| Contract | `ordersCreated` | `MarketplaceOrder.Created` | `count(marketplace_orders)` criados na janela |
| Execution | `executionCompleted` | `MarketplaceOrder.ExecutionCompleted` | `count(marketplace_orders)` com `completed_at` na janela (check-out do Partner) |
| Confirmation | `customerConfirmed` | `MarketplaceOrder.CustomerConfirmed` | `count(marketplace_orders)` com `customer_confirmed_at` na janela |
| Payment | `paymentsReleased` | `Funds.Released` | `count(trust_custodies)` com `released_at` na janela (tranche original; ver nota abaixo) |
| — | `grossOrderValueCents` | `MarketplaceOrder.Created` | `sum(marketplace_orders.amount)` na janela, em centavos |
| — | `releasedCustodyValueCents` | `Funds.Released` | `sum(trust_custodies.amount)` liberado na janela, em centavos |

**Nota sobre `paymentsReleased`**: cobre apenas a custódia ORIGINAL
(`trust_custodies`). Tranches incrementais de Trust Change Order (IP-007,
`incremental_trust_custodies`) ficam fora do funil de topo por serem um
evento comercial adicional, não o fluxo linear canônico Request→Payment.

## Conversão entre estágios adjacentes

Cada taxa é `estágio[n] / estágio[n-1]`, calculada em memória a partir dos
próprios contadores do funil acima (nunca um terceiro contador). `null`
quando o denominador é zero — nunca `0%` (ver `domain/services/rate.ts`).

| Campo | Fórmula |
|---|---|
| `conversion.requestToMatch` | `requestsMatched / requestsCreated` |
| `conversion.offerToOrder` | `ordersCreated / offersCreated` |
| `conversion.orderToExecution` | `executionCompleted / ordersCreated` |
| `conversion.executionToConfirmation` | `customerConfirmed / executionCompleted` |
| `conversion.confirmationToPayment` | `paymentsReleased / customerConfirmed` |

**Limitação conhecida, documentada e não escondida**: cada taxa acima
compara duas contagens do MESMO período, não o mesmo lote de
requests/offers/orders acompanhado ponta a ponta (um pedido aceito na janela
pode ter vindo de uma proposta criada antes da janela começar). Para o
volume/cadência do Release 1 isso é uma aproximação aceitável e muito mais
simples que uma coorte de funil por id — se a diferença se tornar
relevante em escala, a evolução natural é rastrear por `correlationId`.

## Tempo

| Campo | Evento de origem | Fórmula |
|---|---|---|
| `timing.avgTimeToFirstOfferMinutes` | `MarketplaceConversation.Created` → `MarketplaceOffer.Created` | Média de `min(offer.created_at) - conversation.started_at`, em minutos, por conversa iniciada na janela que recebeu ao menos uma proposta |
| `timing.avgPartnerResponseMinutes` | `MarketplaceConversation.Created` → `MarketplaceMessage.Sent` | Média de `min(mensagem do vendedor) - conversation.started_at`, em minutos, por conversa iniciada na janela |

## Desfechos e pagamento

| Campo | Evento de origem | Fórmula |
|---|---|---|
| `outcomes.completionRate` | `MarketplaceOrder.Completed`/`.Cancelled` | `count(status in COMPLETED,CLOSED) / count(*)` entre os pedidos criados na janela |
| `outcomes.cancellationRate` | `MarketplaceOrder.Cancelled` | `count(status = CANCELLED) / count(*)` entre os pedidos criados na janela |
| `outcomes.disputeRate` | `MarketplaceDispute.Opened` | `count(distinct order com disputa) / count(pedidos criados na janela)` |
| `payments.paymentSuccessRate` | `Payment.Authorized`/`.AuthorizationFailed` | `count(status = APPROVED) / count(*)` entre as TENTATIVAS de autorização na janela (uma tentativa por linha, PAY-002 BR-003 — não por pedido) |

## Adoção de Trust (estado atual, sem janela de tempo)

| Campo | Evento de origem | Fórmula |
|---|---|---|
| `passportAdoptionRate` | `TrustPassport.Created` | `count(trust_passports ativos) / count(identities ativas)` |
| `levelDistribution` | `TrustLevel.Changed` | `group by trust_scores.level, count(*)`, só identidades ativas |
| `documentVerifiedShare` | `Verification.Approved` | `count(trust_passports.document_verified = true) / count(*)` |

`identities`/`trust_passports` soft-deletados (anonimizados pela IP-021) são
excluídos de todo denominador e numerador — uma identidade que pediu
exclusão de dados não aparece em nenhuma contagem de adoção.

## Retenção por coorte (básica)

Para cada mês de cadastro `M` (`identities.created_at`, coortes dos últimos
`months` meses, default 6):

- `cohortSize` = identidades ativas cadastradas no mês `M`.
- `retainedMonth1` = quantas dessa coorte fizeram ao menos um pedido (como
  comprador) no mês `M+1`.
- `retainedMonth2` = idem para o mês `M+2`.
- `retentionRateMonth1`/`retentionRateMonth2` = `retainedMonthN / cohortSize`.

Retenção "básica" no sentido literal do IP-020 §1 — não é RFM, LTV nem
coorte por ação de ativação; é "a pessoa voltou a comprar depois do
primeiro mês", o mínimo que dá sinal de retenção sem inventar um modelo de
produto novo.

## Privacidade (Shared Standards §7 / IP-021)

Nenhuma resposta desta API contém nome, e-mail, telefone, endereço ou
localização precisa de uma pessoa — confirmado por teste automatizado
(`apps/api/test/integration/ip-020-analytics-operational-intelligence.e2e.spec.ts`,
que verifica que o e-mail/nome/id de cada identidade criada no teste NUNCA
aparece na resposta serializada). Esta API não substitui nem duplica as
telas de moderação individual já existentes (`/admin/disputes`,
`/admin/verifications`) — quem precisa investigar um caso específico usa
essas telas, auditadas por identidade, não um "dump" agregado.
