
Trust Platform MVP
Especificação da Feature
MRK-013 — Accept Offer (Aceitar Proposta)

Document Information
Campo
Valor
Feature ID
MRK-013
Feature Name
Accept Offer
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 9
Status
Ready for Development
Depends On
MRK-012 – Counter Offer
References
DOC-001 até DOC-007
Blocks
MRK-014 – Reject Offer

1. Objetivo de Negócio
Permitir que uma proposta (ou contraoferta) seja formalmente aceita pelo destinatário da negociação, encerrando a etapa de negociação e iniciando automaticamente a criação do Pedido (Marketplace Order), que será responsável por controlar toda a execução da transação.

2. Escopo
Esta Feature Inclui
Aceitação de proposta
Validação das regras da negociação
Encerramento da negociação
Atualização dos status envolvidos
Criação automática do Marketplace Order
Reserva automática do anúncio
Encerramento das demais propostas pendentes da mesma negociação
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Pagamento
Execução do serviço
Conclusão do pedido
Avaliação das partes

3. User Story
Como participante da negociação
Quero aceitar uma proposta
Para que a negociação seja convertida em um pedido formal dentro da plataforma.

4. Business Rules
BR-001
Somente o destinatário da proposta poderá aceitá-la.
Exemplos:
proposta criada pelo comprador → aceita pelo vendedor;
contraoferta criada pelo vendedor → aceita pelo comprador.

BR-002
A proposta deverá possuir status:
PENDING

BR-003
Após a aceitação, o status da proposta será alterado para:
ACCEPTED

BR-004
Todas as demais propostas pendentes pertencentes à mesma negociação deverão ser automaticamente alteradas para:
CLOSED

BR-005
O anúncio deverá ser automaticamente atualizado para:
RESERVED
Observação: Em futuras evoluções da plataforma, anúncios configurados para venda imediata poderão ser alterados diretamente para SOLD, conforme regras específicas do tipo de anúncio.

BR-006
A aceitação deverá criar automaticamente um novo MarketplaceOrder.

BR-007
A conversa permanecerá disponível para consulta, porém novas propostas não poderão ser criadas para aquela negociação.

BR-008
A operação deverá ser executada de forma transacional.
Caso qualquer etapa falhe, toda a operação deverá ser revertida (rollback).

BR-009
A aceitação da proposta deverá gerar eventos de domínio para consumo pelos módulos de:
Orders
Notifications
Trust Score
Analytics
Audit

5. Fluxo Funcional
Participante recebe proposta
↓
Aceitar proposta
↓
Validar destinatário
↓
Validar status PENDING
↓
Atualizar proposta para ACCEPTED
↓
Encerrar demais propostas
↓
Reservar anúncio
↓
Criar MarketplaceOrder
↓
Registrar auditoria
↓
Publicar eventos
↓
Enviar notificações
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOffer
Adicionar comportamento:
accept()

6.2 Aggregate Integrado
Criar automaticamente:
MarketplaceOrder
(Será detalhado no documento MRK-015.)

6.3 Repository
Atualizar:
MarketplaceOfferRepository
Adicionar métodos:
findPendingOffersByConversation()
saveAll()

Atualizar:
MarketplaceListingRepository
Método:
save()

6.4 Services
Atualizar:
MarketplaceOfferService
Responsabilidades:
validar aceite;
finalizar negociação;
reservar anúncio;
solicitar criação do pedido.

Criar:
MarketplaceNegotiationService
Responsável por coordenar toda a transação de aceite.

6.5 Use Cases
Criar:
AcceptMarketplaceOfferUseCase

6.6 DTOs
Criar:
AcceptMarketplaceOfferRequest
AcceptMarketplaceOfferResponse

6.7 Exceptions
Criar:
MarketplaceOfferAlreadyAcceptedException
MarketplaceOfferAlreadyResolvedException
MarketplaceNegotiationException
MarketplaceOrderCreationException

7. Database
Atualizar tabela:
marketplace_offers
Atualizar:
status
updated_at

Atualizar tabela:
marketplace_listings
Atualizar:
status = RESERVED

Nenhuma nova migration será criada nesta Feature.

8. API
Endpoint
POST /api/v1/marketplace/offers/{offerId}/accept
Responses
200 OK
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity

9. Logging
Registrar:
Offer ID
Conversation ID
Listing ID
Buyer ID
Seller ID
Usuário responsável pelo aceite
MarketplaceOrder ID
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceOffer.Accepted
MarketplaceListing.Reserved
MarketplaceOrder.Created
Esses eventos deverão permitir que módulos consumidores (Orders, Notifications, Trust Score, Analytics e Audit) executem seus respectivos processamentos de forma desacoplada.

11. Notifications
Comprador
Mensagem:
Sua proposta foi aceita. O pedido foi criado com sucesso.

Vendedor
Mensagem:
A negociação foi concluída com sucesso. O pedido foi criado.

Canais
Notificação In-App
Push Notification
E-mail (conforme preferência do usuário)

12. Unit Tests
Implementar testes para:
aceite válido;
usuário não autorizado;
proposta inexistente;
proposta já aceita;
proposta encerrada;
encerramento das demais propostas;
alteração do anúncio para RESERVED;
criação do MarketplaceOrder;
publicação dos eventos;
envio das notificações.

13. Integration Tests
Validar:
endpoint;
transação completa;
rollback em caso de falha;
atualização do anúncio;
criação do pedido;
publicação dos eventos;
notificações.

14. Acceptance Criteria
A Feature será considerada pronta quando:
O destinatário puder aceitar uma proposta.
O anúncio for reservado automaticamente.
O pedido for criado automaticamente.
As demais propostas forem encerradas.
Os eventos forem publicados corretamente.
As notificações forem enviadas.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceOffer
Atualização dos Repositories
MarketplaceNegotiationService
Atualização do MarketplaceOfferService
AcceptMarketplaceOfferUseCase
Endpoint POST
DTOs
Integração com Notification Module
Integração com MarketplaceOrder
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
O aceite estiver operacional.
O pedido for criado automaticamente.
O anúncio for reservado corretamente.
Todas as propostas concorrentes forem encerradas.
Os eventos forem publicados corretamente.
As notificações forem enviadas.
A operação for totalmente transacional.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
