# Feedback — PACK-00 v1.1

> **Documento avaliado**: `TRUST_PACK-00_Foundation_Reconciliation_Engineering_Baseline_v1.1.docx`
> **Substitui**: PACK-00 v1.0 (marcada como SUPERSEDED no repositório)
> **Data**: 2026-08-24 · **Commit**: `48c4e25` · **Registro técnico**: [PACK-00-IMPLEMENTACAO.md](PACK-00-IMPLEMENTACAO.md)

## 1. Veredito

**Sim, está conforme.** A v1.1 resolve os sete pontos levantados na revisão da v1.0,
não introduziu nenhum conflito bloqueante novo, e foi implementada por inteiro —
código, migration e testes.

O Pack autorizava: *"Se não houver novos conflitos bloqueantes, pode implementar o
PACK-00 completo, executar as migrations e todos os testes previstos."* Foi
exatamente isso que aconteceu. Nenhum item precisou ser interrompido e reportado.

| Etapa | Estado |
|---|---|
| Revisão da spec v1.1 | Concluída — sem conflito bloqueante |
| Implementação (§10) | Concluída — 55 produtores, 14 consumers, envelope, erro |
| Migration 0024 (§11) | Aplicada e verificada no banco |
| Testes (§12) | 52 suítes / 320 testes verdes |
| Critérios de aceite (§13) | 10 de 10 PASS |
| Definition of Done (§14) | 6 de 8 concluídos; 2 dependem de terceiros (ver §6) |

## 2. Sobre a spec: como a v1.1 fechou os pontos da v1.0

Cada achado da revisão foi endereçado por uma decisão explícita — todas reunidas no
§16.1 da própria v1.1. Confirmação ponto a ponto:

| # | Achado na v1.0 | Decisão da v1.1 | Confere? |
|---|---|---|---|
| A1 | `traceId` exigido no corpo de erro, mas inexistente no código | `requestId` é o canônico; OTel adiado; futuro Pack pode somar `traceId` sem renomear | ✅ |
| A2 | `details` como objeto quebraria a tela de cadastro | `details` permanece ARRAY de `{path, message}` | ✅ |
| B1 | Nome de evento em 3 segmentos vs. 37 eventos em 2 | `Entity.Event`, dois segmentos; contexto fica no `producer` | ✅ |
| B2 | Teste estrito conflitava com ler evento histórico | Split: escrita estrita, leitura tolerante isolada | ✅ |
| B3 | Regressão de "remoção de tenancy" testava algo que nunca existiu | Trocada por regressão de propriedade/autorização | ✅ |
| C1 | `eventVersion` ora inteiro, ora string | String `"major.minor"` | ✅ |
| C2 | Renomear producers em massa sem necessidade | IDs atuais preservados | ✅ |
| C3 | Escopo real (55 produtores / 14 consumers) subdimensionado | §15 explicita: "do not treat as optional" | ✅ |

Nenhum ponto ficou em aberto e nenhum ponto novo apareceu.

## 3. Critérios de aceite (§13) — evidência

| Critério | Resultado | Onde se comprova |
|---|---|---|
| Todo evento novo segue o envelope canônico | PASS | `event-envelope.spec.ts`; e2e varre a tabela inteira e falha se algum evento ficar sem agregado |
| `aggregateType`/`aggregateId` presentes e semanticamente corretos | PASS | `accept-offer.usecase.spec.ts` + `pack-00.e2e.spec.ts` (Marketplace e Payment reais) |
| `eventType` é o campo canônico de escrita | PASS | teste que afirma a ausência de `eventName` no envelope e recusa o formato legado |
| Eventos persistidos continuam legíveis | PASS | migration renomeia (não recria); e2e publica linha sem agregado |
| Corpo de erro traz `requestId` e `correlationId` | PASS | `global-exception.filter.spec.ts` + e2e |
| Header de correlação segue operante | PASS | e2e compara corpo × headers × RequestContext |
| Nenhum retrofit de `tenant_id`/`organization_id` | PASS | nenhuma tabela alterada além de `outbox_events` |
| pg-boss mantido sem substituição | PASS | nenhuma mudança de broker |
| ARCH históricos não usados como requisito | PASS | precedência do §9 registrada no CLAUDE.md |
| Suítes existentes + novas passam | PASS | 52 suítes / 320 testes |

## 4. O que mudou, em linguagem de negócio

Três coisas, e nenhuma delas é funcionalidade nova:

1. **Todo evento agora diz de quem ele é.** Antes, um evento dizia "uma proposta foi
   aceita"; agora diz "uma proposta foi aceita — e o registro responsável é esta
   proposta, com este identificador". Isso é o que permite, no futuro, reconstruir a
   história de um pagamento ou de um pedido sem varrer tudo.
