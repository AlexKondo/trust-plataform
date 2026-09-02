# PACK-02 — Completion Report

> **Spec**: `docs/2026090101/TRUST_PACK-02_Commercial_Amount_and_Fee_Foundation_v1.0.md`
> **Escopo**: modelo comercial FIXED_PRICE/HOURLY + Trust Fee configurável + snapshot econômico imutável do contrato · **Data**: 2026-09-01
> **Status**: implementado, e2e confirmado verde (2026-09-02); aguardando revisão do diff (§21/§22).
>
> **Atualização 2026-09-02**: a suíte `pnpm test:e2e` foi executada até o fim (algo que a versão original deste relatório não conseguiu confirmar por interferência de ambiente — ver §6/§9 originais, mantidos abaixo para histórico). Na primeira execução completa, 3 dos 4 casos de `pack-02.e2e.spec.ts` falharam por um bug no **teste** (não no código de produção): `publishListing()` não esperava o pipeline assíncrono do Trust Score atingir BRONZE antes de publicar um anúncio na categoria `HOME_REPAIRS` (que exige esse nível mínimo), nem verificava o status do `publish` — a falha ficava silenciosa e só estourava, de forma opaca, no `/contact` seguinte. Corrigido em `apps/api/test/integration/pack-02.e2e.spec.ts` adicionando `waitForBronze()` (mesmo padrão de `mrk-001-008.e2e.spec.ts`) e asserção explícita do status/resultado do `publish`. **Nenhum código de domínio ou de produção do PACK-02 foi alterado.** Depois da correção, `pnpm test:e2e` roda **57/57 suítes, 383/383 testes verdes, 0 falhas**, incluindo os 4 casos do PACK-02 e os 3 do PACK-01 (regressão). Detalhes em `PACK-02-DIFF-REVIEW.md` §F.

## 1. Preflight (§14)

Todas as sete checagens foram feitas **antes** de qualquer alteração de código:

| # | Verificação | Resultado |
|---|---|---|
| 1 | Campos de amount em Proposal/Order/Payment e sua representação | ✅ `marketplace_offers`/`marketplace_orders`/`payments` = `numeric(18,2)` **em reais** no schema; o domínio de `MarketplaceOffer`/`MarketplaceOrder` também trabalha em **reais** (`number`), diferente do domínio `Payment`, que trabalha em **centavos** (`Cents`) — conversão só na fronteira via `fromReais`/`toReais` (`create-payment.consumer.ts`) |
| 2 | Evento/use case que cria o Payment após aceite | ✅ `AcceptOfferUseCase` publica `MarketplaceOrder.Created` → `CreatePaymentOnOrderConsumer` cria o Payment. Confirmado: PACK-02 **não** reintroduz `MarketplaceOrder.CustomerConfirmed` como gatilho (essa é a decisão INCONSISTENCIAS P1, intocada) |
| 3 | Seed de 1000 bp existente | ✅ **Não existe** nenhum seed de fee ativo hoje — `applyBasisPoints`/`splitAmount` (`shared/money/money.ts`) são utilitários genéricos sem nenhum caller de produção. Não é um conflito com decisão existente, é ausência de decisão — tratado como seed técnico novo (ver D5) |
| 4 | Proposal já suporta fixed/hourly? | ❌ Não — `MarketplaceOffer` só tinha `amount` livre (implicitamente FIXED_PRICE). PACK-02 introduziu `pricingModel` com default `FIXED_PRICE` para preservar 100% o comportamento existente |
| 5 | Helper de rounding/percentual existente | ✅ `applyBasisPoints(cents, bps)` em `shared/money/money.ts` — reusado integralmente, nenhuma lógica de arredondamento nova foi criada |
| 6 | PACK-01 (custódia/liberação) independente do cálculo de fee | ✅ Confirmado por leitura de `hold-funds.usecase.ts`: a custódia copia `payment.amountCents` sem nenhum cálculo de fee. PACK-02 **não tocou** em nenhum arquivo do módulo `payment` |
| 7 | Mecanismo de i18n existente | ✅ Não existe framework de i18n (nem next-intl/i18next) — só mapas manuais enum→PT-BR (`apps/web/lib/labels.ts`, `notification-labels.ts`). PACK-02 não precisou de nenhuma string nova user-facing além de mensagens de exceção (mesmo padrão do resto do backend, em inglês, traduzidas na camada de apresentação) |

