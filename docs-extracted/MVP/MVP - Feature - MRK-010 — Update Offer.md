
Trust Platform MVP
Feature Specification
MRK-010 — Update Offer

Document Information
Campo
Valor
Feature ID
MRK-010
Feature Name
Update Offer
Module
Marketplace
Priority
Critical
Sprint
Sprint 8
Status
Ready for Development
Depends On
MRK-009 – Create Offer
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-011 – Withdraw Offer

1. Business Objective
Permitir que o comprador atualize uma oferta ainda pendente, antes que ela seja aceita, rejeitada, retirada ou expirada, preservando um processo de negociação flexível e auditável.

2. Scope
Esta Feature Inclui
Alteração do valor ofertado
Alteração da quantidade
Alteração da validade da oferta
Alteração das observações
Atualização da data da última modificação
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Aceitação da oferta
Rejeição da oferta
Contraoferta
Retirada da oferta
Criação de pedido

3. User Story
Como comprador
Quero atualizar minha oferta
Para que eu possa ajustar minha proposta durante a negociação.

4. Business Rules
BR-001
Somente o comprador que criou a oferta poderá atualizá-la.

BR-002
A oferta deverá estar com status PENDING.

BR-003
Ofertas aceitas, rejeitadas, retiradas, canceladas ou expiradas não poderão ser alteradas.

BR-004
Os seguintes campos poderão ser alterados:
valor;
quantidade;
validade;
observações.

BR-005
O valor deverá permanecer maior que zero.

BR-006
A quantidade deverá permanecer maior que zero.

BR-007
A atualização deverá modificar automaticamente o campo updatedAt.

BR-008
Todas as alterações deverão permanecer registradas para auditoria.

5. Functional Flow
Comprador
↓
Seleciona oferta
↓
Editar proposta
↓
Validar propriedade
↓
Validar status PENDING
↓
Validar dados
↓
Atualizar oferta
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
MarketplaceOffer
Adicionar comportamento:
updateOffer()
Responsabilidades:
validar regras;
atualizar atributos permitidos;
preservar consistência da oferta.

6.2 Repository
Atualizar:
MarketplaceOfferRepository
Métodos:
findById()
save()

6.3 Services
Atualizar:
MarketplaceOfferService
Adicionar responsabilidades:
validar atualização;
verificar status;
validar propriedade.

6.4 Use Cases
Criar:
UpdateMarketplaceOfferUseCase

6.5 DTOs
Criar:
UpdateMarketplaceOfferRequest
UpdateMarketplaceOfferResponse

6.6 Exceptions
Criar:
MarketplaceOfferNotFoundException
MarketplaceOfferUpdateNotAllowedException
MarketplaceOfferOwnershipException
MarketplaceOfferExpiredException

7. Database
Nenhuma alteração estrutural.
Utilizar:
marketplace_offers
Atualizar apenas:
amount
quantity
expires_at
notes
updated_at

8. API
Endpoint
PUT /api/v1/marketplace/offers/{offerId}
Responses
200 OK
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Offer ID
Buyer ID
Campos alterados
Valor anterior
Novo valor
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOffer.Updated
Payload mínimo:
{
  "offerId": "UUID",
  "buyerId": "UUID",
  "updatedAt": "2026-08-03T19:00:00Z"
}

11. Unit Tests
Implementar testes para:
atualização válida;
oferta inexistente;
oferta aceita;
oferta rejeitada;
oferta retirada;
oferta expirada;
usuário não autorizado;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O comprador puder atualizar ofertas pendentes.
Apenas o proprietário da oferta puder alterá-la.
Ofertas encerradas não puderem ser modificadas.
O histórico de auditoria for preservado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceOffer
Repository atualizado
MarketplaceOfferService
UpdateMarketplaceOfferUseCase
Endpoint PUT
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A atualização de ofertas estiver operacional.
As regras de negócio forem respeitadas.
O evento MarketplaceOffer.Updated for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
