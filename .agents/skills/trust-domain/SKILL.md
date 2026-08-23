---
name: trust-domain
description: Regras de domínio da Trust Platform - pipeline de confiança (Event→Score→Level→Badges), fronteiras entre módulos IDN/TPS/VRF/TRS/MRK, máquinas de estado canônicas. Use ao implementar qualquer regra de negócio, integração entre módulos ou quando precisar entender como os módulos se conectam.
---

# Domínio — Trust Platform

## O pipeline de confiança (invariante central, TP-004)

```
Evento de negócio → Trust Event (imutável, TRS-002) → Regras ativas (TRS-009)
→ Trust Score (TRS-003) → Trust Level (TRS-004/008) → Badges (TRS-013) / Benefits (TRS-011)
```
- Nenhum evento altera o score diretamente; nenhum módulo fora do TRS altera Score/Level/Badges.
- Cálculo **determinístico**: mesmos eventos + mesmas regras ⇒ mesmo resultado. Score/Level são projeções recomputáveis (rebuild TRS-007); os Trust Events são a fonte da verdade.
- Regras/pesos **nunca hardcoded** — sempre dados versionados (`trust_score_rules`, `trust_level_rules`).
- Toda alteração de indicador é explicável: qual regra, quais eventos, quando, qual resultado.
- IA nunca decide — apenas sugere; decisões oficiais só via regras determinísticas.

## Mapa de módulos e ownership

| Módulo | Dono de | Nunca faz |
|---|---|---|
| IDN | identities, sessions, tokens, organizations, memberships | lógica de confiança |
| TPS | trust_passports (projeção 1:1 da Identity; atributos verificados, completude) | verificar algo (só reflete o VRF) |
| VRF | verifications, evidences, reviews, decisions | atualizar Passport/Score (emite eventos) |
| TRS | trust_scores, trust_score_events, regras, badges, benefits, visibility policies, shares | consultar banco de outro módulo |
| MRK | listings, conversations, offers, orders, disputes, reviews | lógica financeira e lógica de confiança |

Identidade global: **IdentityId** (UUID, imutável). Cadeia: Identity 1:1 TrustPassport 1:1 TrustScore.

## Fluxos de integração canônicos

- Cadastro: IDN-002 verifica e-mail → `Identity.Created` → TPS-001 cria Passport → `TrustPassport.Created` → TRS-001 cria Score (0, `UNVERIFIED`)
- Verificação: VRF-004 aprova → `Verification.Approved` → TPS-004 marca atributo verificado **e** TRS-002 registra Trust Event → recálculo
- Marketplace alimenta o TRS via eventos: `MarketplaceOrder.CustomerConfirmed`, `MarketplaceOrder.Cancelled`, `MarketplaceDispute.Opened/Resolved`, `MarketplaceReview.Created`
- MRK lê do TRS: publicação exige reputação mínima por categoria (MRK-003); busca filtra/ordena por Trust Level/Score (MRK-004)

## Máquinas de estado canônicas

- **Identity**: `PENDING_EMAIL_VERIFICATION → ACTIVE` (+ `SUSPENDED, RESTRICTED, BLOCKED, DELETED`)
- **Verification**: `WAITING_FOR_EVIDENCE → PENDING_REVIEW → IN_REVIEW → APPROVED | REJECTED` (+ `EXPIRED, CANCELLED`); estados finais irreversíveis; nova tentativa = nova Verification; máx. 1 ativa por Passport+tipo
- **Listing**: `DRAFT → PUBLISHED → RESERVED` (cancelamento do pedido devolve a `PUBLISHED` — decisão #12)
- **Conversation**: `OPEN → CLOSED` (mensagens imutáveis; sem reabertura)
- **Offer**: `PENDING → ACCEPTED | REJECTED | WITHDRAWN | COUNTERED | EXPIRED | CLOSED` (não existe `CANCELLED`)
- **Order** (13 estados; transições só via `MarketplaceOrderLifecycleService`, sem saltos):
  `CREATED → AWAITING_SCHEDULING → SCHEDULED → AWAITING_EXECUTION → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → CUSTOMER_CONFIRMED → COMPLETED → CLOSED` (+ `CANCELLED`, `DISPUTE_OPEN → DISPUTE_RESOLVED`, `REFUNDED`)
- **Dispute**: `OPEN → IN_ANALYSIS → MEDIATION → RESOLVED` (decisão imutável; 1 ativa por pedido)

## Regras de negócio transversais

- Aceite de oferta (MRK-013): transacional — oferta `ACCEPTED` + concorrentes `CLOSED` + listing `RESERVED` + Order criada, com rollback total
- Confirmação do cliente (MRK-022) dispara assíncronos: liberação de pagamento, Trust Score, avaliação — Marketplace **não executa** lógica financeira
- Snapshot imutável: Order copia valor/participantes da oferta aceita; nunca mudam
- Privacidade: exposição de Trust Profile controlada por Visibility Policies (TRS-016) + links revogáveis (TRS-017/019) + trilha de acesso (TRS-020); 410 para link revogado/expirado

## Escala e níveis (decisão P4 — provisória até o founder fixar)

Score 0–1000. Seed de níveis como DADOS em `trust_level_rules`, nunca em código.
