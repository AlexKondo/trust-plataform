# Trust Platform — Plano de Módulos do MVP

> Consolidado a partir da análise completa dos 106 documentos (Founder Book, Master Plan, Arquitetura TP-001..006, Desenvolvedor ID-001..006, MVP DOC-000..007 e 64 feature specs).
> Complementos: [INCONSISTENCIAS.md](INCONSISTENCIAS.md) (conflitos entre docs e decisões canônicas) e [CLAUDE.md](CLAUDE.md) (guia de desenvolvimento).

## 1. O que estamos construindo

O Trust Platform é uma **infraestrutura digital de confiança** para a economia de serviços locais. O marketplace é a primeira aplicação sobre a "Trust Layer". O núcleo é o pipeline:

```
Evento de negócio → Trust Event (imutável) → Regras → Trust Score → Trust Level → Badges/Benefits → Trust Profile
```

Regra de ouro da arquitetura (TP-001/TP-003): **nenhum módulo de negócio implementa regra de confiança** — só o Trust Engine altera Score/Level/Badges, sempre via eventos, de forma determinística, auditável e explicável.

## 2. Quebra em módulos (ordem de desenvolvimento)

A ordem abaixo segue DOC-000 e os sprints das specs, com uma correção importante: **as regras de pontuação/nível (TRS-008/009) precisam existir antes do cálculo (TRS-003/004) funcionar** — as specs as colocam no Sprint 4, depois do motor (Sprint 3). Tratamos isso movendo o "seed" de regras para o Módulo 4.