Nenhum item foi bloqueado por preflight — nenhum conflito real com decisão de negócio existente foi encontrado.

## 2. Implementado

**Modelo comercial da proposta (§4/§9).** `MarketplaceOffer` ganha `pricingModel` (`FIXED_PRICE` | `HOURLY`), imutável após a criação:
- **FIXED_PRICE** (default — comportamento legado 100% preservado): cliente informa `amount` livremente, como sempre foi.
- **HOURLY**: cliente informa `hourlyRateAmount` + `minimumMinutes` (+ opcionalmente `billingIncrementMinutes`); o `amount` inicial é **sempre derivado** — `calculateInitialHourlyAmount()` calcula `round(hourlyRateCents × minimumMinutes / 60)` inteiramente em centavos — o cliente nunca propõe um valor livre para HOURLY. `billingIncrementMinutes`, quando omitido, resolve da `CommercialPolicy` vigente (seed MVP: 30min).

**Trust Fee configurável (§6).** Nova tabela `commercial_policies`, append-only por design (nunca `UPDATE` — cada mudança é uma linha nova; a política vigente é sempre a de `created_at` mais recente). Isso por si só satisfaz a exigência de auditabilidade de mudanças futuras de configuração global (§16): o histórico é a própria tabela.

**Snapshot econômico imutável (§7/§8) — o coração do Pack.** No aceite da proposta (`AcceptOfferUseCase`, MRK-013 — "Contract Formation"), na MESMA transação que já cria o `MarketplaceOrder`:
1. Resolve a `CommercialPolicy` vigente.
2. Calcula `MarketplaceCommercialSnapshot.create(...)`: `grossAmount = SERVICE + MATERIAL_COST + MATERIAL_MARKUP`; `trustFeeBaseAmount = SERVICE + MATERIAL_MARKUP` (MATERIAL_COST fica de fora — pass-through, 0% fee); `trustFeeAmount = applyBasisPoints(trustFeeBaseAmount, rate)`; `providerNetBeforePspFees = grossAmount − trustFeeAmount`. Todo o cálculo acontece em **centavos** (`fromReais`/`toReais`), evitando erro de ponto flutuante.
3. Persiste o snapshot (`marketplace_order_commercial_snapshots`, 1:1 com o pedido, append-only).
4. Audita a taxa efetiva e os totais calculados.

No MVP, `materialCostAmount`/`materialMarkupAmount` são sempre `0` (PACK-02 não implementa evidência/compra de material — §5/§19), então `grossAmount === serviceAmount === order.amount` sempre. Isso significa que **nenhuma linha do módulo `payment` precisou mudar**: o Payment já nasce com o `grossAmount` correto porque `order.amount` já é o valor certo, por construção.

## 3. Arquivos alterados

**Novos (12 arquivos)**

