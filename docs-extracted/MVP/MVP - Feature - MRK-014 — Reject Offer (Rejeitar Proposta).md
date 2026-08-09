
Trust Platform MVP
Especificação da Feature
MRK-014 — Reject Offer (Rejeitar Proposta)

Document Information
Campo
Valor
Feature ID
MRK-014
Feature Name
Reject Offer
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 9
Status
Ready for Development
Depends On
MRK-013 – Accept Offer
References
DOC-001 até DOC-007
Blocks
MRK-015 – Create Marketplace Order

1. Objetivo de Negócio
Permitir que o destinatário de uma proposta ou contraoferta rejeite formalmente a negociação, encerrando aquela proposta sem gerar um pedido, mantendo todo o histórico para auditoria e futuras consultas.

2. Escopo
Esta Feature Inclui
Rejeição formal de proposta
Atualização do status da proposta
Registro do motivo da rejeição (opcional)
Registro da data e hora
Registro do usuário responsável
Auditoria completa
Publicação de eventos
Notificação da outra parte

Esta Feature NÃO Inclui
Exclusão da proposta
Criação de pedido
Contraoferta
Aceitação da proposta
Encerramento da conversa

3. User Story
Como destinatário de uma proposta
Quero rejeitar a proposta recebida
Para que ela deixe de produzir efeitos e a negociação possa ser encerrada ou continuar através de novas propostas.

4. Business Rules
BR-001
Somente o destinatário da proposta poderá rejeitá-la.

BR-002
A proposta deverá possuir status:
PENDING

BR-003
Após a rejeição, o status será alterado para:
REJECTED

BR-004
A rejeição não encerrará automaticamente a conversa.
As partes poderão continuar trocando mensagens.

BR-005
Após uma rejeição, qualquer participante poderá iniciar uma nova rodada de negociação criando uma nova proposta, desde que a conversa permaneça aberta e o anúncio continue disponível.

BR-006
O motivo da rejeição será opcional.

BR-007
Toda rejeição deverá permanecer registrada para auditoria.

5. Fluxo Funcional
Participante recebe proposta
↓
Seleciona "Rejeitar"
↓
Validar destinatário
↓
Validar status PENDING
↓
Atualizar status para REJECTED
↓
Registrar motivo
↓
Registrar auditoria
↓
Notificar outra parte
↓
Publicar evento
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOffer
Adicionar atributos:
rejectedAt

rejectedBy

rejectReason
Adicionar comportamento:
reject()

6.2 Repository
Atualizar:
MarketplaceOfferRepository
Métodos:
findById()
save()

6.3 Services
Atualizar:
MarketplaceOfferService
Responsabilidades:
validar rejeição;
registrar auditoria;
publicar eventos;
solicitar notificações.

6.4 Use Cases
Criar:
RejectMarketplaceOfferUseCase

6.5 DTOs
Criar:
RejectMarketplaceOfferRequest
RejectMarketplaceOfferResponse

6.6 Exceptions
Criar:
MarketplaceOfferRejectNotAllowedException
MarketplaceOfferAlreadyResolvedException
MarketplaceOfferOwnershipException

7. Database
Atualizar tabela:
marketplace_offers
Adicionar:
Campo
Tipo
rejected_at
TIMESTAMP NULL
rejected_by
UUID NULL
reject_reason
TEXT NULL
Atualizar:
status
updated_at

8. API
Endpoint
POST /api/v1/marketplace/offers/{offerId}/reject
Request
{
  "reason": "Valor acima do orçamento."
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
Seller ID
Usuário responsável
Motivo
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOffer.Rejected
Payload mínimo:
{
  "offerId": "UUID",
  "conversationId": "UUID",
  "listingId": "UUID",
  "buyerId": "UUID",
  "sellerId": "UUID",
  "rejectedAt": "2026-08-03T21:30:00Z"
}

11. Notifications
Destinatário
Parte que criou a proposta.
Mensagem:
Sua proposta foi rejeitada.
Canais
Notificação In-App
Push Notification
E-mail (conforme preferências)

12. Unit Tests
Implementar testes para:
rejeição válida;
usuário não autorizado;
proposta inexistente;
proposta aceita;
proposta já rejeitada;
publicação do evento;
envio das notificações.

13. Integration Tests
Validar:
endpoint;
persistência;
alteração do status;
auditoria;
publicação do evento;
notificações.

14. Acceptance Criteria
A Feature será considerada pronta quando:
O destinatário puder rejeitar uma proposta pendente.
A proposta passar para REJECTED.
A conversa permanecer aberta.
O histórico permanecer íntegro.
O evento for publicado.
As notificações forem enviadas.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_offers
Atualização do Aggregate MarketplaceOffer
Repository atualizado
MarketplaceOfferService
RejectMarketplaceOfferUseCase
Endpoint POST
DTOs
Integração com Notification Module
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A rejeição estiver operacional.
O status REJECTED for persistido corretamente.
O evento MarketplaceOffer.Rejected for publicado.
As notificações forem enviadas.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
