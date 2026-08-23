---
name: trust-testing
description: Padrões de teste da Trust Platform (pirâmide, cobertura mínima, naming, quality gates). Use ao escrever ou revisar testes de qualquer feature, ou ao decidir o que testar. Fonte - DOC-007.
---

# Testing Standards — Trust Platform

## Pirâmide

Muitos **unitários** · integração moderada · poucos **E2E**. Shift Left: testes junto com o código, nunca depois.

## Categorias e escopo

- **Unit**: Use Cases, Domain Services, Entities, Mappers, Validators — rápidos, isolados, sem banco/rede; mocks nos ports
- **Integration**: endpoints, persistência real, transações, publicação/consumo de eventos, auth
- **Contract**: compatibilidade produtor↔consumidor de APIs e eventos (envelope, versões)
- **E2E**: fluxos críticos — cadastro→verificação→login, criação→publicação→oferta→pedido→confirmação
- **Security**: 401/403, ownership (IDOR), rate limit, anti-enumeração, validação de entrada
- **Performance**: quando houver target definido (ex.: login < 100 ms P95)

## Por Use Case (mínimo)

Cenário de sucesso + cada validação + cada exceção de domínio + regras de negócio (BR-XXX da spec) + casos limite. Toda BR numerada da spec deve ter teste correspondente.

## Naming

Descritivo, comportamento esperado: `shouldAuthenticateValidIdentity()`, `shouldRejectExpiredRefreshToken()`, `shouldNotAllowOwnerToContactOwnListing()`. Assertions explícitas — proibido teste que só executa código.

## Cobertura mínima (quality gate)

| Camada | Cobertura |
|---|---|
| Domain | ≥ 90% |
| Application | ≥ 85% |
| Infrastructure | ≥ 70% |

Cobertura não substitui qualidade: caminhos críticos sempre cobertos independentemente do número.

## Dados de teste

Previsíveis, criados e destruídos pelo próprio teste (builders/factories); **proibido** depender de dados de ambientes compartilhados. Testes determinísticos e independentes entre si (qualquer ordem).

## Regressão

Toda correção de bug inclui teste automatizado que reproduz o problema **antes** do fix.

## Quality gates (bloqueiam merge)

Teste crítico falhando · regressão sem aprovação formal · cobertura abaixo do mínimo em componente crítico · vulnerabilidade crítica em dependência.
