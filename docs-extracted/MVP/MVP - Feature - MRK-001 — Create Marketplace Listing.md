
Trust Platform MVP
Feature Specification
MRK-001 — Create Marketplace Listing

Document Information
Campo
Valor
Feature ID
MRK-001
Feature Name
Create Marketplace Listing
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
IDN, VRF, TRS
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-002 – Update Marketplace Listing

1. Business Objective
Permitir que usuários autenticados criem anúncios de produtos ou serviços no Marketplace da Trust Platform, disponibilizando ofertas para negociação com outros participantes da plataforma.

2. Scope
Esta Feature Inclui
Criação de anúncios
Cadastro de produtos ou serviços
Definição de categoria
Definição de preço
Upload de imagens
Configuração de disponibilidade
Salvamento em modo rascunho

Esta Feature NÃO Inclui
Publicação do anúncio
Busca de anúncios
Negociação
Pagamento
Avaliações

3. User Story
Como usuário autenticado
Quero criar um anúncio
Para que eu possa oferecer produtos ou serviços no Marketplace.

4. Business Rules
BR-001
Somente usuários autenticados poderão criar anúncios.

BR-002
O anúncio deverá possuir, no mínimo:
título;
descrição;
categoria;
tipo (produto ou serviço);
preço;
moeda.

BR-003
O anúncio será criado inicialmente com status:
DRAFT

BR-004
O usuário poderá salvar anúncios incompletos como rascunho.

BR-005
O anúncio deverá pertencer exclusivamente ao usuário criador.

BR-006
Cada anúncio deverá possuir um identificador único (UUID).

5. Functional Flow
Usuário autenticado
↓
Seleciona "Criar anúncio"
↓
Preenche informações
↓
Valida dados
↓
Salvar anúncio
↓
Status = DRAFT
↓
Registrar auditoria
↓
Publicar evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceListing
Atributos mínimos
id

ownerId

title

description

listingType

categoryId

price

currency

status

createdAt
updatedAt

6.2 Repository
Criar:
MarketplaceListingRepository
Métodos mínimos:
save()
findById()
findByOwner()
exists()

6.3 Use Cases
Criar:
CreateMarketplaceListingUseCase

6.4 DTOs
Criar:
CreateMarketplaceListingRequest
CreateMarketplaceListingResponse

6.5 Exceptions
Criar:
InvalidMarketplaceListingException
MarketplaceListingAlreadyExistsException

7. Database
Criar tabela:
marketplace_listings
Campos
Campo
Tipo
id
UUID
owner_id
UUID
title
VARCHAR(255)
description
TEXT
listing_type
VARCHAR(30)
category_id
UUID
price
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
FK(owner_id)
Índices
Criar índices para:
owner_id
category_id
status
created_at

8. API
Endpoint
POST /api/v1/marketplace/listings
Responses
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden

9. Logging
Registrar:
Listing ID
Owner ID
Categoria
Tipo
Status
Correlation ID

10. Events
Publicar:
MarketplaceListing.Created
Payload mínimo:
{
  "listingId": "UUID",
  "ownerId": "UUID",
  "status": "DRAFT"
}

11. Unit Tests
Implementar testes para:
criação válida;
validação dos campos obrigatórios;
criação em modo rascunho;
publicação do evento.

12. Integration Tests
Validar:
persistência;
endpoint;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Usuários autenticados puderem criar anúncios.
O anúncio for salvo como DRAFT.
Todos os campos obrigatórios forem validados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration marketplace_listings
Aggregate MarketplaceListing
Repository
CreateMarketplaceListingUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A criação de anúncios estiver operacional.
O status inicial for DRAFT.
O evento MarketplaceListing.Created for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