| Arquivo | Papel |
|---|---|
| `marketplace/domain/entities/commercial-policy.ts` | value/read-model da política vigente |
| `marketplace/domain/entities/marketplace-commercial-snapshot.ts` | agregado do snapshot, cálculo determinístico |
| `marketplace/domain/repositories/commercial-policy.repository.ts` | port |
| `marketplace/domain/repositories/marketplace-commercial-snapshot.repository.ts` | port |
| `marketplace/domain/services/hourly-pricing.service.ts` | função pura: valor inicial HOURLY |
| `marketplace/infrastructure/persistence/commercial-policy.schema.ts` | schema Drizzle `commercial_policies` |
| `marketplace/infrastructure/persistence/marketplace-commercial-snapshot.schema.ts` | schema Drizzle do snapshot |
| `marketplace/infrastructure/persistence/drizzle-commercial-policy.repository.ts` | adapter (`findActive` = `ORDER BY created_at DESC LIMIT 1`) |
| `marketplace/infrastructure/persistence/drizzle-marketplace-commercial-snapshot.repository.ts` | adapter (insert puro, append-only) |
| `marketplace-commercial-snapshot.spec.ts` | 17 testes unitários |
| `hourly-pricing.service.spec.ts` | 5 testes unitários |
| `test/integration/pack-02.e2e.spec.ts` | 4 testes e2e |
| `drizzle/0026_pack02_commercial_amount_and_fee.sql` | migration |

**Modificados (18 arquivos)**

| Arquivo | Mudança |
|---|---|
| `marketplace/domain/entities/marketplace-types.ts` | + `PRICING_MODEL`/`PricingModel`/`PRICING_MODELS` |
| `marketplace/domain/entities/marketplace-offer.ts` | + `pricingModel`/`hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes`; validação em `assertTerms`; guarda em `update()`; herança em `counter()` |
| `marketplace/domain/entities/marketplace-order.ts` | + os mesmos 4 campos, copiados do offer em `createFromOffer()` |
| `marketplace/domain/exceptions/marketplace.exceptions.ts` | + `MarketplaceCommercialSnapshotValidationException`, `CommercialPolicyNotConfiguredException` |
| `marketplace/application/dto/marketplace-offer.dtos.ts` | `createOfferRequestSchema` ganha `pricingModel`/`hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes` + `superRefine` condicional; `OfferResponse` estendido |
| `marketplace/application/dto/marketplace-order.dtos.ts` | `OrderResponse` estendido com os 4 campos |
| `marketplace/application/mapper/marketplace.mapper.ts` | `toOfferResponse`/`toOrderResponse` propagam os campos novos |
| `marketplace/application/usecases/create-offer.usecase.ts` | resolve `pricingModel`, deriva `amount` para HOURLY, resolve `billingIncrementMinutes` default |
| `marketplace/application/usecases/accept-offer.usecase.ts` | **Contract Formation**: resolve policy + calcula + persiste snapshot na mesma transação |
| `marketplace/infrastructure/persistence/marketplace-offer.schema.ts` | + 4 colunas |
| `marketplace/infrastructure/persistence/marketplace-order.schema.ts` | + 4 colunas |
| `marketplace/infrastructure/persistence/drizzle-marketplace-offer.repository.ts` | persiste os 4 campos novos (insert-only, imutáveis) |
| `marketplace/infrastructure/persistence/drizzle-marketplace-order.repository.ts` | idem |
| `marketplace/marketplace.module.ts` | wiring dos 2 repositórios novos |
| `shared/database/schema/index.ts` | export dos 2 schemas novos |
| `marketplace-offer.spec.ts` / `marketplace-order.spec.ts` / `accept-offer.usecase.spec.ts` | testes estendidos |
| `drizzle/meta/_journal.json` | registro da migration 0026 |

## 4. Migration

`0026_pack02_commercial_amount_and_fee.sql` — **aditiva e não destrutiva**: `ADD COLUMN IF NOT EXISTS` em `marketplace_offers`/`marketplace_orders` (4 colunas cada, `pricing_model` com `DEFAULT 'FIXED_PRICE'` — nenhuma linha existente quebra); `CREATE TABLE IF NOT EXISTS` para `commercial_policies` e `marketplace_order_commercial_snapshots` (com FK condicional e índice único); seed do MVP condicionado a `WHERE NOT EXISTS (SELECT 1 FROM commercial_policies)` — reexecutável sem duplicar. Nenhuma tabela de `payment` foi tocada.

## 5. APIs/Events

