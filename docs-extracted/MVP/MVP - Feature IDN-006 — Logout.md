
Trust Platform MVP
Feature Specification
IDN-006 — Logout

Document Information
Campo
Valor
Feature ID
IDN-006
Feature Name
Logout
Module
Identity
Priority
High
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-003 – Authenticate IdentityIDN-004 – Refresh Session
Blocks
IDN-007 – Forgot Password

1. Business Objective
Implementar a funcionalidade responsável por encerrar uma sessão autenticada na Trust Platform.
Após o logout, os tokens utilizados pela sessão não poderão mais ser aceitos pelas APIs protegidas.
O logout deverá invalidar apenas a sessão atual.

2. Scope
Esta Feature Inclui
Logout da sessão atual
Revogação da sessão
Invalidação do Refresh Token
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Logout de todos os dispositivos
Revogação de outras sessões
Exclusão da Identity

3. User Story
Como um usuário autenticado
Quero encerrar minha sessão
Para que ninguém possa continuar utilizando minha conta neste dispositivo.

4. Business Rules
BR-001
Somente usuários autenticados poderão realizar logout.

BR-002
A sessão atual deverá ser marcada como revogada.

BR-003
O Refresh Token da sessão deverá ser invalidado.

BR-004
Após o logout, qualquer tentativa de utilizar o Refresh Token deverá retornar HTTP 401.

BR-005
O Access Token deverá deixar de ser considerado válido na estratégia adotada pela plataforma (por exemplo, por meio de lista de revogação ou outra abordagem definida na arquitetura).

BR-006
O logout deverá afetar apenas a sessão atual.
Outras sessões do mesmo usuário permanecerão ativas.

5. Functional Flow
Frontend

↓

POST /api/v1/auth/logout

↓
JWT Authentication
↓
Identificar Session
↓
Revogar Session
↓
Invalidar Refresh Token
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 204

6. Backend Implementation
6.1 Use Case
Criar
LogoutUseCase
Fluxo obrigatório
Validar Access Token.
Identificar a sessão.
Buscar Session.
Validar que a sessão está ativa.
Revogar a sessão.
Invalidar o Refresh Token.
Registrar data/hora da revogação.
Publicar evento.
Retornar sucesso.

6.2 Repository
Adicionar ao SessionRepository
findByAccessTokenId(UUID accessTokenId)
revoke(UUID sessionId)
updateRevokedAt(UUID sessionId, Instant revokedAt)

6.3 Services
Atualizar
SessionService
Adicionar métodos
logout(Session session)
isRevoked(Session session)

6.4 DTOs
Não são necessários DTOs de resposta.
A API retornará apenas HTTP 204.

6.5 Exceptions
Criar
SessionNotFoundException
SessionAlreadyRevokedException

7. Database
Nenhuma nova tabela.
Utilizar a tabela
sessions
Campos utilizados
id
revoked_at
refresh_token
identity_id

8. API
Endpoint
POST /api/v1/auth/logout

Header obrigatório
Authorization: Bearer {accessToken}

Request Body
Nenhum.

Response
HTTP 204
Sem conteúdo.

Possíveis Erros
401 Unauthorized
401 Session Revoked
404 Session Not Found
500 Internal Server Error

9. Frontend
Após receber HTTP 204:
Remover Access Token.
Remover Refresh Token.
Limpar informações da Identity em memória.
Limpar cache relacionado ao usuário.
Redirecionar para:
/login
Caso a chamada falhe por sessão inválida, o frontend deverá executar os mesmos passos acima.

10. Logging
Registrar
Identity ID
Session ID
Horário do logout
Endereço IP
User Agent
Nunca registrar tokens.

11. Eventos
Publicar
Session.LoggedOut
Payload
{
  "sessionId": "UUID",
  "identityId": "UUID",
  "loggedOutAt": "timestamp"
}

12. Testes Unitários
Implementar testes para
Logout válido
Sessão inexistente
Sessão revogada
Revogação do Refresh Token
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Revogação da sessão
Persistência no banco
Publicação do evento

14. Acceptance Criteria
A Feature será considerada pronta quando
A sessão atual for revogada.
O Refresh Token deixar de ser aceito.
O endpoint retornar HTTP 204.
O frontend limpar corretamente os dados locais.
O evento Session.LoggedOut for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
LogoutUseCase
Atualizações no SessionRepository
Atualizações no SessionService
Endpoint POST /api/v1/auth/logout
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
Todos os testes automatizados estiverem aprovados.
A sessão for revogada corretamente.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
