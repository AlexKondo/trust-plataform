
Trust Platform MVP
Feature Specification
TRS-016 — Manage Visibility Policies

Document Information
Campo
Valor
Feature ID
TRS-016
Feature Name
Manage Visibility Policies
Module
Trust Score
Priority
High
Sprint
Sprint 6
Status
Ready for Development
Depends On
TRS-015 – Get Trust Profile
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-017 – Share Trust Profile

1. Business Objective
Permitir que administradores configurem quais informações do Trust Profile poderão ser visualizadas em cada contexto de acesso, garantindo privacidade, segurança e consistência na exposição dos dados da plataforma.

2. Scope
Esta Feature Inclui
Cadastro de políticas de visibilidade
Alteração de políticas existentes
Ativação e desativação
Versionamento
Auditoria

Esta Feature NÃO Inclui
Compartilhamento do Trust Profile
Consulta do Trust Profile
Alteração dos dados do usuário

3. User Story
Como administrador da plataforma
Quero configurar políticas de visibilidade
Para que cada informação do Trust Profile seja exibida apenas para os públicos autorizados.

4. Business Rules
BR-001
Cada política deverá possuir um código único.

BR-002
Uma política deverá estar associada a um atributo específico do Trust Profile.
Exemplos:
Trust Score
Trust Level
Badges
Benefits
Verified Email
Verified Phone
Verified Address

BR-003
Cada política deverá definir o público autorizado.
Valores permitidos:
PUBLIC
AUTHENTICATED
OWNER
ADMIN

BR-004
Toda alteração deverá gerar uma nova versão.

BR-005
Apenas uma versão ativa poderá existir para o mesmo atributo.

BR-006
Toda alteração deverá ser registrada em auditoria.

5. Functional Flow
Administrador
↓
Cadastrar ou atualizar política
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
VisibilityPolicy
Atributos mínimos
id

code

attribute

visibility

description

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
VisibilityPolicyRepository
Métodos mínimos:
save()
findByCode()
findActivePolicies()
findByAttribute()
findByVersion()

6.3 Use Cases
Criar:
CreateVisibilityPolicyUseCase
UpdateVisibilityPolicyUseCase
ActivateVisibilityPolicyUseCase
DeactivateVisibilityPolicyUseCase
GetVisibilityPoliciesUseCase

6.4 DTOs
Criar DTOs para:
criação
atualização
consulta
ativação
desativação

6.5 Exceptions
Criar:
VisibilityPolicyAlreadyExistsException
VisibilityPolicyNotFoundException
InvalidVisibilityPolicyException

7. Database
Criar tabela:
visibility_policies
Campos
Campo
Tipo
id
UUID
code
VARCHAR
attribute
VARCHAR
visibility
VARCHAR
description
TEXT
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
attribute
visibility
is_active
version

8. API
Endpoints
POST   /api/v1/admin/visibility-policies

PUT    /api/v1/admin/visibility-policies/{id}

PATCH  /api/v1/admin/visibility-policies/{id}/activate

PATCH  /api/v1/admin/visibility-policies/{id}/deactivate

GET    /api/v1/admin/visibility-policies

GET    /api/v1/admin/visibility-policies/{id}
Todos os endpoints deverão exigir autenticação e autorização administrativa.

9. Logging
Registrar:
Policy ID
Código
Atributo
Visibilidade definida
Usuário responsável
Operação executada
Correlation ID

10. Events
Publicar:
VisibilityPolicy.Created

VisibilityPolicy.Updated

VisibilityPolicy.Activated
VisibilityPolicy.Deactivated

11. Unit Tests
Implementar testes para:
criação de política
atualização
versionamento
ativação
desativação
validação de unicidade
publicação de eventos

12. Integration Tests
Validar:
persistência
endpoints administrativos
auditoria
versionamento
publicação de eventos

13. Acceptance Criteria
A Feature será considerada pronta quando:
Administradores puderem configurar políticas de visibilidade.
Apenas uma versão ativa existir por atributo.
Todas as alterações forem auditáveis.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration visibility_policies
Aggregate VisibilityPolicy
Repository
Use Cases
Endpoints administrativos
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O gerenciamento das políticas de visibilidade estiver operacional.
O versionamento estiver consistente.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
