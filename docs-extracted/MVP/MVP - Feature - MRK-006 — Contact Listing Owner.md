
Trust Platform MVP
Feature Specification
MRK-006 — Contact Listing Owner

Document Information
Campo
Valor
Feature ID
MRK-006
Feature Name
Contact Listing Owner
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-005 – Get Marketplace Listing
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-007 – Manage Marketplace Conversations

1. Business Objective
Permitir que um usuário interessado inicie contato com o proprietário de um anúncio por meio da plataforma, criando uma conversa privada e rastreável para negociação.

2. Scope
Esta Feature Inclui
Início de uma conversa
Envio da primeira mensagem
Associação da conversa ao anúncio
Identificação do comprador e do anunciante
Registro de data e hora
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Histórico completo da conversa
Envio de anexos
Chamadas de áudio ou vídeo
Pagamentos
Avaliações

3. User Story
Como comprador interessado
Quero entrar em contato com o proprietário de um anúncio
Para que eu possa esclarecer dúvidas e iniciar uma negociação.

4. Business Rules
BR-001
Somente usuários autenticados poderão iniciar uma conversa.

BR-002
Não será permitido iniciar conversa com anúncios que não estejam no status PUBLISHED.

BR-003
O proprietário do anúncio não poderá iniciar uma conversa consigo mesmo.

BR-004
A primeira mensagem será obrigatória.

BR-005
Caso já exista uma conversa ativa entre as mesmas partes para o mesmo anúncio, ela deverá ser reutilizada, evitando conversas duplicadas.

BR-006
Cada conversa deverá estar vinculada exatamente a um anúncio.

BR-007
Toda comunicação deverá permanecer registrada para auditoria.

5. Functional Flow
Comprador autenticado
↓
Seleciona anúncio
↓
Clica em "Entrar em contato"
↓
Validar anúncio
↓
Validar comprador
↓
Existe conversa ativa?
↓
Sim → Abrir conversa existente
↓
Não
↓
Criar conversa
↓
Registrar primeira mensagem
↓
Publicar evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceConversation
Atributos mínimos
id

listingId

sellerId

buyerId

status

startedAt
lastMessageAt
createdAt
updatedAt

6.2 Repository
Criar:
MarketplaceConversationRepository
Métodos mínimos:
save()
findById()
findActiveConversation()
findByListing()

6.3 Services
Criar:
MarketplaceConversationService
Responsabilidades:
validar participantes;
evitar duplicidade;
criar conversa.

6.4 Use Cases
Criar:
ContactListingOwnerUseCase

6.5 DTOs
Criar:
ContactListingOwnerRequest
ContactListingOwnerResponse

6.6 Exceptions
Criar:
MarketplaceConversationAlreadyExistsException
CannotContactOwnListingException
MarketplaceListingUnavailableException

7. Database
Criar tabela:
marketplace_conversations
Campos
Campo
Tipo
id
UUID
listing_id
UUID
seller_id
UUID
buyer_id
UUID
status
VARCHAR(30)
started_at
TIMESTAMP
last_message_at
TIMESTAMP
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(listing_id)
FK(seller_id)
FK(buyer_id)
Índices
Criar índices para:
listing_id
seller_id
buyer_id
status
last_message_at
Criar índice composto:
(listing_id, seller_id, buyer_id)

8. API
Iniciar contato
POST /api/v1/marketplace/listings/{listingId}/contact
Request
{
  "message": "Olá! Gostaria de saber se o produto ainda está disponível."
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
Conversation ID
Listing ID
Buyer ID
Seller ID
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceConversation.Created

MarketplaceMessage.Sent
Payload mínimo:
{
  "conversationId": "UUID",
  "listingId": "UUID",
  "buyerId": "UUID",
  "sellerId": "UUID",
  "startedAt": "2026-08-03T17:10:00Z"
}

11. Unit Tests
Implementar testes para:
criação de conversa;
reutilização de conversa existente;
tentativa de contato com próprio anúncio;
anúncio inexistente;
anúncio não publicado;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
persistência;
reutilização de conversas;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Compradores puderem iniciar contato com anunciantes.
Conversas duplicadas não forem criadas.
Proprietários não puderem contatar seus próprios anúncios.
A primeira mensagem for registrada.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration marketplace_conversations
Aggregate MarketplaceConversation
Repository
MarketplaceConversationService
ContactListingOwnerUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A criação de conversas estiver operacional.
Conversas duplicadas forem evitadas.
A auditoria estiver implementada.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
