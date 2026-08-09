
Trust Platform MVP
Especificação da Feature
MRK-018 — Cancel Marketplace Order (Cancelar Pedido)

Document Information
Campo
Valor
Feature ID
MRK-018
Feature Name
Cancel Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 10
Status
Ready for Development
Depends On
MRK-017 – Update Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-019 – Schedule Marketplace Order

1. Objetivo de Negócio
Permitir o cancelamento controlado de um Pedido, respeitando as regras do estágio da transação, preservando a rastreabilidade completa e notificando todos os módulos impactados.

2. Escopo
Esta Feature Inclui
Cancelamento do pedido
Validação das regras de cancelamento
Registro do motivo
Registro da parte solicitante
Registro da data e hora
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Reembolso financeiro
Resolução de disputas
Reativação do pedido
Exclusão do pedido

3. User Story
Como participante da transação
Quero cancelar um pedido
Para que a negociação seja encerrada quando não puder mais ser executada.

4. Business Rules
BR-001
Poderão solicitar o cancelamento:
Comprador
Vendedor
Plataforma (processos automáticos ou administrativos)

BR-002
O cancelamento somente será permitido conforme as regras do estado atual do pedido.
Exemplos:
Status
Cancelamento
CREATED
Permitido
AWAITING_SCHEDULING
Permitido
SCHEDULED
Permitido (conforme política de cancelamento)
AWAITING_EXECUTION
Permitido (conforme política de cancelamento)
IN_PROGRESS
Não permitido automaticamente. Poderá exigir abertura de disputa ou autorização administrativa.
AWAITING_CUSTOMER_CONFIRMATION
Não permitido automaticamente.
COMPLETED
Não permitido.
CLOSED
Não permitido.

BR-003
O cancelamento exigirá um motivo.
O motivo será armazenado para auditoria e análises futuras.

BR-004
Após o cancelamento:
Status:
CANCELLED

BR-005
O pedido permanecerá armazenado permanentemente.
Nunca será excluído fisicamente.

BR-006
O cancelamento deverá publicar eventos para os módulos consumidores.
Exemplos:
Agenda
Pagamentos
Notificações
Trust Score
Trust Economy
Analytics
Auditoria

BR-007
Caso existam pagamentos autorizados ou capturados, o módulo de Pagamentos decidirá o fluxo de estorno ou retenção, conforme suas próprias regras. O módulo Marketplace não executará lógica financeira.

BR-008
As políticas de cancelamento (prazos, multas, taxas e penalidades) deverão ser configuráveis por categoria de serviço, produto ou parceiro e não deverão ficar codificadas nesta Feature.

5. Fluxo Funcional
Solicitar cancelamento
↓
Validar permissões
↓
Validar estado atual
↓
Validar política de cancelamento
↓
Atualizar status
↓
Registrar motivo
↓
Registrar auditoria
↓
Publicar eventos
↓
Enviar notificações
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOrder
Adicionar atributos:
cancelledAt

cancelledBy

cancellationReason
Adicionar comportamento:
cancel()

6.2 Repository
Atualizar:
MarketplaceOrderRepository
Métodos:
findById()
save()

6.3 Services
Atualizar:
MarketplaceOrderLifecycleService
Adicionar responsabilidades:
validar política de cancelamento;
validar máquina de estados;
coordenar notificações.

Criar:
MarketplaceCancellationPolicyService
Responsabilidades:
avaliar regras de cancelamento;
verificar elegibilidade;
retornar decisão fundamentada.

6.4 Use Cases
Criar:
CancelMarketplaceOrderUseCase

6.5 DTOs
Criar:
CancelMarketplaceOrderRequest
CancelMarketplaceOrderResponse

6.6 Exceptions
Criar:
MarketplaceOrderCancellationNotAllowedException
MarketplaceOrderAlreadyCancelledException
MarketplaceCancellationPolicyViolationException

7. Database
Atualizar:
marketplace_orders
Adicionar:
Campo
Tipo
cancelled_at
TIMESTAMP NULL
cancelled_by
UUID NULL
cancellation_reason
TEXT NULL
Atualizar:
status
updated_at

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/cancel
Request
{
  "reason": "Mudança de planos do cliente."
}
Responses
200 OK
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity

9. Logging
Registrar:
Order ID
Usuário solicitante
Perfil (Comprador, Vendedor ou Plataforma)
Motivo
Status anterior
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOrder.Cancelled
Payload mínimo:
{
  "orderId": "UUID",
  "cancelledBy": "UUID",
  "reason": "Mudança de planos do cliente.",
  "cancelledAt": "2026-08-03T22:15:00Z"
}

11. Notifications
Destinatários
Comprador
Vendedor
Mensagem:
O pedido foi cancelado.
Caso existam ações pendentes (como reembolso ou abertura de disputa), as notificações deverão orientar o usuário sobre os próximos passos.

12. Unit Tests
Implementar testes para:
cancelamento válido;
cancelamento em estado inválido;
política de cancelamento não atendida;
motivo obrigatório;
publicação do evento;
envio das notificações.

13. Integration Tests
Validar:
endpoint;
atualização do pedido;
integração com o MarketplaceCancellationPolicyService;
publicação dos eventos;
notificações;
auditoria.

14. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas cancelamentos permitidos forem executados.
O status passar para CANCELLED.
O motivo for registrado.
Os eventos forem publicados.
Os módulos consumidores forem notificados.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceOrder
Atualização da migration marketplace_orders
MarketplaceCancellationPolicyService
Atualização do MarketplaceOrderLifecycleService
CancelMarketplaceOrderUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
O cancelamento estiver operacional.
A política de cancelamento for aplicada corretamente.
O status CANCELLED for persistido.
O evento MarketplaceOrder.Cancelled for publicado.
As notificações forem enviadas.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
