# PACK-03 — Completion Report

**Trust Change Order & Time Billing — v1.0**
Implementado em 2026-09-02. Autoridade seguida: PACK-03 > PACK-02 > PACK-01 > PACK-00 > código/testes atuais.

---

## 1. Preflight (§23)

Rodado **antes** de qualquer linha de código. Resultado item a item:

| # | Verificação | Resultado |
|---|---|---|
| 1 | Snapshot imutável do PACK-02 | `marketplace_order_commercial_snapshots` (1 por pedido, `UNIQUE(order_id)`), entidade `MarketplaceCommercialSnapshot` — `restore()` só reidrata, nunca recalcula. Totais expostos por getters. |
| 2 | `pricingModel`, `hourlyRateAmount`, `minimumMinutes`, `billingIncrementMinutes` | Congelados em **dois** lugares: no snapshot e no próprio `marketplace_orders` (cópia do offer aceito, MRK-017 BR-001). O PACK-03 lê **sempre do snapshot** (§8). |
| 3 | Payment / autorização incremental | **CONFLITO — item parado e reportado.** Ver §9 deste relatório. |
| 4 | Trust Evidence / storage | **CONFLITO PARCIAL — resolvido com decisão do Kondo.** Ver §9. |
| 5 | Estados de execução e `CustomerConfirmed` | Máquina de 13 estados intacta; `MarketplaceOrder.CustomerConfirmed` é o gatilho de LIBERAÇÃO (PACK-01), não de criação de Payment. Preservado. |
| 6 | Autorização comprador/vendedor | `OrderLifecycleService.loadForSeller/loadForBuyer/loadForParticipant` — reaproveitados sem alteração. |
| 7 | Idempotência/concorrência | Padrões existentes: transição pelo aggregate + índices únicos + dedupe de consumer `(consumerName, eventId)`. O PACK-03 acrescenta um compare-and-set no status (§19). |
| 8 | Auditoria | `AuditLogService.record` (transacional) e `recordSafe` (leitura). Usados nos dois modos. |
| 9 | Convenção monetária | Domínio em **centavos** (`shared/money/money.ts`), banco `numeric(18,2)` em reais, API em reais. Seguida à risca. |
| 10 | Check-in/check-out já existente | **SIM — existe** (MRK-020/021): `order.start()` / `order.completeExecution()` + `ExecutionEvent` append-only. **Reaproveitado, não reimplementado.** |
| 11 | i18n / erros | Mensagens em inglês com `code` estável; tradução no frontend (`lib/labels.ts`). Mantido. |
| 12 | CI | Baseline antes do Pack: **309 testes verdes** (74 e2e pulados por falta de `TEST_DATABASE_URL`). Lint com **os 4 erros pré-existentes** em `tools/extract-docx.mjs` — fora de escopo por §23.12, não tocados. |

---

## 2. Implementado

- **Trust Change Order** completo: 4 tipos (`ADDITIONAL_TIME`, `SCOPE_CHANGE`, `MATERIAL`, `MIXED`), 6 estados, proposta pelo Partner e decisão exclusiva do Member.
- **Cálculo econômico do delta** com a **taxa congelada do contrato**, custo de material como pass-through (0% fee) e markup fee-eligible, sempre separados.
- **Total autorizado corrente** derivado (snapshot inicial + aprovados), sem nenhum campo acumulador — o que resolve "aplicar o delta exatamente uma vez" por construção.
- **Sessão de execução por tempo**: check-in, pausa, retomada, check-out, com tempo decorrido / pausado / ativo / **faturável** separados.
- **Teto e piso do faturável**: nunca acima do autorizado, nunca abaixo do mínimo contratado.
- **Evidência de Change Order** com storage próprio, reaproveitando a abstração promovida ao shared kernel.
- **Service Summary** reconciliando "contratado + aprovado depois = total", com recorte explícito do que está e do que não está em custódia.
- **3 eventos de Change Order + 2 de execução**, envelope canônico do PACK-00, e 3 regras de notificação.

---

## 3. Files Changed

**Novos (18)**

