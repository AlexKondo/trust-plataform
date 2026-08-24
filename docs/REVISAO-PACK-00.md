# Revisão do PACK-00 — inconsistências encontradas

> Documento revisado: `TRUST_PACK-00_Foundation_Reconciliation_Engineering_Baseline_v1.0`
> (extraído em `docs-extracted/Arquitetura-ARCH/`).
> Revisão feita contra o código real em 2026-08-24. **Nada foi implementado**:
> o próprio PACK-00 §15 manda parar e reportar antes de resolver conflito por suposição.

## Resumo

O PACK-00 resolve corretamente as três divergências que eu havia levantado em
`ANALISE-ARQUITETURA.md` e acerta ao classificar os 81 ADRs como referência, não
como requisito. Mas há **2 conflitos que bloqueiam implementação** e **3
inconsistências internas** que precisam de decisão antes de virar código.

---

## A. Conflitos que bloqueiam (precisam de decisão sua)

### A1. `traceId` não existe no sistema

§6 exige `traceId` no corpo de todo erro. §10 manda "adicionar traceId e
correlationId ao corpo".

O código tem **`requestId`** e **`correlationId`** (`RequestContext`), ambos já
devolvidos nos headers `x-request-id` e `x-correlation-id`. Não existe `traceId`
em lugar nenhum.

Há duas leituras possíveis e elas dão trabalhos diferentes:

| Leitura | O que significa | Custo |
|---|---|---|
| `traceId` = nosso `requestId` | Só renomear no corpo da resposta | Trivial |
| `traceId` = trace do OpenTelemetry (ARCH-004) | Instrumentar OTel na aplicação inteira | Grande — e **§3 coloca isso fora de escopo** |

**Decisão mínima necessária**: `traceId` no corpo é o nosso `requestId`?

### A2. Mudar o tipo de `details` quebra o frontend

§6 mostra o corpo do erro com `"details": {}` — um **objeto**.

O contrato atual é um **array**: `details?: Array<{ path: string; message: string }>`,
produzido pelo `ValidationException` a partir dos erros do Zod.

O frontend consome como array:

```
apps/web/app/register/page.tsx:66
  Object.fromEntries(error.details.map((d) => [d.path, d.message]))
```

Se `details` virar objeto, essa linha lança `error.details.map is not a function`
e **a tela de cadastro quebra em produção** — exatamente a classe de falha que
já nos mordeu no dashboard.

Além disso §15 manda "preservar o comportamento existente salvo onde este Pack
mudar explicitamente" — e o Pack não diz que quer mudar o formato de `details`;
o `{}` pode ser só um placeholder do exemplo.

**Decisão mínima necessária**: `details` continua array de `{path, message}`
(recomendado — nenhuma mudança de frontend), ou vira objeto e atualizamos o
`apps/web` junto?

---

## B. Inconsistências internas do PACK-00

### B1. O padrão de nome de evento contradiz todos os exemplos

§5.1 define:

```
BoundedContext.Entity.Event          ← três segmentos
```

E logo abaixo dá os exemplos:

```
Payment.Authorized | TrustCustody.Created | FinancialCase.Opened   ← dois segmentos
```

Nenhum exemplo segue o template. Os 37 eventos já implementados usam dois
segmentos, e o validador impõe isso:

```
EVENT_NAME_PATTERN = /^[A-Z][a-z][A-Za-z]*\.[A-Z][a-z][A-Za-z]*$/
```

O erro vem do ARCH-002, que tem a mesma contradição. Como o Pack o canoniza
(§16), ele herdou o problema.

**Interpretação adotada se ninguém disser o contrário**: valem os exemplos —
dois segmentos, `Entity.Action`. É o que já está no ar e o que o próprio Pack
lista como exemplo.

### B2. O teste do §12 impede o requisito do §11

- §11: "eventos persistidos devem permanecer legíveis"; "não fabricar
  aggregateType/aggregateId para eventos históricos".
- §12: teste do envelope "**rejeita** aggregateType/aggregateId ausentes".

Se o mesmo schema validar escrita e leitura, o segundo requisito torna as
linhas antigas ilegíveis — quebrando o primeiro. O Pack não separa os dois
casos.

**Resolução proposta**: validação **estrita na escrita**, **tolerante na
leitura**, com o caminho de compatibilidade isolado e removível (que é o
espírito do §11). Só precisa ficar escrito.

### B3. Teste de regressão sobre algo que nunca existiu

§12 pede: *"Security regression test confirms no tenancy bypass or global-access
behavior was introduced by **removing** enterprise tenancy from MVP requirements."*

Não há remoção: multi-tenancy nunca foi implementada. Não existe regressão a
testar. A intenção — confirmar que autorização por dono de recurso continua
valendo — é legítima e já é coberta pelos testes existentes (403 para terceiro
em pedido, pagamento, conversa e disputa).

---

## C. Escopo subestimado (não é contradição, mas muda o prazo)

§15 pede "a menor mudança segura". O tamanho real da mudança do envelope:

| Item | Quantidade |
|---|---|
| Chamadas de `outboxService.enqueue` que passam a exigir `aggregateType`/`aggregateId` | **55** |
| Consumers que leem `eventName` | **14** |
| Coluna `event_name` na tabela `outbox_events` (migration + relay + `boss.subscribe`) | 1 tabela, 3 pontos de código |

Cada um dos 55 produtores precisa informar o agregado responsável. É trabalho
necessário e mecânico, mas não é "pequeno" — e é o grosso do PACK-00.

### C1. `eventVersion` aceita formato que o validador recusa

§5 diz `Integer/String`; o exemplo do ARCH-002 usa `"1"`. Nosso validador exige
`/^\d+\.\d+$/` e recusaria `"1"` (usamos `"1.0"`). Trivial, mas precisa alinhar
para o teste do §12 não falhar por bobagem.

### C2. `producer` sem regra de forma

ARCH-002 exemplifica `payments-service`; usamos `payment-service` (singular).
O Pack não decide. Não bloqueia — vale padronizar de uma vez.

---

## D. O que o PACK-00 resolve bem

- **Tenancy**: responde a pergunta que eu havia deixado em aberto — B2C,
  sem `tenant_id`, sem retrofit. Decisão clara e registrada.
- **pg-boss**: mantido, com a exigência correta de não vazar detalhe do broker
  para o domínio.
- **Precedência documental (§9)**: Pack vigente > Packs implementados > código e
  testes > ARCH/TP históricos. Resolve o problema dos 81 ADRs "Approved" e
  duplicados que apontei antes.
- **§15 "não resolver conflito por suposição"**: é a razão desta revisão existir
  em vez de um commit.

---

## E. O que proponho

1. Você responde **A1** (traceId) e **A2** (details) — são duas frases.
2. Confirma **B1** (dois segmentos) e **B2** (estrito na escrita, tolerante na
   leitura).
3. Implemento o PACK-00 inteiro em um bloco só, com os testes do §12, deixando
   os 55 produtores com o agregado correto.

Sem A1 e A2 respondidos, implementar significaria adivinhar contrato público de
API — que é justamente o que o §15 proíbe.
