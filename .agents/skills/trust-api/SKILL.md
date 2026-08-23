---
name: trust-api
description: Padrões de API REST da Trust Platform (envelope, status codes, paginação, naming de rotas). Use ao criar ou alterar qualquer endpoint HTTP, DTO de request/response ou documentação OpenAPI. Fonte - DOC-003, ID-004.
---

# API Standards — Trust Platform

## URLs

- Base: `/api/v1/...` (versionamento na URL; breaking change → `/api/v2`)
- Recursos: substantivos, **plural, minúsculas, kebab-case** — `identities`, `trust-passports`, `marketplace-orders`
- Sem verbos, exceto ações: `/auth/login`, `/listings/{id}/publish`, `/offers/{id}/accept` (sempre POST)
- Endpoints públicos sem auth ficam sob `/public/...` (ex.: `/public/trust-profile/{shareToken}`)
- Padrão CRUD: `GET /identities` · `GET /identities/{identityId}` · `POST /identities` · `PUT/PATCH /identities/{identityId}` · `DELETE /identities/{identityId}`

## Envelope (obrigatório, sem exceção)

```json
// sucesso
{ "success": true, "data": { } }
// erro
{ "success": false, "error": { "code": "IDENTITY_NOT_FOUND", "message": "Identity not found." } }
```
- Códigos de erro estáveis em **UPPER_SNAKE_CASE** (`EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS`)
- Campos JSON em **camelCase**; datas em UTC ISO 8601 (`2026-08-03T18:30:25Z`)
- JSON UTF-8 apenas; XML proibido

## Status codes

200 consulta/ação · 201 criado · 202 processamento assíncrono · 204 sem conteúdo (logout, delete) · 400 request malformado · **401 não autenticado / token de segurança inválido ou expirado** · 403 sem permissão · 404 não encontrado · 409 conflito de estado · **422 violação de regra de negócio/validação** · 410 recurso revogado/expirado (shares) · 429 rate limit · 500 interno.

Regra da plataforma (INCONSISTENCIAS #23): token inválido/expirado → 401; regra de negócio → 422; malformado → 400.

## Paginação, filtro, ordenação

- `?page=1&pageSize=20` (defaults); resposta com bloco irmão de `data`:
  `"pagination": { "page": 1, "pageSize": 20, "totalItems": 87, "totalPages": 5 }`
- Filtros por query string (`?status=ACTIVE&country=BR`) — nunca no body
- Ordenação: `?sortBy=createdAt&direction=asc|desc`

## Auth e headers

- `Authorization: Bearer {accessToken}` em tudo que não for público
- `Content-Type: application/json` e `Accept: application/json` obrigatórios
- `Idempotency-Key: <UUID>` recomendado em operações críticas (aceite de oferta, confirmação de pedido)
- Anti-enumeração: forgot-password e similares respondem **sempre igual** (202/204), exista ou não o recurso

## Erros — nunca expor

Stack trace, SQL, caminhos de arquivo, detalhes de infraestrutura, qual campo da credencial errou ("Invalid credentials" genérico).

## OpenAPI

Toda feature atualiza a documentação OpenAPI **na mesma entrega**: descrição, parâmetros, exemplos, respostas, códigos de erro, modelos. Mudança de contrato exige atualizar o documento antes da implementação.
