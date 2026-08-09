# Trust Platform

Infraestrutura digital de confiança para a economia de serviços locais. O marketplace é a primeira aplicação sobre a "Trust Layer" (Trust Passport, Score, Capital, Benefits). Este repositório contém a documentação completa do produto e (futuramente) o código do MVP.

## Estado atual

**Módulo 0 (fundação) concluído em 2026-08-08** — ver [docs/MODULO-0.md](docs/MODULO-0.md): monorepo pnpm, `apps/api` (NestJS 11 + Fastify), shared kernel (envelope de API, error handler, JWT ES256 guard global, Correlation/Request ID, logging Pino, Transactional Outbox via pg-boss, `audit_logs` append-only com trigger), migrations aplicadas no Supabase `trust-dev-sp`, CI GitHub Actions. Dev: `pnpm dev` → `http://localhost:3001/api/v1/health`; e2e: `TEST_DATABASE_URL=... pnpm test`.

**Módulo 1 em andamento**: IDN-001 Create Identity e IDN-002 Verify Email concluídos no backend em 2026-08-08 (tabelas `identities` + `email_verification_tokens`, Argon2id, token SHA-256, eventos `Identity.Created`/`Identity.EmailVerified` via outbox, auditoria, OpenAPI em [docs/openapi.yaml](docs/openapi.yaml), catálogo em [docs/event-catalog.md](docs/event-catalog.md)). E-mail via **Brevo** (P6b): sem chave REST `xkeysib-` no `.env`, a API loga o link de verificação em vez de enviar. Páginas de frontend ficam para quando o `apps/web` for iniciado. IDN-003 Login também concluído (tabela `sessions`, refresh opaco SHA-256, lockout configurável, rate limiting por IP, evento `Identity.Authenticated`). IDN-004 Refresh, IDN-005 Get Current Identity (`GET /identities/me`) e IDN-006 Logout (`POST /auth/logout`, revoga só a sessão atual) também concluídos. Próximo passo: **IDN-007 Forgot Password → IDN-008 Reset → IDN-009 Change** (fecham o Módulo 1; reset revoga todas as sessões, change revoga todas exceto a atual — INCONSISTENCIAS #22). Pendências restantes (P4 escala do score, P5 DSL de regras) em [INCONSISTENCIAS.md](INCONSISTENCIAS.md).

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
