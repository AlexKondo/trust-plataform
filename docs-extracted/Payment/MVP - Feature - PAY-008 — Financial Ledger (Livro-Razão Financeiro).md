Trust Platform MVP
Especificação da Feature
PAY-008 — Financial Ledger (Livro-Razão Financeiro)

Document Information
Campo
	Valor
	
Feature ID
	PAY-008
	
Feature Name
	Financial Ledger
	
Module
	Payments
	
Prioridade
	Alta
	
Sprint
	Sprint 13
	
Status
	Ready for Development
	
Depends On
	PAY-007 – Funds Distribution
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-009 – Payment Dispute
	

1. Objetivo de Negócio
Manter um histórico financeiro imutável de todas as movimentações relacionadas a uma transação, permitindo rastreabilidade completa, auditoria, integração com sistemas financeiros e suporte à evolução futura da plataforma.

2. Escopo
Esta Feature Inclui
Registro imutável de eventos financeiros
Linha do tempo financeira
Associação aos agregados financeiros
Auditoria
Consulta estruturada do histórico

Esta Feature NÃO Inclui
Conciliação contábil
Emissão de documentos fiscais
Alterações financeiras
Exclusão de registros

3. User Story
Como plataforma
Quero registrar cada evento financeiro
Para que exista um histórico completo, confiável e auditável da transação.

4. Business Rules
BR-001
Toda movimentação financeira relevante deverá gerar uma entrada no Livro-Razão Financeiro.

BR-002
As entradas serão imutáveis.
Não poderão ser alteradas nem excluídas.

BR-003
Cada entrada deverá registrar obrigatoriamente:
tipo do evento;
entidade de origem;
identificador da entidade;
data e hora;
valor (quando aplicável);
moeda;
Correlation ID.

BR-004
Exemplos de eventos registrados:
Payment Created
Payment Authorized
Funds Held
Funds Released
Funds Settled
Funds Refunded
Funds Distributed
A lista deverá ser extensível.

BR-005
O Ledger não executará regras de negócio.
Sua responsabilidade será exclusivamente registrar eventos financeiros.

BR-006
Cada entrada será criada por consumo de eventos publicados pelos demais agregados do módulo financeiro.

5. Fluxo Funcional
Evento financeiro publicado
↓
FinancialLedgerConsumer
↓
Criar LedgerEntry
↓
Persistir
↓
Fim

6. Backend Implementation
6.1 Aggregate
Criar:
FinancialLedger
Responsável apenas por agrupar as entradas de uma transação.

Criar Entity:
LedgerEntry
Campos
id

ledgerId

eventType

aggregateType

aggregateId

amount

currency

occurredAt

correlationId
metadata
createdAt
Observação: O campo metadata deverá armazenar apenas informações complementares relevantes para auditoria (como identificadores externos, códigos de retorno ou referências), evitando duplicar dados já existentes nos agregados de origem.

6.2 Repository
Criar:
FinancialLedgerRepository

6.3 Services
Criar:
FinancialLedgerService
Responsabilidades:
criar entradas;
garantir imutabilidade;
disponibilizar consultas cronológicas.

Criar:
FinancialLedgerConsumer
Responsável por consumir eventos financeiros publicados pelos demais agregados.

6.4 Use Cases
Não aplicável.
Fluxo totalmente orientado a eventos.

6.5 DTOs
Criar apenas DTOs de consulta.

6.6 Exceptions
Criar:
LedgerPersistenceException

7. Database
Criar tabela:
financial_ledgers
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
created_at
	TIMESTAMP
	

Criar tabela:
financial_ledger_entries
Campo
	Tipo
	
id
	UUID
	
ledger_id
	UUID
	
event_type
	VARCHAR(100)
	
aggregate_type
	VARCHAR(100)
	
aggregate_id
	UUID
	
amount
	DECIMAL(18,2) NULL
	
currency
	CHAR(3) NULL
	
occurred_at
	TIMESTAMP
	
correlation_id
	UUID
	
metadata
	JSONB NULL
	
created_at
	TIMESTAMP
	
Constraints
PK(id)
FK(ledger_id)
Índices
ledger_id
occurred_at
aggregate_type
event_type
correlation_id

8. API
Endpoints
GET /api/v1/payments/{paymentId}/ledger
GET /api/v1/payments/{paymentId}/ledger/{entryId}
Esses endpoints terão finalidade exclusivamente de consulta.

9. Logging
Registrar:
Ledger ID
Entry ID
Evento
Aggregate
Correlation ID
Timestamp

10. Events
O Financial Ledger será apenas consumidor de eventos.
Não publicará novos eventos de domínio.

11. Unit Tests
Implementar testes para:
criação de entradas;
imutabilidade;
ordenação cronológica;
consumo de eventos.

12. Integration Tests
Validar:
consumo dos eventos financeiros;
persistência das entradas;
consultas cronológicas;
consistência dos dados.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Todos os eventos financeiros relevantes gerarem entradas no Ledger.
Nenhuma entrada puder ser alterada ou removida.
As consultas retornarem o histórico cronológico corretamente.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate FinancialLedger
Entity LedgerEntry
FinancialLedgerRepository
FinancialLedgerService
FinancialLedgerConsumer
Migrations das tabelas financial_ledgers e financial_ledger_entries
Endpoints de consulta
DTOs de consulta
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O Livro-Razão Financeiro estiver operacional.
Todas as entradas forem persistidas de forma imutável.
As consultas estiverem disponíveis.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
