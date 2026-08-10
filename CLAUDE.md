# Trust Platform

Infraestrutura digital de confiança para a economia de serviços locais. O marketplace é a primeira aplicação sobre a "Trust Layer" (Trust Passport, Score, Capital, Benefits). Este repositório contém a documentação completa do produto e (futuramente) o código do MVP.

## Estado atual

**Módulo 0 (fundação) concluído em 2026-08-08** — ver [docs/MODULO-0.md](docs/MODULO-0.md): monorepo pnpm, `apps/api` (NestJS 11 + Fastify), shared kernel (envelope de API, error handler, JWT ES256 guard global, Correlation/Request ID, logging Pino, Transactional Outbox via pg-boss, `audit_logs` append-only com trigger), migrations aplicadas no Supabase `trust-dev-sp`, CI GitHub Actions. Dev: `pnpm dev` → `http://localhost:3001/api/v1/health`; e2e: `TEST_DATABASE_URL=... pnpm test`.

**Módulo 1 em andamento**: IDN-001 Create Identity e IDN-002 Verify Email concluídos no backend em 2026-08-08 (tabelas `identities` + `email_verification_tokens`, Argon2id, token SHA-256, eventos `Identity.Created`/`Identity.EmailVerified` via outbox, auditoria, OpenAPI em [docs/openapi.yaml](docs/openapi.yaml), catálogo em [docs/event-catalog.md](docs/event-catalog.md)). E-mail via **Brevo** (P6b): sem chave REST `xkeysib-` no `.env`, a API loga o link de verificação em vez de enviar. Páginas de frontend ficam para quando o `apps/web` for iniciado. IDN-003 Login também concluído (tabela `sessions`, refresh opaco SHA-256, lockout configurável, rate limiting por IP, evento `Identity.Authenticated`). **MÓDULO 1 (IDN) COMPLETO — 9/9** (2026-08-08). **MÓDULO 2 (TPS) COMPLETO — TPS-001/002/003** (2026-08-09): infra de consumers no shared kernel (`EventConsumer` + dedupe em `processed_events` + descoberta automática no pg-boss), consumer `tps.create-trust-passport` cria o Passport ao consumir `Identity.Created`, `GET/PUT /trust-passports/me`, eventos `TrustPassport.Created/Updated`. Frontend `apps/web` (Next 15) no ar na Vercel; API no Render; ambos com deploy automático no push. **EM PRODUÇÃO**: site https://trust-plataform-api.vercel.app + API https://trust-api-5zlh.onrender.com. **MÓDULO 3 (VRF) COMPLETO — VRF-001..006** (2026-08-09): máquina de estados canônica, evidências via multipart → Supabase Storage (`verification-evidences`), flag `is_admin` + `AdminGuard` (primeiro mecanismo admin; conceder via UPDATE no banco), 6 eventos `Verification.*`, índice parcial garante 1 verificação ativa por Passport+tipo. **TPS-004 COMPLETO** (2026-08-09): consumers `tps.sync-verification-approved/-rejected` projetam decisões no Passport (mapeamento DOCUMENT→document, ADDRESS→address, PHONE→phone, EMAIL→email; demais tipos ficam só no VRF) e recalculam a completude. **MÓDULO 4 (TRS) COMPLETO** (2026-08-09; P4/P5 aprovados): TRS-001..011 — engine determinístico (escala 0–1000, níveis seed), event store imutável, consumers com **fan-out real** (fila própria por consumer + `boss.publish`/`subscribe` — pg-boss é job queue, não pub/sub por fila!), timeline explicável, admin de regras/níveis/benefícios, TRS-007 rebuild síncrono, TRS-010/011 benefícios com elegibilidade on-demand sobre `{score, level}`. **E2E local: `pnpm test:e2e`** (Postgres embutido descartável — nunca usar o Supabase compartilhado, que é produção). **MÓDULO 5 (TRS reputação) COMPLETO — TRS-012..020** (2026-08-09): catálogo de badges admin + premiação automática via consumer de `TrustScore.Calculated` (PERMANENT/DYNAMIC, seed 5 badges), visibility policies (4 toggles), perfil consolidado PRIVATE/PUBLIC (`/trust-profile/me` + `/public/trust-profile/{token}`), shares com token `<random>.<hmac>` (segredo derivado da chave JWT — sem env nova), verificação de autenticidade, revogação (410) e histórico de acessos. **MÓDULO 6 (MRK anúncios + conversas) COMPLETO — MRK-001..008** (2026-08-09): primeiro módulo que **consome** a Trust Layer. Anúncio nasce DRAFT (só `title` obrigatório — INCONSISTENCIAS #29), edita, e **publica só se a conta estiver ativa e o nível atender ao mínimo da categoria** (`marketplace_categories` com `minimum_trust_level`, seed de 12 categorias — #30); busca pública com filtros/ordenação por reputação do anunciante (LEFT JOIN read-only em `trust_scores`), detalhe com resumo do vendedor respeitando as Visibility Policies (TRS-016), contato que **reutiliza** conversa ativa (#9 → 200), mensagens imutáveis com controle de leitura e encerramento preservando o histórico. 8 eventos `MarketplaceListing.*`/`MarketplaceConversation.*`/`MarketplaceMessage.Sent`. **MÓDULO 7 (MRK negociação) COMPLETO — MRK-009..014** (2026-08-10): cadeia de propostas com `parentOfferId` e 7 estados (`PENDING/ACCEPTED/REJECTED/WITHDRAWN/COUNTERED/EXPIRED/CLOSED` — sem `CANCELLED`, INCONSISTENCIAS #10). **Duas autorizações distintas**: quem propôs atualiza/retira, quem recebeu aceita/rejeita/contrapõe — e a contraoferta inverte os papéis. O **aceite (MRK-013) é o pivô**: numa única transação a proposta vira ACCEPTED, as concorrentes viram CLOSED, o anúncio vira RESERVED e o `MarketplaceOrder` nasce em CREATED (tabela criada aqui por causa da atomicidade exigida pelo MRK-015 BR-007 — #32). Uma proposta viva por negociação (#34); expiração derivada de `expires_at`, sem job (#33). 8 eventos novos, incluindo o trio atômico `MarketplaceOffer.Accepted` + `MarketplaceListing.Reserved` + `MarketplaceOrder.Created`. **MÓDULO 8 (MRK ciclo do pedido) COMPLETO — MRK-015..022** (2026-08-10): máquina de **13 estados** com `OrderLifecycleService` como porta única (persistência + evento + auditoria atômicos; nenhum salto de estado). Agendar (com checagem de conflito na agenda do prestador) → check-in → check-out (calcula duração efetiva) → confirmação do cliente → conclusão automática. **Aqui o ciclo do produto fecha**: `MarketplaceOrder.CustomerConfirmed` vira Trust Event (+40 para o prestador) e `MarketplaceOrder.Cancelled` penaliza quem cancelou (−20) — INCONSISTENCIAS #13. Cancelamento devolve o anúncio à vitrine via consumer (#12). Novas decisões: uma só tabela de execução (#35), estados intermediários sem produtor no MVP (#36), pipeline de conclusão pós-confirmação (#37). **MÓDULO 9 (MRK disputas e avaliações) COMPLETO — MRK-023..025** (2026-08-10): abrir disputa (1 ativa por pedido, garantida por índice parcial), resolver (só ADMIN/mediador, decisão definitiva) e avaliar (1 por participante, nota 1–5 + critérios opcionais em tabela própria porque são configuráveis). **Fecha o gap #13 e o ciclo de reputação**: `MarketplaceReview.Created` pontua quem foi avaliado (+30/+5/−30 por faixa) e `MarketplaceDispute.Resolved` penaliza a parte culpada (−60/−30); abrir disputa não pontua, porque não é prova de culpa.

