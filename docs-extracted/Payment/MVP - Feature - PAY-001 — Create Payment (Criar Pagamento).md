Trust Platform MVP
Especificação da Feature
PAY-001 — Create Payment (Criar Pagamento)

Document Information
Campo
	Valor
	
Feature ID
	PAY-001
	
Feature Name
	Create Payment
	
Module
	Payments
	
Prioridade
	Crítica
	
Sprint
	Sprint 12
	
Status
	Ready for Development
	
Depends On
	MRK-022 – Confirm Marketplace Order Completion
	
References
	DOC-001 até DOC-007
	
Blocks
	PAY-002 – Authorize Payment
	

1. Objetivo de Negócio
Criar um compromisso financeiro associado a um Marketplace Order, representando a obrigação de pagamento da transação e servindo como ponto central para autorização, captura, retenção (escrow), liberação e reembolso.

2. Escopo
Esta Feature Inclui
Criação do pagamento
Associação ao pedido
Associação ao comprador
Associação ao vendedor
Definição do valor
Definição da moeda
Definição do método de pagamento
Definição do provedor de pagamento
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Autorização
Captura
Escrow
Liberação
Estorno
Split
Conciliação financeira

3. User Story
Como plataforma
Quero criar um pagamento para um pedido
Para que toda a movimentação financeira da transação seja controlada de forma estruturada.

4. Business Rules
BR-001
Cada Marketplace Order poderá possuir apenas um Payment ativo.

BR-002
O Payment será criado automaticamente por um consumidor do evento:
MarketplaceOrder.CustomerConfirmed
O Marketplace não fará chamadas diretas para o módulo Payments.

BR-003
O Payment registrará obrigatoriamente:
Pedido
Comprador
Vendedor
Valor
Moeda
Status inicial

BR-004
Status inicial:
CREATED

BR-005
O Payment será independente do gateway utilizado.
O gateway será apenas um provedor responsável por executar as operações financeiras.

BR-006
Todas as tentativas financeiras futuras serão registradas em PaymentTransaction.

BR-007
Toda criação deverá ser auditada.

5. Fluxo Funcional
MarketplaceOrder.CustomerConfirmed

↓

Payment Event Consumer

↓
Validar inexistência
↓
Criar Payment
↓
Status = CREATED
↓
Persistir
↓
Registrar auditoria
↓
Publicar Payment.Created

6. Backend Implementation
6.1 Aggregate
Criar:
Payment
Atributos
id

orderId

buyerId

sellerId

amount

currency

status
paymentMethodId
paymentProviderId
createdAt
updatedAt

6.2 Repository
Criar:
PaymentRepository
Métodos:
save()
findById()
findByOrderId()
existsByOrderId()

6.3 Services
Criar:
PaymentService
Responsabilidades:
criar pagamento;
validar duplicidade;
publicar eventos.

Criar:
MarketplacePaymentConsumer
Responsável por consumir:
MarketplaceOrder.CustomerConfirmed

6.4 Use Cases
Criar:
CreatePaymentUseCase
Observação: Este caso de uso será interno, acionado pelo consumidor de eventos.

6.5 DTOs
Não aplicável.
A criação ocorrerá por integração interna.

6.6 Exceptions
Criar:
PaymentAlreadyExistsException
PaymentCreationException

7. Database
Criar tabela:
payments
Campo
	Tipo
	
id
	UUID
	
order_id
	UUID
	
buyer_id
	UUID
	
seller_id
	UUID
	
amount
	DECIMAL(18,2)
	
currency
	CHAR(3)
	
status
	VARCHAR(30)
	
payment_method_id
	UUID NULL
	
payment_provider_id
	UUID NULL
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	
Constraints
PK(id)
FK(order_id)
UNIQUE(order_id)
Índices
buyer_id
seller_id
status
created_at

8. API
Não haverá endpoint público nesta Feature.
O Payment será criado exclusivamente por eventos de domínio.

9. Logging
Registrar:
Payment ID
Order ID
Buyer ID
Seller ID
Valor
Moeda
Status
Correlation ID
Timestamp

10. Events
Publicar:
Payment.Created
Consumidores previstos:
Authorization
Analytics
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
criação válida;
duplicidade por orderId;
publicação do evento;
persistência dos relacionamentos.

12. Integration Tests
Validar:
consumo do evento MarketplaceOrder.CustomerConfirmed;
criação do Payment;
publicação do evento Payment.Created;
rollback em caso de falha.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Um Payment for criado automaticamente após a confirmação do cliente.
Não houver duplicidade por pedido.
O evento Payment.Created for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate Payment
PaymentRepository
PaymentService
MarketplacePaymentConsumer
CreatePaymentUseCase
Migration da tabela payments
Eventos de domínio
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O Payment for criado automaticamente.
O vínculo com o Marketplace Order estiver correto.
O evento Payment.Created for publicado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