```
apps/api/drizzle/0027_pack03_change_order_and_time_billing.sql
apps/api/src/shared/storage/evidence-storage.service.ts
apps/api/src/shared/storage/supabase-evidence-storage.service.ts
apps/api/src/shared/storage/storage.module.ts
apps/api/src/modules/marketplace/domain/entities/trust-change-order.ts
apps/api/src/modules/marketplace/domain/entities/trust-change-order.spec.ts
apps/api/src/modules/marketplace/domain/entities/service-execution-session.ts
apps/api/src/modules/marketplace/domain/entities/service-execution-session.spec.ts
apps/api/src/modules/marketplace/domain/services/authorized-commercial.service.ts
apps/api/src/modules/marketplace/domain/services/authorized-commercial.service.spec.ts
apps/api/src/modules/marketplace/domain/repositories/trust-change-order.repository.ts
apps/api/src/modules/marketplace/domain/repositories/service-execution.repository.ts
apps/api/src/modules/marketplace/application/dto/trust-change-order.dtos.ts
apps/api/src/modules/marketplace/application/mapper/trust-change-order.mapper.ts
apps/api/src/modules/marketplace/application/usecases/manage-change-order.usecase.ts
apps/api/src/modules/marketplace/application/usecases/service-execution.usecase.ts
apps/api/src/modules/marketplace/infrastructure/api/marketplace-change-order.controller.ts
apps/api/src/modules/marketplace/infrastructure/persistence/trust-change-order.schema.ts
apps/api/src/modules/marketplace/infrastructure/persistence/service-execution.schema.ts
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-trust-change-order.repository.ts
apps/api/src/modules/marketplace/infrastructure/persistence/drizzle-service-execution.repository.ts
apps/api/test/integration/pack-03.e2e.spec.ts
docs/2026090202/PACK-03-COMPLETION-REPORT.md
```

**Alterados (12)**

| Arquivo | O quê |
|---|---|
| `marketplace-types.ts` | Enums e transições do Change Order, da sessão e dos motivos de pausa |
| `marketplace.exceptions.ts` | 10 exceções novas com `code` estável |
| `manage-order.usecase.ts` | Check-in cria a sessão e check-out a fecha, **na mesma transação** dos marcos existentes |
| `marketplace.module.ts` | Controller, 2 use cases e 2 repositórios |
| `app.module.ts` | `StorageModule` (global) |
| `verification.module.ts` / `submit-evidence.usecase.ts` | Passam a consumir o port de storage do shared kernel, com o bucket declarado na chamada |
| `shared/database/schema/index.ts` | Registro dos 2 schemas novos |
| `notification-rules.ts` | 3 regras `ntf.change-order-*` |
| `drizzle/meta/_journal.json` | Entrada da migration 0027 |
| `docs/openapi.yaml` | 10 paths novos (11 operações) |
| `docs/event-catalog.md` | 5 eventos novos + nota das adições retrocompatíveis |

**Removidos (2)** — movidos para o shared kernel, sem mudança de comportamento:
`modules/verification/domain/services/evidence-storage.service.ts` e `modules/verification/infrastructure/storage/supabase-evidence-storage.service.ts`.

---

## 4. Migrations

`0027_pack03_change_order_and_time_billing.sql` — **aditiva, não destrutiva e reexecutável** (só `CREATE TABLE IF NOT EXISTS`, índices condicionais e FKs guardadas por `DO $$ ... information_schema`). Nenhum `ALTER` destrutivo, nenhum `DROP`, nenhum `tenant_id`. **Não toca em `marketplace_order_commercial_snapshots`.**

4 tabelas:

| Tabela | Papel | Garantia no banco |
|---|---|---|
| `trust_change_orders` | A mudança comercial e seus deltas congelados | Índices por pedido, status e proponente |
| `trust_change_order_evidences` | Metadados da evidência (binário no storage) | FK para o Change Order |
| `service_execution_sessions` | Tempo da execução | `UNIQUE(order_id)` — uma sessão por pedido no MVP |
| `service_execution_pauses` | Interrupções não faturáveis | **Índice parcial `UNIQUE(session_id) WHERE resumed_at IS NULL`** — impossível ter duas pausas abertas |

---

## 5. APIs e Eventos

**10 rotas novas** (nenhuma duplica endpoint existente — check-in e check-out continuam em `/start` e `/complete`):

