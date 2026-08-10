Trust Platform MVP
Especificação da Feature
PAY-007 — Funds Distribution (Distribuição Financeira)

Document Information
Campo
	Valor
	
Feature ID
	PAY-007
	
Feature Name
	Funds Distribution
	
Module
	Payments
	
Prioridade
	Alta
	
Sprint
	Sprint 13
	
Status
	Ready for Development
	
Depends On
	PAY-006 – Refund Payment
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-008 – Payment History
	

1. Objetivo de Negócio
Distribuir os recursos financeiros de uma transação entre todos os participantes elegíveis, conforme políticas configuráveis da plataforma.
A distribuição representa a alocação lógica dos valores antes da efetiva liquidação financeira para cada destinatário.

2. Escopo
Esta Feature Inclui
Criação da distribuição financeira
Distribuição entre múltiplos destinatários
Registro dos percentuais e valores
Aplicação das políticas de distribuição
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Liquidação bancária individual
Cálculo tributário
Emissão de notas fiscais
Contabilidade

3. User Story
Como plataforma
Quero distribuir os valores da transação
Para que cada participante receba corretamente sua parcela.

4. Business Rules
BR-001
A distribuição somente poderá ocorrer após:
Funds Settled

BR-002
Cada Payment possuirá apenas uma distribuição principal.

BR-003
Uma distribuição poderá possuir múltiplos itens.

BR-004
Cada item registrará:
beneficiário;
tipo;
valor;
percentual;
moeda.

BR-005
A soma dos valores distribuídos deverá ser exatamente igual ao valor líquido disponível para distribuição.

BR-006
Os critérios de distribuição serão definidos exclusivamente pelo:
DistributionPolicyService

BR-007
Toda distribuição será auditada.

5. Fluxo Funcional
Funds Settled

↓

DistributionPolicyService

↓

Criar FundsDistribution

↓

Criar Distribution Items

↓

Persistir
↓
Publicar eventos

6. Backend Implementation
6.1 Aggregate
Criar:
FundsDistribution
Atributos
id

paymentId

currency

grossAmount

netAmount

status

createdAt
updatedAt

Criar Entity:
FundsDistributionItem
Campos:
id

distributionId

recipientId

recipientType

amount

percentage

status

6.2 Repository
Criar:
FundsDistributionRepository

6.3 Services
Criar:
DistributionPolicyService
Responsabilidades:
calcular distribuição;
aplicar regras comerciais;
validar percentuais.

Criar:
FundsDistributionService
Responsabilidades:
criar distribuição;
persistir itens;
publicar eventos.

6.4 Use Cases
Criar:
DistributeFundsUseCase

6.5 DTOs
Não aplicável.
Fluxo interno orientado a eventos.

6.6 Exceptions
Criar:
InvalidDistributionException
DistributionPolicyException
DistributionAmountMismatchException

7. Database
Criar tabela:
funds_distributions
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
gross_amount
	DECIMAL(18,2)
	
net_amount
	DECIMAL(18,2)
	
currency
	CHAR(3)
	
status
	VARCHAR(30)
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	

Criar tabela:
funds_distribution_items
Campo
	Tipo
	
id
	UUID
	
distribution_id
	UUID
	
recipient_id
	UUID
	
recipient_type
	VARCHAR(50)
	
amount
	DECIMAL(18,2)
	
percentage
	DECIMAL(8,5)
	
status
	VARCHAR(30)
	
Constraints
PK(id)
FK(payment_id)
FK(distribution_id)
Índices
payment_id
distribution_id
recipient_id

8. API
Não haverá endpoint público.
A distribuição será executada automaticamente após a liquidação financeira.

9. Logging
Registrar:
Distribution ID
Payment ID
Beneficiário
Valor
Percentual
Timestamp
Correlation ID

10. Events
Publicar:
FundsDistribution.Created

FundsDistribution.Completed
Consumidores previstos:
Trust Economy
Financeiro
Analytics
Auditoria
ERP
Notificações

11. Unit Tests
Implementar testes para:
distribuição válida;
soma dos valores;
múltiplos destinatários;
publicação dos eventos.

12. Integration Tests
Validar:
cálculo da distribuição;
persistência dos itens;
publicação dos eventos;
integração com DistributionPolicyService.

13. Acceptance Criteria
A Feature será considerada pronta quando:
A distribuição for criada corretamente.
Todos os itens forem persistidos.
A soma dos valores estiver correta.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate FundsDistribution
Entity FundsDistributionItem
FundsDistributionRepository
DistributionPolicyService
FundsDistributionService
DistributeFundsUseCase
Migrations das tabelas funds_distributions e funds_distribution_items
Eventos de domínio
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A distribuição financeira estiver operacional.
Todos os itens forem registrados corretamente.
As políticas forem aplicadas.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
