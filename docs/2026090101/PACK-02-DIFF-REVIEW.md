# PACK-02 — Diff Review

> **Commit da implementação**: `25d8cb1` — "PACK-02: fundacao comercial -- modelo de preco e Trust Fee (v1.0)"
> **Commit da correção do teste e2e**: `754e95f` — "fix(test): pack-02 e2e esperava nivel BRONZE e checava status do publish" (só teste, sem código de produção)
> **Commit final revisado**: `754e95f` (HEAD de `main`)
> **Spec**: `docs/2026090101/TRUST_PACK-02_Commercial_Amount_and_Fee_Foundation_v1.0.md`
> **Baseline**: PACK-00 v1.1 + PACK-01 (implementados e aprovados)
> **Revisor**: revisão técnica assistida (Claude), linha a linha do diff completo
> **Data**: 2026-09-02

## A. Veredito Executivo

✅ **PACK-02 DIFF APROVADO — SEGURO PARA FECHAR, validação e2e efetivamente concluída**

O diff implementa exatamente o que a spec pede — modelo comercial FIXED_PRICE/HOURLY, Trust Fee configurável e snapshot econômico imutável — sem tocar em nenhuma linha do módulo `payment` e sem introduzir nenhum item fora de escopo (§19). Zero achados críticos no código de produção.

**Atualização 2026-09-02 — pós-execução real do e2e**: a ressalva original desta seção (e2e não executado por interferência de ambiente) foi resolvida por execução direta, fora do CI (que está bloqueado por um problema pré-existente não relacionado a este Pack — ver §J). Numa primeira tentativa completa, o Postgres embutido subiu normalmente e a suíte rodou até o fim — e **3 dos 4 casos de `pack-02.e2e.spec.ts` falharam de verdade**, não por ambiente. A causa raiz foi isolada com precisão: um bug no próprio arquivo de teste (`publishListing()` não esperava o Trust Score da identidade recém-criada atingir BRONZE, exigido pela categoria `HOME_REPAIRS`, e não verificava o status do `publish` — a falha ficava muda até estourar depois no `/contact`). Isso **contradiz a afirmação original desta revisão** de que o arquivo e2e estava "correto e completo" — não estava; a leitura manual não pegou essa dependência de nível de confiança porque ela não está em nenhuma linha do próprio arquivo, só se manifesta em runtime. Corrigido o teste (restrito a `pack-02.e2e.spec.ts`, nenhuma linha de domínio/aplicação/infraestrutura tocada), a suíte completa roda **57/57 suítes, 383/383 testes, 0 falhas** — detalhes em §F revisado.

## B. Arquivos revisados

**30 arquivos no diff** (12 novos + 18 modificados) + 2 documentos (spec original + completion report). Todos lidos integralmente nesta revisão, não apenas por amostragem.

| Camada | Arquivos |
|---|---|
| Domínio (entidades/serviços/exceções) | `marketplace-commercial-snapshot.ts`, `commercial-policy.ts`, `hourly-pricing.service.ts`, `marketplace-offer.ts`, `marketplace-order.ts`, `marketplace-types.ts`, `marketplace.exceptions.ts` |
| Aplicação (usecases/DTOs/mapper) | `accept-offer.usecase.ts`, `create-offer.usecase.ts`, `marketplace-offer.dtos.ts`, `marketplace-order.dtos.ts`, `marketplace.mapper.ts` |
| Infraestrutura (persistência) | `commercial-policy.schema.ts`, `marketplace-commercial-snapshot.schema.ts`, `marketplace-offer.schema.ts`, `marketplace-order.schema.ts`, `drizzle-commercial-policy.repository.ts`, `drizzle-marketplace-commercial-snapshot.repository.ts`, `drizzle-marketplace-offer.repository.ts`, `drizzle-marketplace-order.repository.ts`, `marketplace.module.ts`, `shared/database/schema/index.ts` |
| Migration | `0026_pack02_commercial_amount_and_fee.sql`, `drizzle/meta/_journal.json` |
| Testes | `marketplace-commercial-snapshot.spec.ts` (17), `hourly-pricing.service.spec.ts` (5), `marketplace-offer.spec.ts` (+casos), `marketplace-order.spec.ts` (+casos), `accept-offer.usecase.spec.ts` (+casos), `pack-02.e2e.spec.ts` (4) |

