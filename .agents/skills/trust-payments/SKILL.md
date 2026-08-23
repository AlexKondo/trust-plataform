---
name: trust-payments
description: Regras do módulo Payments da Trust Platform (dinheiro em centavos, custódia Trust, port PaymentGateway, idempotência financeira, ledger imutável). Use SEMPRE que tocar em qualquer feature PAY-XXX, valor monetário, integração com gateway, custódia, liquidação, reembolso ou conciliação. Fonte - PAY-001..010, PAY-ARCH-001/002.
---

# Payments — Trust Platform

> Este módulo move **dinheiro real**. Um bug aqui não é um bug de tela: é
> alguém sem receber ou cobrado duas vezes. As regras abaixo não são estilo —
> são o que impede prejuízo.

## 1. A regra do dinheiro: centavos inteiros

**Todo cálculo monetário no domínio usa `number` inteiro em CENTAVOS.**
Nunca `float` de reais. `0.1 + 0.2 !== 0.3` — e em rateio de comissão isso vira
divergência de centavo que a conciliação (PAY-010) vai acusar como CRITICAL.

- Domínio e cálculos: **centavos** (`amountCents: number`).
- Banco: `numeric(18,2)` em reais (contrato das specs) — conversão só no
  repositório, via `toReais()` / `fromReais()` do `money.ts`.
- API: reais com 2 casas, como no resto da plataforma.
- **Rateio**: distribuir o resto da divisão para o último beneficiário. A soma
  dos itens tem que bater EXATAMENTE com o líquido (PAY-007 BR-005).

```ts
// certo
const fee = Math.round(grossCents * feeBasisPoints / 10_000);
// errado — perde centavo
const fee = gross * 0.10;
```

## 2. Ports & Adapters é obrigatório (PAY-ARCH-001)

O domínio conhece **apenas** a interface `PaymentGateway`. Nenhuma entidade,
use case ou serviço de domínio pode importar SDK, tipo ou constante de gateway.

```
Payments Domain → PaymentGateway (port) → [Sandbox | MercadoPago | Stripe]Adapter
```

- Adapter **nunca publica evento**: devolve resultado ao domínio; só o domínio
  publica `Payment.Authorized` etc. (PAY-ARCH-001 §14).
- Seleção do provedor fica no `PaymentProviderResolver` — o domínio não conhece
  os critérios (país, moeda, custo, disponibilidade).
- Webhook nunca escreve no agregado direto: `Controller → Validation →
  Translator → Domain Event` (§8).

## 3. Idempotência financeira

Toda operação que fala com gateway exige **Idempotency Key** + Correlation ID.
Chamada repetida com a mesma chave **não pode** gerar segunda cobrança.

- A chave é persistida junto da tentativa (`payment_authorizations`,
  `funds_refunds`...), com índice único.
- Consumers já têm dedupe por `(consumerName, eventId)` — use isso em vez de
  inventar controle novo.
- Antes de chamar o gateway: verifique se já existe tentativa concluída com a
  mesma chave e devolva o resultado anterior.

## 4. Custódia Trust é o coração (PAY-ARCH-002)

A confiança não vem do gateway; vem de a plataforma **segurar o dinheiro** até
a condição ser atendida.

Máquina de estados da `TrustCustody`:

```
CREATED → FUNDS_RESERVED → IN_CUSTODY → READY_FOR_RELEASE → RELEASED → SETTLED
                                    ↘ REFUNDED | CANCELLED | FAILED
```

- Uma custódia ativa por Payment (`UNIQUE(payment_id)`).
- Liberar SÓ pelo `TrustReleasePolicyService` (PAY-004 BR-002). Nenhum use case
  decide liberação por conta própria.
- Política negando liberação = **nenhuma** alteração financeira (BR-005).
- O agregado nunca chama gateway; quem chama é a camada de aplicação.

## 5. Marketplace e Payments não se conhecem

O Marketplace **não** chama Payments. Payments consome eventos do Marketplace
(`MarketplaceOrder.*`, `MarketplaceDispute.*`) e reage. O contrário também vale:
Payments não importa repositório do Marketplace — se precisa de um dado, ele
vem no payload do evento (adição de campo é retrocompatível).

## 6. Ledger é append-only e burro (PAY-008)

- `financial_ledger_entries` **nunca** sofre UPDATE ou DELETE.
- O Ledger **não executa regra de negócio** (BR-005): só registra o que os
  outros agregados publicaram.
- Uma entrada por evento financeiro, criada por consumer.
- Correção de erro = **nova entrada compensatória**, nunca edição.

## 7. Ordem canônica do fluxo

```
Pedido criado (aceite da proposta)
  → Payment CREATED
  → comprador autoriza        → Payment AUTHORIZED
  → custódia                  → FUNDS_IN_CUSTODY / IN_CUSTODY
  → cliente confirma serviço  → política aprova → READY_FOR_RELEASE → RELEASED
  → liquidação                → SETTLED
  → distribuição              → líquido rateado (plataforma + prestador)
```

Cancelamento ou disputa procedente entram como **reembolso**, nunca como
"desfazer" de estado anterior.

## 8. Segurança (PAY-ARCH-001 §13)

**Nunca** persistir nem logar: CVV, PAN completo, token sensível do gateway.
`gateway_response` em JSONB é permitido, mas **sanitizado** — remova qualquer
campo de cartão antes de salvar. Log de valor monetário é permitido; log de
instrumento de pagamento, não.

## 9. Auditoria

Toda movimentação registra: responsável (usuário ou processo), momento, estado
anterior, novo estado, origem, Correlation ID e Idempotency Key
(PAY-ARCH-002 §11). Nenhum registro é removível.

## 10. Checklist antes de dar uma feature PAY como pronta

- [ ] Cálculos em centavos; soma dos rateios bate exatamente
- [ ] Operação de gateway é idempotente e testada com chamada repetida
- [ ] Domínio não importa nada de gateway específico
- [ ] Transição de estado passa pelo agregado (sem salto)
- [ ] Evento publicado no outbox, na MESMA transação da escrita
- [ ] Entrada no ledger para o fato financeiro
- [ ] Auditoria com correlation + idempotency key
- [ ] Nenhum dado de cartão persistido ou logado
