
Trust Platform MVP
Feature Specification
IDN-009 — Change Password

Document Information
Campo
Valor
Feature ID
IDN-009
Feature Name
Change Password
Module
Identity
Priority
High
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-003 – Authenticate Identity
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TPS-001 – Create Trust Passport

1. Business Objective
Permitir que um usuário autenticado altere sua própria senha de forma segura.
A alteração deverá validar a senha atual, aplicar a política de senhas da plataforma e proteger todas as sessões da Identity.

2. Scope
Esta Feature Inclui
Validação da senha atual
Validação da nova senha
Atualização da senha
Revogação das demais sessões ativas
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Recuperação de senha
Login
MFA
Alteração de e-mail

3. User Story
Como um usuário autenticado
Quero alterar minha senha
Para que minha conta permaneça segura.

4. Business Rules
BR-001
O usuário deverá estar autenticado.

BR-002
A senha atual deverá ser informada.

BR-003
A senha atual deverá corresponder ao hash armazenado.

BR-004
A nova senha deverá atender à Password Policy definida no DOC-002.

BR-005
A nova senha deverá ser diferente da senha atual.

BR-006
A nova senha deverá ser armazenada utilizando o algoritmo de hash definido pela plataforma.

BR-007
Após a alteração da senha:
todas as demais sessões deverão ser revogadas;
a sessão utilizada para executar a operação poderá permanecer ativa;
todos os Refresh Tokens das sessões revogadas deverão ser invalidados.

BR-008
A operação deverá ser registrada na trilha de auditoria.

5. Functional Flow
Usuário autenticado
↓
Tela Alterar Senha
↓

POST /api/v1/auth/change-password

↓
Validar Access Token
↓
Validar Senha Atual
↓
Validar Nova Senha
↓
Atualizar Hash
↓
Revogar Outras Sessões
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 204

6. Backend Implementation
6.1 Use Case
Criar
ChangePasswordUseCase
Fluxo obrigatório
Validar sessão.
Buscar Identity.
Validar senha atual.
Validar nova senha.
Gerar novo hash.
Atualizar senha.
Revogar demais sessões.
Invalidar Refresh Tokens das sessões revogadas.
Registrar auditoria.
Publicar evento.
Retornar sucesso.

6.2 Services
Atualizar
PasswordHashService
SessionService
Adicionar métodos
changePassword()
revokeOtherSessions()
invalidateOtherRefreshTokens()

6.3 Repository
Atualizar
IdentityRepository
SessionRepository
Adicionar
updatePassword()
findActiveSessions()
revokeAllExcept()

6.4 DTOs
Criar
ChangePasswordRequest
ChangePasswordResponse

6.5 Exceptions
Criar
CurrentPasswordInvalidException
SamePasswordException

7. Database
Nenhuma alteração estrutural.
Atualizar registros das tabelas:
identities
sessions
A operação deverá ser executada em transação.

8. API
Endpoint
POST /api/v1/auth/change-password

Header
Authorization: Bearer {accessToken}

Request
{
  "currentPassword":"OldPassword@123",
  "newPassword":"NewPassword@123"
}

Response
HTTP 204
Sem conteúdo.

Possíveis Erros
400 Validation Error
401 Unauthorized
401 Current Password Invalid
422 Password Policy Violation
422 Same Password
500 Internal Server Error

9. Frontend
Criar página
/settings/security/change-password
Campos
Senha atual
Nova senha
Confirmar nova senha
Comportamentos
Validar força da senha.
Validar confirmação.
Exibir requisitos mínimos.
Manter a sessão atual ativa após sucesso.
Informar que outras sessões foram encerradas.

10. Logging
Registrar
Identity ID
Session ID
Resultado
Data/Hora
Correlation ID
Nunca registrar senhas ou hashes.

11. Eventos
Publicar
Identity.PasswordChanged
Payload
{
  "identityId":"UUID",
  "changedAt":"2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para
Senha atual válida
Senha atual inválida
Nova senha igual à anterior
Política de senha
Atualização do hash
Revogação das demais sessões
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Atualização da senha
Revogação das sessões
Publicação do evento
Auditoria

14. Acceptance Criteria
A Feature será considerada pronta quando
A senha for alterada corretamente.
A senha atual for obrigatória.
A nova senha atender à política definida.
As demais sessões forem encerradas.
A sessão atual permanecer ativa.
O evento Identity.PasswordChanged for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
ChangePasswordUseCase
Atualizações dos Services
Atualizações dos Repositories
DTOs
Endpoint /api/v1/auth/change-password
Página /settings/security/change-password
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
A senha for alterada corretamente.
As demais sessões forem revogadas.
Os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
