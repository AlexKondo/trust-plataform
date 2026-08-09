
Trust Platform MVP
Especificação da Feature
MRK-021 — Complete Marketplace Order (Concluir Execução do Pedido)

Document Information
Campo
Valor
Feature ID
MRK-021
Feature Name
Complete Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 10
Status
Ready for Development
Depends On
MRK-020 – Start Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-022 – Confirm Marketplace Order Completion

1. Objetivo de Negócio
Permitir o encerramento oficial da execução de um pedido, registrando o check-out da prestação do serviço, consolidando a linha do tempo da execução e iniciando o processo de confirmação pelo cliente.

2. Escopo
Esta Feature Inclui
Check-out da execução
Registro da data e hora de término
Registro opcional da geolocalização
Registro opcional de evidências finais
Registro das observações do prestador
Cálculo da duração efetiva do serviço
Atualização do status do pedido
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Confirmação do cliente
Pagamento
Avaliação
Garantia
Disputas

3. User Story
Como prestador de serviço
Quero finalizar oficialmente a execução do pedido
Para que o cliente possa confirmar a conclusão e a plataforma registre o encerramento da prestação do serviço.

4. Business Rules
BR-001
Somente pedidos com status:
IN_PROGRESS
poderão ser concluídos.

BR-002
O check-out registrará obrigatoriamente:
data;
hora;
usuário responsável.

BR-003
Opcionalmente poderão ser registrados:
latitude;
longitude;
precisão da localização;
endereço aproximado;
fotos finais;
vídeos finais;
observações do prestador;
pendências identificadas.

BR-004
O sistema calculará automaticamente a duração efetiva da execução considerando:
horário oficial do check-in;
horário oficial do check-out;
futuras pausas registradas na linha do tempo (quando implementadas).

BR-005
Após a conclusão:
Status do Pedido:
AWAITING_CUSTOMER_CONFIRMATION

BR-006
O cliente será notificado para confirmar ou contestar a conclusão da execução.

BR-007
O registro de conclusão será permanente e não poderá ser excluído.

5. Fluxo Funcional
Prestador seleciona pedido
↓
Solicita conclusão
↓
Validar status
↓
Registrar evento CHECK_OUT
↓
Calcular duração efetiva
↓
Atualizar MarketplaceOrder
↓
Status = AWAITING_CUSTOMER_CONFIRMATION

↓

Registrar auditoria

↓
Publicar eventos
↓
Notificar cliente

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOrder
Adicionar atributos:
completedAt
completedBy
actualDuration

Criar Aggregate:
ExecutionEvent
Atributos
id

orderId

eventType

occurredAt

performedBy

latitude

longitude

accuracy

address

notes

createdAt

Event Types
CHECK_IN

CHECK_OUT

PAUSE
RESUME

6.2 Repository
Criar:
ExecutionEventRepository
Atualizar:
MarketplaceOrderRepository

6.3 Services
Criar:
ExecutionTimelineService
Responsabilidades:
registrar eventos da execução;
calcular duração efetiva;
validar consistência da linha do tempo.

Atualizar:
MarketplaceOrderLifecycleService
Responsável por alterar o status para:
AWAITING_CUSTOMER_CONFIRMATION

6.4 Use Cases
Criar:
CompleteMarketplaceOrderUseCase

6.5 DTOs
Criar:
CompleteMarketplaceOrderRequest
CompleteMarketplaceOrderResponse

6.6 Exceptions
Criar:
MarketplaceOrderCompletionNotAllowedException
InvalidExecutionTimelineException

7. Database
Criar tabela:
marketplace_order_execution_events
Campo
Tipo
id
UUID
order_id
UUID
event_type
VARCHAR(30)
occurred_at
TIMESTAMP
performed_by
UUID
latitude
DECIMAL(10,7) NULL
longitude
DECIMAL(10,7) NULL
accuracy
DECIMAL(8,2) NULL
address
TEXT NULL
notes
TEXT NULL
created_at
TIMESTAMP

Atualizar:
marketplace_orders
Adicionar:
Campo
Tipo
completed_at
TIMESTAMP NULL
completed_by
UUID NULL
actual_duration
INTEGER NULL
Constraints
FK(order_id)
FK(performed_by)
Índices
order_id
event_type
occurred_at

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/complete

9. Logging
Registrar:
Order ID
Evento CHECK_OUT
Usuário
Data e hora
Duração calculada
Resultado das validações
Correlation ID

10. Events
Publicar:
ExecutionEvent.Created

MarketplaceOrder.Completed
Consumidores previstos:
Notificações
Analytics
Trust Score
Garantia Trust
Auditoria
IA

11. Unit Tests
Implementar testes para:
conclusão válida;
pedido em estado inválido;
cálculo correto da duração;
registro do evento CHECK_OUT;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
criação do evento CHECK_OUT;
atualização do pedido;
cálculo da duração;
publicação dos eventos;
envio das notificações.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O pedido puder ser concluído.
O evento CHECK_OUT for registrado.
A duração efetiva for calculada corretamente.
O pedido passar para AWAITING_CUSTOMER_CONFIRMATION.
O cliente for notificado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate ExecutionEvent
ExecutionEventRepository
ExecutionTimelineService
Atualização do MarketplaceOrder
CompleteMarketplaceOrderUseCase
Migration da tabela marketplace_order_execution_events
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O check-out estiver operacional.
A linha do tempo da execução estiver consistente.
A duração efetiva for calculada corretamente.
O pedido passar para AWAITING_CUSTOMER_CONFIRMATION.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
