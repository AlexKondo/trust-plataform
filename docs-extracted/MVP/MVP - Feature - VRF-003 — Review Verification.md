
Trust Platform MVP
Feature Specification
VRF-003 — Review Verification

Document Information
Campo
Valor
Feature ID
VRF-003
Feature Name
Review Verification
Module
Verification
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
VRF-002 – Submit Verification Evidence
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
VRF-004 – Approve Verification, VRF-005 – Reject Verification

1. Business Objective
Encaminhar uma Verification para análise, consolidando todas as evidências enviadas e permitindo que a decisão seja tomada por mecanismos automáticos, revisores humanos ou uma combinação de ambos.

2. Scope
Esta Feature Inclui
Início do processo de revisão
Consolidação das evidências
Definição do responsável pela revisão
Registro do andamento da revisão
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Aprovação da verificação
Rejeição da verificação
Reenvio de evidências
Cálculo do Trust Score

3. User Story
Como sistema de verificação
Quero iniciar a revisão de uma Verification
Para que ela possa ser avaliada antes da decisão final.

4. Business Rules
BR-001
Somente Verifications com status PENDING_REVIEW poderão iniciar revisão.

BR-002
Toda revisão deverá possuir um responsável.
O responsável poderá ser:
Motor automático
Revisor humano
Provedor externo

BR-003
Ao iniciar a revisão, o status da Verification deverá ser alterado para:
IN_REVIEW

BR-004
Uma Verification somente poderá possuir uma revisão ativa.

BR-005
Toda revisão deverá registrar data/hora de início.

5. Functional Flow
Verification

↓

Status = PENDING_REVIEW

↓
Iniciar Review
↓
Validar Evidências
↓
Criar Review
↓
Alterar Status
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 201

6. Backend Implementation
6.1 Entity
Criar
VerificationReview

Atributos
id

verificationId

reviewType

reviewerId

status

startedAt
completedAt
createdAt

6.2 Repository
Criar
VerificationReviewRepository
Métodos
save()
findActiveByVerification()
findByVerification()
update()

6.3 Use Case
Criar
ReviewVerificationUseCase
Fluxo obrigatório
Buscar Verification.
Validar status.
Verificar existência de revisão ativa.
Criar VerificationReview.
Atualizar status da Verification.
Persistir.
Registrar auditoria.
Publicar evento.
Retornar resultado.

6.4 DTOs
Criar
ReviewVerificationRequest
ReviewVerificationResponse

6.5 Exceptions
Criar
VerificationAlreadyInReviewException
VerificationNotPendingReviewException

7. Database
Criar tabela
verification_reviews

Campos
Campo
Tipo
id
UUID
verification_id
UUID
review_type
VARCHAR
reviewer_id
UUID NULL
status
VARCHAR
started_at
TIMESTAMP
completed_at
TIMESTAMP NULL
created_at
TIMESTAMP

Constraints
PK(id)
FK(verification_id)

Índices
Criar índices para:
verification_id
review_type
status

8. API
Endpoint
POST /api/v1/verifications/{verificationId}/review

Header
Authorization: Bearer {accessToken}

Request
{
  "reviewType": "AUTOMATIC"
}
Valores suportados inicialmente:
AUTOMATIC
MANUAL
EXTERNAL_PROVIDER

Response
HTTP 201
{
  "success": true,
  "data": {
    "reviewId": "UUID",
    "status": "IN_REVIEW"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
404 Verification Not Found
409 Verification Already In Review
422 Invalid Verification Status
500 Internal Server Error

9. Frontend
Para usuários finais, a interface deverá exibir apenas o status da Verification como "Em análise".
Para usuários administrativos ou revisores autorizados, disponibilizar uma fila de revisões contendo:
Tipo da verificação
Data de início
Tipo de revisão
Responsável
Tempo em análise

10. Logging
Registrar:
Identity ID
Verification ID
Review ID
Tipo de revisão
Responsável
Resultado
Correlation ID

11. Eventos
Publicar
Verification.ReviewStarted
Payload mínimo
{
  "verificationId": "UUID",
  "reviewId": "UUID",
  "reviewType": "AUTOMATIC",
  "startedAt": "2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para:
Início válido da revisão
Verification inexistente
Status inválido
Revisão já existente
Publicação do evento

13. Testes de Integração
Validar:
Endpoint
Persistência
Alteração de status
Auditoria
Publicação do evento

14. Acceptance Criteria
A Feature será considerada pronta quando:
Uma revisão puder ser iniciada para uma Verification elegível.
O status da Verification passar para IN_REVIEW.
Apenas uma revisão ativa existir por Verification.
O evento Verification.ReviewStarted for publicado.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration verification_reviews
Entity VerificationReview
VerificationReviewRepository
ReviewVerificationUseCase
DTOs
Endpoint POST /api/v1/verifications/{verificationId}/review
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
A revisão for criada corretamente.
O status da Verification for atualizado.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