### Módulo 0 — Fundação (não existe como spec; é pré-requisito)
Setup do monorepo/projeto, CI, migrations, shared kernel:
- Esqueleto Clean Architecture (presentation/application/domain/infrastructure) por módulo
- Envelope de resposta da API, error handler global, envelope de eventos + **Transactional Outbox**
- Middleware de auth (JWT), Correlation ID / Request ID, logging estruturado JSON
- Tabela `audit_logs` (exigida por DOC-002/006, ausente das specs — ver INCONSISTENCIAS #14)
- Infra local (Docker Compose: PostgreSQL 16, broker, mailhog)

### Módulo 1 — IDN · Identity (Sprint 1) — 9 features
IDN-001 Create Identity → IDN-002 Verify Email → IDN-003 Login → IDN-004 Refresh → IDN-005 Get Current Identity → IDN-006 Logout → IDN-007 Forgot Password → IDN-008 Reset Password → IDN-009 Change Password.
- Tabelas: `identities`, `email_verification_tokens`, `sessions`, `password_reset_tokens`
- Tokens: Access 15 min / Refresh 30 dias com rotação obrigatória
- **Atenção:** existem 2 arquivos IDN-001; o canônico é "Create Identity" (ver INCONSISTENCIAS #2)

### Módulo 2 — TPS · Trust Passport (Sprint 2, parte 1)
TPS-001 Create (auto pós-Identity ativa, 1:1 com Identity) → TPS-002 Get (`/trust-passports/me`) → TPS-003 Update (atributos EDITABLE; alteração verificável → `PENDING_VERIFICATION`).
- Tabela: `trust_passports` (colunas canônicas: `email_verified`…, `profile_completion DECIMAL(5,2)` — ver INCONSISTENCIAS #6)

### Módulo 3 — VRF · Verification (Sprint 2, parte 2) — 6 features
VRF-001 Create → VRF-002 Submit Evidence → VRF-003 Review → VRF-004 Approve / VRF-005 Reject → VRF-006 Get.
- Máquina de estados: `WAITING_FOR_EVIDENCE → PENDING_REVIEW → IN_REVIEW → APPROVED | REJECTED` (+ `EXPIRED`, `CANCELLED` terminais)
- Tabelas: `verifications`, `verification_evidences`, `verification_reviews`, `verification_decisions`
- Máx. 1 verificação ativa por Passport+tipo; decisões irreversíveis; nova tentativa = nova Verification

### Módulo 4 — TRS núcleo · Trust Score Engine (Sprints 3–4) — TRS-001..011 + TPS-004
Ordem funcional corrigida:
1. TRS-001 Create Trust Score (consome `TrustPassport.Created`; score 0, level `UNVERIFIED`)
2. TRS-002 Register Trust Event (event store imutável, idempotente por `event_id`)
3. **TRS-008 + TRS-009** (admin de regras de nível e pontuação) **+ seed inicial de regras** — sem isso o motor roda no vácuo
4. TRS-003 Calculate (TrustScoreEngine determinístico) → TRS-004 Determine Level (`trust_level_history`)
5. TPS-004 Synchronize Verifications (projeção `Verification.Approved` → Passport; implementar também o consumer de `Verification.Rejected` — ver INCONSISTENCIAS #7)
6. TRS-005 Get My Trust Profile · TRS-006 Get Trust Timeline
7. TRS-007 Rebuild (job assíncrono + snapshot — exige decidir infra de jobs; ver PENDENCIAS)
8. TRS-010 Manage Benefits → TRS-011 Get My Benefits (elegibilidade avaliada on-demand; nada é "concedido")

### Módulo 5 — TRS reputação pública (Sprints 5–6) — TRS-012..020
1. TRS-012 Manage Badges → TRS-013 Award Badges (PERMANENT/DYNAMIC, `awarded_badges`) → TRS-014 Get My Badges
2. TRS-016 Manage Visibility Policies (**antes** do TRS-015, que depende delas — dependência declarada está invertida)
3. TRS-015 Get Trust Profile consolidado (`PUBLIC_VIEW`/`PRIVATE_VIEW`) — renomear artefatos para não colidir com TRS-005 (ver INCONSISTENCIAS #3)
4. TRS-017 Share (links revogáveis) + TRS-019 Revoke (é extensão do 017, não reimplementar) + TRS-018 Verification Link + TRS-020 Access History (a tabela `trust_profile_access_logs` precisa nascer com o TRS-017)

### Módulo 6 — MRK Listings + Conversations (Sprint 7) — MRK-001..008 ✅ CONCLUÍDO (2026-08-09)
- Listings: Create (DRAFT) → Update → Publish (exige Identity ativa + reputação mínima por categoria) → Search → Get
- Conversations: Contact Owner (reutiliza conversa ativa — ver INCONSISTENCIAS #9) → Manage (mensagens imutáveis) → Close
- Tabelas: `marketplace_listings`, `marketplace_conversations`, `marketplace_messages` + `marketplace_categories` e `marketplace_listing_images` (lacunas das specs — INCONSISTENCIAS #30/#31)
- Primeiro módulo que **consome** a Trust Layer: nível mínimo por categoria como porteiro da publicação, reputação do anunciante na busca (filtro + ordenação) e no detalhe (respeitando as Visibility Policies do TRS-016)

### Módulo 7 — MRK Offers (Sprints 8–9) — MRK-009..014 ✅ CONCLUÍDO (2026-08-10)
Create → Update → Withdraw → Counter (`parentOfferId`, sem limite de rodadas) → **Accept** (pivô: encerra concorrentes como `CLOSED`, listing → `RESERVED`, cria Order na mesma transação) → Reject.
- Estados da oferta: `PENDING → ACCEPTED | REJECTED | WITHDRAWN | COUNTERED | EXPIRED | CLOSED`
- Duas autorizações distintas: **quem propôs** atualiza/retira; **quem recebeu** aceita/rejeita/contrapõe (a contraoferta inverte os papéis a cada rodada)
- `marketplace_orders` nasce aqui (MRK-015 BR-007 exige atomicidade com o aceite — INCONSISTENCIAS #32); o Módulo 8 estende com a máquina de 13 estados
- Uma proposta viva por negociação (#34); expiração derivada de `expires_at`, sem job (#33)

### Módulo 8 — MRK Orders (Sprints 9–11) — MRK-015..022 ✅ CONCLUÍDO (2026-08-10)
Máquina de estados canônica (13 estados, incluindo `CUSTOMER_CONFIRMED` — ver INCONSISTENCIAS #8):
```
CREATED → AWAITING_SCHEDULING → SCHEDULED → AWAITING_EXECUTION → IN_PROGRESS
        → AWAITING_CUSTOMER_CONFIRMATION → CUSTOMER_CONFIRMED → COMPLETED → CLOSED
   (+ CANCELLED, DISPUTE_OPEN, DISPUTE_RESOLVED, REFUNDED)
```
Create (automático no aceite) → Get → Update (LifecycleService centraliza transições) → Cancel (política por estado) → Schedule → Start (check-in) → Complete (check-out) → Confirm Completion.
- **Ao cancelar pedido, liberar a reserva do listing** (gap das specs — ver INCONSISTENCIAS #12): consumer `mrk.release-listing-on-cancel`
- **É aqui que o marketplace passa a alimentar o Trust Score** (INCONSISTENCIAS #13): `MarketplaceOrder.CustomerConfirmed` → +40 para o prestador; `MarketplaceOrder.Cancelled` → −20 para quem cancelou
- Tabelas: `marketplace_order_schedulings`, `marketplace_order_execution_events` (CHECK_IN/CHECK_OUT numa só — #35), `marketplace_confirmations`
- `AWAITING_SCHEDULING`/`AWAITING_EXECUTION` existem na máquina mas ninguém os produz no MVP (#36); `CLOSED` depende da janela de avaliação do Módulo 9 (#37)

### Módulo 9 — MRK Disputes + Reviews (Sprint 11) — MRK-023..025 ✅ CONCLUÍDO (2026-08-10)
Open Dispute (1 ativa por pedido) → Resolve (decisão imutável, só ADMIN/mediador) → Review (1 por participante por pedido, nota 1–5).
**Fecha o MVP do Marketplace e o ciclo de reputação**: a nota da transação e o desfecho da disputa viram Trust Events, encerrando o gap #13.
- Critérios da avaliação em tabela própria (`marketplace_review_scores`) porque a spec os define como configuráveis pela Administração
- Categorias de disputa e tipos de decisão são catálogo fechado no código no MVP (tela admin fica para depois)

## 3. Grafo de dependências entre módulos

```
IDN ──→ TPS ──→ VRF ──→ TRS núcleo ──→ TRS reputação ──→ MRK (usa Trust Level na publicação/busca)
 │                          ↑                                │
 └── auth p/ todos          └──── eventos MRK-* como Trust Events (mapear regras — gap #13)
```

## 4. Fora do MVP (pressupostos pelas specs, sem spec própria)

Estes módulos são **consumidores de eventos citados nas specs** mas não existem — cada um precisa de decisão explícita antes do Sprint em que é citado:

| Módulo fantasma | Citado por | Necessário a partir de |
|---|---|---|
| Pagamentos / escrow | MRK-015/018/022/024 (captura, estorno, liberação) | Não bloqueia MVP; stub de eventos |
| Notificações (e-mail/push/in-app) | IDN-002/007, MRK-011+ | Sprint 1 (mínimo: e-mail transacional) |
| Jobs assíncronos | TRS-007 (rebuild), expiração de ofertas/verificações | Sprint 4 |
| Evidências (storage de mídia) | VRF-002, MRK-020/021/022/025 | Sprint 2 (mínimo: storage de arquivos do VRF) |
| Roles/Permissions (admin) | Todos os endpoints `/admin/*`, VRF-003/004/005 | Sprint 2 (mínimo: flag admin) |
| Auditoria persistida | DOC-002/006 (trilha imutável) | Módulo 0 |

## 5. Riscos principais (ver INCONSISTENCIAS.md para a lista completa)

1. ~~Stack tecnológico não definido~~ — **Resolvido em 2026-08-08**: TypeScript full-stack (NestJS+Fastify / Next.js / Supabase / pg-boss) — ver INCONSISTENCIAS.md P1–P7.
2. Escala do Trust Score nunca definida (exemplos usam 742/GOLD; não há min/max nem seed de níveis).
3. Cadeias "Depends On/Blocks" das specs têm rótulos sistematicamente errados (renumeração não propagada) — usar este plano, não os rótulos.
4. Fluxo de produtos (envio/entrega) não existe — o fluxo de Orders é 100% serviços. MVP deve assumir **serviços**.
