
Trust Platform MVP
Feature Specification
TRS-010 — Manage Trust Benefits

Document Information
Campo
Valor
Feature ID
TRS-010
Feature Name
Manage Trust Benefits
Module
Trust Score
Priority
High
Sprint
Sprint 4
Status
Ready for Development
Depends On
TRS-009 – Manage Trust Score Rules
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-011 – Get Eligible Trust Benefits

1. Business Objective
Permitir que administradores autorizados configurem os benefícios concedidos aos usuários conforme sua reputação, possibilitando a evolução da estratégia de fidelização sem alterações no código da aplicação.

2. Scope
Esta Feature Inclui
Cadastro de benefícios
Associação a critérios de elegibilidade
Versionamento
Ativação e desativação
Auditoria

Esta Feature NÃO Inclui
Concessão automática de benefícios
Consumo dos benefícios
Gestão de campanhas promocionais

3. User Story
Como administrador da plataforma
Quero configurar benefícios de confiança
Para que usuários elegíveis recebam vantagens compatíveis com sua reputação.

4. Business Rules
BR-001
Cada benefício deverá possuir um código único e imutável.

BR-002
Os critérios de elegibilidade poderão considerar, isoladamente ou em conjunto:
Trust Level;
Trust Score mínimo;
Categoria de usuário;
País ou região;
Tipo de conta (Pessoa Física, Pessoa Jurídica, Organização);
Assinatura ativa;
Campanha vigente.

BR-003
Cada alteração relevante deverá gerar uma nova versão.

BR-004
Benefícios desativados não poderão ser concedidos, mas permanecerão disponíveis para auditoria.

BR-005
Cada benefício deverá possuir período de vigência (effectiveFrom e effectiveTo).

5. Functional Flow
Administrador
↓
Criar ou atualizar benefício
↓
Validar critérios
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
TrustBenefit
Atributos mínimos
id

code

name

description

benefitType

eligibilityExpression

priority

stackable

isActive

version

effectiveFrom

effectiveTo

createdBy

approvedBy
changeReason
createdAt
updatedAt
Observação: eligibilityExpression deverá seguir o mesmo princípio utilizado em conditionExpression das regras de pontuação, permitindo evolução futura para uma DSL comum de regras.

6.2 Repository
Criar:
TrustBenefitRepository
Métodos mínimos:
save()
findByCode()
findActiveBenefits()
findByVersion()
findEligibleBenefits()

6.3 Use Cases
Criar:
CreateTrustBenefitUseCase
UpdateTrustBenefitUseCase
ActivateTrustBenefitUseCase
DeactivateTrustBenefitUseCase
GetTrustBenefitsUseCase

6.4 DTOs
Criar DTOs para:
criação;
atualização;
consulta;
ativação;
desativação.

6.5 Exceptions
Criar:
TrustBenefitAlreadyExistsException
TrustBenefitNotFoundException
InvalidTrustBenefitException

7. Database
Criar tabela:
trust_benefits
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
benefit_type
VARCHAR
eligibility_expression
TEXT
priority
INTEGER
stackable
BOOLEAN
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
benefit_type
is_active
version
effective_from

8. API
Endpoints
POST   /api/v1/admin/trust-benefits

PUT    /api/v1/admin/trust-benefits/{id}

PATCH  /api/v1/admin/trust-benefits/{id}/activate

PATCH  /api/v1/admin/trust-benefits/{id}/deactivate

GET    /api/v1/admin/trust-benefits

GET    /api/v1/admin/trust-benefits/{id}
Todos os endpoints deverão exigir autenticação e autorização administrativa.

9. Logging
Registrar:
Benefit ID
Código
Versão
Usuário responsável
Operação executada
Correlation ID

10. Eventos
Publicar:
TrustBenefit.Created

TrustBenefit.Updated

TrustBenefit.Activated
TrustBenefit.Deactivated

11. Testes Unitários
Implementar testes para:
criação válida;
atualização gerando nova versão;
ativação;
desativação;
validação da expressão de elegibilidade;
consulta;
publicação de eventos.

12. Testes de Integração
Validar:
persistência;
versionamento;
endpoints administrativos;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Administradores puderem gerenciar benefícios sem alterar código.
O versionamento estiver consistente.
Apenas benefícios ativos estiverem elegíveis para concessão.
Todas as alterações forem auditáveis.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_benefits
Aggregate TrustBenefit
Repository
Use Cases
Endpoints administrativos
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O gerenciamento de benefícios estiver completamente operacional.
O versionamento estiver consistente.
As regras de elegibilidade forem validadas.
Os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
