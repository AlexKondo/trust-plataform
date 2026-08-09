
Trust Platform MVP
Feature Specification
TRS-013 — Award Trust Badges

Document Information
Campo
Valor
Feature ID
TRS-013
Feature Name
Award Trust Badges
Module
Trust Score
Priority
High
Sprint
Sprint 5
Status
Ready for Development
Depends On
TRS-012 – Manage Trust Badges
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-014 – Get My Trust Badges

1. Business Objective
Avaliar continuamente a elegibilidade dos usuários para concessão e revogação de badges, registrando o ciclo de vida de cada conquista de forma auditável e independente da configuração dos badges.

2. Scope
Esta Feature Inclui
Avaliação de elegibilidade
Concessão de badges
Revogação de badges dinâmicos
Registro do ciclo de vida
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Administração dos badges
Exibição dos badges
Alteração das regras de elegibilidade

3. User Story
Como plataforma
Quero conceder e revogar badges automaticamente
Para que o perfil do usuário represente corretamente suas conquistas atuais e históricas.

4. Business Rules
BR-001
Todo badge deverá ser avaliado utilizando sua eligibilityExpression.

BR-002
Badges do tipo PERMANENT nunca poderão ser revogados automaticamente.

BR-003
Badges do tipo DYNAMIC poderão ser revogados quando deixarem de atender aos critérios de elegibilidade.

BR-004
A concessão do mesmo badge para uma mesma identidade deverá ser idempotente.

BR-005
Toda concessão, revogação ou arquivamento deverá ser registrada.

BR-006
A avaliação poderá ser iniciada por eventos de negócio (ex.: mudança de Trust Level, verificação aprovada) ou por processos periódicos de reconciliação.

5. Functional Flow
Evento de Negócio
↓
Badge Evaluation Engine

↓

Carregar Badges Ativos

↓
Avaliar Elegibilidade
↓
Conceder ou Revogar
↓
Persistir AwardedBadge
↓
Registrar Auditoria
↓
Publicar Evento

6. Backend Implementation
6.1 Service
Criar:
BadgeEvaluationEngine
Responsabilidades:
avaliar elegibilidade;
conceder badges;
revogar badges dinâmicos;
manter o estado das conquistas.

6.2 Aggregate
Criar:
AwardedBadge
Atributos mínimos
id
identityId

badgeId

status

awardedAt

revokedAt

reason

sourceEvent
version
createdAt
updatedAt

6.3 Repository
Criar:
AwardedBadgeRepository
Métodos mínimos:
save()
findByIdentity()
findByBadge()
existsActiveBadge()
findActiveBadges()

6.4 Use Cases
Criar:
EvaluateTrustBadgesUseCase
AwardTrustBadgeUseCase
RevokeTrustBadgeUseCase

6.5 DTOs
Criar DTOs para:
concessão;
revogação;
resultado da avaliação.

6.6 Exceptions
Criar:
BadgeEvaluationException
AwardedBadgeNotFoundException
DuplicateAwardException

7. Database
Criar tabela:
awarded_badges
Campos
Campo
Tipo
id
UUID
identity_id
UUID
badge_id
UUID
status
VARCHAR
awarded_at
TIMESTAMP
revoked_at
TIMESTAMP NULL
reason
TEXT
source_event
VARCHAR
version
INTEGER
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(identity_id)
FK(badge_id)
Índices
Criar índices para:
identity_id
badge_id
status
awarded_at

8. Integração
Consumir eventos como:
TrustLevel.Changed
TrustScore.Calculated
Verification.Approved
Organization.Certified
Publicar:
TrustBadge.Awarded
TrustBadge.Revoked

9. Logging
Registrar:
Identity ID
Badge ID
Operação (award/revoke)
Resultado
Correlation ID

10. Eventos
Publicar
TrustBadge.Awarded

TrustBadge.Revoked
Payload mínimo:
{
  "identityId": "UUID",
  "badgeId": "UUID",
  "status": "AWARDED",
  "awardedAt": "2026-08-03T18:30:00Z"
}

11. Testes Unitários
Implementar testes para:
concessão válida;
revogação de badge dinâmico;
não revogação de badge permanente;
idempotência;
publicação de eventos.

12. Testes de Integração
Validar:
consumo dos eventos;
avaliação das regras;
persistência do AwardedBadge;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Badges forem concedidos automaticamente aos usuários elegíveis.
Badges dinâmicos forem revogados quando aplicável.
Badges permanentes nunca forem removidos automaticamente.
O histórico das conquistas permanecer íntegro.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration awarded_badges
Aggregate AwardedBadge
BadgeEvaluationEngine
Repository
Use Cases
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI (eventos)

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O motor de avaliação estiver operacional.
O ciclo de vida dos badges estiver consistente.
A concessão e revogação forem auditáveis e idempotentes.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