2. **Toda mensagem de erro agora vem com um número de protocolo.** Quando um usuário
   disser "deu erro", esse número aparece na tela e no log — dá para achar a
   requisição exata em vez de procurar por horário.
3. **O passado continua legível.** Eventos gravados antes desta mudança são lidos por
   um caminho separado e descartável, e nenhum valor foi inventado para eles.

## 5. Decisões que peço confirmação

Três pontos foram decididos com base no texto do Pack. Nenhum é conflito — mas o
autor do Pack deve saber que foram interpretações, não transcrições:

**5.1 — Onde `requestId`/`correlationId` entraram no corpo.**
O §6 mostra o objeto de erro em formato plano. A API já usa, desde o DOC-003, o
envelope `{success, error: {…}}`. Os dois campos foram acrescentados **dentro de
`error`**, ao lado de `code`, `message` e `details` — a mesma lista de campos do §6,
preservando o envelope existente. Base: o §10 instrui *"Add requestId and
correlationId to the JSON error body. Preserve … existing safe error semantics"* —
somar campos, não trocar a estrutura. Se a intenção era achatar o envelope, isso é
mudança de contrato de toda a API e precisa de um Pack próprio.

**5.2 — Três colunas `event_name` permaneceram.**
São `trust_events.event_name` (event store do Trust Score), `trust_score_rules.event_name`
(regra de pontuação, editável em `/admin/trust-rules`) e o campo homônimo da timeline
em `GET /trust-scores/me/timeline`. Não são o envelope de evento entre domínios, que é
o objeto do §5. Renomeá-las quebraria contrato de API e tela sem ganho algum.

**5.3 — Agregado quando o evento nomeia um valor, não um agregado.**
`TrustLevel.Changed` recebeu `aggregateType: TrustScore`, porque nível é atributo do
score e não agregado próprio. Mesma lógica para as disputas, que transitam pelo
serviço de ciclo do pedido mas cujo fato pertence à disputa.

## 6. Definition of Done (§14) — o que falta

| Item | Estado |
|---|---|
| Migration revisada e aplicada no ambiente de desenvolvimento | ✅ aplicada e verificada: 25 migrations, `event_name` → `event_type` com as 1018 linhas preservadas, colunas de agregado anuláveis, 4 índices |
| Produtores e consumers atualizados | ✅ 55 e 14 |
| Handler canônico de erro atualizado | ✅ |
| Nenhuma mudança de schema de tenancy | ✅ |
| Testes passando | ✅ 52 suítes / 320 testes |
| Nenhum conflito de documento autoritativo em aberto | ✅ |
| **Kondo revisa o diff e confirma que não entrou escopo alheio** | ⏳ pendente — ação do Kondo |
| **Referência do commit registrada no Pack** | ⚠️ registrada no repositório (`48c4e25`, [PACK-00-IMPLEMENTACAO.md](PACK-00-IMPLEMENTACAO.md)); carimbar dentro do .docx depende de quem edita o Pack |

## 7. Estado dos ambientes

| Ambiente | Estado |
|---|---|
| GitHub | ✅ `48c4e25` no `main` |
| Banco (Supabase) | ✅ reativado; migration 0024 aplicada e conferida |
| Site (Vercel) | ✅ no ar |
| API (Render) | ❌ **suspensa — cota do plano free esgotada** |

A suspensão da API é anterior a esta entrega e **não tem relação com o PACK-00** —
é limite de horas do plano gratuito do Render (750 h/mês). Enquanto durar, o site
fica no ar mas sem backend. Decisão pendente: subir para o plano Starter (US$ 7/mês),
aguardar o ciclo virar, ou migrar de hospedagem.

Um detalhe favorável: **as 1018 linhas do outbox estavam todas `PUBLISHED`**, nenhuma
pendente ou falha. Ou seja, a migration rodou sem nenhum evento em trânsito, e o
caminho de leitura tolerante existe como rede de segurança — não como necessidade.

## 8. Resultado esperado quando a API voltar

Sem nenhuma ação adicional de código:

- todo evento novo nasce com `eventType` + `aggregateType` + `aggregateId`;
- toda resposta de erro traz `requestId` e `correlationId`, iguais aos headers;
- o comportamento funcional para o usuário final é **idêntico** ao de antes — o
  PACK-00 é fundação, não funcionalidade.

Verificação de um minuto, assim que o serviço subir:

```bash
curl -s https://trust-api-5zlh.onrender.com/api/v1/marketplace/listings/00000000-0000-7000-8000-000000000000
# esperado: {"success":false,"error":{"code":"MARKETPLACE_LISTING_NOT_FOUND",…,"requestId":"…","correlationId":"…"}}
```

Se `requestId` aparecer, o build do PACK-00 está no ar.