```
POST   /api/v1/marketplace/orders/{orderId}/change-orders          201  (Partner)
GET    /api/v1/marketplace/orders/{orderId}/change-orders          200  (participantes)
GET    /api/v1/marketplace/change-orders/{id}                      200  (participantes)
POST   /api/v1/marketplace/change-orders/{id}/submit               200  (Partner)
POST   /api/v1/marketplace/change-orders/{id}/approve              200  (Member)
POST   /api/v1/marketplace/change-orders/{id}/reject               200  (Member)
POST   /api/v1/marketplace/change-orders/{id}/cancel               200  (Partner)
POST   /api/v1/marketplace/change-orders/{id}/evidences            201  (Partner, multipart)
POST   /api/v1/marketplace/orders/{orderId}/pause                  200  (Partner)
POST   /api/v1/marketplace/orders/{orderId}/resume                 200  (Partner)
GET    /api/v1/marketplace/orders/{orderId}/service-summary        200  (participantes)
```

**5 eventos novos**, envelope canônico do PACK-00 (`eventType` + `aggregateType`/`aggregateId`):

- `TrustChangeOrder.Submitted` / `.Approved` / `.Rejected` — agregado `TrustChangeOrder`
- `ServiceExecution.Paused` / `.Resumed` — agregado `ServiceExecutionSession`

**Nenhum evento para `DRAFT` nem para `CANCELLED`**: não mudam valor autorizado, e §22 proíbe evento por escrita de banco.

**Duas adições retrocompatíveis** em eventos existentes (§22): `MarketplaceOrder.Started` ganhou `sessionId`; `MarketplaceOrder.ExecutionCompleted` ganhou `sessionId`, `elapsedMinutes`, `pausedMinutes`, `billableMinutes` e `authorizedMinutes`. **`actualDuration` não foi redefinido** — continua sendo o tempo decorrido, para não reescrever o significado de pedidos já concluídos.

---

## 6. Modelo financeiro e de tempo

**Dinheiro** (tudo em centavos, arredondamento determinístico):

```
changeGross    = serviceDelta + materialCostDelta + materialMarkupDelta
changeFeeBase  = serviceDelta + materialMarkupDelta        (custo fica FORA)
changeFee      = applyBasisPoints(changeFeeBase, trustFeeRateBps DO CONTRATO)
changeNet      = changeGross - changeFee

currentGross   = initialGross + Σ(changeGross dos APROVADOS)
```

Em `ADDITIONAL_TIME` o `serviceDelta` é **derivado**, nunca informado:
`round(hourlyRateCents × minutos / 60)`, com minutos obrigatoriamente múltiplos do `billingIncrementMinutes` congelado. O exemplo da spec fecha exato: R$150/h, 30 min → **R$75**, fee 10% → **R$7,50**.

**Tempo**:

```
elapsed    = checkOut − checkIn
paused     = Σ(pausas fechadas)
rawActive  = elapsed − paused
authorized = minimumMinutes + Σ(minutos dos ADDITIONAL_TIME aprovados)
billable   = min( max(rawActive, minimumMinutes), authorized )
```

O **teto** é o autorizado (presença não vira cobrança). O **piso** é o mínimo contratado, porque ele já foi pago na contratação e devolver valor é reembolso — fora de escopo (§4.2). Em `FIXED_PRICE`, `billable` é `null`: ali o tempo é registro operacional, não moeda.

---

## 7. Testes e Resultados

**Suíte completa contra Postgres embutido descartável (`pnpm test:e2e`)**:
**61 arquivos / 441 testes — todos verdes** (390 s). Baseline antes do Pack: 57 arquivos / 383 testes.
São **+4 arquivos e +58 testes**, sem nenhuma regressão.

`pnpm typecheck` limpo. `pnpm lint` com **exatamente** os 4 erros pré-existentes de
`tools/extract-docx.mjs` — nenhum erro novo.

**Nota honesta sobre a validação**: entre a primeira e a última execução houve 3 rodadas
com falhas — **todas por timeout de 60 s, zero `AssertionError`** — atingindo arquivos
diferentes a cada vez (`pack-01`, `pay-002`, `mrk-015-022`, `mrk-023-025`), inclusive um
teste que só verifica um 403. O log do Postgres registrou um `checkpoint` de **222 s**
durante uma delas: a máquina estava com I/O saturado, e `createActiveUser` (Argon2) é
CPU-intensivo. A rodada final, com `--no-file-parallelism`, fechou tudo verde. O único
defeito determinístico encontrado foi **no próprio teste** (§7.1 abaixo), já corrigido.

### 7.1 Defeito encontrado e corrigido durante a validação