## BACKEND DO MVP COMPLETO — 68/68 features (2026-08-10)

Todos os 9 módulos entregues, 46 suítes de teste verdes, 71 rotas no OpenAPI.

## FRONTEND — onda 1 entregue (2026-08-10)

`apps/web` saiu de 9 para **19 rotas**, todas consumindo a API real: dashboard com score/timeline/badges, Trust Passport, Verificações (com upload multipart), Trust Score explicável (níveis, timeline, selos, benefícios), Marketplace (busca com filtro de reputação, detalhe com cartão de confiança do anunciante, gestão de anúncios com publicação), Conversas com negociação embutida (propostas, contrapropostas, aceite), Pedidos com linha do tempo e todas as ações do ciclo (agendar/check-in/check-out/confirmar/cancelar/avaliar/disputar), perfil público `/p/[token]` e configurações de privacidade com links compartilháveis.

Infra do frontend: [lib/api.ts](apps/web/lib/api.ts) (envelope + paginação + refresh automático + multipart), [lib/types.ts](apps/web/lib/types.ts) (contratos espelhando o OpenAPI), [lib/labels.ts](apps/web/lib/labels.ts) (enums da API → português) e [components/layout.tsx](apps/web/components/layout.tsx) (Card, Pill, ScoreRing, TrustLevelBadge, StarRating, EmptyState).

## FRONTEND — onda 2: painel de moderação (2026-08-10)

`/admin` com fila de **verificações** (iniciar análise → aprovar/rejeitar com motivo do catálogo) e de **disputas** (julgar com fundamentação, avisando na tela quanto cada desfecho custa em pontos). O item "Moderação" só aparece no menu para quem é admin — a autorização real continua no `AdminGuard` da API.

**Adicionado ao backend para as telas**: `GET /verifications` (minhas verificações), `GET /verifications/queue/pending` (fila de análise, ADMIN) e o campo `isAdmin` em `/identities/me`.

**Como virar admin**: `UPDATE identities SET is_admin = true WHERE email = '...'` no banco (PLANO §4 — primeiro mecanismo admin do MVP).

## NOTIFICAÇÕES (NTF-001) + admin de regras (2026-08-10)

