
Trust Platform MVP
Feature Specification
TRS-012 — Manage Trust Badges

Document Information
Campo
Valor
Feature ID
TRS-012
Feature Name
Manage Trust Badges
Module
Trust Score
Priority
High
Sprint
Sprint 5
Status
Ready for Development
Depends On
TRS-011 – Get My Trust Benefits
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-013 – Award Trust Badges

1. Business Objective
Permitir que administradores configurem os badges da plataforma, definindo critérios de concessão, ciclo de vida, visibilidade e demais atributos necessários para reconhecer conquistas relevantes dos usuários.

2. Scope
Esta Feature Inclui
Cadastro de badges
Versionamento
Ativação e desativação
Definição dos critérios de elegibilidade
Definição do tipo do badge (permanente ou dinâmico)
Auditoria

Esta Feature NÃO Inclui
Concessão automática de badges
Revogação automática de badges
Exibição no perfil público

3. User Story
Como administrador da plataforma
Quero configurar badges
Para que a plataforma reconheça conquistas e comportamentos positivos dos usuários.

4. Business Rules
BR-001
Cada badge deverá possuir um código único e imutável.

BR-002
Cada alteração relevante deverá gerar uma nova versão.

BR-003
Todo badge deverá possuir um tipo:
PERMANENT
DYNAMIC

BR-004
A elegibilidade deverá ser definida por uma expressão configurável (eligibilityExpression).

BR-005
Badges desativados não poderão ser concedidos, mas deverão permanecer disponíveis para consultas históricas.

BR-006
Cada badge deverá definir sua visibilidade:
PUBLIC
PRIVATE
INTERNAL

5. Functional Flow
Administrador
↓
Criar ou atualizar badge
↓
Validar configuração
↓
Criar nova versão
↓
Persistir
↓
Registrar auditoria
↓
Publicar evento

6. Backend Implementation
6.1 Aggregate
Criar:
TrustBadge
Atributos mínimos
id

code

name

description

badgeType

visibility

icon

category

eligibilityExpression

priority

isActive

version

effectiveFrom

effectiveTo

createdBy

approvedBy

changeReason
createdAt
updatedAt

6.2 Repository
Criar:
TrustBadgeRepository
Métodos mínimos:
save()
findByCode()
findActiveBadges()
findByVersion()
findByCategory()

6.3 Use Cases
Criar:
CreateTrustBadgeUseCase
UpdateTrustBadgeUseCase
ActivateTrustBadgeUseCase
DeactivateTrustBadgeUseCase
GetTrustBadgesUseCase

6.4 DTOs
Criar DTOs para:
criação;
atualização;
consulta;
ativação;
desativação.

6.5 Exceptions
Criar:
TrustBadgeAlreadyExistsException
TrustBadgeNotFoundException
InvalidTrustBadgeException

7. Database
Criar tabela:
trust_badges
Campos
Campo
Tipo
id
UUID
code
VARCHAR
name
VARCHAR
description
TEXT
badge_type
VARCHAR
visibility
VARCHAR
icon
VARCHAR
category
VARCHAR
eligibility_expression
TEXT
priority
INTEGER
is_active
BOOLEAN
version
INTEGER
effective_from
TIMESTAMP
effective_to
TIMESTAMP NULL
created_by
UUID
approved_by
UUID NULL
change_reason
TEXT
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
UNIQUE(code, version)
Índices
Criar índices para:
code
category
badge_type
visibility
is_active
version

8. API
Endpoints
POST   /api/v1/admin/trust-badges

PUT    /api/v1/admin/trust-badges/{id}

PATCH  /api/v1/admin/trust-badges/{id}/activate

PATCH  /api/v1/admin/trust-badges/{id}/deactivate

GET    /api/v1/admin/trust-badges

GET    /api/v1/admin/trust-badges/{id}
Todos os endpoints exigirão autenticação e autorização administrativa.

9. Logging
Registrar:
Badge ID
Código
Tipo
Versão
Usuário responsável
Operação
Correlation ID

10. Eventos
Publicar:
TrustBadge.Created
TrustBadge.Updated
TrustBadge.Activated
TrustBadge.Deactivated

11. Testes Unitários
Implementar testes para:
criação;
atualização;
versionamento;
ativação;
desativação;
validação da elegibilidade;
publicação de eventos.

12. Testes de Integração
Validar:
persistência;
endpoints administrativos;
auditoria;
versionamento;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Administradores puderem gerenciar badges sem alterar código.
O versionamento estiver consistente.
Apenas badges ativos puderem ser concedidos.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_badges
Aggregate TrustBadge
Repository
Use Cases
Endpoints administrativos
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O gerenciamento de badges estiver operacional.
As regras de elegibilidade estiverem válidas.
O versionamento estiver consistente.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
