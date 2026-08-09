
Trust Platform MVP
Feature Specification
IDN-007 — Forgot Password

Document Information
Campo
Valor
Feature ID
IDN-007
Feature Name
Forgot Password
Module
Identity
Priority
High
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-001 – Create Identity
Blocks
IDN-008 – Reset Password

1. Business Objective
Implementar a funcionalidade responsável por iniciar o processo de recuperação de senha de uma Identity.
O usuário informará seu endereço de e-mail e, caso exista uma Identity correspondente, o sistema enviará um e-mail contendo um link seguro para redefinição da senha.
Por motivos de segurança, a API nunca deverá informar se o e-mail existe ou não na plataforma.

2. Scope
Esta Feature Inclui
Solicitação de recuperação de senha
Geração de token de recuperação
Persistência do token
Envio do e-mail
Registro de auditoria
Esta Feature NÃO Inclui
Redefinição da senha
Alteração da senha
Login
MFA

3. User Story
Como um usuário que esqueceu sua senha
Quero solicitar uma recuperação de senha
Para que eu possa definir uma nova senha e voltar a acessar minha conta.

4. Business Rules
BR-001
O usuário deverá informar um endereço de e-mail.

BR-002
Caso o e-mail exista, gerar um token único de recuperação.

BR-003
Caso o e-mail não exista, retornar exatamente a mesma resposta da operação bem-sucedida.
Nunca informar se a conta existe.

BR-004
O token deverá possuir validade de 30 minutos.

BR-005
Somente um token ativo poderá existir por Identity.
Caso exista um token anterior, ele deverá ser invalidado.

BR-006
O token deverá ser criptograficamente seguro.

5. Functional Flow
Usuário
↓
Tela "Esqueci minha senha"
↓

POST /api/v1/auth/forgot-password

↓
Validar e-mail
↓
Buscar Identity
↓
Se existir
↓
Invalidar token anterior
↓
Gerar novo token
↓
Persistir token
↓
Enviar e-mail
↓
HTTP 202 Accepted

6. Backend Implementation
6.1 Entity
Criar
PasswordResetToken
Atributos
id

identityId

token

expiresAt

usedAt

createdAt

6.2 Repository
Criar
PasswordResetRepository
Métodos obrigatórios
save()
findByToken()

findActiveByIdentity()

invalidateActiveTokens()

markAsUsed()

deleteExpiredTokens()

6.3 Use Case
Criar
ForgotPasswordUseCase
Fluxo obrigatório
Validar e-mail.
Buscar Identity.
Caso não exista, retornar sucesso.
Invalidar tokens ativos.
Gerar novo token.
Persistir.
Solicitar envio do e-mail.
Registrar auditoria.
Retornar HTTP 202.

6.4 Services
Criar
PasswordResetService
Métodos
generateResetToken()
sendResetEmail()
invalidatePreviousTokens()

6.5 Exceptions
Nenhuma exceção específica deverá ser retornada ao cliente.
Todas as falhas deverão resultar na mesma resposta pública.
Exceções internas poderão ser registradas apenas em log.

7. Database
Criar tabela
password_reset_tokens
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
used_at
TIMESTAMP NULL
created_at
TIMESTAMP

Constraints
FK(identity_id)
UNIQUE(token)

Índices
Criar índices para
token
identity_id
expires_at

8. API
Endpoint
POST /api/v1/auth/forgot-password

Request
{
    "email":"john@email.com"
}

Response
HTTP 202
{
    "success":true,
    "message":"If an account exists for this email, password recovery instructions have been sent."
}
A resposta deverá ser exatamente a mesma para e-mails existentes e inexistentes.

9. Frontend
Criar página
/forgot-password
Campos
E-mail
Botões
Enviar
Comportamentos
Validar formato do e-mail.
Exibir indicador de carregamento.
Sempre exibir mensagem de sucesso após o envio.
Nunca informar que o e-mail não existe.

10. Logging
Registrar
Identity ID (quando existir)
Data/Hora
Resultado
Endereço IP
Nunca registrar o token completo.
Nunca registrar informações que revelem a existência da conta.

11. Eventos
Publicar
Identity.PasswordRecoveryRequested
Payload
{
    "identityId":"UUID",
    "requestedAt":"timestamp"
}

12. Testes Unitários
Implementar testes para
E-mail existente
E-mail inexistente
Geração do token
Invalidação do token anterior
Envio do e-mail
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Persistência
Envio do e-mail
Eventos

14. Acceptance Criteria
A Feature será considerada pronta quando
O token for criado corretamente.
Apenas um token ativo existir por Identity.
O e-mail for enviado.
A resposta pública for idêntica para e-mails existentes e inexistentes.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
Migration
PasswordResetToken
PasswordResetRepository
ForgotPasswordUseCase
PasswordResetService
Endpoint /api/v1/auth/forgot-password
Página /forgot-password
Testes Unitários
Testes de Integração
Atualização do OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
Todos os testes automatizados estiverem aprovados.
Os critérios de aceite forem atendidos.
O Code Review estiver aprovado.
A documentação estiver atualizada.
