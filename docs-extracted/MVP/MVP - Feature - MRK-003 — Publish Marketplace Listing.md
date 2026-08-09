
Trust Platform MVP
Feature Specification
MRK-003 — Publish Marketplace Listing

Document Information
Campo
Valor
Feature ID
MRK-003
Feature Name
Publish Marketplace Listing
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-002 – Update Marketplace Listing
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-004 – Search Marketplace Listings

1. Business Objective
Permitir que o proprietário publique um anúncio previamente criado, tornando-o visível e pesquisável no Marketplace, desde que atenda a todos os requisitos obrigatórios definidos pela plataforma.

2. Scope
Esta Feature Inclui
Publicação de anúncios
Validação de completude dos dados
Validação de elegibilidade do anunciante
Alteração do status do anúncio
Disponibilização para pesquisas
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Busca de anúncios
Alteração do conteúdo do anúncio
Negociação
Pagamentos
Promoção patrocinada

3. User Story
Como proprietário de um anúncio
Quero publicá-lo
Para que ele fique disponível para visualização e negociação pelos demais usuários do Marketplace.

4. Business Rules
BR-001
Somente o proprietário poderá publicar o anúncio.

BR-002
O anúncio deverá estar com status DRAFT.

BR-003
Todos os campos obrigatórios deverão estar preenchidos.
Campos mínimos:
título;
descrição;
categoria;
tipo;
preço;
moeda.

BR-004
O proprietário deverá possuir uma Identity ativa.

BR-005
Caso existam requisitos mínimos de reputação definidos para a categoria do anúncio, eles deverão ser atendidos antes da publicação.

BR-006
Após a publicação, o status deverá ser alterado para:
PUBLISHED

BR-007
A data de publicação (publishedAt) deverá ser registrada.

BR-008
Anúncios publicados passarão a ser indexados pelo mecanismo de busca do Marketplace.

5. Functional Flow
Usuário autenticado
↓
Seleciona anúncio
↓
Solicita publicação
↓
Validar propriedade
↓
Validar status DRAFT
↓
Validar obrigatoriedades
↓
Validar elegibilidade
↓
Atualizar status
↓

publishedAt = now()

↓

Registrar auditoria

↓

Publicar evento

↓

HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceListing
Adicionar atributos:
publishedAt
Adicionar comportamento de domínio:
publish()
O método deverá:
validar regras;
alterar status;
registrar data de publicação.

6.2 Repository
Utilizar:
MarketplaceListingRepository
Métodos:
findById()
save()

6.3 Services
Criar:
MarketplacePublicationService
Responsabilidades:
validar elegibilidade;
validar completude;
validar requisitos da categoria.

6.4 Use Cases
Criar:
PublishMarketplaceListingUseCase

6.5 DTOs
Criar:
PublishMarketplaceListingRequest
PublishMarketplaceListingResponse

6.6 Exceptions
Criar:
MarketplaceListingNotFoundException
MarketplaceListingAlreadyPublishedException
MarketplaceListingIncompleteException
MarketplacePublicationNotAllowedException

7. Database
Atualizar tabela:
marketplace_listings
Adicionar campo:
Campo
Tipo
published_at
TIMESTAMP NULL
Atualizar:
status
published_at
updated_at

8. API
Publicar anúncio
POST /api/v1/marketplace/listings/{listingId}/publish
Responses
200 OK
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Listing ID
Owner ID
Status anterior
Novo status
PublishedAt
Correlation ID

10. Events
Publicar:
MarketplaceListing.Published
Payload mínimo:
{
  "listingId": "UUID",
  "ownerId": "UUID",
  "status": "PUBLISHED",
  "publishedAt": "2026-08-03T16:15:00Z"
}

11. Unit Tests
Implementar testes para:
publicação válida;
anúncio incompleto;
anúncio já publicado;
proprietário inválido;
validação de elegibilidade;
atualização do status;
atualização de publishedAt;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência;
indexação para busca;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O proprietário conseguir publicar anúncios válidos.
Apenas anúncios completos forem publicados.
O status mudar corretamente para PUBLISHED.
O anúncio ficar disponível para pesquisa.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_listings
Atualização do Aggregate MarketplaceListing
MarketplacePublicationService
PublishMarketplaceListingUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A publicação estiver operacional.
Apenas anúncios elegíveis puderem ser publicados.
Os anúncios publicados forem indexados para pesquisa.
O evento MarketplaceListing.Published for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
