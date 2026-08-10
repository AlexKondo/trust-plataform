Trust Platform MVP
Especificação da Feature
PAY-005 — Funds Settlement (Liquidação Financeira)

Document Information
Campo
	Valor
	
Feature ID
	PAY-005
	
Feature Name
	Funds Settlement
	
Module
	Payments
	
Prioridade
	Crítica
	
Sprint
	Sprint 12
	
Status
	Ready for Development
	
Depends On
	PAY-004 – Release Funds
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-006 – Refund Payment
	

1. Objetivo de Negócio
Registrar e acompanhar a liquidação financeira dos recursos liberados pela Custódia Trust até sua efetiva disponibilização ao beneficiário final.
A liquidação representa a confirmação de que os recursos foram processados com sucesso pelo provedor financeiro e creditados ao vendedor.

2. Escopo
Esta Feature Inclui
Criação do registro de liquidação
Acompanhamento do processamento
Registro das respostas do gateway
Registro das informações bancárias da liquidação
Atualização dos estados financeiros
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Reembolso
Split financeiro
Conciliação contábil
Cobrança de taxas administrativas

3. User Story
Como plataforma
Quero acompanhar a liquidação financeira
Para que exista confirmação oficial do crédito ao vendedor.

4. Business Rules
BR-001
Somente pagamentos com recursos:
RELEASED
poderão iniciar a liquidação.

BR-002
Cada Payment poderá possuir apenas um processo principal de liquidação.

BR-003
A liquidação registrará obrigatoriamente:
pagamento;
custódia;
provedor financeiro;
valor bruto;
moeda;
data e hora de início.

BR-004
Durante o processamento:
Status:
SETTLEMENT_PENDING

BR-005
Após confirmação do provedor:
Status do FundsSettlement:
SETTLED
Status do Payment:
SETTLED
Status da TrustCustody:
SETTLED

BR-006
Caso ocorra falha:
Status:
SETTLEMENT_FAILED
O sistema poderá executar novas tentativas conforme política configurável.

BR-007
Todas as alterações deverão ser auditadas.

5. Fluxo Funcional
Funds Released

↓

Criar FundsSettlement

↓

Status = SETTLEMENT_PENDING

↓
Gateway confirma liquidação
↓
Atualizar Settlement
↓
Atualizar Payment
↓
Atualizar TrustCustody
↓
Publicar eventos

6. Backend Implementation
6.1 Aggregate
Criar:
FundsSettlement
Atributos
id

paymentId

trustCustodyId

providerId

providerSettlementId

grossAmount

netAmount

currency

status

startedAt

settledAt

createdAt

updatedAt

6.2 Repository
Criar:
FundsSettlementRepository

6.3 Services
Criar:
FundsSettlementService
Responsabilidades:
iniciar liquidação;
consultar status;
atualizar estados;
publicar eventos.

6.4 Use Cases
Criar:
SettleFundsUseCase

6.5 DTOs
Não aplicável.
Fluxo interno orientado a eventos.

6.6 Exceptions
Criar:
SettlementFailedException
SettlementAlreadyExistsException
SettlementNotAllowedException

7. Database
Criar tabela:
funds_settlements
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
trust_custody_id
	UUID
	
provider_id
	UUID
	
provider_settlement_id
	VARCHAR(200)
	
gross_amount
	DECIMAL(18,2)
	
net_amount
	DECIMAL(18,2)
	
currency
	CHAR(3)
	
status
	VARCHAR(30)
	
started_at
	TIMESTAMP
	
settled_at
	TIMESTAMP NULL
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	
Constraints
PK(id)
FK(payment_id)
FK(trust_custody_id)
UNIQUE(payment_id)
Índices
payment_id
trust_custody_id
provider_settlement_id
status

8. API
Não haverá endpoint público.
A liquidação será iniciada automaticamente após a liberação dos recursos.

9. Logging
Registrar:
Settlement ID
Payment ID
TrustCustody ID
Provider
Valor bruto
Valor líquido
Status
Timestamp
Correlation ID

10. Events
Publicar:
FundsSettlement.Created

Funds.Settled

Settlement.Failed
Consumidores previstos:
Trust Economy
Analytics
Financeiro
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
criação da liquidação;
confirmação da liquidação;
falha na liquidação;
atualização dos estados;
publicação dos eventos.

12. Integration Tests
Validar:
integração com o Payment Gateway;
atualização do Payment;
atualização da TrustCustody;
persistência do FundsSettlement;
publicação dos eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
A liquidação for registrada.
O Payment e a TrustCustody refletirem corretamente o resultado.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate FundsSettlement
FundsSettlementRepository
FundsSettlementService
SettleFundsUseCase
Migration da tabela funds_settlements
Eventos de domínio
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A liquidação financeira estiver operacional.
Os estados forem atualizados corretamente.
O histórico da liquidação estiver persistido.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