Nenhum endpoint novo. `OfferResponse`/`OrderResponse` (endpoints já existentes: criar/aceitar proposta, listar/detalhar pedido) ganham os 4 campos comerciais.

Nenhum evento novo criado (§17 respeitado). `MarketplaceOffer.Created` ganha campos retrocompatíveis (`pricingModel`, `hourlyRateAmount`, `minimumMinutes`, `billingIncrementMinutes`). `MarketplaceOrder.Created`/`Payment.Created`/`Payment.Authorized` permanecem **byte-a-byte inalterados** — nenhum evento de Trust Fee (`TrustFee.Collected`) ou split foi criado, conforme exigido.

## 6. Testes

| Camada | Resultado |
|---|---|
| Unitários novos (PACK-02) | 17 (`marketplace-commercial-snapshot.spec.ts`) + 5 (`hourly-pricing.service.spec.ts`) = **22** |
| Unitários estendidos | `marketplace-offer.spec.ts` (31 testes, incl. novos casos de pricing), `marketplace-order.spec.ts` (17), `accept-offer.usecase.spec.ts` (9, incl. verificação do snapshot) |
| E2E novos (PACK-02) | 4 (`pack-02.e2e.spec.ts`) — seed da política, fluxo FIXED_PRICE completo, fluxo HOURLY completo, regressão PACK-01 |
| **Suíte unitária completa** (`pnpm test`) | **309 testes / 37 suítes verdes, 0 falhas** |
| Typecheck (`pnpm typecheck`) | **limpo, 0 erros** |
| **Suíte completa com e2e** (`pnpm test:e2e`, confirmado 2026-09-02) | **383 testes / 57 suítes verdes, 0 falhas** — inclui os 4 casos de `pack-02.e2e.spec.ts` e os 3 de `pack-01.e2e.spec.ts` (regressão) |

Os testes cobrem todos os itens do §18.1: cálculo FIXED_PRICE, cálculo HOURLY a partir de rate/duração, incremento de 30min resolvido por configuração (não hard-coded), incremento customizado persistido, taxa lida de configuração e congelada (mudança de política não afeta snapshot já criado), SERVICE fee-eligible, MATERIAL_COST excluído da base, MATERIAL_MARKUP incluído, arredondamento determinístico em centavos, `providerNetBeforePspFees`, rejeição de valores negativos/inconsistentes — e, agora confirmado por execução real (não só leitura de código), os itens de §18.2: proposta aceita → snapshot congelado → Payment com `grossAmount` correto (FIXED_PRICE e HOURLY), e custódia do PACK-01 segurando o valor cheio sem recalcular fee.

**Histórico da execução do e2e (mantido para rastreabilidade)**: a primeira tentativa de rodar `pnpm test:e2e` neste ambiente Windows local não completou — o `initdb` do Postgres embutido tinha arquivos apagados no meio da própria escrita (padrão de interferência externa, não relacionado ao código). Numa segunda rodada, o Postgres embutido subiu normalmente e a suíte completou, revelando 3 falhas reais em `pack-02.e2e.spec.ts` — não por interferência de ambiente, mas por um bug no próprio arquivo de teste (ver nota no topo deste documento e `PACK-02-DIFF-REVIEW.md` §F). Corrigido o teste, a suíte completa roda 100% verde — ver linha da tabela acima.

## 7. Critérios de aceite (§20)

| Critério | Resultado |
|---|---|
| FIXED_PRICE e HOURLY representados sem quebrar o fluxo existente | PASS |
| Incremento HOURLY configurável e congelado por contrato; default 30min | PASS |
| Uma taxa Trust Fee configurável, sem hard-code de negócio | PASS |
| Snapshot econômico inicial imutável e auditável | PASS |
| Trust Fee calculado só sobre componentes fee-eligible | PASS |
| MATERIAL_COST pass-through excluído do Trust Fee | PASS |
| `grossAmount` do Payment bate com o snapshot congelado | PASS |
| Comportamento de custódia/liberação do PACK-01 inalterado | PASS |
| Nenhum workflow de PSP/split/refund/change-order introduzido | PASS |
| Todos os testes (existentes + novos) passam | PASS — 383/383 testes verdes (`pnpm test:e2e`), confirmado por execução real em 2026-09-02 (§6) |

