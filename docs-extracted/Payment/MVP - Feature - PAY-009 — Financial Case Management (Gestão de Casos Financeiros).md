Trust Platform MVP
Especificação da Feature
PAY-009 — Financial Case Management (Gestão de Casos Financeiros)

Document Information
Campo
	Valor
	
Feature ID
	PAY-009
	
Feature Name
	Financial Case Management
	
Module
	Payments
	
Prioridade
	Alta
	
Sprint
	Sprint 13
	
Status
	Ready for Development
	
Depends On
	PAY-008 – Financial Ledger
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-010 – Payment Reconciliation
	

1. Objetivo de Negócio
Permitir a abertura, análise, acompanhamento e resolução de ocorrências financeiras relacionadas às transações da plataforma, garantindo rastreabilidade, auditoria e tratamento estruturado de incidentes.

2. Escopo
Esta Feature Inclui
Abertura de caso financeiro
Registro do tipo da ocorrência
Registro da análise
Registro da decisão
Encerramento do caso
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Chargeback
AML
KYC Review
Antifraude
Compliance regulatório
Essas capacidades utilizarão o mesmo domínio em evoluções futuras.

3. User Story
Como plataforma ou administrador autorizado
Quero registrar um caso financeiro
Para que ocorrências relacionadas ao fluxo financeiro possam ser tratadas de maneira estruturada.

4. Business Rules
BR-001
Um caso poderá ser aberto automaticamente por eventos ou manualmente por usuários autorizados.

BR-002
Tipos iniciais de caso:
Falha na liquidação
Divergência de pagamento
Reembolso
Erro operacional
Os tipos deverão ser configuráveis pela Administração.

BR-003
Status possíveis:
OPEN

UNDER_ANALYSIS

WAITING_INFORMATION

RESOLVED
CLOSED

BR-004
Cada caso deverá possuir:
responsável;
data de abertura;
descrição;
histórico de alterações.

BR-005
Todas as alterações deverão ser auditadas.

BR-006
O encerramento do caso poderá publicar eventos para outros módulos.

5. Fluxo Funcional
Evento financeiro
↓
Criar FinancialCase
↓
Registrar análise
↓
Registrar decisão
↓
Atualizar status
↓
Publicar eventos

6. Backend Implementation
6.1 Aggregate
Criar:
FinancialCase
Atributos
id

paymentId

caseType

status

openedBy

assignedTo

description

openedAt

closedAt
createdAt
updatedAt

Criar Entity:
FinancialCaseHistory
Campos:
id

caseId

action

performedBy
notes
createdAt

6.2 Repository
Criar:
FinancialCaseRepository

6.3 Services
Criar:
FinancialCaseService
Responsabilidades:
abrir caso;
atribuir responsável;
registrar histórico;
alterar status;
publicar eventos.

6.4 Use Cases
Criar:
OpenFinancialCaseUseCase
ResolveFinancialCaseUseCase

6.5 DTOs
Criar:
FinancialCaseRequest
FinancialCaseResponse

6.6 Exceptions
Criar:
FinancialCaseAlreadyExistsException
FinancialCaseNotAllowedException

7. Database
Criar tabela:
financial_cases
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID NULL
	
case_type
	VARCHAR(100)
	
status
	VARCHAR(50)
	
opened_by
	UUID
	
assigned_to
	UUID NULL
	
description
	TEXT
	
opened_at
	TIMESTAMP
	
closed_at
	TIMESTAMP NULL
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	

Criar tabela:
financial_case_history
Campo
	Tipo
	
id
	UUID
	
case_id
	UUID
	
action
	VARCHAR(100)
	
performed_by
	UUID
	
notes
	TEXT
	
created_at
	TIMESTAMP
	
Constraints
PK(id)
FK(case_id)
Índices
payment_id
status
case_type
opened_at

8. API
Endpoints
POST /api/v1/financial-cases
GET /api/v1/financial-cases/{caseId}
PATCH /api/v1/financial-cases/{caseId}

9. Logging
Registrar:
Case ID
Tipo
Status
Responsável
Timestamp
Correlation ID

10. Events
Publicar:
FinancialCase.Opened

FinancialCase.Updated

FinancialCase.Resolved
FinancialCase.Closed
Consumidores previstos:
Analytics
Auditoria
Notificações
Compliance (futuro)
Antifraude (futuro)

11. Unit Tests
Implementar testes para:
abertura de caso;
atualização de status;
encerramento;
histórico;
publicação dos eventos.

12. Integration Tests
Validar:
persistência;
histórico;
eventos;
integrações.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Casos financeiros puderem ser registrados.
O histórico for mantido.
O ciclo de vida do caso funcionar corretamente.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate FinancialCase
Entity FinancialCaseHistory
FinancialCaseRepository
FinancialCaseService
Use Cases
Migrations
APIs
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A gestão de casos estiver operacional.
O histórico for persistido corretamente.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
