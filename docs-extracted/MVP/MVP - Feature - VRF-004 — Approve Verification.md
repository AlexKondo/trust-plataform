
Trust Platform MVP
Feature Specification
VRF-004 — Approve Verification

Document Information
Campo
Valor
Feature ID
VRF-004
Feature Name
Approve Verification
Module
Verification
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
VRF-003 – Review Verification
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
VRF-006 – Get Verification

1. Business Objective
Concluir uma Verification com resultado APPROVED, tornando o atributo verificado oficialmente confiável para consumo pelos demais módulos da Trust Platform.

2. Scope
Esta Feature Inclui
Aprovação da Verification
Registro da decisão
Encerramento da revisão
Atualização do status
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Atualização do Trust Passport
Recalcular Trust Score
Concessão de Badges
Atualização de permissões
Essas ações deverão ocorrer por meio do consumo dos eventos publicados.

3. User Story
Como revisor autorizado ou mecanismo automático
Quero aprovar uma Verification
Para que o atributo seja considerado validado pela plataforma.

4. Business Rules
BR-001
Somente Verifications em status IN_REVIEW poderão ser aprovadas.

BR-002
Toda aprovação deverá possuir uma decisão registrada.

BR-003
A decisão deverá registrar:
responsável pela aprovação;
origem da decisão (automática, humana ou provedor externo);
data e hora da decisão.

BR-004
Após a aprovação, o status da Verification deverá ser alterado para:
APPROVED

BR-005
A revisão ativa deverá ser encerrada.

BR-006
Uma Verification aprovada não poderá retornar ao estado IN_REVIEW.
Nova validação exigirá a criação de uma nova Verification.

5. Functional Flow
Verification

↓

Status = IN_REVIEW

↓
Validar elegibilidade
↓
Registrar decisão
↓
Atualizar status
↓
Encerrar revisão
↓
Registrar auditoria
↓
Publicar eventos
↓
HTTP 200

6. Backend Implementation
6.1 Entity
Criar
VerificationDecision

Atributos
id

verificationId

decision

decisionSource

reviewerId

comments
decidedAt
createdAt

6.2 Repository
Criar
VerificationDecisionRepository
Métodos
save()
findByVerification()
findLatestByVerification()

6.3 Use Case
Criar
ApproveVerificationUseCase
Fluxo obrigatório
Buscar Verification.
Validar status.
Buscar revisão ativa.
Criar VerificationDecision.
Alterar Verification para APPROVED.
Encerrar VerificationReview.
Persistir transação.
Registrar auditoria.
Publicar eventos.
Retornar sucesso.

6.4 DTOs
Criar
ApproveVerificationRequest
ApproveVerificationResponse

6.5 Exceptions
Criar
VerificationNotInReviewException
VerificationAlreadyApprovedException

7. Database
Criar tabela
verification_decisions

Campos
Campo
Tipo
id
UUID
verification_id
UUID
decision
VARCHAR
decision_source
VARCHAR
reviewer_id
UUID NULL
comments
TEXT NULL
decided_at
TIMESTAMP
created_at
TIMESTAMP

Constraints
PK(id)
FK(verification_id)

Índices
Criar índices para:
verification_id
decision
decided_at

8. API
Endpoint
POST /api/v1/verifications/{verificationId}/approve

Header
Authorization: Bearer {accessToken}

Request
{
  "comments": "Document validated successfully."
}

Response
HTTP 200
{
  "success": true,
  "data": {
    "verificationId": "UUID",
    "status": "APPROVED"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
404 Verification Not Found
409 Invalid Verification Status
500 Internal Server Error

9. Frontend
Para revisores autorizados:
Exibir botão Approve.
Permitir comentário opcional.
Exibir confirmação antes da decisão final.
Para usuários finais:
Atualizar status da Verification para Approved.
Exibir data da aprovação.

10. Logging
Registrar:
Verification ID
Review ID
Decision ID
Responsável
Origem da decisão
Resultado
Correlation ID

11. Eventos
Publicar obrigatoriamente:
Verification.Approved
Payload
{
  "verificationId": "UUID",
  "trustPassportId": "UUID",
  "type": "DOCUMENT",
  "approvedAt": "2026-08-03T18:30:00Z"
}
Também publicar:
Verification.ReviewCompleted

12. Testes Unitários
Implementar testes para:
Aprovação válida
Verification inexistente
Status inválido
Criação da decisão
Encerramento da revisão
Publicação dos eventos

13. Testes de Integração
Validar:
Endpoint
Persistência da decisão
Atualização da Verification
Encerramento da revisão
Auditoria
Eventos publicados

14. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas Verifications em IN_REVIEW puderem ser aprovadas.
A decisão for persistida.
O status mudar para APPROVED.
A revisão for encerrada.
Os eventos obrigatórios forem publicados.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration verification_decisions
Entity VerificationDecision
VerificationDecisionRepository
ApproveVerificationUseCase
DTOs
Endpoint POST /api/v1/verifications/{verificationId}/approve
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
A decisão de aprovação for registrada corretamente.
A Verification for concluída com status APPROVED.
Os eventos forem publicados.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
