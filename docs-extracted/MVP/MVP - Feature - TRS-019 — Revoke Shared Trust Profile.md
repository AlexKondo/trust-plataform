
Trust Platform MVP
Feature Specification
TRS-019 — Revoke Shared Trust Profile

Document Information
Campo
Valor
Feature ID
TRS-019
Feature Name
Revoke Shared Trust Profile
Module
Trust Score
Priority
High
Sprint
Sprint 6
Status
Ready for Development
Depends On
TRS-018 – Trust Profile Verification Link
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-020 – Get Trust Profile Access History

1. Business Objective
Permitir que o proprietário de um Trust Profile revogue, de forma imediata e definitiva, qualquer link de compartilhamento previamente criado, impedindo novos acessos ao perfil por meio daquele link.

2. Scope
Esta Feature Inclui
Revogação manual de links de compartilhamento
Atualização do status do link
Registro da data e responsável pela revogação
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Exclusão física do link
Compartilhamento do perfil
Criação de novos links
Alteração do Trust Profile

3. User Story
Como proprietário do Trust Profile
Quero revogar um link de compartilhamento
Para que terceiros não possam mais acessar meu perfil utilizando aquele link.

4. Business Rules
BR-001
Somente o proprietário do Trust Profile poderá revogar seus links.

BR-002
A revogação deverá ser permanente.

BR-003
Links revogados não poderão ser reativados.

BR-004
Após a revogação, qualquer tentativa de acesso deverá retornar HTTP 410 (Gone).

BR-005
A revogação deverá registrar:
data;
usuário responsável;
motivo (opcional).

BR-006
O histórico do compartilhamento deverá ser preservado para auditoria.

5. Functional Flow
Usuário autenticado
↓
Seleciona link
↓
Solicita revogação
↓
Validar propriedade
↓
Atualizar status para REVOKED
↓
Registrar auditoria
↓
Publicar evento
↓
HTTP 204

6. Backend Implementation
6.1 Aggregate
Atualizar:
TrustProfileShare
Adicionar atributos:
revokedAt

revokedBy

revokeReason

6.2 Repository
Atualizar:
TrustProfileShareRepository
Adicionar método:
revoke()

6.3 Use Case
Criar:
RevokeTrustProfileShareUseCase

6.4 DTOs
Criar:
RevokeTrustProfileShareRequest
RevokeTrustProfileShareResponse

6.5 Exceptions
Criar:
TrustProfileShareAlreadyRevokedException
UnauthorizedTrustProfileShareException

7. Database
Alterar tabela:
trust_profile_shares
Adicionar campos:
Campo
Tipo
revoked_at
TIMESTAMP NULL
revoked_by
UUID NULL
revoke_reason
TEXT NULL

8. API
Endpoint
DELETE /api/v1/trust-profile/shares/{id}

Request Body (Opcional)
{
  "reason": "Profile no longer needs to be shared."
}

Responses
204 No Content
401 Unauthorized
403 Forbidden
404 Not Found
409 Already Revoked

9. Logging
Registrar:
Identity ID
Share ID
Usuário responsável
Motivo
Data/Hora
Correlation ID

10. Events
Publicar:
TrustProfileShare.Revoked
Payload mínimo:
{
  "shareId": "UUID",
  "identityId": "UUID",
  "revokedAt": "2026-08-03T18:00:00Z"
}

11. Unit Tests
Implementar testes para:
revogação válida;
tentativa de revogar link inexistente;
tentativa de revogar link já revogado;
validação de propriedade;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência da revogação;
atualização do status;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O proprietário puder revogar seus links.
Links revogados não puderem mais ser utilizados.
O histórico permanecer íntegro.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration trust_profile_shares
Atualização do Aggregate TrustProfileShare
Repository atualizado
RevokeTrustProfileShareUseCase
Endpoint DELETE
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A revogação estiver operacional.
O histórico estiver preservado.
O endpoint retornar os códigos HTTP corretos.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
