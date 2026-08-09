
Trust Platform MVP
Feature Specification
MRK-011 — Withdraw Offer

Document Information
Campo
Valor
Feature ID
MRK-011
Feature Name
Withdraw Offer
Module
Marketplace
Priority
Critical
Sprint
Sprint 8
Status
Ready for Development
Depends On
MRK-010 – Update Offer
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-012 – Counter Offer

1. Business Objective
Permitir que o comprador retire formalmente uma oferta pendente antes que ela seja aceita, rejeitada ou expire, preservando um histórico completo da negociação e garantindo segurança jurídica e rastreabilidade.

2. Scope
Esta Feature Inclui
Retirada voluntária da oferta
Alteração do status da oferta
Registro do motivo da retirada (opcional)
Registro da data e hora da retirada
Identificação do usuário responsável
Auditoria completa
Publicação de eventos
Notificação ao vendedor

Esta Feature NÃO Inclui
Exclusão da oferta
Reabertura da oferta
Aceitação da oferta
Rejeição da oferta
Contraoferta

3. User Story
Como comprador
Quero retirar uma oferta enviada
Para que ela deixe de produzir efeitos antes da decisão do vendedor.

4. Business Rules
BR-001
Somente o comprador que criou a oferta poderá retirá-la.

BR-002
A oferta deverá possuir status:
PENDING

BR-003
Ofertas com status:
ACCEPTED
REJECTED
WITHDRAWN
EXPIRED
CANCELLED
não poderão ser retiradas.

BR-004
A retirada não removerá a oferta do banco de dados.

BR-005
O status será alterado para:
WITHDRAWN

BR-006
O sistema deverá registrar:
withdrewBy
withdrewAt
withdrawReason

BR-007
O vendedor deverá ser notificado sobre a retirada da oferta.

BR-008
A retirada preservará todo o histórico da negociação para auditoria e eventual resolução de disputas.

5. Functional Flow
Comprador
↓
Seleciona oferta
↓
Solicita retirada
↓
Validar proprietário
↓
Validar status PENDING
↓
Atualizar status
↓
Registrar motivo
↓
Registrar auditoria
↓
Notificar vendedor
↓
Publicar evento
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOffer
Adicionar atributos:
withdrewAt

withdrewBy

withdrawReason
Adicionar comportamento:
withdraw()
Responsabilidades:
validar regras de retirada;
alterar status;
registrar metadados da retirada.

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
validar retirada;
registrar auditoria;
disparar notificações.

6.4 Use Cases
Criar:
WithdrawMarketplaceOfferUseCase

6.5 DTOs
Criar:
WithdrawMarketplaceOfferRequest
WithdrawMarketplaceOfferResponse

6.6 Exceptions
Criar:
MarketplaceOfferNotFoundException
MarketplaceOfferAlreadyClosedException
MarketplaceOfferOwnershipException
MarketplaceOfferWithdrawNotAllowedException

7. Database
Atualizar tabela:
marketplace_offers
Adicionar campos:
Campo
Tipo
withdrew_at
TIMESTAMP NULL
withdrew_by
UUID NULL
withdraw_reason
TEXT NULL
Atualizar:
status
updated_at

8. API
Endpoint
POST /api/v1/marketplace/offers/{offerId}/withdraw
Request
{
  "reason": "Encontrei outra solução."
}
Responses
200 OK
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Offer ID
Listing ID
Conversation ID
Buyer ID
Motivo
Status anterior
Novo status
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOffer.Withdrawn
Payload mínimo:
{
  "offerId": "UUID",
  "conversationId": "UUID",
  "listingId": "UUID",
  "buyerId": "UUID",
  "status": "WITHDRAWN",
  "withdrawnAt": "2026-08-03T20:00:00Z"
}

11. Notifications
Destinatário
Vendedor
Evento
Oferta retirada pelo comprador.
Canais
Notificação In-App
Push Notification (quando habilitado)
E-mail (opcional, conforme preferências do usuário)

12. Unit Tests
Implementar testes para:
retirada válida;
usuário não proprietário;
oferta aceita;
oferta rejeitada;
oferta já retirada;
oferta expirada;
publicação do evento;
envio da notificação.

13. Integration Tests
Validar:
endpoint;
persistência;
alteração do status;
auditoria;
publicação do evento;
envio da notificação.

14. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas o comprador puder retirar a oferta.
Apenas ofertas pendentes puderem ser retiradas.
O histórico permanecer íntegro.
O vendedor for notificado.
O evento MarketplaceOffer.Withdrawn for publicado.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_offers
Atualização do Aggregate MarketplaceOffer
Repository atualizado
MarketplaceOfferService
WithdrawMarketplaceOfferUseCase
Endpoint POST
DTOs
Integração com Notification Module
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A retirada da oferta estiver operacional.
O status WITHDRAWN for persistido corretamente.
O vendedor receber a notificação.
O evento MarketplaceOffer.Withdrawn for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
