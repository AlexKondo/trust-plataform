
Trust Platform MVP
Feature Specification
MRK-002 — Update Marketplace Listing

Document Information
Campo
Valor
Feature ID
MRK-002
Feature Name
Update Marketplace Listing
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-001 – Create Marketplace Listing
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-003 – Publish Marketplace Listing

1. Business Objective
Permitir que o proprietário de um anúncio atualize suas informações antes ou após a publicação, mantendo o conteúdo do anúncio preciso, atualizado e consistente com as regras do Marketplace.

2. Scope
Esta Feature Inclui
Atualização das informações do anúncio
Alteração de título
Alteração da descrição
Alteração da categoria
Alteração do preço
Alteração da moeda
Alteração das imagens
Alteração da disponibilidade
Registro de auditoria

Esta Feature NÃO Inclui
Publicação do anúncio
Exclusão do anúncio
Alteração do proprietário
Negociação
Pagamentos

3. User Story
Como proprietário de um anúncio
Quero atualizar suas informações
Para que os compradores visualizem dados corretos e atualizados.

4. Business Rules
BR-001
Somente o proprietário poderá editar o anúncio.

BR-002
O identificador (UUID) do anúncio não poderá ser alterado.

BR-003
O status do anúncio não deverá ser alterado por esta Feature.

BR-004
Todos os campos obrigatórios deverão permanecer válidos após a atualização.

BR-005
A data de atualização (updatedAt) deverá ser atualizada automaticamente.

BR-006
Toda alteração deverá ser registrada para auditoria.

5. Functional Flow
Usuário autenticado
↓
Seleciona anúncio
↓
Editar informações
↓
Validar propriedade
↓
Validar dados
↓
Atualizar anúncio
↓
Atualizar updatedAt
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
Adicionar métodos de domínio para atualização dos atributos editáveis, preservando a integridade das regras de negócio.

6.2 Repository
Utilizar:
MarketplaceListingRepository
Métodos:
findById()
save()

6.3 Use Case
Criar:
UpdateMarketplaceListingUseCase

6.4 DTOs
Criar:
UpdateMarketplaceListingRequest
UpdateMarketplaceListingResponse

6.5 Exceptions
Criar:
MarketplaceListingNotFoundException
MarketplaceListingOwnershipException
InvalidMarketplaceListingUpdateException

7. Database
Nenhuma alteração estrutural.
Utilizar a tabela:
marketplace_listings
Atualizar apenas os campos modificados e updated_at.

8. API
Endpoint
PUT /api/v1/marketplace/listings/{listingId}
Responses
200 OK
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found

9. Logging
Registrar:
Listing ID
Owner ID
Campos alterados
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceListing.Updated
Payload mínimo:
{
  "listingId": "UUID",
  "ownerId": "UUID",
  "updatedAt": "2026-08-03T15:45:00Z"
}

11. Unit Tests
Implementar testes para:
atualização válida;
atualização por usuário não proprietário;
atualização com dados inválidos;
atualização do campo updatedAt;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência das alterações;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O proprietário conseguir atualizar seu anúncio.
Usuários não autorizados não conseguirem realizar alterações.
O histórico de auditoria for registrado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceListing
UpdateMarketplaceListingUseCase
Endpoint PUT
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A edição de anúncios estiver operacional.
A propriedade do anúncio for validada corretamente.
O evento MarketplaceListing.Updated for publicado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
