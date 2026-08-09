
Trust Platform MVP
Especificação da Feature
MRK-023 — Open Marketplace Dispute (Abrir Disputa)

Document Information
Campo
Valor
Feature ID
MRK-023
Feature Name
Open Marketplace Dispute
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 11
Status
Ready for Development
Depends On
MRK-022 – Confirm Marketplace Order Completion
References
DOC-001 até DOC-007
Blocks
MRK-024 – Resolve Marketplace Dispute

1. Objetivo de Negócio
Permitir que comprador ou vendedor iniciem formalmente uma disputa relacionada à execução de um pedido, criando um processo estruturado para análise, mediação e futura resolução baseada em evidências.

2. Escopo
Esta Feature Inclui
Abertura da disputa
Registro do solicitante
Registro do motivo
Registro da descrição detalhada
Associação ao pedido
Criação do processo de disputa
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Troca de mensagens da disputa
Inclusão de evidências
Decisão da disputa
Reembolso
Penalidades
Encerramento da disputa

3. User Story
Como participante da transação
Quero abrir uma disputa
Para que a plataforma possa analisar um problema ocorrido durante a execução do pedido.

4. Business Rules
BR-001
Poderão abrir uma disputa:
Comprador
Vendedor

BR-002
Somente poderá existir uma disputa ativa por pedido.

BR-003
A disputa deverá registrar obrigatoriamente:
Pedido
Solicitante
Categoria da disputa
Descrição do problema
Data e hora da abertura

BR-004
Categorias iniciais:
Serviço não concluído
Serviço executado parcialmente
Produto divergente
Produto danificado
Cobrança indevida
Conduta inadequada
Outro
As categorias deverão ser configuráveis pela Administração da plataforma.

BR-005
Após a abertura:
Status do Pedido:
DISPUTE_OPEN
Status da Disputa:
OPEN

BR-006
A abertura da disputa não excluirá nem alterará qualquer evidência previamente registrada.

BR-007
Todas as ações relacionadas à disputa deverão ser auditadas.

5. Fluxo Funcional
Participante acessa pedido
↓
Solicita abertura da disputa
↓
Validar elegibilidade
↓
Criar MarketplaceDispute
↓
Atualizar MarketplaceOrder
↓
Status = DISPUTE_OPEN
↓
Registrar auditoria
↓
Publicar eventos
↓
Notificar outra parte

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceDispute
Atributos
id

orderId

openedBy

category

description

status

openedAt
createdAt
updatedAt

6.2 Repository
Criar:
MarketplaceDisputeRepository

6.3 Services
Criar:
MarketplaceDisputeService
Responsabilidades:
validar elegibilidade;
abrir disputa;
impedir duplicidade;
publicar eventos.

Atualizar:
MarketplaceOrderLifecycleService
Adicionar transição:
CUSTOMER_CONFIRMED
↓
DISPUTE_OPEN
Observação: A plataforma também poderá permitir a abertura da disputa a partir de outros estados específicos, conforme políticas futuras (por exemplo, durante AWAITING_CUSTOMER_CONFIRMATION). Essas regras deverão permanecer centralizadas no MarketplaceOrderLifecycleService.

6.4 Use Cases
Criar:
OpenMarketplaceDisputeUseCase

6.5 DTOs
Criar:
OpenMarketplaceDisputeRequest
OpenMarketplaceDisputeResponse

6.6 Exceptions
Criar:
MarketplaceDisputeAlreadyExistsException
MarketplaceDisputeNotAllowedException

7. Database
Criar tabela:
marketplace_disputes
Campo
Tipo
id
UUID
order_id
UUID
opened_by
UUID
category
VARCHAR(100)
description
TEXT
status
VARCHAR(30)
opened_at
TIMESTAMP
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(order_id)
FK(opened_by)
UNIQUE(order_id, status) WHERE status IN ('OPEN','IN_ANALYSIS','MEDIATION')
Índices
order_id
status
opened_at

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/disputes

9. Logging
Registrar:
Order ID
Dispute ID
Solicitante
Categoria
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceDispute.Opened

MarketplaceOrder.DisputeOpened
Consumidores previstos:
Notificações
Analytics
Auditoria
IA
Trust Score
Administração

11. Unit Tests
Implementar testes para:
abertura válida;
disputa duplicada;
categoria obrigatória;
atualização do status do pedido;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
criação da disputa;
atualização do pedido;
publicação dos eventos;
notificações.

13. Acceptance Criteria
A Feature será considerada pronta quando:
A disputa puder ser aberta pelos participantes autorizados.
Apenas uma disputa ativa existir por pedido.
O pedido passar para DISPUTE_OPEN.
O evento MarketplaceDispute.Opened for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate MarketplaceDispute
MarketplaceDisputeRepository
MarketplaceDisputeService
OpenMarketplaceDisputeUseCase
Migration da tabela marketplace_disputes
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A disputa puder ser aberta corretamente.
O status do pedido for atualizado para DISPUTE_OPEN.
A disputa for persistida.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
