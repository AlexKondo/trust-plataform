
Trust Platform MVP
Feature Specification
IDN-004 — Refresh Session

Document Information
Campo
Valor
Feature ID
IDN-004
Feature Name
Refresh Session
Module
Identity
Priority
Critical
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-003 – Authenticate Identity
Blocks
IDN-005 – Logout

1. Business Objective
Implementar a renovação de uma sessão autenticada utilizando um Refresh Token válido.
O objetivo desta funcionalidade é permitir que o usuário permaneça autenticado sem precisar informar novamente suas credenciais, desde que sua sessão continue válida.
Esta feature não realiza autenticação por e-mail e senha. Ela apenas renova uma sessão existente.

2. Scope
Esta Feature Inclui
Validação do Refresh Token
Validação da sessão
Validação da Identity
Geração de novo Access Token
Rotação (troca) do Refresh Token
Atualização da sessão existente
Publicação de evento

Esta Feature NÃO Inclui
Login
Logout
Revogação de sessões
MFA
Alteração de senha

3. User Story
Como um usuário autenticado
Quero renovar minha sessão
Para que eu continue utilizando a plataforma sem realizar um novo login.

4. Business Rules
BR-001
Somente Refresh Tokens válidos poderão renovar uma sessão.

BR-002
Refresh Tokens expirados deverão ser rejeitados.

BR-003
Refresh Tokens revogados deverão ser rejeitados.

BR-004
A Identity deverá permanecer com status ACTIVE.

BR-005
Após cada renovação deverá ser gerado:
novo Access Token
novo Refresh Token
O Refresh Token anterior deverá ser invalidado.

BR-006
A data do último acesso da sessão deverá ser atualizada.

BR-007
Caso a sessão tenha sido revogada, retornar HTTP 401.

5. Functional Flow
Cliente

↓

POST /api/v1/auth/refresh

↓
Receber Refresh Token
↓
Validar JWT
↓
Buscar Session
↓
Validar Expiração
↓
Validar Revogação
↓
Buscar Identity
↓
Validar Status ACTIVE
↓
Gerar Novo Access Token
↓
Gerar Novo Refresh Token
↓
Atualizar Session
↓
Publicar Evento
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar:
RefreshSessionUseCase
Fluxo obrigatório
Validar Refresh Token.
Buscar Session.
Validar expiração.
Validar revogação.
Buscar Identity.
Verificar status ACTIVE.
Gerar novo Access Token.
Gerar novo Refresh Token.
Atualizar Session.
Atualizar Last Access.
Publicar evento.
Retornar resposta.

6.2 Services
Utilizar:
JwtTokenService
SessionService
Adicionar métodos:
JwtTokenService
refreshAccessToken()
refreshRefreshToken()

SessionService
Adicionar:
rotateRefreshToken()
updateLastAccess()
validateSession()

6.3 Repository
Adicionar ao SessionRepository:
updateRefreshToken()
updateAccess()
updateLastAccess()

6.4 DTOs
Criar
RefreshSessionRequest
RefreshSessionResponse

6.5 Exceptions
Criar
InvalidRefreshTokenException
ExpiredRefreshTokenException
RevokedSessionException

7. Database
Nenhuma nova tabela.
Atualizar tabela:
sessions
Campos utilizados
refresh_token
expires_at
last_access_at
revoked_at
Nenhuma alteração estrutural é necessária.

8. API
Endpoint
POST /api/v1/auth/refresh

Request
{
    "refreshToken":"JWT"
}

Response
HTTP 200
{
    "success":true,
    "data":{
        "accessToken":"JWT",
        "refreshToken":"JWT",
        "expiresIn":900
    }
}

Possíveis Erros
401 Invalid Refresh Token
401 Session Revoked
401 Refresh Token Expired
403 Identity Not Active
500 Internal Error

9. Frontend
Nenhuma nova página.
Atualizar mecanismo global de autenticação.
Comportamento esperado
Detectar expiração do Access Token.
Solicitar automaticamente um novo Access Token utilizando o Refresh Token.
Atualizar os tokens armazenados.
Caso a renovação falhe, redirecionar automaticamente para /login.
A renovação deverá ocorrer de forma transparente para o usuário.

10. Logging
Registrar
Session ID
Identity ID
Resultado da renovação
Data/Hora
Tempo de processamento
Nunca registrar Access Token ou Refresh Token.

11. Eventos
Publicar
Session.Refreshed
Payload
{
    "sessionId":"UUID",
    "identityId":"UUID",
    "refreshedAt":"timestamp"
}

12. Testes Unitários
Implementar testes para
Refresh válido
Token inválido
Token expirado
Sessão revogada
Identity inativa
Rotação do Refresh Token
Atualização do Last Access
Publicação do evento

13. Testes de Integração
Validar
Endpoint
JWT
SessionRepository
Banco
Eventos

14. Acceptance Criteria
A Feature será considerada pronta quando
Um Refresh Token válido renovar corretamente uma sessão.
O Refresh Token anterior deixar de ser aceito.
Novos tokens forem gerados.
A sessão permanecer válida.
O último acesso for atualizado.
O evento Session.Refreshed for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
RefreshSessionUseCase
Atualizações no JwtTokenService
Atualizações no SessionService
Atualizações no SessionRepository
DTOs
Exceptions
Endpoint /api/v1/auth/refresh
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
Todos os testes automatizados estiverem aprovados.
A rotação do Refresh Token estiver funcionando corretamente.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
