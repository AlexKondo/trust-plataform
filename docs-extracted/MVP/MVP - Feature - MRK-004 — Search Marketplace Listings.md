
Trust Platform MVP
Feature Specification
MRK-004 — Search Marketplace Listings

Document Information
Campo
Valor
Feature ID
MRK-004
Feature Name
Search Marketplace Listings
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-003 – Publish Marketplace Listing
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-005 – Get Marketplace Listing

1. Business Objective
Permitir que usuários pesquisem anúncios publicados no Marketplace utilizando filtros, critérios de ordenação e paginação, retornando apenas anúncios ativos e respeitando as regras de visibilidade e elegibilidade da plataforma.

2. Scope
Esta Feature Inclui
Pesquisa textual
Pesquisa por categoria
Pesquisa por tipo (produto ou serviço)
Pesquisa por localização
Pesquisa por faixa de preço
Paginação
Ordenação
Aplicação de filtros
Exibição resumida dos anúncios

Esta Feature NÃO Inclui
Visualização completa do anúncio
Contato com o anunciante
Favoritos
Recomendações personalizadas
Pesquisa por imagem

3. User Story
Como usuário da plataforma
Quero pesquisar anúncios
Para que eu encontre rapidamente produtos e serviços relevantes para minha necessidade.

4. Business Rules
BR-001
Somente anúncios com status PUBLISHED poderão ser retornados.

BR-002
Anúncios suspensos, removidos, expirados ou em rascunho não deverão aparecer nos resultados.

BR-003
A pesquisa deverá suportar combinação de filtros.

BR-004
A busca deverá ser paginada.

BR-005
Os resultados deverão permitir ordenação por:
relevância;
data de publicação;
menor preço;
maior preço;
maior Trust Score do anunciante.

BR-006
A pesquisa deverá permitir filtros por:
categoria;
tipo;
faixa de preço;
moeda;
localização;
Trust Level mínimo do anunciante.

BR-007
Cada resultado deverá retornar apenas informações resumidas do anúncio.

5. Functional Flow
Usuário
↓
Informa critérios
↓
Aplicar filtros
↓
Buscar anúncios publicados
↓
Aplicar ordenação
↓
Paginar
↓
Montar resumo
↓
HTTP 200

6. Backend Implementation
6.1 Query Service
Criar:
MarketplaceSearchService
Responsabilidades:
executar consultas;
aplicar filtros;
ordenar resultados;
paginar.

6.2 Repository
Atualizar:
MarketplaceListingRepository
Adicionar métodos:
search()
searchPaged()
countSearchResults()

6.3 Use Cases
Criar:
SearchMarketplaceListingsUseCase

6.4 DTOs
Criar:
MarketplaceSearchRequest
MarketplaceSearchResponse
MarketplaceListingSummaryResponse

6.5 Exceptions
Criar:
InvalidMarketplaceSearchException

7. Database
Utilizar:
marketplace_listings
Criar índices para melhorar performance:
status
category_id
listing_type
price
published_at
Criar índice composto:
(status, category_id, published_at)

8. API
Endpoint
GET /api/v1/marketplace/listings
Query Parameters
Parâmetro
Obrigatório
Descrição
q
Não
Texto da pesquisa
category
Não
Categoria
listingType
Não
Produto ou Serviço
minPrice
Não
Preço mínimo
maxPrice
Não
Preço máximo
currency
Não
Moeda
location
Não
Localização
minimumTrustLevel
Não
Trust Level mínimo
sort
Não
Ordenação
page
Não
Página
size
Não
Quantidade

Responses
200 OK
400 Bad Request

9. Logging
Registrar:
Critérios utilizados
Quantidade de resultados
Tempo da consulta
Correlation ID

10. Events
Esta Feature não publica eventos.

11. Unit Tests
Implementar testes para:
pesquisa textual;
filtros individuais;
filtros combinados;
paginação;
ordenação;
anúncios não publicados;
Trust Level mínimo.

12. Integration Tests
Validar:
endpoint;
índices;
performance;
paginação;
filtros;
ordenação.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas anúncios publicados forem retornados.
Todos os filtros funcionarem corretamente.
A ordenação retornar resultados consistentes.
A paginação funcionar corretamente.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Repository
MarketplaceSearchService
SearchMarketplaceListingsUseCase
Endpoint GET
DTOs
Índices de banco
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A pesquisa estiver operacional.
Todos os filtros estiverem funcionando.
A paginação estiver implementada.
A ordenação estiver consistente.
Os índices garantirem desempenho adequado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