O cenário 1 do e2e retroagia apenas `service_execution_sessions.check_in_at` e depois
verificava `actualDuration`, que vem de `marketplace_orders.started_at` — outro agregado.
Resultado: `expected 1 to be greater than 90`. O helper passou a retroagir **os dois
marcos**, que é o que torna o cenário coerente. Erro de teste, não de produção.


Unitários novos (3 arquivos, cobrindo os 18 itens do §25.1):

- `trust-change-order.spec.ts` — ciclo de vida, terminalidade, derivação do valor por tempo, incremento congelado (30 min e customizado), recusa de 45 min, recusa de `ADDITIONAL_TIME` em FIXED_PRICE, recusa de valor informado pelo proponente, custo fora / markup dentro da base da fee, taxa congelada preservada.
- `service-execution-session.spec.ts` — check-in/pausa/retomada/check-out, exemplo de 75/15/60 min da spec, múltiplas pausas, transições inválidas, check-out fechando pausa aberta.
- `authorized-commercial.service.spec.ts` — só aprovados somam; pendente/rejeitado/cancelado não; delta aplicado uma vez; tempo autorizado; teto, piso e `null` em FIXED_PRICE; separação custódia × autorizado-não-custodiado.

E2E `pack-03.e2e.spec.ts` — os 9 cenários do §25.2, incluindo as três regressões. A passagem de tempo é simulada empurrando `check_in_at`/`paused_at` para trás no banco, única forma honesta de exercitar "executou 95 min sobre 60 autorizados" sem esperar 95 minutos.

---

## 8. Acceptance Criteria (§26)

| Critério | Como está provado |
|---|---|
| Snapshot inicial permanece imutável | E2E compara a linha inteira antes/depois de um Change Order aprovado |
| Aprovados somam deltas | `calculateAuthorizedTotals` + E2E (150 → 225) |
| Pendente/rejeitado não muda economia | Unit + E2E de rejeição |
| Partner não aumenta unilateralmente | Auto-aprovação devolve **403** no E2E |
| Incremento vem do contrato congelado | Unit (30 e 15 min) + E2E (45 min → 422) |
| Tempo adicional exige aprovação do Member | E2E cenários 1 e 2 |
| Check-in/Pause/Resume/Check-out com transições válidas | Unit + E2E (pausa dupla e retomada dupla → 409) |
| Decorrido, pausado e faturável distinguíveis | Service Summary e payload do check-out |
| Presença ≠ faturável | E2E: 95 min ativos, 60 faturáveis |
| Faturável não passa do autorizado | `calculateBillableMinutes` + E2E |
| MATERIAL_COST 0% de fee | Unit + E2E (custo 200, base da fee só 50 de markup) |
| MATERIAL_MARKUP fee-eligible | idem |
| Taxa congelada reutilizada | Unit com contrato a 5% enquanto a política global está a 10% |
| Service Summary reconcilia | E2E lê `initial + approved = current` |
| Evidência sem duplicar storage | Port único no shared kernel, tabela e bucket próprios |
| Sem reembolso/disputa/Asaas/split | Nada disso foi tocado |
| Sem regressão PACK-00/01/02 | 3 testes de regressão dedicados + suíte completa |

---

## 9. Desvios e Decisões

Os cinco pontos abaixo foram levantados **antes de codar** e decididos pelo Kondo.

### 9.1 (§9) Item de pagamento PARADO e reportado — como a spec manda

**Conflito**: o `Payment` nasce ao consumir `MarketplaceOrder.Created` (o cliente paga ao fechar negócio, antes da execução), seu valor é imutável por design, a `TrustCustody` copia e congela esse valor, e `evaluateRelease` **nega a liberação** se os dois divergirem (`SNAPSHOT_MISMATCH`). Não existe autorização incremental em lugar nenhum do PACK-01.

**Decisão (aprovada)**: o PACK-03 é **só autorização comercial**. Nenhuma linha de `Payment`, `TrustCustody` ou política de liberação foi alterada. O total corrente vive no Marketplace, e o delta aprovado é exposto de forma explícita como **autorizado e não custodiado** — em três lugares: no Service Summary (`amountInCustody` / `amountAuthorizedNotInCustody`), no payload de `TrustChangeOrder.Approved` e no log da aprovação.

**Consequência de produto que o founder precisa aceitar**: hoje, na liberação, o prestador recebe o valor da contratação; o saldo aprovado depois **não é cobrado nem repassado pela plataforma**. Cobrá-lo exige desenho novo de autorização de pagamento — natural no PACK-05 (Asaas), que já vai mexer em cobrança e split.

