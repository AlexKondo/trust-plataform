# Análise dos 88 documentos de arquitetura

> Fonte: `docs/Arquitetura-20260823T121643Z-1-001/` → extraídos para
> `docs-extracted/Arquitetura-ARCH/` (índice em `_indice.tsv`, decisões em `_decisoes.tsv`).
> Leitura feita em 2026-08-23, comparando cada ADR com o que já está implementado.

## 1. O que é este conjunto

- **7 documentos TP-001..006** — são os **mesmos** que já processamos no Módulo 0
  (`docs-extracted/Arquitetura/`). Nada novo — por isso não foram duplicados aqui.
- **81 ADRs novos (ARCH-001..081)** — padrões transversais de plataforma, no
  formato Architecture Decision Record, todos com status "Approved".

O conjunto descreve uma **plataforma SaaS enterprise madura**: event bus
dedicado, Kubernetes, OAuth2/OIDC com RBAC+ABAC, multi-tenancy, SIEM, data
warehouse, marketplace de agentes de IA, SDK público, multi-região.

## 2. O que valida o que já construímos

Estes ADRs descrevem, quase palavra por palavra, decisões que já tomamos:

| ADR | O que exige | Nosso estado |
|---|---|---|
| ARCH-001 | Event-driven entre domínios, consumidores idempotentes, retry + DLQ | ✅ Outbox transacional + dedupe por `(consumer, eventId)` + pg-boss |
| ARCH-002 | Nome `BoundedContext.Entity.Event`, linguagem de negócio | ✅ Nossos nomes batem com os exemplos do próprio ADR |
| ARCH-006/026/047 | Trilha de auditoria imutável | ✅ `audit_logs` append-only com trigger |
| ARCH-009 | `/api/v1/{recurso}`, contrato previsível | ✅ Idêntico |
| ARCH-010 | Ports & Adapters para sistemas externos, idempotência | ✅ `PaymentGateway` + adapter sandbox |
| ARCH-016/037 | Binário em object storage, separado dos metadados | ✅ Evidências no Supabase Storage |
| ARCH-040 | Regras como dado avaliável, não código | ✅ Regras do Trust Score em JSON |
| ARCH-012/053 | Testes mais profundos em caminho financeiro | ✅ 51 suítes; dinheiro em centavos com teste de rateio |

**Observação relevante**: os exemplos do ARCH-002 são literalmente
`Payment.Authorized`, `Funds.Released`, `MarketplaceOrder.CustomerConfirmed`,
`FinancialCase.Opened`. Estes ADRs foram escritos **depois** das specs de
pagamento e já assumem o vocabulário que implementamos.

## 3. Divergências concretas (acionáveis)

### 3.1 Envelope de evento — faltam 2 campos obrigatórios

ARCH-002 §6 define 10 campos obrigatórios. O nosso tem 8.

| Campo | ARCH-002 | Nosso |
|---|---|---|
| `eventType` | obrigatório | temos como **`eventName`** |
| `aggregateType` | **obrigatório** | ❌ ausente |
| `aggregateId` | **obrigatório** | ❌ ausente |

**Por que importa agora**: `aggregateId` é o que permite reconstruir a linha do
tempo de um agregado a partir do event store, e é insumo direto da conciliação
financeira (PAY-010). Corrigir hoje custa uma migration e um ajuste no
`createEventEnvelope`. Corrigir depois exige reescrever linhas de outbox já
gravadas e todo consumidor que lê o envelope.

### 3.2 Envelope de erro — falta rastreabilidade no corpo

ARCH-009 pede `{code, message, details, traceId, correlationId}`. Devolvemos
`{code, message, details}` — o correlation id vai só no header
`x-correlation-id`. Quem abre um chamado copia o corpo do erro, não o header.

### 3.3 Multi-tenancy — não existe

ARCH-018 e ARCH-042 definem **Organization/Tenant como fronteira de negócio e
segurança**, com isolamento lógico forte desde o início.

Hoje não há `tenant_id` em nenhuma das ~25 tabelas. Todo dado é global, ligado a
`identityId`.

**É a maior decisão estrutural pendente.** Retrofit de tenant em 25 tabelas,
todos os índices, todas as queries e todas as políticas de acesso é uma das
migrações mais caras que existem. As opções honestas:

- **Assumir single-tenant no MVP** e registrar isso como decisão explícita
  (o produto atual é B2C: prestador e cliente, sem organização no meio);
- **Introduzir `organization_id` agora**, enquanto são 25 tabelas e não 60.

Isso depende de para quem você vai vender. Não dá para decidir por você.

## 4. Descompasso de escala (leitura honesta)

Boa parte destes ADRs descreve capacidades que, sozinhas, são maiores que tudo
que construímos até aqui:

- ARCH-041/077..081 — runtime de agentes de IA, gateway de modelos, red teaming,
  comitê de risco de IA, marketplace de agentes, SDK de agentes (**10 documentos**)
- ARCH-050/051/052/067 — data warehouse, governança de dados, BI
- ARCH-055/056/069 — control plane, billing, ciclo de contrato enterprise
- ARCH-058 — multi-região e internacionalização
- ARCH-072/073 — federação de identidade B2B, SSO corporativo

Nada disso está errado como visão. Mas tratá-los como backlog agora pararia o
produto por meses. **Recomendação: são alvo arquitetural, não plano de sprint.**
O próprio ARCH-001 admite isso ao dizer que a tecnologia de mensageria é decisão
de infraestrutura — nosso pg-boss atende o contrato sem ser Kafka.

## 5. Duplicação no conjunto

Vários temas aparecem 2, 3 ou 4 vezes, em documentos diferentes e com o mesmo
status "Approved":

| Tema | Documentos |
|---|---|
| IA | 10 (ARCH-007, 041, 077, 078, 079, 080, 081…) |
| API / gateway / segurança de API | 5 (009, 033, 057, 074…) |
| Busca | 4 (015, 036, 049, 076) |
| Integração | 4 (010, 048, 075…) |
| Identidade / autenticação | 4 (005, 024, 072…) |
| Auditoria | 4 (006, 026, 047, 064) |
| Notificação | 3 (003, 020, 038) |
| Disaster recovery | 3 (013, 030, 054) |
| Secrets | 3 (023, 044, 062) |
| Feature flags / configuração | 3 (014, 043, 061) |
| Multi-tenancy | 2 (018, 042) |

**Risco**: dois documentos aprovados sobre o mesmo assunto podem divergir e não
há regra dizendo qual vence. Antes de usar isso como fonte de verdade, vale
consolidar — ou declarar que a numeração maior prevalece.

## 6. Recomendação de uso

1. **Agora (barato, alto valor)**: corrigir o envelope de evento (§3.1) e o de
   erro (§3.2). São ajustes de fundação; ficam mais caros a cada semana.
2. **Decidir**: multi-tenancy (§3.3). Precisa de resposta sua sobre o modelo de
   negócio antes de virar código.
3. **Consolidar**: eleger um documento vencedor por tema duplicado (§5).
4. **Arquivar como visão**: os ~60 ADRs enterprise, revisitados quando houver
   cliente/escala que os justifique.
5. **Continuar**: o módulo Payments (Blocos 3–8) não é bloqueado por nada disso.
