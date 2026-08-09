
Trust Platform MVP
Especificação da Feature
MRK-016 — Get Marketplace Order (Consultar Pedido)

Document Information
Campo
Valor
Feature ID
MRK-016
Feature Name
Get Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 9
Status
Ready for Development
Depends On
MRK-015 – Create Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-017 – Update Marketplace Order

1. Objetivo de Negócio
Permitir que comprador e vendedor consultem todas as informações do Pedido (Marketplace Order), tornando-o a fonte oficial de acompanhamento da execução da transação.

2. Escopo
Esta Feature Inclui
Consulta completa do pedido
Consulta do status atual
Consulta da linha do tempo da transação
Consulta dos participantes
Consulta das informações comerciais
Consulta dos próximos passos da transação
Auditoria de acesso

Esta Feature NÃO Inclui
Alteração do pedido
Pagamento
Agendamento
Execução do serviço
Evidências
Disputas

3. User Story
Como participante da transação
Quero consultar meu pedido
Para que eu acompanhe todas as etapas da negociação e da execução do serviço ou entrega do produto.

4. Business Rules
BR-001
Somente participantes do pedido poderão consultá-lo.
Participantes:
Comprador
Vendedor
Observação: Administradores da plataforma poderão consultar pedidos conforme suas permissões definidas no módulo de Administração e Auditoria.

BR-002
O pedido deverá retornar seu status atual.
Estados suportados:
CREATED
AWAITING_SCHEDULING
SCHEDULED
AWAITING_EXECUTION
IN_PROGRESS
AWAITING_CUSTOMER_CONFIRMATION
COMPLETED
CLOSED
CANCELLED
DISPUTE_OPEN
DISPUTE_RESOLVED
REFUNDED

BR-003
A consulta deverá retornar a linha do tempo da transação, incluindo os principais eventos já ocorridos.
Exemplos:
Pedido criado
Agendamento realizado
Serviço iniciado
Serviço concluído
Confirmação do cliente
Pagamento liberado
Disputa aberta (quando aplicável)

BR-004
O pedido deverá informar claramente a próxima ação esperada.
Exemplos:
Aguardando agendamento
Aguardando início do serviço
Aguardando confirmação do cliente
Pedido finalizado

BR-005
Todas as consultas deverão ser registradas para auditoria.

5. Fluxo Funcional
Usuário autenticado
↓
Seleciona pedido
↓
Validar permissão
↓
Buscar MarketplaceOrder
↓
Buscar dados relacionados
↓
Montar visão consolidada
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Utilizar:
MarketplaceOrder
Nenhuma alteração estrutural.

6.2 Repository
Atualizar:
MarketplaceOrderRepository
Adicionar métodos:
findById()
findDetailedById()

6.3 Query Service
Criar:
MarketplaceOrderQueryService
Responsabilidades:
montar visão consolidada do pedido;
carregar dados relacionados;
calcular próxima etapa da transação.

6.4 Use Cases
Criar:
GetMarketplaceOrderUseCase

6.5 DTOs
Criar:
MarketplaceOrderDetailsResponse
Estrutura mínima:
Order
Buyer
Seller
Listing
Accepted Offer
Conversation

Current Status

Timeline

Next Action

Created At
Updated At

6.6 Exceptions
Criar:
MarketplaceOrderNotFoundException
MarketplaceOrderAccessDeniedException

7. Database
Nenhuma alteração estrutural.
Utilizar:
marketplace_orders
marketplace_listings
marketplace_offers
marketplace_conversations

8. API
Endpoint
GET /api/v1/marketplace/orders/{orderId}
Responses
200 OK
401 Unauthorized
403 Forbidden
404 Not Found

9. Logging
Registrar:
Order ID
Usuário
Perfil de acesso
Timestamp
Correlation ID

10. Events
Esta Feature não publica eventos de domínio.
O acesso será registrado exclusivamente no módulo de Auditoria.

11. Unit Tests
Implementar testes para:
consulta válida;
pedido inexistente;
acesso não autorizado;
montagem correta da visão consolidada;
cálculo da próxima ação.

12. Integration Tests
Validar:
endpoint;
autenticação;
autorização;
carregamento das entidades relacionadas;
auditoria.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O participante puder consultar seu pedido.
Todas as informações estiverem consistentes.
A linha do tempo for exibida corretamente.
A próxima ação estiver claramente identificada.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
MarketplaceOrderQueryService
GetMarketplaceOrderUseCase
Repository atualizado
Endpoint GET
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A consulta do pedido estiver operacional.
A visão consolidada estiver correta.
O controle de acesso estiver funcionando.
A auditoria registrar todas as consultas.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
