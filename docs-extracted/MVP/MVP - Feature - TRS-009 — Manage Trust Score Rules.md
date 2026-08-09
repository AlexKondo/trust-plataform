
Trust Platform MVP
Feature Specification
TRS-009 — Manage Trust Score Rules

Document Information
Campo
Valor
Feature ID
TRS-009
Feature Name
Manage Trust Score Rules
Module
Trust Score
Priority
Critical
Sprint
Sprint 4
Status
Ready for Development
Depends On
TRS-008 – Manage Trust Level Rules
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-010 – Manage Trust Benefits

1. Business Objective
Permitir que administradores autorizados criem, versionem e gerenciem regras de pontuação que serão interpretadas pelo Trust Score Engine durante o cálculo da reputação.
As regras deverão ser configuráveis, auditáveis, reutilizáveis e independentes do código da aplicação.

2. Scope
Esta Feature Inclui
Cadastro de regras de pontuação
Versionamento
Ativação e desativação
Definição de condições
Definição de pesos
Definição de limites de aplicação
Auditoria

Esta Feature NÃO Inclui
Execução das regras
Rebuild automático
Cadastro de benefícios

3. User Story
Como administrador da plataforma
Quero configurar regras de reputação
Para que o comportamento do Trust Score Engine possa evoluir sem necessidade de novas implantações.

4. Business Rules
BR-001
Cada regra deverá possuir um código único e imutável.

BR-002
Cada alteração relevante deverá gerar uma nova versão.

BR-003
Apenas regras ativas poderão ser utilizadas pelo Trust Score Engine.

BR-004
Uma regra deverá possuir, no mínimo:
categoria;
tipo de evento;
condição de aplicação;
pontuação;
peso;
limite máximo de execuções;
prioridade.

BR-005
Regras poderão conceder pontuação positiva, negativa ou neutra.

BR-006
Regras desativadas permanecerão disponíveis para consultas históricas e auditorias.

5. Functional Flow
Administrador
↓
Criar ou atualizar regra
↓
Validar consistência
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
TrustScoreRule
Atributos mínimos
id

code

name

description

category

eventType

conditionExpression

score

weight

maximumExecutions

priority

cooldown

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
Observação: conditionExpression representa a expressão de negócio que será interpretada pelo TrustScoreEngine. A implementação do interpretador pode ser evoluída gradualmente (por exemplo, iniciando com operadores simples e expandindo para uma DSL ou motor de regras mais sofisticado).

6.2 Repository
Criar:
TrustScoreRuleRepository
Métodos mínimos:
save()
findByCode()
findActiveRules()
findByVersion()
findByCategory()

6.3 Use Cases
Criar:
CreateTrustScoreRuleUseCase
UpdateTrustScoreRuleUseCase
ActivateTrustScoreRuleUseCase
DeactivateTrustScoreRuleUseCase
GetTrustScoreRulesUseCase

6.4 DTOs
Criar DTOs para:
criação;
atualização;
consulta;
ativação;
desativação.

6.5 Exceptions
Criar:
TrustScoreRuleAlreadyExistsException
TrustScoreRuleNotFoundException
InvalidTrustScoreRuleException
InvalidConditionExpressionException

7. Database
Criar tabela:
trust_score_rules
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
category
VARCHAR
event_type
VARCHAR
condition_expression
TEXT
score
INTEGER
weight
DECIMAL(10,4)
maximum_executions
INTEGER
priority
INTEGER
cooldown
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
category
event_type
is_active
version
effective_from

8. API
Endpoints
POST   /api/v1/admin/trust-score-rules

PUT    /api/v1/admin/trust-score-rules/{id}

PATCH  /api/v1/admin/trust-score-rules/{id}/activate

PATCH  /api/v1/admin/trust-score-rules/{id}/deactivate

GET    /api/v1/admin/trust-score-rules

GET    /api/v1/admin/trust-score-rules/{id}
Todos os endpoints deverão exigir autenticação e autorização administrativa.

9. Logging
Registrar:
Rule ID
Código
Categoria
Versão
Usuário responsável
Operação executada
Correlation ID

10. Eventos
Publicar:
TrustScoreRule.Created

TrustScoreRule.Updated

TrustScoreRule.Activated
TrustScoreRule.Deactivated
Cada evento deverá incluir, no mínimo:
ruleId
code
version
effectiveFrom
effectiveTo (quando aplicável)

11. Testes Unitários
Implementar testes para:
criação válida;
atualização gerando nova versão;
ativação;
desativação;
validação da expressão de condição;
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
Administradores puderem gerenciar regras sem alterar código.
O versionamento estiver consistente.
Apenas regras ativas forem disponibilizadas ao Trust Score Engine.
Todas as alterações forem auditáveis.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_score_rules
Aggregate TrustScoreRule
Repository
Use Cases
Endpoints administrativos
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O gerenciamento das regras estiver completamente operacional.
O versionamento estiver funcionando corretamente.
As validações de negócio forem aplicadas.
Os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
