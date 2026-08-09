
Trust Platform MVP
Especificação da Feature
MRK-019 — Schedule Marketplace Order (Agendar Pedido)

Document Information
Campo
Valor
Feature ID
MRK-019
Feature Name
Schedule Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 10
Status
Ready for Development
Depends On
MRK-018 – Cancel Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-020 – Start Marketplace Order

1. Objetivo de Negócio
Permitir o agendamento da execução de um pedido, reservando uma janela de atendimento entre comprador e vendedor e estabelecendo a base para toda a execução operacional da transação.

2. Escopo
Esta Feature Inclui
Agendamento da execução
Reserva da agenda do prestador
Definição da data e horário
Definição da duração prevista
Associação ao pedido
Auditoria
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Reagendamento
Check-in
Check-out
Execução do serviço
Cálculo das horas efetivamente trabalhadas

3. User Story
Como comprador e vendedor
Quero definir uma data e horário para execução do serviço
Para que ambas as partes tenham um compromisso confirmado e registrado na plataforma.

4. Business Rules
BR-001
Somente pedidos nos estados:
CREATED
AWAITING_SCHEDULING
poderão ser agendados.

BR-002
O agendamento deverá possuir:
data;
horário de início;
duração prevista;
fuso horário.

BR-003
A duração prevista poderá ser:
definida manualmente pelas partes; ou
sugerida pela IA da Trust com base na descrição do serviço, histórico de serviços semelhantes e demais informações disponíveis.
A sugestão da IA terá caráter informativo e não substituirá a confirmação das partes.

BR-004
O sistema deverá validar conflitos de agenda do prestador antes da confirmação.

BR-005
Após confirmação do agendamento:
Status do Pedido:
SCHEDULED

BR-006
O agendamento permanecerá vinculado permanentemente ao pedido, mesmo após reagendamentos futuros, preservando o histórico.

BR-007
Toda alteração será registrada para auditoria.

5. Fluxo Funcional
Selecionar pedido
↓
Informar data e horário
↓
Informar duração prevista
↓
Validar disponibilidade
↓
Criar Scheduling
↓
Associar ao MarketplaceOrder
↓
Atualizar status para SCHEDULED
↓
Registrar auditoria
↓
Publicar eventos
↓
Enviar notificações

6. Backend Implementation
6.1 Aggregate
Criar:
Scheduling
Atributos
id
orderId
scheduledStart
estimatedDuration
scheduledEnd
timezone
status
createdAt
updatedAt

6.2 Repository
Criar:
SchedulingRepository

6.3 Services
Criar:
SchedulingService
Responsabilidades:
validar disponibilidade;
criar agendamento;
reservar agenda;
calcular horário previsto de término.

Atualizar:
MarketplaceOrderLifecycleService
Responsável por alterar o status para:
SCHEDULED

6.4 Use Cases
Criar:
ScheduleMarketplaceOrderUseCase

6.5 DTOs
Criar:
ScheduleMarketplaceOrderRequest
ScheduleMarketplaceOrderResponse

6.6 Exceptions
Criar:
SchedulingConflictException
SchedulingNotAllowedException
InvalidSchedulingWindowException

7. Database
Criar tabela:
scheduling
Campo
Tipo
id
UUID
order_id
UUID
scheduled_start
TIMESTAMP
estimated_duration
INTEGER
scheduled_end
TIMESTAMP
timezone
VARCHAR(50)
status
VARCHAR(30)
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
FK(order_id)
UNIQUE(order_id)
Índices
scheduled_start
status

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/schedule

9. Logging
Registrar:
Order ID
Scheduling ID
Data
Hora
Duração prevista
Usuário responsável
Timestamp
Correlation ID

10. Events
Publicar:
Scheduling.Created

MarketplaceOrder.Scheduled
Consumidores previstos:
Agenda
Notificações
IA
Analytics
Auditoria

11. Unit Tests
Implementar testes para:
agendamento válido;
conflito de agenda;
cálculo do horário final;
alteração do status do pedido;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
criação do Scheduling;
atualização do MarketplaceOrder;
publicação dos eventos;
notificações.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O agendamento for criado com sucesso.
Não houver conflito de agenda.
O pedido passar para SCHEDULED.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate Scheduling
SchedulingRepository
SchedulingService
ScheduleMarketplaceOrderUseCase
Migration da tabela scheduling
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O agendamento estiver operacional.
A disponibilidade do prestador for validada.
O pedido estiver no estado SCHEDULED.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
