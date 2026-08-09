
Trust Platform MVP
Feature Specification
IDN-008 — Reset Password

Document Information
Campo
Valor
Feature ID
IDN-008
Feature Name
Reset Password
Module
Identity
Priority
High
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-007 – Forgot Password
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
IDN-009 – Change Password

1. Business Objective
Implementar a funcionalidade responsável por permitir que um usuário redefina sua senha utilizando um token de recuperação previamente emitido.
Ao final da operação:
a senha deverá ser atualizada;
todos os tokens de recuperação deverão ser invalidados;
todas as sessões ativas da Identity deverão ser revogadas;
o usuário deverá realizar um novo login.

2. Scope
Esta Feature Inclui
Validação do token de recuperação
Validação da nova senha
Atualização da senha
Invalidação do token utilizado
Revogação de todas as sessões ativas
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Alteração de senha para usuários autenticados
Login automático
MFA

3. User Story
Como um usuário que solicitou recuperação de senha
Quero definir uma nova senha
Para que eu volte a acessar minha conta com segurança.

4. Business Rules
BR-001
O token de recuperação deverá existir.

BR-002
O token deverá estar dentro do prazo de validade.

BR-003
O token não poderá ter sido utilizado anteriormente.

BR-004
A nova senha deverá atender integralmente à Password Policy definida no DOC-002.

BR-005
A nova senha deverá ser armazenada utilizando o algoritmo de hash aprovado pela plataforma.

BR-006
Após a redefinição:
invalidar todos os Password Reset Tokens da Identity;
revogar todas as sessões ativas;
invalidar todos os Refresh Tokens.

BR-007
Após concluir a operação, o usuário deverá realizar novo login.

5. Functional Flow
Usuário
↓
Acessa link recebido por e-mail
↓

Tela Reset Password

↓

POST /api/v1/auth/reset-password

↓
Validar Token
↓
Validar Nova Senha
↓
Atualizar Password
↓
Revogar Sessões
↓
Invalidar Tokens
↓
Publicar Evento
↓
HTTP 204

6. Backend Implementation
6.1 Use Case
Criar
ResetPasswordUseCase
Fluxo obrigatório
Validar token.
Buscar Identity.
Validar expiração.
Validar uso anterior.
Validar nova senha.
Gerar novo hash.
Atualizar senha.
Invalidar tokens de recuperação.
Revogar sessões.
Publicar evento.
Registrar auditoria.
Retornar sucesso.

6.2 Services
Atualizar
PasswordHashService
PasswordResetService
SessionService
Adicionar
revokeAllSessions(identityId)
invalidateTokens(identityId)

6.3 Repository
Atualizar
PasswordResetRepository
SessionRepository
IdentityRepository
Novos métodos
updatePassword()
revokeAllSessions()
invalidateAllResetTokens()

6.4 DTOs
Criar
ResetPasswordRequest
ResetPasswordResponse

6.5 Exceptions
Criar
InvalidResetTokenException
ExpiredResetTokenException
PasswordPolicyViolationException

7. Database
Nenhuma nova tabela.
Atualizar registros das tabelas:
identities
password_reset_tokens
sessions
A operação deverá ser executada em uma única transação quando suportado pela arquitetura.

8. API
Endpoint
POST /api/v1/auth/reset-password

Request
{
  "token":"RESET_TOKEN",
  "newPassword":"StrongPassword@123"
}

Response
HTTP 204
Sem conteúdo.

Possíveis Erros
400 Validation Error
401 Invalid Token
401 Expired Token
422 Password Policy Violation
500 Internal Server Error

9. Frontend
Criar página
/reset-password
Campos
Nova senha
Confirmar senha
Comportamentos
Validar força da senha.
Confirmar igualdade entre os campos.
Exibir requisitos mínimos da política de senha.
Redirecionar para /login após sucesso.

10. Logging
Registrar
Identity ID
Reset Token ID
Resultado
Tempo de processamento
Correlation ID
Nunca registrar:
senha
hash
token completo

11. Eventos
Publicar
Identity.PasswordReset
Payload
{
  "identityId":"UUID",
  "resetAt":"2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para
Token válido
Token expirado
Token inexistente
Token já utilizado
Senha inválida
Atualização da senha
Revogação das sessões
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Persistência
Revogação das sessões
Invalidação dos tokens
Evento publicado

14. Acceptance Criteria
A Feature será considerada pronta quando
A senha for redefinida corretamente.
O token não puder ser reutilizado.
Todas as sessões forem revogadas.
Todos os Refresh Tokens forem invalidados.
O usuário precisar realizar novo login.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
ResetPasswordUseCase
Atualizações dos Services
Atualizações dos Repositories
DTOs
Endpoint /api/v1/auth/reset-password
Página /reset-password
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
A senha for atualizada corretamente.
Todos os tokens de recuperação forem invalidados.
Todas as sessões da Identity forem revogadas.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
