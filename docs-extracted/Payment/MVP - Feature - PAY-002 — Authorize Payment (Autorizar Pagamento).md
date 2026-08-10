Trust Platform MVP
Especificação da Feature
PAY-002 — Authorize Payment (Autorizar Pagamento)

Document Information
Campo
	Valor
	
Feature ID
	PAY-002
	
Feature Name
	Authorize Payment
	
Module
	Payments
	
Prioridade
	Crítica
	
Sprint
	Sprint 12
	
Status
	Ready for Development
	
Depends On
	PAY-001 – Create Payment
	
References
	PAY-ARCH-001
	
Blocks
	PAY-003 – Capture Payment
	

1. Objetivo de Negócio
Autorizar um pagamento junto ao provedor financeiro, verificando a disponibilidade do meio de pagamento e registrando formalmente a autorização para etapas posteriores do fluxo financeiro.

2. Escopo
Esta Feature Inclui
Solicitação de autorização ao gateway
Registro da autorização
Registro da resposta do gateway
Atualização do status do pagamento
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Captura
Escrow
Liberação ao vendedor
Estorno
Conciliação

3. User Story
Como plataforma
Quero autorizar um pagamento
Para que a transação financeira possa prosseguir de forma segura.

4. Business Rules
BR-001
Somente pagamentos com status:
CREATED
poderão ser autorizados.

BR-002
A autorização será executada através do PaymentGateway, conforme definido em PAY-ARCH-001.

BR-003
Cada tentativa de autorização gerará um registro próprio de PaymentAuthorization.

BR-004
Em caso de sucesso:
Status do Payment:
AUTHORIZED

BR-005
Em caso de falha:
Status do Payment:
AUTHORIZATION_FAILED
A plataforma poderá permitir novas tentativas, conforme política configurada.

BR-006
A resposta do gateway deverá ser armazenada para auditoria e reconciliação.

BR-007
A autorização deverá ser idempotente.
Chamadas repetidas com a mesma chave de idempotência não poderão gerar múltiplas autorizações.

5. Fluxo Funcional
Receber solicitação
↓
Validar Payment
↓
Selecionar PaymentGateway
↓
Solicitar autorização
↓
Criar PaymentAuthorization
↓
Atualizar Payment
↓
Registrar auditoria
↓
Publicar evento
↓
Retornar resultado

6. Backend Implementation
6.1 Aggregate
Criar:
PaymentAuthorization
Atributos
id

paymentId

providerId

providerTransactionId

authorizationCode

authorizedAmount

status
authorizedAt
expiresAt
gatewayResponse
createdAt

6.2 Repository
Criar:
PaymentAuthorizationRepository

6.3 Services
Criar:
PaymentAuthorizationService
Responsabilidades:
validar autorização;
invocar PaymentGateway;
persistir resultado;
atualizar Payment;
publicar eventos.

6.4 Use Cases
Criar:
AuthorizePaymentUseCase

6.5 DTOs
Criar:
AuthorizePaymentRequest
AuthorizePaymentResponse

6.6 Exceptions
Criar:
PaymentAuthorizationException
PaymentAlreadyAuthorizedException
PaymentGatewayUnavailableException

7. Database
Criar tabela:
payment_authorizations
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
provider_id
	UUID
	
provider_transaction_id
	VARCHAR(200)
	
authorization_code
	VARCHAR(100)
	
authorized_amount
	DECIMAL(18,2)
	
status
	VARCHAR(30)
	
authorized_at
	TIMESTAMP
	
expires_at
	TIMESTAMP NULL
	
gateway_response
	JSONB
	
created_at
	TIMESTAMP
	
Constraints
PK(id)
FK(payment_id)
FK(provider_id)
Índices
payment_id
provider_transaction_id
status

8. API
Endpoint
POST /api/v1/payments/{paymentId}/authorize

9. Logging
Registrar:
Payment ID
Authorization ID
Provider
Valor autorizado
Código de autorização
Status
Correlation ID
Timestamp

10. Events
Publicar:
Payment.Authorized

Payment.AuthorizationFailed
Consumidores previstos:
Escrow
Analytics
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
autorização bem-sucedida;
autorização recusada;
gateway indisponível;
duplicidade por idempotência;
atualização do status do Payment;
publicação dos eventos.

12. Integration Tests
Validar:
integração com PaymentGateway;
persistência da autorização;
atualização do Payment;
publicação dos eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O pagamento puder ser autorizado.
O PaymentAuthorization for persistido.
O Payment refletir corretamente o resultado.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate PaymentAuthorization
PaymentAuthorizationRepository
PaymentAuthorizationService
AuthorizePaymentUseCase
Migration da tabela payment_authorizations
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A autorização estiver operacional.
O PaymentAuthorization for registrado corretamente.
O Payment for atualizado.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
