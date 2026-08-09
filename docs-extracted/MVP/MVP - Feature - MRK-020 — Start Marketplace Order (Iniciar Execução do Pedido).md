
Trust Platform MVP
Especificação da Feature
MRK-020 — Start Marketplace Order (Iniciar Execução do Pedido)

Document Information
Campo
Valor
Feature ID
MRK-020
Feature Name
Start Marketplace Order
Module
Marketplace
Prioridade
Crítica
Sprint
Sprint 10
Status
Ready for Development
Depends On
MRK-019 – Schedule Marketplace Order
References
DOC-001 até DOC-007
Blocks
MRK-021 – Complete Marketplace Order

1. Objetivo de Negócio
Permitir o início oficial da execução de um pedido, registrando o check-in da transação e estabelecendo o marco inicial para controle operacional, auditoria, cálculo do tempo efetivamente trabalhado e futuras garantias da prestação do serviço.

2. Escopo
Esta Feature Inclui
Check-in da execução
Registro da data e hora oficial de início
Registro opcional da geolocalização
Registro opcional de evidências iniciais
Atualização do status do pedido
Auditoria completa
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Check-out
Conclusão do serviço
Confirmação do cliente
Pagamento
Avaliação
Disputas

3. User Story
Como prestador de serviço
Quero iniciar oficialmente a execução do pedido
Para que a plataforma registre o começo da prestação do serviço e acompanhe sua execução.

4. Business Rules
BR-001
Somente pedidos com status:
SCHEDULED
AWAITING_EXECUTION
poderão ser iniciados.

BR-002
O início da execução registrará obrigatoriamente:
data;
hora;
usuário responsável.

BR-003
Opcionalmente poderão ser registrados:
latitude;
longitude;
precisão da localização;
endereço aproximado (quando disponível);
fotos;
vídeos;
observações iniciais.

BR-004
Quando o serviço exigir validação de localização, a plataforma poderá comparar a posição do check-in com o endereço previsto para execução.
Essa validação poderá gerar alertas, mas não impedirá automaticamente o início do serviço, salvo em políticas específicas configuradas para determinada categoria ou parceiro.

BR-005
Após o check-in:
Status do Pedido:
IN_PROGRESS

BR-006
O horário oficial de início será utilizado posteriormente para:
cálculo da duração real do serviço;
indicadores operacionais;
métricas de SLA;
análises por IA;
suporte a auditorias e disputas.

BR-007
O início da execução deverá ser registrado permanentemente e não poderá ser excluído.

5. Fluxo Funcional
Prestador seleciona pedido
↓
Validar permissões
↓
Validar status do pedido
↓
Registrar check-in
↓
Registrar localização (opcional)
↓
Registrar evidências iniciais (opcional)
↓
Atualizar MarketplaceOrder
↓

Status = IN_PROGRESS

↓

Registrar auditoria

↓

Publicar eventos
↓
Enviar notificações

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceOrder
Adicionar atributos:
startedAt
startedBy

Criar Value Object:
CheckIn
Campos:
latitude
longitude
accuracy
address
photos
videos
notes

6.2 Repository
Atualizar:
MarketplaceOrderRepository

6.3 Services
Atualizar:
MarketplaceOrderLifecycleService
Adicionar responsabilidade:
iniciar execução do pedido;
validar transição para IN_PROGRESS.

Criar:
CheckInValidationService
Responsabilidades:
validar geolocalização (quando aplicável);
validar integridade dos dados enviados;
emitir alertas de inconsistência.

6.4 Use Cases
Criar:
StartMarketplaceOrderUseCase

6.5 DTOs
Criar:
StartMarketplaceOrderRequest
StartMarketplaceOrderResponse

6.6 Exceptions
Criar:
MarketplaceOrderStartNotAllowedException
InvalidCheckInException

7. Database
Atualizar:
marketplace_orders
Adicionar:
Campo
Tipo
started_at
TIMESTAMP NULL
started_by
UUID NULL
Criar tabela:
marketplace_order_checkins
Campo
Tipo
id
UUID
order_id
UUID
latitude
DECIMAL(10,7) NULL
longitude
DECIMAL(10,7) NULL
accuracy
DECIMAL(8,2) NULL
address
TEXT NULL
notes
TEXT NULL
created_at
TIMESTAMP
Observação: Fotos e vídeos não serão armazenados diretamente nesta tabela. Os arquivos deverão ser gerenciados pelo futuro módulo de Evidências, sendo referenciados por identificadores quando necessário.

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/start

9. Logging
Registrar:
Order ID
Usuário responsável
Data e hora do check-in
Geolocalização (quando informada)
Resultado das validações
Correlation ID

10. Events
Publicar:
MarketplaceOrder.Started

MarketplaceOrder.CheckInRegistered
Consumidores previstos:
Evidências
Trust Score
Garantia Trust
Analytics
Notificações
Auditoria

11. Unit Tests
Implementar testes para:
início válido;
status inválido;
registro do check-in;
validação da geolocalização;
publicação dos eventos.

12. Integration Tests
Validar:
endpoint;
alteração do status para IN_PROGRESS;
persistência do check-in;
integração com o módulo de Evidências (quando disponível);
publicação dos eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O pedido puder ser iniciado.
O check-in for registrado corretamente.
O status passar para IN_PROGRESS.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate MarketplaceOrder
Value Object CheckIn
CheckInValidationService
StartMarketplaceOrderUseCase
Migration da tabela marketplace_order_checkins
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O check-in estiver operacional.
O pedido passar para IN_PROGRESS.
A auditoria registrar o início da execução.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
