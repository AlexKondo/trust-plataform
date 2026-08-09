
Trust Platform MVP
Especificação da Feature
MRK-012 — Counter Offer (Contraoferta)

Document Information
Campo
Valor
Feature ID
MRK-012
Feature Name
Counter Offer
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 8
Status
Ready for Development
Depends On
MRK-011 – Withdraw Offer
References
DOC-001 até DOC-007
Blocks
MRK-013 – Accept Offer

1. Objetivo de Negócio
Permitir que o vendedor responda a uma proposta recebida apresentando uma contraoferta, mantendo um processo de negociação estruturado, rastreável e transparente dentro da plataforma.

2. Escopo
Esta Feature Inclui
Criação de contraoferta
Encadeamento do histórico da negociação
Registro do novo valor proposto
Registro da nova quantidade (quando aplicável)
Registro da nova validade
Auditoria completa
Notificação ao comprador
Publicação de eventos

Esta Feature NÃO Inclui
Aceitação automática
Rejeição automática
Pagamento
Criação do pedido

3. User Story
Como vendedor
Quero responder uma proposta com uma contraoferta
Para que possamos continuar negociando até chegar a um acordo.

4. Business Rules
BR-001
Somente o vendedor do anúncio poderá criar uma contraoferta.

BR-002
A proposta original deverá possuir status PENDING.

BR-003
Ao ser criada uma contraoferta, a proposta original será automaticamente alterada para o status:
COUNTERED

BR-004
Cada contraoferta deverá possuir referência à proposta imediatamente anterior, formando um histórico completo da negociação.
Campo:
parentOfferId

BR-005
A contraoferta será criada com status:
PENDING

BR-006
O comprador poderá:
aceitar;
rejeitar;
apresentar uma nova contraoferta.

BR-007
Não haverá limite técnico para o número de contraofertas.
Todo o histórico deverá permanecer preservado para auditoria.

BR-008
A conversa vinculada deverá permanecer com status OPEN.

BR-009
A contraoferta deverá respeitar as regras do anúncio (moeda, disponibilidade e quantidade máxima disponível).

5. Fluxo Funcional
Comprador envia proposta
↓
Vendedor analisa
↓
Criar contraoferta
↓
Validar proposta
↓
Atualizar proposta original para COUNTERED
↓
Criar nova MarketplaceOffer
↓
Relacionar parentOfferId
↓
Status = PENDING
↓
Registrar auditoria
↓
Notificar comprador
↓
Publicar evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOffer
Adicionar atributo:
parentOfferId
Adicionar comportamento:
createCounterOffer()

6.2 Repository
Atualizar:
MarketplaceOfferRepository
Adicionar métodos:
findByParentOffer()
findNegotiationHistory()

6.3 Services
Atualizar:
MarketplaceOfferService
Responsabilidades adicionais:
validar contraoferta;
atualizar oferta anterior;
criar nova proposta;
manter histórico da negociação.

6.4 Use Cases
Criar:
CreateMarketplaceCounterOfferUseCase

6.5 DTOs
Criar:
CreateMarketplaceCounterOfferRequest
CreateMarketplaceCounterOfferResponse

6.6 Exceptions
Criar:
MarketplaceOfferAlreadyResolvedException
MarketplaceCounterOfferNotAllowedException
MarketplaceConversationClosedException

7. Database
Atualizar:
marketplace_offers
Adicionar coluna:
Campo
Tipo
parent_offer_id
UUID NULL
Constraints:
FK(parent_offer_id)
Índices:
parent_offer_id

8. API
Endpoint
POST /api/v1/marketplace/offers/{offerId}/counter
Request
{
  "amount": 9200.00,
  "currency": "BRL",
  "quantity": 1,
  "expiresAt": "2026-08-12T23:59:59Z",
  "notes": "Podemos fechar neste valor."
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
Parent Offer ID
Conversation ID
Listing ID
Buyer ID
Seller ID
Valor anterior
Novo valor
Correlation ID
Timestamp

10. Events
Publicar:
MarketplaceOffer.Countered
Payload mínimo:
{
  "offerId": "UUID",
  "parentOfferId": "UUID",
  "conversationId": "UUID",
  "listingId": "UUID",
  "buyerId": "UUID",
  "sellerId": "UUID",
  "status": "PENDING",
  "createdAt": "2026-08-03T21:00:00Z"
}

11. Notifications
Destinatário
Comprador
Evento
O vendedor enviou uma contraoferta.
Canais
Notificação In-App
Push Notification
E-mail (conforme preferência do usuário)

12. Unit Tests
Implementar testes para:
criação válida de contraoferta;
proposta inexistente;
proposta já aceita;
proposta rejeitada;
conversa encerrada;
criação do vínculo parentOfferId;
alteração da proposta original para COUNTERED;
publicação do evento;
envio da notificação.

13. Integration Tests
Validar:
endpoint;
persistência;
relacionamento entre propostas;
atualização do status da proposta original;
histórico completo da negociação;
publicação de eventos;
envio da notificação.

14. Acceptance Criteria
A Feature será considerada pronta quando:
O vendedor puder criar uma contraoferta.
A proposta original passar para o status COUNTERED.
A contraoferta for criada com status PENDING.
O histórico da negociação permanecer íntegro.
O comprador receber a notificação.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_offers
Atualização do Aggregate MarketplaceOffer
Repository atualizado
MarketplaceOfferService
CreateMarketplaceCounterOfferUseCase
Endpoint POST
DTOs
Integração com Notification Module
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A criação de contraofertas estiver operacional.
O histórico de negociação estiver preservado.
O relacionamento entre propostas funcionar corretamente.
O evento MarketplaceOffer.Countered for publicado.
O comprador for notificado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
