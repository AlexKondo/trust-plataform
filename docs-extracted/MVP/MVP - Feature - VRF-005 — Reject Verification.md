
Trust Platform MVP
Feature Specification
VRF-005 — Reject Verification

Document Information
Campo
Valor
Feature ID
VRF-005
Feature Name
Reject Verification
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
Concluir uma Verification com resultado REJECTED, registrando formalmente os motivos da rejeição e preservando o histórico completo da análise.

2. Scope
Esta Feature Inclui
Rejeição da Verification
Registro da decisão
Registro dos motivos da rejeição
Encerramento da revisão
Atualização do status
Registro de auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Criação automática de nova Verification
Reenvio de evidências
Atualização do Trust Passport
Recalcular Trust Score

3. User Story
Como revisor autorizado ou mecanismo automático
Quero rejeitar uma Verification
Para que atributos inválidos não sejam considerados confiáveis.

4. Business Rules
BR-001
Somente Verifications em status IN_REVIEW poderão ser rejeitadas.

BR-002
Toda rejeição deverá possuir pelo menos um motivo.

BR-003
Os motivos deverão ser padronizados por catálogo de domínio.
Exemplos:
DOCUMENT_UNREADABLE
DOCUMENT_EXPIRED
DOCUMENT_INCOMPLETE
FACE_MISMATCH
ADDRESS_INVALID
PHONE_VERIFICATION_FAILED
FRAUD_SUSPECTED
INSUFFICIENT_EVIDENCE
OTHER

BR-004
A rejeição poderá conter comentários adicionais.

BR-005
Após a rejeição, o status da Verification deverá ser alterado para:
REJECTED

BR-006
A revisão ativa deverá ser encerrada.

BR-007
Uma Verification rejeitada não poderá retornar ao estado IN_REVIEW.
Uma nova tentativa exigirá a criação de uma nova Verification.

5. Functional Flow
Verification

↓

Status = IN_REVIEW

↓
Validar elegibilidade
↓
Registrar decisão
↓
Registrar motivos
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
Utilizar
VerificationDecision
Atualizar para suportar:
decisão APPROVED
decisão REJECTED

Campos adicionais
reasonCode
comments

6.2 Repository
Atualizar
VerificationDecisionRepository

6.3 Use Case
Criar
RejectVerificationUseCase
Fluxo obrigatório
Buscar Verification.
Validar status.
Buscar revisão ativa.
Validar motivo da rejeição.
Registrar VerificationDecision.
Atualizar Verification para REJECTED.
Encerrar VerificationReview.
Persistir transação.
Registrar auditoria.
Publicar eventos.
Retornar sucesso.

6.4 DTOs
Criar
RejectVerificationRequest
RejectVerificationResponse

6.5 Exceptions
Criar
RejectionReasonRequiredException
VerificationAlreadyRejectedException

7. Database
Nenhuma nova tabela.
Atualizar a tabela:
verification_decisions
Adicionar:
Campo
Tipo
reason_code
VARCHAR
comments
TEXT

8. API
Endpoint
POST /api/v1/verifications/{verificationId}/reject

Header
Authorization: Bearer {accessToken}

Request
{
  "reasonCode": "DOCUMENT_UNREADABLE",
  "comments": "Image resolution too low."
}

Response
HTTP 200
{
  "success": true,
  "data": {
    "verificationId": "UUID",
    "status": "REJECTED"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
404 Verification Not Found
409 Invalid Verification Status
422 Reason Required
500 Internal Server Error

9. Frontend
Para revisores autorizados:
Exibir botão Reject.
Tornar obrigatório selecionar um motivo.
Permitir comentário complementar.
Solicitar confirmação antes da decisão.
Para usuários finais:
Exibir status Rejected.
Exibir os motivos da rejeição em linguagem amigável, quando permitido pela política de segurança.
Disponibilizar ação para iniciar uma nova tentativa, se aplicável.

10. Logging
Registrar:
Verification ID
Review ID
Decision ID
Motivo da rejeição
Responsável
Origem da decisão
Resultado
Correlation ID

11. Eventos
Publicar obrigatoriamente:
Verification.Rejected
Payload
{
  "verificationId": "UUID",
  "trustPassportId": "UUID",
  "type": "DOCUMENT",
  "reasonCode": "DOCUMENT_UNREADABLE",
  "rejectedAt": "2026-08-03T18:30:00Z"
}
Também publicar:
Verification.ReviewCompleted

12. Testes Unitários
Implementar testes para:
Rejeição válida
Ausência de motivo
Verification inexistente
Status inválido
Registro da decisão
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
Apenas Verifications em IN_REVIEW puderem ser rejeitadas.
O motivo da rejeição for obrigatório.
O status mudar para REJECTED.
A revisão for encerrada.
Os eventos obrigatórios forem publicados.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration verification_decisions
Atualização da Entity VerificationDecision
RejectVerificationUseCase
DTOs
Endpoint POST /api/v1/verifications/{verificationId}/reject
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
A decisão de rejeição for registrada corretamente.
A Verification for concluída com status REJECTED.
Os eventos forem publicados.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