## C. Matriz de conformidade

Contra os requisitos explícitos da spec (§4 a §20). **33/33 PASS.**

| # | Requisito (seção) | Resultado |
|---|---|---|
| 1 | FIXED_PRICE preserva comportamento legado (§4.1) | PASS — default do enum, `amount` livre como sempre |
| 2 | HOURLY: valor inicial = `round(hourlyRate × minimumMinutes / 60)`, nunca livre (§4.2) | PASS — `calculateInitialHourlyAmount`; DTO nem aceita `amount` para HOURLY |
| 3 | `billingIncrementMinutes` configurável, default 30 (§4.2) | PASS — `CommercialPolicy.defaultBillingIncrementMinutes`, seed = 30 |
| 4 | Tempo adicional NÃO implementado (§4.2) | PASS — nenhum campo de elapsed/billable time no diff |
| 5 | Dinheiro em unidade menor/inteira, sem float (§5/§8) | PASS (ver nota D1 abaixo sobre a convenção de reais vs. centavos) |
| 6 | SERVICE fee-eligible (§5) | PASS — `trustFeeBaseAmount` inclui `serviceCents` sempre |
| 7 | MATERIAL_COST 0% fee, pass-through (§5) | PASS — excluído explicitamente do `feeBaseCents` |
| 8 | MATERIAL_MARKUP fee-capable (§5) | PASS — incluído no `feeBaseCents`; testado (`materialMarkupAmount` no fee base) |
| 9 | OTHER reservado, sem uso implícito (§5) | PASS — não existe nenhum caminho de código que produza `OTHER` |
| 10 | Taxa configurável, não hard-coded (§6) | PASS — `commercial_policies`, lida via `findActive()` |
| 11 | Trust Member não paga fee adicional (§6) | PASS — nenhum campo/cálculo toca no lado do buyer |
| 12 | PSP fee é componente distinto, não calculado aqui (§6) | PASS — `providerNetBeforePspFees` explicitamente antes de PSP |
| 13 | Snapshot congela pricingModel/currency/gross/service/fee/etc (§7) | PASS — todos os 13 campos do §7 presentes em `CommercialSnapshotProps` |
| 14 | Mudança de config depois não retroage (§7) | PASS — `restore()` só reidrata; testado explicitamente |
| 15 | `grossAmount = SERVICE + MATERIAL_COST + MATERIAL_MARKUP` (§8) | PASS |
| 16 | `trustFeeBaseAmount = SERVICE + MATERIAL_MARKUP` (§8) | PASS |
| 17 | `providerNetBeforePspFees = gross - fee` (§8) | PASS |
| 18 | Campos calculados persistidos, não recalculados depois (§8) | PASS — snapshot é insert-only, nunca recalculado por leitura |
| 19 | FIXED_PRICE proposal: amount+currency obrigatórios (§9.1) | PASS — Zod `superRefine` |
| 20 | HOURLY proposal: hourlyRate+minimumMinutes obrigatórios, incremento resolvido (§9.2) | PASS — `superRefine` + `resolveDefaultBillingIncrement()` |
| 21 | Contract Formation: policy resolvida na transação, snapshot calculado antes do Payment (§10) | PASS — tudo dentro de `db.transaction()` em `AcceptOfferUseCase`, antes do outbox publicar `MarketplaceOrder.Created` |
| 22 | Fee não recalculado em authorization/custody/release (§10/§11) | PASS — módulo `payment` **zero linhas alteradas** neste diff |
| 23 | `Payment.amount` == `grossAmount` congelado (§11) | PASS — `order.amount` já é o `grossAmount` (materialCost/markup sempre 0 no MVP) |
| 24 | Custódia PACK-01 seguindo o gross cheio (§11) | PASS — confirmado por leitura de código E por execução real (`pack-02.e2e.spec.ts` caso 3, `pack-01.e2e.spec.ts`) |
| 25 | Snapshot extensível para Change Orders futuros, sem implementá-los (§12) | PASS — nenhum campo de Change Order existe; comentário explícito documentando a extensão futura |
| 26 | Migration aditiva, sem retrofit de tenant_id (§13) | PASS |
| 27 | Todas as 8 regras de validação (§15) | PASS — ver detalhamento em §D |
| 28 | Auditoria da taxa efetiva e totais (§16) | PASS — `auditLogService.record` inclui `trustFeeRateBps/grossAmount/trustFeeAmount/providerNetBeforePspFees` |
| 29 | Nenhum evento novo; extensões retrocompatíveis (§17) | PASS — só `MarketplaceOffer.Created` ganha campos, todos opcionais/aditivos |
| 30 | Nenhum `TrustFee.Collected`/`Funds.Split` (§17) | PASS |
| 31 | Todos os itens de §19 fora de escopo, de fato ausentes | PASS — busca não encontrou nenhum vestígio de Change Order, timers, Pause, Asaas, split, etc. |
| 32 | i18n: nenhuma string nova hard-coded no domínio (§3) | PASS — mensagens de exceção em inglês, mesmo padrão do resto do backend (sem framework i18n no projeto, ver preflight #7 do completion report) |
| 33 | Preflight §14 executado e documentado antes de codar | PASS — 7/7 checagens registradas no completion report, nenhum bloqueio |

## D. Verificação detalhada das 8 regras de validação (§15)

| Condição | Onde é aplicada | Resultado |
|---|---|---|
| pricingModel não suportado → Reject | `assertTerms()`, ramo `else` | PASS |
| FIXED_PRICE sem amount válido → Reject | Zod `superRefine` + `assertTerms` (`amount > 0`) | PASS |
| HOURLY sem hourlyRate/minimumMinutes → Reject | Zod `superRefine` + `assertTerms` | PASS |
| `billingIncrementMinutes <= 0` → Reject | Zod (`.positive()`) + `assertTerms` (defesa em profundidade, dois níveis) | PASS |
| Componente financeiro negativo → Reject | `MarketplaceCommercialSnapshot.create` (`materialCostAmount < 0` / `materialMarkupAmount < 0`) | PASS |
| MATERIAL_COST classificado como fee base → Reject | Estruturalmente impossível — `feeBaseCents` nunca inclui `materialCostCents` no código, não é uma checagem em runtime | PASS (por construção) |
| Totais do snapshot inconsistentes → Reject antes do Payment | `feeAmountCents > feeBaseCents \|\| feeBaseCents > grossCents \|\| providerNetCents < 0` lança exceção **antes** do `outboxService.enqueue` de `MarketplaceOrder.Created` | PASS |
| Config de fee muda depois → snapshot existente intacto | Tabela append-only + `restore()` sem recálculo; testado explicitamente | PASS |

## E. Análise de dinheiro e limites de transação

**D1 — duas convenções de dinheiro coexistindo, e por que isso está correto.** O módulo `marketplace` trabalha em REAIS (`number`, schema `numeric(18,2)`) desde antes do PACK-02; o módulo `payment` trabalha em CENTAVOS (`Cents`) desde o PACK-01. PACK-02 **preserva** essa divisão em vez de unificá-la — os 4 campos novos em `marketplace_offers`/`marketplace_orders` seguem a convenção do marketplace (reais), e o cálculo do snapshot converte para centavos **só internamente**, dentro de `MarketplaceCommercialSnapshot.create()`, via `fromReais`/`toReais`/`applyBasisPoints` (utilitários do PACK-01, reusados sem alteração). Isso é consistente com a fronteira que já existe hoje entre os dois módulos (o consumer `pay.create-payment-on-order` já faz essa mesma conversão ao consumir `MarketplaceOrder.Created`). Não é uma inconsistência introduzida pelo Pack — é a convenção pré-existente, respeitada.

**D2 — transação única no Contract Formation.** `AcceptOfferUseCase` resolve a `CommercialPolicy`, calcula e persiste o snapshot **dentro da mesma `db.transaction()`** que já fechava a proposta, reservava o anúncio e criava o pedido (herdada do MRK-013). Não há uma segunda transação nem uma janela onde o pedido exista sem snapshot correspondente — `UNIQUE(order_id)` em `marketplace_order_commercial_snapshots` garante isso no nível do banco também.

**D3 — nenhuma race condition nova.** A leitura de `CommercialPolicyRepository.findActive()` dentro da transação usa o mesmo executor (`tx`) — não há leitura fora da transação que pudesse capturar uma política diferente da que efetivamente vale para aquele commit. Como a tabela é append-only (nunca `UPDATE`), não existe cenário de leitura suja mudando o resultado entre o início e o fim da transação.

**D4 — imutabilidade reforçada nos repositórios, não só no domínio.** Verifiquei os dois `onConflictDoUpdate` (`drizzle-marketplace-offer.repository.ts`, `drizzle-marketplace-order.repository.ts`): a cláusula `set` **exclui deliberadamente** `pricingModel`/`hourlyRateAmount`/`minimumMinutes`/`billingIncrementMinutes` — mesmo que alguém chame `save()` de novo sobre um offer/order já persistido, esses 4 campos nunca são reescritos. Isso é uma garantia a nível de infraestrutura, não só de invariante de domínio (que também existe: `update()` recusa mudar `amount` de uma oferta HOURLY).

## F. Achados

### Não-crítico — execução do e2e pendente de confirmação (residual desde o completion report)

**Resolvido em 2026-09-02 — atualização pós-execução real.** Esta seção originalmente classificava a execução do e2e como pendente e afirmava que `pack-02.e2e.spec.ts` estava "correto e completo" por leitura manual. Isso estava **errado**: rodei a suíte até o fim depois (Postgres embutido subiu normalmente, sem a interferência das tentativas anteriores) e **3 dos 4 casos falharam de verdade**.

Causa raiz isolada com confiança total (comparação direta com `mrk-001-008.e2e.spec.ts`, que exercita o mesmo endpoint `/contact` e passava): `publishListing()` publicava um anúncio na categoria `HOME_REPAIRS` (exige nível mínimo BRONZE — MRK-003 BR-002) para uma identidade **recém-criada, com score 0**, sem esperar o pipeline assíncrono do Trust Score calcular o nível, e sem verificar o status do `publish`. O anúncio ficava em `DRAFT`; o `/contact` seguinte rejeitava (só aceita `PUBLISHED`); o helper `openConversation()` quebrava com `TypeError: Cannot read properties of undefined (reading 'conversation')` ao tentar ler `.data.conversation` de uma resposta de erro. Um bug clássico de fixture de teste — não de leitura de código, é o tipo de dependência de runtime (ordem de eventos assíncronos) que revisão estática não pega.

**Correção aplicada — restrita a `pack-02.e2e.spec.ts`, nenhuma linha de produção tocada**: adicionado `waitForBronze()` (idêntico ao padrão já usado em `mrk-001-008.e2e.spec.ts` — tickar o relay até `trustScores.score >= 25`), chamado antes de cada `publish`; adicionada asserção explícita de `published.statusCode === 200` e `data.status === 'PUBLISHED'`, para que uma falha de publicação pare o teste ali, de forma clara, em vez de estourar de forma opaca depois no `/contact`.

**Resultado depois da correção**: `pnpm test:e2e` → **57/57 suítes, 383/383 testes, 0 falhas**. Os 4 casos de `pack-02.e2e.spec.ts` passam individualmente (incluindo os dois comportamentos que antes só tinham confirmação por leitura de código: `resolveDefaultBillingIncrement()`, exercitado indiretamente pelo caso HOURLY que usa o incremento default de 30min; e a integração ponta a ponta HTTP → snapshot → Payment, nos três casos). Os 3 casos de `pack-01.e2e.spec.ts` confirmam que não houve regressão.

**Lição para revisões futuras**: uma leitura manual de teste e2e pode confirmar a *forma* do teste (asserções corretas, dados corretos) mas não substitui a execução real quando o comportamento depende de estado assíncrono entre módulos (aqui, o pipeline Identity → TrustPassport → TrustScore). Marcar como "correto e completo" sem rodar foi a lição errada desta revisão — corrigido aqui, mas registrado para não repetir.

### Não-crítico — seed técnico de 10% pendente de validação de negócio

Mesmo padrão já aceito no PACK-01: `trustFeeRateBps = 1000` é um placeholder técnico para o MVP funcionar, não uma decisão de negócio validada pelo founder/Kondo. A arquitetura já suporta trocar isso sem migration nova (basta inserir uma linha em `commercial_policies`). Não bloqueia o fechamento do diff, mas bloqueia uso com dinheiro real.

### Observação — nenhum achado de correção, simplificação ou segurança

Não encontrei bugs de lógica, oportunidades de simplificação que valham a pena, nem problemas de segurança. Os pontos que poderiam parecer superfície de risco à primeira vista já estão cobertos:
- Não há injeção de SQL (Drizzle parametrizado em todo lugar).
- Não há endpoint novo exposto (nenhuma rota HTTP nova neste Pack).
- Não há dado sensível novo logado (a auditoria loga só valores monetários agregados, nunca PII adicional).
- Os asserts não-nulos em `create-offer.usecase.ts` (`body.hourlyRateAmount!`) são seguros porque o Zod `superRefine` já garante a presença desses campos antes do usecase rodar — mesmo padrão de outros DTOs do projeto.

## G. Migration

`0026_pack02_commercial_amount_and_fee.sql` — revisada linha a linha: `ADD COLUMN IF NOT EXISTS` com `DEFAULT 'FIXED_PRICE'` em ambas as tabelas existentes (nenhuma linha legada quebra); `CREATE TABLE IF NOT EXISTS` para as duas tabelas novas, com FK condicional (`DO $$ ... IF NOT EXISTS ...`) e índice único; seed condicionado a `WHERE NOT EXISTS (SELECT 1 FROM commercial_policies)`. Reexecutável com segurança, mesmo padrão das migrations 0024/0025. **PASS.**

## H. Cobertura de testes

| Camada | Confirmado por execução real |
|---|---|
| Unitários (domínio/serviço) | **309/309 verdes, 0 falhas** |
| Unitários novos do Pack | 17 (`marketplace-commercial-snapshot.spec.ts`) + 5 (`hourly-pricing.service.spec.ts`) — cobrem todos os 12 itens do §18.1 no nível de entidade/serviço |
| **Suíte completa com e2e** (`pnpm test:e2e`) | **383/383 testes, 57/57 suítes, 0 falhas** (2026-09-02, após corrigir o fixture — ver §F) |
| E2E do PACK-02 (§18.2) | **4/4 casos passando** — seed da política, FIXED_PRICE ponta a ponta, HOURLY ponta a ponta, regressão da custódia PACK-01 |
| E2E do PACK-01 | **3/3 casos passando** — sem regressão |

## I. Escopo

Busquei por vestígios de cada item de §19 (Change Order, Check-in/out, Pause, elapsed/billable/paused time, evidência de material, Service Summary, refund/dispute redesign, liberação parcial, Asaas, escrow/split/settlement, PSP fee, financiamento, Wallet, Coin, fee variável) — **nenhum encontrado**. O diff se limita exatamente ao que a spec descreve. Nenhuma linha do módulo `payment` foi tocada.

## J. CI do repositório (achado colateral, fora do escopo deste diff)

Ao tentar obter o resultado do e2e via CI antes de rodar localmente, encontrei que o pipeline do GitHub Actions falha no passo **Lint**, em `tools/extract-docx.mjs` (globals de Node — `process`/`Buffer`/`console` — não reconhecidos pela config do ESLint), antes de chegar em Typecheck/Test/Build. Confirmei via API do GitHub que essa falha **já existia no run do commit do PACK-01** (`2c9ec73`, anterior a este Pack) — não é uma regressão introduzida pelo PACK-02, e não há como o CI ter validado nenhum dos dois Packs até hoje. Fora do escopo deste diff corrigir; registrado aqui e no completion report (§9) para visibilidade. A validação e2e deste Pack (§F/§H) foi obtida por execução direta fora do CI.

## K. Recomendação final

**PACK-02 DIFF APROVADO — seguro para o Kondo revisar e fechar, validação e2e efetivamente concluída.** O código de produção — domínio, persistência, transação, migration — está correto, completo, consistente com PACK-00/PACK-01 e sem nenhum item fora de escopo. Nenhum achado crítico. A suíte completa (`pnpm test:e2e`) roda 383/383 testes verdes, incluindo os 4 casos do PACK-02 e a regressão de 3 casos do PACK-01, confirmado por execução real em 2026-09-02 — não resta nenhuma pendência de verificação de código para este Pack. As duas pendências que seguem abertas são de negócio/infra, não de código: (1) validar a taxa de 10% com o founder antes de dinheiro real, (2) o CI do repositório está bloqueado por um problema pré-existente não relacionado a este Pack (§J).
