
Trust Platform MVP
Feature Specification
MRK-009 — Create Offer

Document Information
Campo
Valor
Feature ID
MRK-009
Feature Name
Create Offer
Module
Marketplace
Priority
Critical
Sprint
Sprint 8
Status
Ready for Development
Depends On
MRK-008 – Close Marketplace Conversation
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-010 – Update Offer

1. Business Objective
Permitir que um comprador formalize uma proposta comercial para um anúncio publicado, iniciando oficialmente a negociação entre as partes dentro da Trust Platform.

2. Scope
Esta Feature Inclui
Criação de proposta comercial
Associação da proposta ao anúncio
Associação à conversa existente
Definição do valor ofertado
Definição da quantidade
Definição da validade da oferta
Registro de observações
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Contraoferta
Aceitação
Rejeição
Pagamento
Criação do pedido

3. User Story
Como comprador
Quero enviar uma oferta ao anunciante
Para que possamos iniciar uma negociação formal pela plataforma.

4. Business Rules
BR-001
Somente o comprador da conversa poderá criar uma oferta.

BR-002
A conversa deverá estar com status OPEN.

BR-003
O anúncio deverá permanecer com status PUBLISHED.

BR-004
Uma oferta deverá possuir, no mínimo:
anúncio;
comprador;
vendedor;
valor;
quantidade;
moeda;
validade.

BR-005
O valor da oferta deverá ser maior que zero.

BR-006
A oferta será criada inicialmente com status:
PENDING

BR-007
Após expirada, a oferta não poderá ser aceita.

BR-008
Toda oferta deverá estar vinculada exatamente a uma conversa de negociação.

5. Functional Flow
Comprador
↓
Seleciona conversa
↓
Criar oferta
↓
Validar conversa
↓
Validar anúncio
↓
Validar dados
↓
Persistir oferta
↓
Status = PENDING
↓
Registrar auditoria
↓
Publicar evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceOffer
Atributos mínimos
id

conversationId

listingId

buyerId

sellerId

amount

currency

quantity

status
expiresAt
notes
createdAt
updatedAt

6.2 Repository
Criar:
MarketplaceOfferRepository
Métodos mínimos:
save()
findById()
findByConversation()
findPendingByConversation()

6.3 Services
Criar:
MarketplaceOfferService
Responsabilidades:
validar regras da oferta;
validar elegibilidade da conversa;
validar anúncio;
controlar ofertas pendentes.

6.4 Use Cases
Criar:
CreateMarketplaceOfferUseCase

6.5 DTOs
Criar:
CreateMarketplaceOfferRequest
CreateMarketplaceOfferResponse

6.6 Exceptions
Criar:
MarketplaceConversationClosedException
MarketplaceOfferValidationException
MarketplaceOfferAlreadyExistsException
MarketplaceListingUnavailableException

7. Database
Criar tabela:
marketplace_offers
Campos
Campo
Tipo
id
UUID
conversation_id
UUID
listing_id
UUID
buyer_id
UUID
seller_id
UUID
amount
DECIMAL(18,2)
currency
CHAR(3)
quantity
DECIMAL(18,4)
status
VARCHAR(30)
expires_at
TIMESTAMP
notes
TEXT NULL
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(conversation_id)
FK(listing_id)
FK(buyer_id)
FK(seller_id)
Índices
Criar índices para:
conversation_id
listing_id
buyer_id
seller_id
status
expires_at

8. API
Endpoint
POST /api/v1/marketplace/conversations/{conversationId}/offers
Request
{
  "amount": 8500.00,
  "currency": "BRL",
  "quantity": 1,
  "expiresAt": "2026-08-10T23:59:59Z",
  "notes": "Proposta válida por 7 dias."
}
Responses
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Offer ID
Conversation ID
Listing ID
Buyer ID
Seller ID
Valor ofertado
Status
Correlation ID

10. Events
Publicar:
MarketplaceOffer.Created
Payload mínimo:
{
  "offerId": "UUID",
  "conversationId": "UUID",
  "listingId": "UUID",
  "buyerId": "UUID",
  "sellerId": "UUID",
  "status": "PENDING",
  "createdAt": "2026-08-03T18:30:00Z"
}

11. Unit Tests
Implementar testes para:
criação de oferta válida;
conversa encerrada;
anúncio indisponível;
valor inválido;
quantidade inválida;
oferta expirada;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência;
vínculo com a conversa;
vínculo com o anúncio;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Compradores puderem criar ofertas.
Apenas conversas abertas aceitarem ofertas.
Apenas anúncios publicados aceitarem ofertas.
A oferta for criada com status PENDING.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration marketplace_offers
Aggregate MarketplaceOffer
Repository
MarketplaceOfferService
CreateMarketplaceOfferUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A criação de ofertas estiver operacional.
As validações de negócio estiverem implementadas.
O evento MarketplaceOffer.Created for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