**Módulo `notification`** — 10º módulo, puramente reativo: não expõe criação, tudo nasce de evento consumido do outbox. 17 consumers `ntf.*` declarados na tabela `NOTIFICATION_RULES` (em vez de 17 classes idênticas), construídos como providers via factory — o `OutboxRelayService` descobre por `instanceof EventConsumer`. Regras: quem age nunca é avisado do próprio ato; queda de nível não notifica; disputa aberta avisa só a parte reclamada. Frontend: sininho com contador no header + `/notifications`.

Dois payloads ganharam campo (adição retrocompatível) para o consumidor não precisar resolver agregados alheios: `Verification.Approved/Rejected` + `identityId` e `MarketplaceMessage.Sent` + `recipientId`.

**`/admin/trust-rules`** — pontuação por evento (editar pontos, limite por pessoa, ativar/desativar), faixas de nível, selos e benefícios, com as condições JSON renderizadas em linguagem legível. A tela avisa que mudar regra não reescreve o passado.

**MVP COMPLETO**: 10 módulos, 47 suítes verdes, 76 rotas no OpenAPI, 24 telas. Pendências de produto (P4 escala do score, P5 DSL de regras) em [INCONSISTENCIAS.md](INCONSISTENCIAS.md).

## Stack oficial (decidido em 2026-08-08 — detalhes em INCONSISTENCIAS.md P1–P7)

- **Backend**: NestJS + Fastify (Node 22, TypeScript), monolito modular, Drizzle ORM, Zod, Pino + OpenTelemetry
- **Frontend**: Next.js 15 + Tailwind + shadcn/ui + TanStack Query
- **Banco**: Supabase (PostgreSQL gerenciado) + Supabase Storage; **não usar Supabase Auth** (Identity é módulo próprio, IDN-001..009)
- **Mensageria/jobs**: pg-boss (outbox transacional no próprio Postgres)
- **Cripto**: Argon2id (senhas), JWT ES256 15 min, refresh 256-bit hashed + rotação, UUIDv7, HMAC-SHA256 nos share tokens
- **Testes**: Vitest + Testcontainers + Supertest + Playwright
- **Interfaces sem prefixo "I"** (convenção TypeScript, conforme DOC-001 "escolher um padrão")

## Documentos-guia (ler nesta ordem)

1. [PLANO-DE-MODULOS.md](PLANO-DE-MODULOS.md) — quebra em módulos, ordem de desenvolvimento, grafo de dependências
2. [INCONSISTENCIAS.md](INCONSISTENCIAS.md) — conflitos entre docs e **decisões canônicas** (vencem as specs quando divergem)
3. `docs-extracted/` — toda a documentação original convertida para markdown:
   - `docs-extracted/MVP/` — 64 feature specs (IDN, TPS, VRF, TRS, MRK) + standards DOC-000..007
   - `docs-extracted/Arquitetura/` — TP-001..006 (blueprint, domain model, Trust Engine, scoring)
   - `docs-extracted/Desenvolvedor/` — processo, roadmap, série Identity ID-001..006
   - `docs-extracted/Founder Book/` — visão, personas, jornadas, design system
   - Os `.docx` originais em `Trust Platform-20260805T205238Z-1-001/` são a fonte; a pasta `docs-extracted/` é a versão de trabalho

## Regras principais (detalhes nas skills)

- **Ordem de desenvolvimento**: IDN → TPS → VRF → TRS núcleo → TRS reputação → MRK. Nenhuma feature usa módulo ainda não implementado. Os campos "Depends On/Blocks" das specs contêm erros de renumeração — a ordem oficial é a do PLANO-DE-MODULOS.
- **Só o Trust Engine (TRS) altera Score/Level/Badges**; módulos de negócio apenas publicam eventos.
- Clean Architecture em 4 camadas; entidades em inglês; enums em UPPER_SNAKE_CASE.
- API: envelope `{success, data}` / `{success: false, error: {code, message}}`, rotas `/api/v1/<recurso-plural-kebab>`.
- Banco: PostgreSQL 16+, tabelas snake_case plural, `id UUID` (v7), soft delete, tudo via migration.
- Eventos: `<Entity>.<Action>` no passado, envelope com eventId/correlationId, Transactional Outbox, consumers idempotentes.
- Senha: mínimo 12 caracteres (DOC-002 vence specs antigas que dizem 8).

## Skills do projeto (`.claude/skills/`)

| Skill | Quando usar |
|---|---|
| `trust-feature-workflow` | **Sempre** ao implementar/planejar uma feature do backlog |
| `trust-domain` | Regras de negócio, integrações entre módulos, máquinas de estado |
| `trust-architecture` | Criar componentes backend, estrutura de pastas, naming |
| `trust-api` | Qualquer endpoint HTTP |
| `trust-database` | Tabelas, migrations, queries |
| `trust-events` | Eventos, publishers, consumers |
| `trust-security` | Auth, endpoints sensíveis, auditoria |
| `trust-logging` | Logs e instrumentação |
| `trust-testing` | Escrever/revisar testes |
| `trust-payments` | **Qualquer feature PAY-XXX**, valor monetário, gateway, custódia, liquidação, reembolso |
