
Trust Platform MVP
Feature Specification
IDN-003 — Authenticate Identity (Login)

Document Information
Campo
Valor
Feature ID
IDN-003
Feature Name
Authenticate Identity
Module
Identity
Priority
Critical
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-001 – Create IdentityIDN-002 – Verify Email
Blocks
IDN-004 – Refresh Session

1. Business Objective
Implementar a autenticação de usuários na Trust Platform utilizando e-mail e senha.
Ao concluir esta feature, uma Identity com e-mail verificado deverá conseguir iniciar uma sessão autenticada e receber credenciais para acessar as APIs protegidas.

2. Scope
Esta Feature Inclui
Login com e-mail e senha
Validação das credenciais
Geração de Access Token
Geração de Refresh Token
Criação da sessão
Registro do último login
Publicação do evento de autenticação
Esta Feature NÃO Inclui
Logout
Renovação do Access Token
MFA
Login Social
Recuperação de senha

3. User Story
Como um usuário com e-mail verificado
Quero autenticar-me na plataforma
Para que eu possa utilizar os recursos protegidos da Trust Platform.

4. Business Rules
BR-001
Somente Identities com status ACTIVE poderão realizar login.

BR-002
O e-mail e a senha deverão ser obrigatórios.

BR-003
A senha deverá ser validada utilizando o PasswordHashService.

BR-004
Em caso de credenciais inválidas, não informar qual dado está incorreto.
Mensagem padrão:
Invalid credentials.

BR-005
Após autenticação com sucesso, deverá ser criada uma Session.

BR-006
O Access Token deverá possuir validade de 15 minutos.

BR-007
O Refresh Token deverá possuir validade de 30 dias.

BR-008
Registrar data e hora do último login da Identity.

5. Functional Flow
Usuário
↓
Tela de Login
↓

POST /api/v1/auth/login

↓

Validar Request
↓
Buscar Identity
↓
Verificar Status ACTIVE
↓
Validar Senha
↓
Criar Session
↓
Gerar Access Token
↓
Gerar Refresh Token
↓
Persistir Session
↓
Atualizar Last Login
↓
Publicar Evento
↓
HTTP 200

6. Backend Implementation
6.1 Entity
Criar Entity:
Session
Atributos
id

identityId

refreshToken

accessTokenId

ipAddress

userAgent

createdAt

expiresAt

lastAccessAt

revokedAt

6.2 Repository
Criar interface:
SessionRepository
Métodos obrigatórios
save(session)

findById(id)

findByRefreshToken(token)

revoke(sessionId)

deleteExpiredSessions()

findActiveSessions(identityId)

6.3 Use Case
Criar:
AuthenticateIdentityUseCase
Fluxo obrigatório
Validar Request.
Buscar Identity.
Validar status ACTIVE.
Verificar senha.
Criar Session.
Gerar Access Token.
Gerar Refresh Token.
Persistir Session.
Atualizar último login.
Publicar evento.
Retornar resposta.

6.4 Services
Criar:
JwtTokenService

SessionService
JwtTokenService
Métodos
generateAccessToken()

generateRefreshToken()

validateToken()
extractIdentityId()

SessionService
Métodos
createSession()
revokeSession()
updateLastAccess()

6.5 DTOs
Criar:
AuthenticateIdentityRequest
AuthenticateIdentityResponse

6.6 Exceptions
Criar:
InvalidCredentialsException
InactiveIdentityException
AccountLockedException

7. Database
Criar tabela
sessions
Campos
Campo
Tipo
id
UUID
identity_id
UUID
refresh_token
VARCHAR(500)
access_token_id
UUID
ip_address
VARCHAR(50)
user_agent
VARCHAR(500)
created_at
TIMESTAMP
expires_at
TIMESTAMP
last_access_at
TIMESTAMP
revoked_at
TIMESTAMP NULL

Constraints
FK(identity_id)

Índices
Criar índices para:
identity_id
refresh_token
expires_at

8. API
Endpoint
POST /api/v1/auth/login

Request
{
    "email":"john@email.com",
    "password":"Password@123"
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
400 Validation Error
401 Invalid Credentials
403 Identity Not Active
500 Internal Error

9. Frontend
Criar página
/login
Campos
E-mail
Senha
Botões
Entrar
Links
Esqueci minha senha
Criar conta
Comportamentos
Mostrar indicador de carregamento.
Desabilitar botão durante autenticação.
Armazenar tokens conforme política de segurança da aplicação.
Redirecionar para Workspace após login.

10. Logging
Registrar:
Identity ID
Session ID
Endereço IP
User Agent
Resultado da autenticação
Tempo de processamento
Nunca registrar:
Senha
Access Token
Refresh Token

11. Eventos
Publicar:
Identity.Authenticated
Payload
{
    "identityId":"UUID",
    "sessionId":"UUID",
    "authenticatedAt":"timestamp"
}

12. Testes Unitários
Implementar testes para:
Login válido
Senha incorreta
E-mail inexistente
Identity inativa
Geração dos tokens
Criação da sessão
Atualização do último login
Publicação do evento

13. Testes de Integração
Validar:
Endpoint
Repository
JWT
Session
Banco de dados
Eventos

14. Acceptance Criteria
A Feature será considerada pronta quando:
O usuário conseguir autenticar-se utilizando e-mail e senha.
Apenas Identities ACTIVE conseguirem autenticar-se.
A Session for criada corretamente.
Os tokens forem gerados.
O último login for atualizado.
O evento Identity.Authenticated for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration da tabela sessions
Entity Session
Repository Interface
Repository Implementation
AuthenticateIdentityUseCase
JwtTokenService
SessionService
DTOs
Exceptions
Endpoint /api/v1/auth/login
Página /login
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
Todos os testes automatizados estiverem aprovados.
Os tokens forem gerados corretamente.
A sessão for criada corretamente.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
