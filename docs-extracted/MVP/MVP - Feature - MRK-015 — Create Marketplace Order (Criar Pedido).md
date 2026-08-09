
Trust Platform MVP
Especificação da Feature
MRK-015 — Create Marketplace Order (Criar Pedido)

Document Information
Campo
Valor
Feature ID
MRK-015
Feature Name
Create Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 9
Status
Ready for Development
Depends On
MRK-014 – Reject Offer
References
DOC-001 até DOC-007
Blocks
MRK-016 – Get Marketplace Order

1. Objetivo de Negócio
Criar automaticamente um Pedido (Marketplace Order) após a aceitação de uma proposta, tornando-o a entidade central responsável por controlar toda a execução da transação entre comprador e vendedor.

2. Escopo
Esta Feature Inclui
Criação automática do pedido
Associação ao anúncio
Associação à proposta aceita
Associação à conversa
Associação ao comprador e vendedor
Definição do valor contratado
Definição da moeda
Definição do status inicial
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Pagamento
Agendamento
Execução do serviço
Evidências
Disputas
Avaliações

3. User Story
Como plataforma
Quero criar automaticamente um pedido quando uma proposta for aceita
Para que toda a execução da transação seja controlada de forma estruturada.

4. Business Rules
BR-001
A criação do pedido será automática.
Não existirá endpoint público para criação manual.

BR-002
Cada proposta aceita poderá gerar exatamente um pedido.

BR-003
Cada pedido estará vinculado a:
um anúncio;
uma conversa;
uma proposta aceita;
um comprador;
um vendedor.

BR-004
O pedido será criado com status:
CREATED

BR-005
O valor do pedido será copiado da proposta aceita.
Após a criação do pedido, alterações futuras na proposta não produzirão efeitos.

BR-006
O pedido será imutável em relação aos participantes da negociação.
Comprador e vendedor não poderão ser alterados.

BR-007
Toda a criação deverá ocorrer na mesma transação da aceitação da proposta.

BR-008
O pedido será a entidade responsável por orquestrar todas as próximas etapas da transação.

5. Fluxo Funcional
Proposta aceita
↓
Iniciar transação
↓
Criar MarketplaceOrder
↓
Associar anúncio
↓
Associar proposta
↓
Associar conversa
↓
Associar comprador
↓
Associar vendedor
↓
Status = CREATED
↓
Registrar auditoria
↓
Publicar evento
↓
Fim da transação

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceOrder
Atributos
id

listingId

offerId

conversationId

buyerId

sellerId

amount
currency
status
createdAt
updatedAt

6.2 Repository
Criar:
MarketplaceOrderRepository
Métodos:
save()
findById()
existsByOfferId()

6.3 Services
Criar:
MarketplaceOrderService
Responsabilidades:
criar pedido;
validar unicidade;
garantir consistência da transação.

6.4 Use Cases
Criar:
CreateMarketplaceOrderUseCase
Observação: este caso de uso será interno, invocado automaticamente pelo AcceptMarketplaceOfferUseCase, não sendo exposto diretamente aos clientes da API.

6.5 DTOs
Não aplicável.
A criação será interna.

6.6 Exceptions
Criar:
MarketplaceOrderAlreadyExistsException
MarketplaceOrderCreationException

7. Database
Criar tabela:
marketplace_orders
Campo
Tipo
id
UUID
listing_id
UUID
offer_id
UUID
conversation_id
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
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(listing_id)
FK(offer_id)
FK(conversation_id)
FK(buyer_id)
FK(seller_id)
UNIQUE(offer_id)
Índices
buyer_id
seller_id
status
created_at

8. API
Não haverá endpoint público nesta Feature.
A criação ocorrerá exclusivamente por integração interna após a aceitação da proposta.

9. Logging
Registrar:
Order ID
Offer ID
Listing ID
Conversation ID
Buyer ID
Seller ID
Valor contratado
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOrder.Created
Consumidores previstos:
Pagamentos
Agenda
Notificações
Trust Score
Trust Economy
Analytics
Auditoria

11. Unit Tests
Implementar testes para:
criação válida;
tentativa de duplicidade por offerId;
consistência dos vínculos;
publicação do evento.

12. Integration Tests
Validar:
criação automática após aceite;
persistência;
publicação do evento;
rollback transacional em caso de falha.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O pedido for criado automaticamente após a aceitação da proposta.
Cada proposta aceita gerar apenas um pedido.
Todos os relacionamentos forem persistidos corretamente.
O evento MarketplaceOrder.Created for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration marketplace_orders
Aggregate MarketplaceOrder
Repository
MarketplaceOrderService
CreateMarketplaceOrderUseCase
Eventos de domínio
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI (referências internas)

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O MarketplaceOrder for criado automaticamente.
Não houver possibilidade de duplicidade.
O evento MarketplaceOrder.Created for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
