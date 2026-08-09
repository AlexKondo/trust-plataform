
Trust Platform MVP
Especificação da Feature
MRK-017 — Update Marketplace Order (Atualizar Pedido)

Document Information
Campo
Valor
Feature ID
MRK-017
Feature Name
Update Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 10
Status
Ready for Development
Depends On
MRK-016 – Get Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-018 – Cancel Marketplace Order

1. Objetivo de Negócio
Permitir a atualização controlada do Pedido durante sua execução, preservando a integridade dos dados comerciais acordados na negociação e permitindo que outros módulos enriqueçam o pedido com informações operacionais.

2. Escopo
Esta Feature Inclui
Atualização de informações operacionais
Alteração controlada do status do pedido
Inclusão de dados provenientes de outros módulos
Registro da última atualização
Auditoria completa
Publicação de eventos

Esta Feature NÃO Inclui
Alteração do comprador
Alteração do vendedor
Alteração do anúncio original
Alteração do valor negociado
Alteração da moeda
Alteração da proposta aceita

3. User Story
Como plataforma
Quero atualizar o pedido conforme sua execução evolui
Para que ele represente fielmente o estado atual da transação.

4. Business Rules
BR-001
Os dados comerciais definidos na proposta aceita serão imutáveis:
comprador;
vendedor;
anúncio;
valor;
moeda;
proposta aceita.

BR-002
As atualizações ocorrerão principalmente por processos internos da plataforma ou por módulos especializados.
Exemplos:
Agenda
Pagamentos
Evidências
Disputas
Garantia Trust
IA
Notificações

BR-003
Toda alteração de status deverá respeitar a máquina de estados do Marketplace Order.
Transições válidas:
CREATED
↓

AWAITING_SCHEDULING
↓

SCHEDULED
↓

AWAITING_EXECUTION
↓

IN_PROGRESS
↓

AWAITING_CUSTOMER_CONFIRMATION
↓

COMPLETED
↓

CLOSED
Fluxos excepcionais:
CANCELLED

DISPUTE_OPEN

DISPUTE_RESOLVED

REFUNDED

BR-004
Não serão permitidos "saltos" de estado, salvo quando definidos explicitamente pelas regras de negócio.
Exemplo:
Não será permitido:
CREATED → COMPLETED

BR-005
Cada alteração deverá registrar:
usuário ou processo responsável;
data e hora;
status anterior;
novo status;
origem da alteração.

BR-006
Cada atualização deverá publicar um evento de domínio correspondente.

5. Fluxo Funcional
Evento interno
↓
Validar transição
↓
Validar regras
↓
Atualizar MarketplaceOrder
↓
Atualizar updatedAt
↓
Registrar auditoria
↓
Publicar evento
↓
Fim

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOrder
Adicionar comportamento:
updateStatus()
validateStateTransition()

6.2 Repository
Atualizar:
MarketplaceOrderRepository
Métodos:
save()
findById()

6.3 Services
Criar:
MarketplaceOrderLifecycleService
Responsabilidades:
validar transições;
coordenar atualizações;
garantir consistência do ciclo de vida.

6.4 Use Cases
Criar:
UpdateMarketplaceOrderUseCase
Observação: Este caso de uso será utilizado internamente pelos demais módulos da plataforma.

6.5 DTOs
Não aplicável.
As atualizações ocorrerão predominantemente por integrações internas.

6.6 Exceptions
Criar:
MarketplaceOrderInvalidStateTransitionException
MarketplaceOrderUpdateNotAllowedException

7. Database
Nenhuma alteração estrutural.
Atualizar apenas:
marketplace_orders
Campos:
status
updated_at

8. API
Não haverá endpoint público genérico de atualização.
Cada funcionalidade especializada (cancelamento, agendamento, início da execução, conclusão etc.) possuirá seus próprios endpoints e utilizará internamente o MarketplaceOrderLifecycleService.

9. Logging
Registrar:
Order ID
Status anterior
Novo status
Usuário ou processo responsável
Origem da alteração
Timestamp
Correlation ID

10. Events
Publicar evento correspondente a cada transição de estado.
Exemplos:
MarketplaceOrder.StatusChanged

MarketplaceOrder.Scheduled

MarketplaceOrder.Started

MarketplaceOrder.Completed

MarketplaceOrder.Cancelled
Os módulos consumidores decidirão quais eventos processar conforme sua responsabilidade.

11. Unit Tests
Implementar testes para:
transições válidas;
transições inválidas;
tentativa de alteração de dados imutáveis;
publicação de eventos;
registro da auditoria.

12. Integration Tests
Validar:
atualização do pedido;
consistência da máquina de estados;
publicação dos eventos;
integração com módulos consumidores.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Todas as transições válidas forem suportadas.
Transições inválidas forem bloqueadas.
Dados comerciais permanecerem imutáveis.
Eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceOrder
MarketplaceOrderLifecycleService
UpdateMarketplaceOrderUseCase
Atualização do Repository
Eventos de domínio
Testes Unitários
Testes de Integração
Atualização da documentação técnica

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A máquina de estados estiver implementada.
Todas as regras de transição forem respeitadas.
Os dados comerciais permanecerem protegidos.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
