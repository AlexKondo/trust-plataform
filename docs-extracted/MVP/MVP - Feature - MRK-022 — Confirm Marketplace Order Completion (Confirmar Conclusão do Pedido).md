
Trust Platform MVP
Especificação da Feature
MRK-022 — Confirm Marketplace Order Completion (Confirmar Conclusão do Pedido)

Document Information
Campo
Valor
Feature ID
MRK-022
Feature Name
Confirm Marketplace Order Completion
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 11
Status
Ready for Development
Depends On
MRK-021 – Complete Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-023 – Open Marketplace Dispute

1. Objetivo de Negócio
Permitir que o cliente confirme formalmente a conclusão da execução do pedido, registrando o aceite da prestação do serviço ou da entrega do produto e iniciando os processos subsequentes da plataforma.

2. Escopo
Esta Feature Inclui
Confirmação da conclusão
Registro do aceite do cliente
Registro opcional de comentários
Registro opcional de anexos
Atualização do status do pedido
Publicação de eventos
Auditoria completa
Notificações

Esta Feature NÃO Inclui
Avaliação
Pagamento
Garantia
Atualização do Trust Score
Encerramento definitivo do pedido
Estes processos serão executados pelos módulos especializados consumidores dos eventos publicados por esta Feature.

3. User Story
Como comprador
Quero confirmar que o serviço foi concluído conforme esperado
Para que a plataforma possa prosseguir com a liquidação da transação e seu encerramento.

4. Business Rules
BR-001
Somente o comprador poderá confirmar a conclusão do pedido.

BR-002
A confirmação somente será permitida para pedidos com status:
AWAITING_CUSTOMER_CONFIRMATION

BR-003
A confirmação registrará obrigatoriamente:
comprador;
data e hora da confirmação.

BR-004
Opcionalmente poderão ser registrados:
comentários;
anexos;
observações adicionais.

BR-005
Após a confirmação:
Status do Pedido:
CUSTOMER_CONFIRMED

BR-006
A confirmação do cliente não encerrará imediatamente o pedido.
Ela iniciará os processos assíncronos responsáveis por:
liberação do pagamento;
atualização do Trust Score;
geração de Trust Points;
geração de Trust Coin;
ativação da Garantia Trust;
disponibilização da avaliação;
atualização dos indicadores analíticos.

BR-007
Somente após a conclusão bem-sucedida dos processos obrigatórios o pedido poderá evoluir para:
COMPLETED
CLOSED

BR-008
O registro da confirmação será permanente e não poderá ser excluído.

5. Fluxo Funcional
Cliente acessa o pedido
↓
Solicita confirmação
↓
Validar permissões
↓
Validar status
↓
Criar MarketplaceConfirmation
↓
Atualizar MarketplaceOrder
↓
Status = CUSTOMER_CONFIRMED
↓
Registrar auditoria
↓
Publicar MarketplaceOrder.CustomerConfirmed
↓
Notificar módulos consumidores
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceConfirmation
Atributos
id

orderId

confirmedBy

confirmedAt

comments

attachments

createdAt

Atualizar:
MarketplaceOrder
Adicionar:
customerConfirmedAt
customerConfirmedBy

6.2 Repository
Criar:
MarketplaceConfirmationRepository
Atualizar:
MarketplaceOrderRepository

6.3 Services
Criar:
MarketplaceConfirmationService
Responsabilidades:
validar confirmação;
registrar o aceite;
atualizar o ciclo de vida do pedido;
publicar eventos.

Atualizar:
MarketplaceOrderLifecycleService
Adicionar transição:
AWAITING_CUSTOMER_CONFIRMATION
↓
CUSTOMER_CONFIRMED

6.4 Use Cases
Criar:
ConfirmMarketplaceOrderCompletionUseCase

6.5 DTOs
Criar:
ConfirmMarketplaceOrderCompletionRequest
ConfirmMarketplaceOrderCompletionResponse

6.6 Exceptions
Criar:
MarketplaceOrderConfirmationNotAllowedException
MarketplaceOrderAlreadyConfirmedException

7. Database
Criar tabela:
marketplace_confirmations
Campo
Tipo
id
UUID
order_id
UUID
confirmed_by
UUID
confirmed_at
TIMESTAMP
comments
TEXT NULL
created_at
TIMESTAMP
Observação: Os anexos deverão ser armazenados pelo módulo de Evidências. A tabela marketplace_confirmations armazenará apenas referências aos respectivos registros, quando aplicável.

Atualizar:
marketplace_orders
Adicionar:
Campo
Tipo
customer_confirmed_at
TIMESTAMP NULL
customer_confirmed_by
UUID NULL
Constraints
PK(id)
FK(order_id)
FK(confirmed_by)
Índices
order_id
confirmed_at

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/confirm-completion

9. Logging
Registrar:
Order ID
Confirmation ID
Comprador
Data e hora
Comentários
Correlation ID

10. Events
Publicar:
MarketplaceConfirmation.Created

MarketplaceOrder.CustomerConfirmed
Consumidores previstos:
Pagamentos
Trust Score
Trust Economy
Garantia Trust
Avaliações
Analytics
Notificações
Auditoria

11. Unit Tests
Implementar testes para:
confirmação válida;
usuário sem permissão;
status inválido;
criação da confirmação;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
criação do MarketplaceConfirmation;
atualização do pedido;
publicação dos eventos;
integração com módulos consumidores.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas o comprador puder confirmar.
O MarketplaceConfirmation for criado corretamente.
O pedido passar para CUSTOMER_CONFIRMED.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate MarketplaceConfirmation
MarketplaceConfirmationRepository
MarketplaceConfirmationService
Atualização do MarketplaceOrder
ConfirmMarketplaceOrderCompletionUseCase
Migration da tabela marketplace_confirmations
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A confirmação do cliente estiver operacional.
O aceite estiver registrado permanentemente.
O pedido evoluir para CUSTOMER_CONFIRMED.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
