---
name: trust-architecture
description: Padrões de arquitetura e código da Trust Platform (Clean Architecture, estrutura de pastas, naming, fronteiras de módulo). Use ao criar qualquer componente backend, novo módulo, ou ao revisar código. Fonte - DOC-001, TP-001/002.
---

# Arquitetura e Código — Trust Platform

## Clean Architecture (obrigatória em todo módulo)

4 camadas; dependências sempre apontam para o centro (domain). Nenhuma camada acessa camada superior.

```
src/
 ├── application/   (usecases/, dto/, mapper/)
 ├── domain/        (entities/, repositories/, services/, events/, exceptions/)
 ├── infrastructure/ (persistence/, api/, messaging/, security/, configuration/)
 ├── shared/
 └── tests/
```

## Componentes obrigatórios por feature (backend)

Controller · Request DTO · Response DTO · Use Case · Repository Interface (domain) · Repository Implementation (infra) · Validators · Domain Entity · Domain Exceptions · Services · Event Publisher · Unit Tests · Integration Tests. Nenhum componente acumula responsabilidade de outro.

## Naming (linguagem canônica: inglês, idêntico em código, API, banco e docs)

- Classes: **PascalCase** — `CreateIdentityUseCase`, `TrustScoreEngine`, `MarketplaceOrderLifecycleService`
- Métodos e variáveis: **camelCase** — `createIdentity()`, `findByEmail()`, `identityId`
- Constantes: **UPPER_SNAKE_CASE** — `MAX_LOGIN_ATTEMPTS`
- Use Cases: `<Verbo><Entidade>UseCase`, um por feature, responsabilidade única
- Exceptions específicas de domínio: `IdentityNotFoundException`, `ImmutableFieldException` — nunca exceção genérica para regra de negócio
- Enums serializados: **UPPER_SNAKE_CASE** (`PENDING_REVIEW`, `AWAITING_CUSTOMER_CONFIRMATION`)
- Interface com prefixo "I" ou sem: escolher UM padrão conforme a stack e nunca misturar

## Regras rígidas

1. **Entities não conhecem** HTTP, banco, JSON ou APIs externas.
2. **DTOs próprios por endpoint** — nunca expor Entity na API.
3. **Repositories** só persistência (`save`, `findById`, `exists`…) — zero regra de negócio.
4. **Services** = comportamento compartilhado (`PasswordHashService`, `JwtTokenService`); fluxo completo de negócio é do Use Case.
5. **Mappers dedicados** para Entity↔DTO — nada de transformação em Controller/Use Case.
6. **Validação sintática antes do Use Case** (formato, obrigatoriedade, enum); validação de negócio no domínio.
7. **Dependency Injection sempre** — proibido `new` de service dentro de Use Case.
8. `PasswordHashService` é o ÚNICO componente autorizado a gerar hash de senha.

## Fronteiras de módulo (TP-001/002)

- Cada entidade pertence a **um único módulo**; nenhum módulo acessa o banco de outro.
- Comunicação entre módulos: API (síncrona) ou evento (assíncrona) — nada mais. Idempotência obrigatória; contratos versionados.
- **Só o Trust Engine (TRS) altera Score/Level/Badges** — módulos de negócio apenas publicam eventos.
- Módulos e prefixos: IDN (Identity), TPS (Trust Passport), VRF (Verification), TRS (Trust Score), MRK (Marketplace).

## Em conflito velocidade × qualidade arquitetural, escolher a solução sustentável.
