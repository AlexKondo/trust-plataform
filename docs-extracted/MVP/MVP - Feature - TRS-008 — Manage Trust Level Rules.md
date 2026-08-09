
Trust Platform MVP
Feature Specification
TRS-008 — Manage Trust Level Rules

Document Information
Campo
Valor
Feature ID
TRS-008
Feature Name
Manage Trust Level Rules
Module
Trust Score
Priority
High
Sprint
Sprint 4
Status
Ready for Development
Depends On
TRS-007 – Rebuild Trust Score
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-009 – Manage Trust Score Rules

1. Business Objective
Permitir que administradores autorizados criem, versionem, ativem, desativem e consultem as regras que definem os níveis de confiança (Trust Levels), sem necessidade de alteração de código.
As regras deverão ser governadas, auditáveis e preparadas para utilização em processos de reconstrução do Trust Score.

2. Scope
Esta Feature Inclui
Cadastro de Trust Levels
Versionamento de regras
Ativação e desativação
Consulta das regras
Auditoria das alterações

Esta Feature NÃO Inclui
Cálculo do Trust Score
Rebuild automático
Cadastro de regras de pontuação

3. User Story
Como administrador da plataforma
Quero gerenciar os níveis de confiança
Para que a classificação dos usuários possa evoluir ao longo do tempo sem alterações no código da aplicação.

4. Business Rules
BR-001
Cada Trust Level deverá possuir um identificador único e um código imutável.

BR-002
Cada alteração relevante deverá gerar uma nova versão da configuração.

BR-003
Não será permitida sobreposição de faixas de pontuação entre níveis ativos da mesma categoria.

BR-004
Apenas uma versão poderá estar vigente para uma mesma combinação de categoria e período de vigência.

BR-005
Alterações deverão registrar:
usuário responsável;
data/hora;
motivo da alteração;
versão criada.

BR-006
Níveis desativados não poderão ser utilizados em novos cálculos, mas deverão permanecer disponíveis para consultas históricas.

5. Functional Flow
Administrador
↓
Criar ou atualizar configuração
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
TrustLevelRule

Atributos mínimos
id
code
name
description
minimumScore

maximumScore

priority

category

icon

color

isPublic

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
TrustLevelRuleRepository
Métodos mínimos:
save()
findByCode()
findActiveByCategory()
findByVersion()
existsOverlappingRange()

6.3 Use Cases
Criar:
CreateTrustLevelRuleUseCase
UpdateTrustLevelRuleUseCase
ActivateTrustLevelRuleUseCase
DeactivateTrustLevelRuleUseCase
GetTrustLevelRulesUseCase

6.4 DTOs
Criar DTOs para:
criação;
atualização;
consulta;
ativação;
desativação.

6.5 Exceptions
Criar:
TrustLevelRuleAlreadyExistsException
TrustLevelRuleOverlapException
TrustLevelRuleNotFoundException
InvalidTrustLevelRuleException

7. Database
Criar tabela:
trust_level_rules
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
minimum_score
INTEGER
maximum_score
INTEGER
priority
INTEGER
category
VARCHAR
icon
VARCHAR
color
VARCHAR
is_public
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
version
is_active
effective_from

8. API
Endpoints
POST   /api/v1/admin/trust-level-rules

PUT    /api/v1/admin/trust-level-rules/{id}

PATCH  /api/v1/admin/trust-level-rules/{id}/activate

PATCH  /api/v1/admin/trust-level-rules/{id}/deactivate

GET    /api/v1/admin/trust-level-rules

GET    /api/v1/admin/trust-level-rules/{id}
Todos os endpoints deverão exigir autenticação e autorização administrativa.

9. Logging
Registrar:
Rule ID
Código
Versão
Usuário responsável
Operação executada
Correlation ID

10. Eventos
Publicar:
TrustLevelRule.Created

TrustLevelRule.Updated

TrustLevelRule.Activated
TrustLevelRule.Deactivated
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
sobreposição de faixas;
ativação;
desativação;
consulta;
publicação de eventos.

12. Testes de Integração
Validar:
persistência;
versionamento;
restrição de sobreposição;
endpoints administrativos;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Administradores puderem gerenciar Trust Levels sem alterar código.
O versionamento estiver funcionando corretamente.
Não houver sobreposição de faixas de pontuação ativas.
Todas as alterações forem auditáveis.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_level_rules
Aggregate TrustLevelRule
Repository
Use Cases
Endpoints administrativos
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O gerenciamento de Trust Levels estiver completamente operacional.
O versionamento estiver consistente.
As regras de validação forem aplicadas.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
