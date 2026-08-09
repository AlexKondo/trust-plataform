
Trust Platform MVP
Feature Specification
IDN-002 — Verify Email

Document Information
Campo
Valor
Feature ID
IDN-002
Feature Name
Verify Email
Module
Identity
Priority
Critical
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-001 – Create Identity
Blocks
IDN-003 – Authenticate Identity

1. Business Objective
Implementar a funcionalidade responsável pela verificação do endereço de e-mail da Identity.
Somente Identities com e-mail verificado poderão autenticar-se na plataforma.
Ao concluir esta feature, será possível confirmar que o e-mail informado realmente pertence ao usuário.

2. Scope
Esta Feature Inclui
Geração de token de verificação
Envio de e-mail de verificação
Validação do token
Atualização do status da Identity
Publicação do evento Identity.Created
Publicação do evento Identity.EmailVerified
Esta Feature NÃO Inclui
Login
Recuperação de senha
Alteração de e-mail
MFA

3. User Story
Como um usuário recém-cadastrado
Quero confirmar meu endereço de e-mail
Para que minha conta seja ativada e eu possa acessar a plataforma.

4. Business Rules
BR-001
Toda nova Identity deverá possuir um token de verificação de e-mail.

BR-002
O token deverá possuir prazo de validade de 24 horas.

BR-003
Após a confirmação, o token deverá ser invalidado.

BR-004
Uma Identity com e-mail já verificado não poderá utilizar novamente o mesmo token.

BR-005
Após a confirmação, o status da Identity deverá ser alterado para:
ACTIVE

BR-006
Caso o token esteja expirado ou inválido, retornar erro HTTP 400.

5. Functional Flow
Usuário
↓
Recebe e-mail
↓
Clica no link
↓

GET /api/v1/identities/verify-email

↓
Validar Token
↓
Atualizar Status da Identity
↓
Invalidar Token
↓
Publicar Eventos
↓
HTTP 200

6. Backend Implementation
6.1 Criar Entity
EmailVerificationToken
Atributos
id

identityId

token

expiresAt

verifiedAt

createdAt

6.2 Repository
Criar interface:
EmailVerificationRepository
Métodos obrigatórios
save()
findByToken()
markAsVerified()
deleteExpired()

6.3 Use Cases
Criar:
GenerateEmailVerificationUseCase

VerifyEmailUseCase
GenerateEmailVerificationUseCase
Responsabilidades:
Gerar token único.
Persistir token.
Solicitar envio do e-mail.

VerifyEmailUseCase
Responsabilidades:
Validar token.
Verificar expiração.
Buscar Identity.
Atualizar status para ACTIVE.
Registrar data de verificação.
Invalidar token.
Publicar eventos.
Retornar sucesso.

6.4 Services
Criar:
EmailService

TokenGeneratorService
EmailService
Métodos:
sendVerificationEmail()
TokenGeneratorService
Métodos:
generate()

6.5 Exceptions
Criar:
InvalidVerificationTokenException
ExpiredVerificationTokenException
EmailAlreadyVerifiedException

7. Database
Criar tabela
email_verification_tokens
Campos
Campo
Tipo
id
UUID
identity_id
UUID
token
VARCHAR(255)
expires_at
TIMESTAMP
verified_at
TIMESTAMP NULL
created_at
TIMESTAMP

Constraints
FK para identities(id)
Índice único em token

8. API
Gerar token
POST /api/v1/identities/{identityId}/verify-email

Confirmar e-mail
GET /api/v1/identities/verify-email?token={token}

Response
HTTP 200
{
  "success": true,
  "data": {
    "status": "ACTIVE"
  }
}

Possíveis Erros
400 Token inválido
400 Token expirado
404 Identity não encontrada
409 E-mail já verificado

9. Frontend
Criar páginas:
/verify-email

/verify-email/success

/verify-email/error
Comportamentos
Exibir carregamento durante a validação.
Exibir mensagem de sucesso quando a conta for ativada.
Exibir mensagem amigável em caso de token inválido ou expirado.
Disponibilizar opção para solicitar novo e-mail de verificação.

10. Logging
Registrar:
Identity ID
Token ID
Resultado da validação
Data/Hora
Tempo de processamento
Nunca registrar o token completo em logs.

11. Eventos
Publicar:
Identity.Created
Payload mínimo:
{
  "identityId": "UUID"
}

Publicar:
Identity.EmailVerified
Payload mínimo:
{
  "identityId": "UUID",
  "verifiedAt": "timestamp"
}

12. Testes Unitários
Implementar testes para:
Geração do token
Token duplicado
Token expirado
Token inválido
Verificação com sucesso
Atualização do status
Publicação dos eventos

13. Testes de Integração
Validar:
Envio do e-mail
Persistência do token
Atualização da Identity
Publicação dos eventos
Endpoints

14. Acceptance Criteria
A Feature será considerada pronta quando:
O token for gerado corretamente.
O e-mail de verificação for enviado.
O token puder ser validado.
A Identity passar para o status ACTIVE.
Os eventos forem publicados.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration da tabela email_verification_tokens
Entity EmailVerificationToken
Repository Interface
Repository Implementation
GenerateEmailVerificationUseCase
VerifyEmailUseCase
EmailService
TokenGeneratorService
Endpoints REST
Páginas de verificação
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem concluídos.
Todos os testes automatizados estiverem aprovados.
Os eventos forem publicados corretamente.
O Code Review estiver aprovado.
Não existirem bugs críticos.
Todos os Acceptance Criteria forem atendidos.
