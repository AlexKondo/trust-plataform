
Trust Platform MVP
Feature Specification
VRF-006 — Get Verification

Document Information
Campo
Valor
Feature ID
VRF-006
Feature Name
Get Verification
Module
Verification
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
VRF-001, VRF-002, VRF-003, VRF-004, VRF-005
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
VRF-007 – List Verifications (Future)

1. Business Objective
Permitir a consulta detalhada de uma Verification, incluindo seu estado atual, histórico de decisões, revisão, evidências e metadados, respeitando as regras de autorização e privacidade da plataforma.

2. Scope
Esta Feature Inclui
Consulta de uma Verification
Consulta das evidências (metadados)
Consulta da revisão
Consulta da decisão
Consulta do histórico de status
Registro de auditoria de acesso

Esta Feature NÃO Inclui
Download do arquivo da evidência
Alteração da Verification
Exclusão
Nova tentativa

3. User Story
Como usuário autorizado
Quero consultar uma Verification
Para que eu possa acompanhar seu andamento e resultado.

4. Business Rules
BR-001
Somente usuários autorizados poderão consultar uma Verification.

BR-002
O proprietário da Verification poderá consultar apenas suas próprias verificações.

BR-003
Administradores poderão consultar qualquer Verification conforme suas permissões.

BR-004
O conteúdo dos arquivos enviados nunca deverá ser retornado.
Somente seus metadados.

BR-005
Links temporários (pre-signed URLs), quando necessários para visualização segura, deverão ser gerados por serviço específico e possuir tempo limitado de expiração. Este endpoint retornará apenas metadados por padrão.

BR-006
Toda consulta deverá ser registrada para fins de auditoria.

5. Functional Flow
Usuário autenticado
↓
GET /api/v1/verifications/{verificationId}
↓
Validar Permissões
↓
Buscar Verification
↓
Buscar Review
↓
Buscar Decision
↓
Buscar Evidências
↓
Montar Response
↓
Registrar Auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar
GetVerificationUseCase
Fluxo obrigatório
Validar autenticação.
Buscar Verification.
Validar autorização.
Buscar Review.
Buscar Decision.
Buscar Evidências.
Montar DTO.
Registrar auditoria.
Retornar resposta.

6.2 Repositories
Utilizar:
VerificationRepository
VerificationReviewRepository
VerificationDecisionRepository
VerificationEvidenceRepository

6.3 DTOs
Criar
GetVerificationResponse
EvidenceResponse
ReviewResponse
DecisionResponse

6.4 Exceptions
Criar
VerificationNotFoundException
VerificationAccessDeniedException

7. Database
Nenhuma alteração estrutural.
Utilizar as tabelas:
verifications
verification_reviews
verification_decisions
verification_evidences

8. API
Endpoint
GET /api/v1/verifications/{verificationId}

Header
Authorization: Bearer {accessToken}

Response
HTTP 200
{
  "success": true,
  "data": {
    "verificationId": "UUID",
    "type": "DOCUMENT",
    "status": "APPROVED",
    "currentAttempt": 1,
    "createdAt": "2026-08-03T18:30:00Z",
    "updatedAt": "2026-08-03T19:10:00Z",
    "review": {
      "status": "COMPLETED",
      "reviewType": "AUTOMATIC",
      "startedAt": "2026-08-03T18:45:00Z",
      "completedAt": "2026-08-03T19:05:00Z"
    },
    "decision": {
      "decision": "APPROVED",
      "decisionSource": "AUTOMATIC",
      "comments": "Verification completed successfully.",
      "decidedAt": "2026-08-03T19:05:00Z"
    },
    "evidences": [
      {
        "id": "UUID",
        "type": "DOCUMENT_FRONT",
        "fileName": "passport_front.jpg",
        "mimeType": "image/jpeg",
        "fileSize": 842311,
        "uploadedAt": "2026-08-03T18:34:00Z"
      }
    ]
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
403 Forbidden
404 Verification Not Found
500 Internal Server Error

9. Frontend
Para usuários finais:
Exibir status da Verification.
Exibir tipo da Verification.
Exibir progresso do processo.
Exibir data de envio.
Exibir resultado da decisão.
Exibir motivo da rejeição quando permitido.
Para administradores:
Exibir histórico completo.
Exibir responsável pela revisão.
Exibir origem da decisão.
Exibir todas as evidências (metadados).

10. Logging
Registrar:
Identity ID
Verification ID
Resultado da consulta
Correlation ID
Origem da requisição

11. Eventos
Esta Feature não publica eventos de negócio.
Opcionalmente poderá publicar:
Verification.Viewed
para fins analíticos, desde que esse evento não seja utilizado como gatilho para regras de negócio.

12. Testes Unitários
Implementar testes para:
Consulta válida
Verification inexistente
Acesso negado
Montagem correta do DTO
Auditoria registrada

13. Testes de Integração
Validar:
Endpoint
Autorização
Recuperação dos relacionamentos
Auditoria

14. Acceptance Criteria
A Feature será considerada pronta quando:
Usuários autorizados puderem consultar uma Verification.
Apenas metadados das evidências forem retornados.
O estado atual, revisão e decisão forem apresentados corretamente.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
GetVerificationUseCase
DTOs
Endpoint GET /api/v1/verifications/{verificationId}
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
As regras de autorização forem respeitadas.
Os dados retornados estiverem completos e consistentes.
Nenhum conteúdo sensível de evidências for exposto.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
