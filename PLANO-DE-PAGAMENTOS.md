# Módulo Payments — plano de execução em blocos

> Specs: `docs-extracted/Payment/` (PAY-001..010 + PAY-ARCH-001/002).
> Regras de implementação: skill `trust-payments`.
> Este documento é o mapa. Cada bloco fecha com testes verdes e commit próprio.

## 1. O que o módulo é

O Payments não é "integração com gateway". É a **custódia**: a plataforma
segura o dinheiro do cliente e só solta para o prestador quando a condição
combinada acontece. O gateway é um detalhe substituível atrás de uma interface.

```
MarketplaceOrder → Payment → PaymentAuthorization → TrustCustody
                                                        ↓
                                         Release → Settlement → Distribution
                                                        ↓
                                              Refund (fluxo alternativo)
```

Tudo isso é observado por dois módulos passivos: o **Ledger** (registra) e a
**Conciliação** (confere).

## 2. Decisões canônicas (resolvem conflitos das specs)

| # | Conflito | Resolução |
|---|---|---|
| **P1** | **PAY-001 BR-002 cria o Payment ao consumir `MarketplaceOrder.CustomerConfirmed`** — ou seja, cobra o cliente DEPOIS de ele confirmar que o serviço foi entregue. Isso esvazia a custódia: o PAY-ARCH-002 lista "confirmação do cliente" como *condição de liberação*, mas nesse desenho ela já aconteceu antes de existir dinheiro. | **O Payment nasce com o pedido** (`MarketplaceOrder.Created`, no aceite da proposta) e `MarketplaceOrder.CustomerConfirmed` passa a ser o **gatilho de liberação** da custódia. É a única leitura em que a custódia protege alguém. O gatilho fica isolado em um consumer só, para poder ser revertido sem tocar no resto. **CONFIRMADO pelo founder em 2026-08-10**: o cliente paga ao fechar negócio e o dinheiro fica retido até a confirmação do serviço. |
| P2 | Nenhuma spec define o provedor de pagamento real, e não há credencial, conta ou requisito de PCI atendido | MVP entrega o **port `PaymentGateway` completo** (PAY-ARCH-001) com um adapter `SandboxPaymentGateway` que simula autorização/captura/estorno de forma determinística. Trocar por Mercado Pago/Stripe é escrever um adapter novo — zero mudança no domínio. |
| P3 | PAY-007 exige que a soma dos itens seja exatamente o líquido, mas nenhuma spec define a taxa da plataforma | Taxa configurável em **basis points** (1 bp = 0,01%), com seed padrão de **1000 bp = 10%**. Rateio em centavos inteiros; a sobra da divisão vai para o prestador. |
| P4 | `DECIMAL(18,2)` no banco vs. aritmética de rateio | Banco em reais conforme a spec; **domínio em centavos inteiros**. Conversão só no repositório (ver skill `trust-payments` §1). |
| P5 | PAY-004/005/006 não dizem quem dispara a operação (só "eventos internos") | Cada etapa é disparada pelo evento da etapa anterior, via consumer: `Funds.Held` → avalia liberação; `Funds.Released` → liquidação; `Funds.Settled` → distribuição. A cadeia é observável e cada elo é idempotente. |
| P6 | PAY-009/010 preveem automações ("abrir caso automaticamente", "conciliação periódica") sem definir agendamento | MVP: conciliação **sob demanda** (endpoint admin) e caso financeiro aberto automaticamente só a partir de inconsistência CRITICAL. Job periódico entra quando houver agendador. |

## 3. Blocos de execução

Cada bloco é entregável: compila, testa e pode ser publicado sozinho.

### Bloco 1 — Fundação financeira ✅ CONCLUÍDO (2026-08-10)
**Entrega**: o dinheiro tem onde morar e como ser somado sem erro.
- `shared/money.ts`: centavos, conversão, rateio com resto, formatação
- Tabela `payments` + agregado `Payment` com máquina de estados
- Port `PaymentGateway` + `SandboxPaymentGateway` + `PaymentProviderResolver`
- Consumer `pay.create-payment-on-order` (P1)
- Testes: máquina de estados, rateio, idempotência do consumer

### Bloco 2 — Autorização (PAY-002) ✅ CONCLUÍDO (2026-08-10)
**Entrega**: o cliente paga.
- Tabela `payment_authorizations` com idempotency key única
- `POST /payments/{id}/authorize` (comprador)
- `GET /payments/me` e `GET /payments/{id}` (participantes)
- Eventos `Payment.Authorized` / `Payment.AuthorizationFailed`
- Testes: sucesso, falha, **repetição com a mesma chave não cobra duas vezes**

### Bloco 3 — Custódia (PAY-003 + PAY-004)
**Entrega**: o dinheiro fica retido e só sai pela política.
- Tabela `trust_custodies` + agregado com a máquina de 8 estados
- `TrustReleasePolicyService` (confirmação do cliente, sem disputa aberta)
- Consumers: autorização → custódia; confirmação do pedido → liberação
- Eventos `TrustCustody.Created`, `Funds.Held`, `Funds.ReadyForRelease`, `Funds.Released`
- Testes: liberação aprovada, negada por disputa, negada sem confirmação

### Bloco 4 — Liquidação e distribuição (PAY-005 + PAY-007)
**Entrega**: o prestador recebe, a plataforma cobra a taxa.
- Tabelas `funds_settlements`, `funds_distributions`, `funds_distribution_items`
- `DistributionPolicyService` com taxa em basis points
- Cadeia por evento: liberado → liquidado → distribuído
- Testes: soma dos itens == líquido, ao centavo

### Bloco 5 — Reembolso (PAY-006)
**Entrega**: cancelamento e disputa procedente devolvem o dinheiro.
- Tabela `funds_refunds`, total e parcial, soma limitada ao liquidado
- Consumers de `MarketplaceOrder.Cancelled` e `MarketplaceDispute.Resolved`
- Endpoint admin para reembolso manual
- Testes: parcial, teto da soma, disputa procedente devolve automaticamente

### Bloco 6 — Ledger (PAY-008)
**Entrega**: todo movimento fica registrado, para sempre.
- Tabelas `financial_ledgers` + `financial_ledger_entries` (append-only)
- Um consumer por evento financeiro
- `GET /payments/{id}/ledger`
- Testes: entrada por evento, imutabilidade

### Bloco 7 — Casos e conciliação (PAY-009 + PAY-010)
**Entrega**: a plataforma sabe quando o dinheiro não fecha.
- Tabelas `financial_cases` + histórico, `financial_reconciliations` + issues
- Regras de conciliação (authorization ≥ settlement, distribution == settlement…)
- Abertura automática de caso em inconsistência CRITICAL
- Telas admin: casos e saúde financeira

### Bloco 8 — Frontend
**Entrega**: o usuário vê e paga.
- Botão "Pagar" no pedido, estado do pagamento na linha do tempo
- Extrato do prestador (o que entrou, o que está retido, o que foi liberado)
- Painel admin: casos financeiros e conciliação

## 4. Ordem de dependência

```
Bloco 1 ──→ Bloco 2 ──→ Bloco 3 ──→ Bloco 4
                            │           │
                            └──→ Bloco 5 (reembolso)
                                        │
Blocos 1..5 ────────────────────────────┴──→ Bloco 6 (ledger) ──→ Bloco 7
                                                                      │
                                                                 Bloco 8
```

O Ledger vem depois porque consome os eventos de todos os anteriores — construí-lo
antes significaria voltar nele a cada bloco novo.