## 8. Desvios e decisões

**D1 — Convenção de dinheiro dupla, preservada de propósito.** O módulo marketplace já trabalha em REAIS (`number`) no domínio/schema (`numeric(18,2)`), diferente do módulo payment, que trabalha em CENTAVOS (`Cents`) no domínio. Em vez de forçar uma convenção nova sobre o marketplace (o que exigiria migrar `MarketplaceOffer`/`MarketplaceOrder` inteiros, fora de escopo), PACK-02 preservou a convenção existente nos campos novos e faz a conversão para centavos **só internamente**, dentro do cálculo do snapshot (`fromReais`/`toReais`/`applyBasisPoints`) — o mesmo padrão de fronteira que já existe entre marketplace e payment hoje.

**D2 — HOURLY: `amount` é sempre derivado, nunca aceito do cliente.** A spec exige que o valor inicial seja "deterministicamente derivável" de `hourlyRateAmount`/`minimumMinutes` (§9.2). Em vez de aceitar um `amount` do cliente e validar que bate com o cálculo, a proposta HOURLY simplesmente não aceita `amount` como input — elimina de raiz qualquer possibilidade de divergência cliente/servidor.

**D3 — `update()`/`counter()` de ofertas HOURLY: escopo deliberadamente contido.** A spec não trata negociação (MRK-010/012) de ofertas HOURLY. Decisão: `update()` recusa mudar `amount` diretamente numa oferta HOURLY (o valor é derivado — quem quiser outro precisa retirar e propor de novo); `quantity`/`expiresAt`/`notes` continuam editáveis normalmente. `counter()` sempre herda `pricingModel` e os termos hourly do offer pai (igual ao que já acontece com `currency`) — não é possível contrapropor um `amount` livre quando ele é calculado. Isso não é um conflito de negócio, é uma decisão de escopo menor deliberada, documentada aqui em vez de adivinhada.

**D4 — Onde mora a política de Trust Fee.** Não existe hoje nenhuma tabela de configuração comercial no projeto (o `trust_rules` do Trust Score é de outro domínio — reputação, não comissão — não foi reaproveitado). `commercial_policies` foi criada do zero, dentro do módulo marketplace (onde o snapshot nasce, no aceite da proposta), append-only por design — cada mudança de taxa é uma linha nova, nunca um `UPDATE`, o que satisfaz a auditabilidade exigida (§16) sem precisar de nenhuma infraestrutura de audit extra.

**D5 — Seed técnico de 10% (1000 bps) + 30min.** A spec deliberadamente não define qual percentual cobrar — é uma decisão de produto que só o founder/Kondo pode tomar. Seguindo o mesmo precedente já aceito no PACK-01 (seed técnico de 10%, "não usado como regra de negócio"), a migration semeia `trustFeeRateBps = 1000` como **placeholder técnico** para o MVP funcionar de ponta a ponta — não é uma decisão de negócio validada. A arquitetura é 100% configurável (basta inserir uma nova linha em `commercial_policies`); nenhuma parte do domínio depende desse valor específico.

**D6 — Onde calcular o fee: marketplace, não payment.** A spec exige que o snapshot esteja congelado ANTES da criação do Payment (§10 passo 6). Como o Payment nasce reativamente a partir de `MarketplaceOrder.Created` (evento já existente, disparado dentro do `AcceptOfferUseCase`), o cálculo do snapshot só pode acontecer no momento do aceite da oferta — dentro do módulo marketplace. Isso preserva a direção de dependência já estabelecida no PACK-01 (D4 daquele pack: "Marketplace continua sem conhecer Payments; a direção contrária segue só por evento") e evita qualquer mudança no módulo payment.

