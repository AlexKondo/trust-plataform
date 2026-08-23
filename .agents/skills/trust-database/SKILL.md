---
name: trust-database
description: Padrões de banco de dados da Trust Platform (PostgreSQL, naming snake_case, UUID, soft delete, migrations, índices). Use ao criar/alterar tabelas, migrations, queries ou repositórios. Fonte - DOC-004, ID-003.
---

# Database Standards — Trust Platform

## Engine

PostgreSQL 16+. IDs: **UUID v7** (v4 como fallback) — nunca auto-increment.

## Naming

- Tabelas: **snake_case, minúsculas, plural** — `identities`, `trust_passports`, `marketplace_orders`. Nunca `tbl_`, nunca singular.
- Colunas: snake_case — `identity_id`, `created_at`, `refresh_token_hash`
- PK: sempre `id UUID PRIMARY KEY`
- FKs explícitas: `identity_id`, `organization_id`, `trust_passport_id` — proibido `parent`, `reference`, `owner`
- Índices: `idx_<entidade>_<campo>` — `idx_identity_email`, `idx_membership_organization`

## Colunas padrão

- Sempre: `created_at`, `updated_at` (TIMESTAMPTZ, UTC)
- Soft delete: `deleted_at TIMESTAMPTZ NULL` — consultas padrão com `WHERE deleted_at IS NULL`; `identities` e `organizations` NUNCA excluídas fisicamente
- Entidades críticas: `created_by`, `updated_by`, `deleted_by` (Identity ID)
- Exceções documentadas: `sessions` usa `revoked_at` em vez de `deleted_at`; tabelas de token não têm soft delete

## Tipos

UUID (ids) · VARCHAR (texto curto) · TEXT (longo) · **DECIMAL** (monetário/percentual — nunca float) · TIMESTAMPTZ · BOOLEAN. Enums persistidos como VARCHAR em UPPER_SNAKE_CASE.

## Integridade e transações

- Constraints no banco (PK, FK, UNIQUE, CHECK, NOT NULL) — integridade não fica só na aplicação
- FKs `ON UPDATE RESTRICT ON DELETE RESTRICT` (cascade só com justificativa de negócio)
- Unicidades de negócio como constraint: `UNIQUE(identity_id, organization_id)` em memberships, `UNIQUE(trust_passport_id)` em trust_scores, `UNIQUE(offer_id)` em orders, `UNIQUE(order_id, reviewer_id)` em reviews; unicidade condicional via índice parcial (ex.: 1 disputa ativa por pedido)
- Operações multi-tabela relacionadas: transação ACID com rollback total (ex.: aceite de oferta → criar pedido → reservar listing)

## Segurança de dados

Senha, refresh token e OTP **apenas como hash** (Argon2id ou bcrypt). Nunca dado sensível em texto puro.

## Migrations

- Toda alteração estrutural **só via migration versionada**; nenhuma tabela sem migration
- Nunca editar migration já executada; uma alteração lógica por migration; reversível quando possível
- Proibido alterar produção manualmente

## Performance

- Índice para toda FK, coluna de filtro e ordenação frequente (avaliar custo de escrita)
- Evitar `SELECT *`, N+1 e full scans; targets do Identity: login < 100 ms P95, busca por e-mail < 50 ms
