
Trust Platform MVP
Especificação da Feature
MRK-024 — Resolve Marketplace Dispute (Resolver Disputa)

Document Information
Campo
Valor
Feature ID
MRK-024
Feature Name
Resolve Marketplace Dispute
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 11
Status
Ready for Development
Depends On
MRK-023 – Open Marketplace Dispute
References
DOC-001 até DOC-007
Blocks
MRK-025 – Rate Marketplace Transaction

1. Objetivo de Negócio
Permitir a conclusão formal de uma disputa, registrando uma decisão fundamentada e disponibilizando seu resultado para os módulos responsáveis pela execução das ações decorrentes.

2. Escopo
Esta Feature Inclui
Registro da decisão
Fundamentação da decisão
Identificação do responsável pela decisão
Encerramento da disputa
Atualização do status do pedido
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Execução de reembolso
Liberação de pagamento
Atualização do Trust Score
Aplicação de penalidades
Alteração da Garantia Trust
Estas ações serão executadas pelos respectivos módulos consumidores dos eventos publicados por esta Feature.

3. User Story
Como mediador autorizado da plataforma
Quero registrar uma decisão para uma disputa
Para que o conflito seja formalmente resolvido e a plataforma possa executar as ações necessárias.

4. Business Rules
BR-001
Somente usuários autorizados pela plataforma poderão resolver disputas.
Perfis previstos:
Administrador
Mediador
Processo automatizado autorizado (IA), quando configurado

BR-002
A disputa deverá estar com status:
OPEN
IN_ANALYSIS
MEDIATION

BR-003
Toda decisão deverá registrar obrigatoriamente:
responsável pela decisão;
tipo da decisão;
fundamentação;
data e hora.

BR-004
Tipos iniciais de decisão:
Procedente
Parcialmente procedente
Improcedente
Acordo entre as partes
Cancelamento da disputa
Esses tipos deverão ser configuráveis pela Administração.

BR-005
Após a decisão:
Status da Disputa:
RESOLVED
Status do Pedido:
DISPUTE_RESOLVED

BR-006
A decisão será permanente e não poderá ser alterada ou excluída.
Caso seja necessária uma revisão, deverá ser aberto um processo específico de recurso em uma evolução futura.

BR-007
A decisão deverá publicar eventos para todos os módulos consumidores.

5. Fluxo Funcional
Selecionar disputa
↓
Validar permissões
↓
Registrar decisão
↓
Criar MarketplaceDisputeDecision
↓
Atualizar MarketplaceDispute
↓
Status = RESOLVED
↓
Atualizar MarketplaceOrder
↓
Status = DISPUTE_RESOLVED
↓
Registrar auditoria
↓
Publicar eventos
↓
Notificar as partes

6. Backend Implementation
6.1 Aggregates
Criar:
MarketplaceDisputeDecision
Atributos
id

disputeId

decidedBy

decisionType

justification

decidedAt

createdAt

Atualizar:
MarketplaceDispute
Adicionar:
decisionId

6.2 Repositories
Criar:
MarketplaceDisputeDecisionRepository
Atualizar:
MarketplaceDisputeRepository

6.3 Services
Criar:
MarketplaceDisputeResolutionService
Responsabilidades:
validar elegibilidade;
registrar decisão;
atualizar disputa;
atualizar pedido;
publicar eventos.

Atualizar:
MarketplaceOrderLifecycleService
Adicionar transição:
DISPUTE_OPEN
↓
DISPUTE_RESOLVED

6.4 Use Cases
Criar:
ResolveMarketplaceDisputeUseCase

6.5 DTOs
Criar:
ResolveMarketplaceDisputeRequest
ResolveMarketplaceDisputeResponse

6.6 Exceptions
Criar:
MarketplaceDisputeResolutionNotAllowedException
MarketplaceDisputeAlreadyResolvedException

7. Database
Criar tabela:
marketplace_dispute_decisions
Campo
Tipo
id
UUID
dispute_id
UUID
decided_by
UUID
decision_type
VARCHAR(50)
justification
TEXT
decided_at
TIMESTAMP
created_at
TIMESTAMP

Atualizar:
marketplace_disputes
Adicionar:
Campo
Tipo
decision_id
UUID NULL
Constraints
PK(id)
FK(dispute_id)
FK(decided_by)
FK(decision_id)
Índices
dispute_id
decided_at

8. API
Endpoint
POST /api/v1/marketplace/disputes/{disputeId}/resolve

9. Logging
Registrar:
Dispute ID
Decision ID
Responsável
Tipo da decisão
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceDispute.Resolved

MarketplaceDisputeDecision.Created

MarketplaceOrder.DisputeResolved
Consumidores previstos:
Pagamentos
Garantia Trust
Trust Score
Trust Economy
Analytics
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
resolução válida;
disputa em estado inválido;
usuário sem permissão;
criação da decisão;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
criação da decisão;
atualização da disputa;
atualização do pedido;
publicação dos eventos;
notificações.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas usuários autorizados puderem resolver disputas.
A decisão for registrada permanentemente.
A disputa passar para RESOLVED.
O pedido passar para DISPUTE_RESOLVED.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate MarketplaceDisputeDecision
MarketplaceDisputeDecisionRepository
MarketplaceDisputeResolutionService
Atualização do MarketplaceDispute
Atualização do MarketplaceOrder
ResolveMarketplaceDisputeUseCase
Migration da tabela marketplace_dispute_decisions
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A disputa puder ser resolvida corretamente.
A decisão estiver registrada permanentemente.
O pedido e a disputa forem atualizados.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