**D7 — bug de teste encontrado e corrigido depois do fechamento inicial deste relatório (2026-09-02).** A execução real de `pnpm test:e2e` (pendente na versão original deste documento) revelou que `pack-02.e2e.spec.ts` publicava anúncios na categoria `HOME_REPAIRS` (que exige nível mínimo BRONZE, MRK-003 BR-002) sem esperar o pipeline assíncrono do Trust Score calcular esse nível para a identidade recém-criada, e sem verificar o status do `publish` — a falha ficava silenciosa e só estourava, de forma opaca, na chamada seguinte a `/contact`. Corrigido adicionando `waitForBronze()` (mesmo padrão já usado em `mrk-001-008.e2e.spec.ts`) e asserção explícita de `published.statusCode`/`data.status` antes de prosseguir. Mudança **restrita ao arquivo de teste**; nenhuma linha de domínio, aplicação ou infraestrutura do PACK-02 foi tocada. Os 4 casos do Pack passam sem alteração na lógica que estavam validando.

## 9. Pendências conhecidas

1. **Confirmação da taxa Trust Fee real** — o seed de 1000 bps (D5) precisa de validação de negócio do founder/Kondo antes de qualquer uso com dinheiro real (mesma pendência já registrada para o seed técnico do PACK-01).
2. ~~Execução do `pnpm test:e2e` neste ambiente~~ — **resolvido em 2026-09-02**: suíte completa (57/57 suítes, 383/383 testes) confirmada verde após corrigir um bug no arquivo de teste `pack-02.e2e.spec.ts` (faltava esperar o pipeline assíncrono do Trust Score atingir BRONZE antes de publicar; nenhum código de produção foi alterado). Ver §6 e `PACK-02-DIFF-REVIEW.md` §F.
3. **CI do repositório está quebrado por um motivo não relacionado a este Pack** — o pipeline falha no passo de Lint, em `tools/extract-docx.mjs` (globals de Node não reconhecidos pelo ESLint), antes mesmo de chegar no Typecheck/Test/Build. Confirmado que essa falha já existia no commit do PACK-01 (anterior a este Pack), então não é uma regressão introduzida aqui — mas significa que o CI não valida nenhum Pack recente. Fora do escopo desta entrega corrigir; registrado para visibilidade.
4. **PACK-03 (Change Orders)** — o snapshot já está desenhado para ser estendido (`approvedChangeOrders[]` futuro, §12), mas nenhum campo de Change Order existe ainda — proposital.
5. **Material cost/markup** — arquitetura suporta (`materialCostAmount`/`materialMarkupAmount` já existem no snapshot e são fee-classificados corretamente), mas nenhuma oferta hoje captura esses valores (sempre 0) — evidência/compra de material é escopo futuro (§19).

## 10. Fora de escopo (confirmado, §19)

Nada de Trust Change Order, Check-in/Check-out/Trust Pause, elapsed/billable/paused time, evidência de material, Service Summary, cancelamento/reembolso/disputa redesenhada, liberação parcial, Asaas, escrow/split/settlement real, taxa de PSP, financiamento parcelado, Trust Wallet/Coin, fee variável por nível/categoria/plano/volume/campanha.

## 11. Commit

| Commit | Conteúdo |
|---|---|
| `25d8cb1` | Implementação do PACK-02 (domínio, persistência, migration 0026, testes unitários e e2e) |
| `754e95f` | Correção do fixture de teste e2e (`pack-02.e2e.spec.ts` — D7 acima); nenhum código de produção alterado |

`main` está com a suíte completa verde (`pnpm test:e2e` — 383/383 testes) no commit `754e95f`. Aguardando revisão do diff pelo Kondo (mesmo fluxo do PACK-00/PACK-01).
