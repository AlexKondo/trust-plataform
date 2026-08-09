# Módulo 0 — Fundação (concluído em 2026-08-08)

Infraestrutura transversal sobre a qual todos os módulos de negócio (IDN → TPS → VRF → TRS → MRK) serão construídos. Nenhuma feature de negócio vive aqui.

## O que existe

### Monorepo

```
trust/
├── apps/api/                  # NestJS 11 + Fastify (monolito modular, Node 22+)
│   ├── drizzle/               # migrations SQL versionadas
│   ├── src/
│   │   ├── main.ts            # bootstrap (helmet, prefixo /api/v1, shutdown hooks)
│   │   ├── app.module.ts      # wiring global (guard, interceptor, filter, middleware)
│   │   ├── shared/            # shared kernel (detalhe abaixo)
│   │   └── modules/health/    # GET /api/v1/health (público)
│   └── test/integration/      # e2e condicional a TEST_DATABASE_URL
├── packages/                  # (futuro: contratos compartilhados com o frontend)
├── .github/workflows/ci.yml   # lint → typecheck → test (Postgres 16) → build
└── docs/event-catalog.md      # catálogo obrigatório de eventos
```

### Shared kernel (`apps/api/src/shared/`)

| Pasta | O que fornece |
|---|---|
| `config/` | Validação Zod do `.env` na subida (`env.schema.ts`) + `AppConfigService` tipado |
| `logging/` | Pino JSON estruturado (nestjs-pino), Correlation ID + Request ID em toda requisição (headers `x-correlation-id`/`x-request-id`), redação de headers sensíveis |
| `api/` | `ResponseEnvelopeInterceptor` (`{success, data}` + `pagination`), `GlobalExceptionFilter` (envelope de erro, nunca vaza stack/SQL), `ZodValidationPipe` (400 VALIDATION_ERROR) |
| `domain/exceptions/` | `DomainException` e bases por status: `EntityNotFoundException` 404, `StateConflictException` 409, `BusinessRuleViolationException` 422, `ForbiddenOperationException` 403 |
| `security/` | `JwtTokenService` (ES256, access 15 min, issuer `trust-platform`), `JwtAuthGuard` **global** (tudo exige Bearer, opt-out com `@Public()`), `@CurrentIdentity()` |
| `database/` | Drizzle ORM + postgres.js (pooler Supabase, `prepare: false`), schema, `migrate.ts` |
| `events/` | Envelope canônico (`createEventEnvelope`, valida `<Entity>.<Action>`), `OutboxService` (grava na transação do chamador), `OutboxRelayService` (publica no pg-boss, at-least-once, retry + FAILED após `OUTBOX_MAX_ATTEMPTS`) |
| `audit/` | `AuditLogService` — trilha imutável em `audit_logs` |

### Tabelas (migrations `0000` e `0001`)

- `audit_logs` — append-only; trigger `trg_audit_logs_immutable` bloqueia UPDATE/DELETE no banco. **Exceção documentada aos padrões**: sem `updated_at` e sem soft delete (registros de auditoria nunca mudam).
- `outbox_events` — Transactional Outbox; `event_id` único (dedupe), status `PENDING → PUBLISHED | FAILED`.
- `pgboss.*` — criadas pelo próprio pg-boss na primeira subida (fila de publicação/consumo).

## Como rodar

```bash
pnpm install            # na raiz
pnpm db:migrate         # aplica migrations (usa DIRECT_DATABASE_URL ou DATABASE_URL do .env)
pnpm dev                # sobe a API em http://localhost:3001/api/v1/health
pnpm test               # unit; com TEST_DATABASE_URL=postgres descartável roda também o e2e
pnpm lint && pnpm typecheck && pnpm build
```

## Convenções que os próximos módulos herdam

1. Controllers retornam DTOs puros — o envelope é aplicado pelo interceptor.
2. Toda exceção de negócio é subclasse de `DomainException` com `code` estável em UPPER_SNAKE_CASE.
3. Toda rota é autenticada por padrão; `@Public()` é decisão explícita.
4. Evento de domínio: `outboxService.enqueue(tx, {...})` **dentro** da transação de negócio + entrada no `docs/event-catalog.md`. Consumers devem deduplicar por `eventId`.
5. Auditoria de operação crítica: `auditLogService.record(entry, tx)` na mesma transação.
6. `correlationId` vem de `request.requestContext` (middleware) e é propagado para logs, eventos e auditoria.
7. Nova tabela = novo arquivo em `shared/database/schema/` (ou schema do módulo) + `pnpm db:generate` + revisão do SQL gerado.

## Decisões técnicas registradas

- **JWT ES256**: chaves PEM em base64 no `.env` (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`), geradas localmente. Produção usará secret manager e rotação.
- **pg-boss como broker** (P3): fila no próprio Postgres, schema `pgboss`; consumidores usarão `boss.work(eventName)`.
- **Sem Docker local**: dev usa Supabase (`trust-dev-sp`, São Paulo); e2e roda onde houver Postgres descartável (CI usa service container Postgres 16). O plano original citava Docker Compose — substituído pela decisão de stack P1–P7.
- **Fastify pinado em 5.10.0** para casar com a versão interna do `@nestjs/platform-fastify` (evita dois fastify no lockfile).
- Interfaces **sem** prefixo `I` (DOC-001, decisão registrada no CLAUDE.md).