### 9.2 (§10) Sessão de execução aditiva, máquina do pedido intocada

O check-in/check-out do MRK-020/021 **não foi reimplementado**. A sessão nasce e morre nas mesmas transações desses marcos. O pedido **não ganhou** o estado `PAUSED`: pausa é fato da execução, não do pedido. `actualDuration` foi preservado com o significado original (decorrido) — quem quer faturável usa `billableMinutes`.

### 9.3 (§11) Piso do faturável no mínimo contratado

A spec só dá exemplos de estouro. Para o caso oposto (terminar antes), a decisão é `billable = mínimo contratado`: o Member já pagou por ele e devolução é reembolso, fora de escopo (§4.2). O Service Summary mostra os dois números lado a lado — 40 min reais e 60 faturáveis — em vez de esconder a diferença.

### 9.4 (§10) Sessão para todos os pedidos, dinheiro só em HOURLY

Todo pedido ganha sessão (é registro operacional e Trust Signal), mas tempo só vira dinheiro em `HOURLY`. Em `FIXED_PRICE`, `authorizedMinutes` e `billableMinutes` são `null` e acréscimo só existe via `SCOPE_CHANGE`/`MATERIAL` — como o §24 exige.

### 9.5 (§13) Storage de evidência promovido ao shared kernel

**Conflito**: a única evidência com arquivo era `verification_evidences`, amarrada ao agregado `Verification` (verificação de **identidade**), com o port de storage dentro do módulo `verification`. Pendurar foto de peça quebrada ali corromperia aquele agregado.

**Decisão (aprovada)**: o port `EvidenceStorageService` foi movido para `shared/storage`, ganhou `bucket` no input, e o VRF passou a declarar `verification-evidences` na chamada — **comportamento idêntico**. O Change Order tem tabela (`trust_change_order_evidences`) e bucket (`change-order-evidences`) próprios.

### 9.6 Decisões menores tomadas dentro da margem da spec

- **Estados elegíveis a Change Order**: `SCHEDULED`, `AWAITING_EXECUTION`, `IN_PROGRESS`, `AWAITING_CUSTOMER_CONFIRMATION`. Depois da confirmação a conta está fechada.
- **Expiração derivada, sem job** (§6.1 + INCONSISTENCIAS #33): `effectiveStatus()` reporta `EXPIRED` na leitura; nenhuma operação passa.
- **Sem evento em DRAFT/CANCELLED** (§22): só auditoria.
- **`MIXED` não carrega minutos**: §7.4 fala em SERVICE + MATERIAL_COST + MATERIAL_MARKUP. Tempo adicional é `ADDITIONAL_TIME`.
- **3 notificações** (`ntf.change-order-*`): o §12.8 exige que "o Member receba a solicitação"; a tabela `NOTIFICATION_RULES` já existia e o custo foi de 3 entradas.

---

## 10. Known Issues

1. **A migration 0027 não foi aplicada em nenhum banco compartilhado.** Ela roda limpa no Postgres descartável do e2e. Aplicar no Supabase é ação sobre ambiente vivo — depende do seu OK.
2. **O bucket `change-order-evidences` não existe no Supabase Storage.** Sem ele, o upload de evidência falha em produção (em teste/CI o adapter é em memória). Precisa ser criado como bucket **privado**, igual ao `verification-evidences`.
3. **Lint**: seguem os 4 erros pré-existentes em `tools/extract-docx.mjs`, que o §23.12 declara fora de escopo. Nenhum erro novo foi introduzido.

---

## 11. Remaining Work

- **Frontend**: o PACK-03 §4.1 não pede UI e o §27 não a exige, então nada foi construído. As telas de "pedir mais tempo", "aprovar mudança" e "resumo do serviço" ficam para um pack de produto — o backend já expõe tudo de que elas precisam.
- **Cobrança do delta aprovado**: item §9 parado, endereçado no PACK-05 (Asaas).
- **Trust Signals** (§17): os fatos brutos estão persistidos e auditáveis (pausas, número de Change Orders, minutos pedidos), mas nenhuma inteligência os consome — como o Pack manda.
- **Reembolso / disputa / cancelamento**: fora de escopo por §4.2, previstos para o PACK-04.

---

## 12. Commits

`COMMIT_PENDENTE` — diff pendente de revisão do Kondo antes do fechamento (§27).
