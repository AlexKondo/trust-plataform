
Trust Platform MVP
Feature Specification
MRK-005 — Get Marketplace Listing

Document Information
Campo
Valor
Feature ID
MRK-005
Feature Name
Get Marketplace Listing
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-004 – Search Marketplace Listings
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-006 – Contact Listing Owner

1. Business Objective
Permitir que usuários consultem os detalhes completos de um anúncio publicado, apresentando todas as informações públicas do anúncio e do anunciante necessárias para apoiar uma decisão de negociação.

2. Scope
Esta Feature Inclui
Consulta de anúncio por ID
Exibição completa do anúncio
Exibição resumida do anunciante
Exibição do Trust Score e Trust Level públicos
Exibição das imagens
Exibição da localização
Incremento do contador de visualizações
Auditoria da consulta

Esta Feature NÃO Inclui
Contato com o anunciante
Compra
Pagamento
Avaliações
Favoritos

3. User Story
Como usuário da plataforma
Quero visualizar um anúncio
Para que eu possa avaliar se desejo iniciar uma negociação.

4. Business Rules
BR-001
Somente anúncios com status PUBLISHED poderão ser visualizados publicamente.

BR-002
Anúncios removidos, suspensos, expirados ou em rascunho deverão retornar HTTP 404.

BR-003
As informações exibidas deverão respeitar as Visibility Policies da plataforma.

BR-004
A visualização deverá incrementar o contador de visualizações (viewCount).

BR-005
O Trust Score e o Trust Level do anunciante deverão ser exibidos apenas conforme a configuração de visibilidade.

BR-006
O anúncio poderá ser visualizado por usuários autenticados e, conforme a política da plataforma, por visitantes anônimos.

BR-007
Toda visualização deverá ser registrada para auditoria.

5. Functional Flow
Usuário
↓
Seleciona anúncio
↓
Buscar anúncio
↓
Validar status
↓
Aplicar Visibility Policies
↓
Incrementar viewCount
↓
Montar resposta
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceListing
Adicionar atributos:
viewCount

lastViewedAt
Adicionar comportamento:
registerView()

6.2 Repository
Atualizar:
MarketplaceListingRepository
Adicionar métodos:
findPublishedById()
incrementViewCount()

6.3 Services
Criar:
MarketplaceListingPresentationService
Responsabilidades:
montar resposta pública;
aplicar Visibility Policies;
compor informações do anunciante.

6.4 Use Cases
Criar:
GetMarketplaceListingUseCase

6.5 DTOs
Criar:
MarketplaceListingResponse
MarketplaceSellerSummaryResponse
MarketplaceImageResponse

6.6 Exceptions
Criar:
MarketplaceListingNotFoundException
MarketplaceListingUnavailableException

7. Database
Atualizar tabela:
marketplace_listings
Adicionar campos:
Campo
Tipo
view_count
BIGINT
last_viewed_at
TIMESTAMP NULL
Criar índice:
view_count

8. API
Endpoint
GET /api/v1/marketplace/listings/{listingId}
Responses
200 OK
404 Not Found

9. Logging
Registrar:
Listing ID
Usuário autenticado (quando houver)
IP
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceListing.Viewed
Payload mínimo:
{
  "listingId": "UUID",
  "viewerId": "UUID | null",
  "viewedAt": "2026-08-03T16:30:00Z"
}

11. Unit Tests
Implementar testes para:
consulta válida;
anúncio inexistente;
anúncio não publicado;
incremento do contador de visualizações;
aplicação das Visibility Policies;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência do contador;
composição da resposta;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Usuários puderem visualizar anúncios publicados.
O contador de visualizações for atualizado corretamente.
Apenas informações públicas forem exibidas.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_listings
Atualização do Aggregate MarketplaceListing
Repository atualizado
MarketplaceListingPresentationService
GetMarketplaceListingUseCase
Endpoint GET
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A consulta do anúncio estiver operacional.
O contador de visualizações funcionar corretamente.
As Visibility Policies forem respeitadas.
O evento MarketplaceListing.Viewed for publicado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
