Trust Platform MVP
Especificação da Feature
PAY-006 — Refund Payment (Reembolsar Pagamento)

Document Information
Campo
	Valor
	
Feature ID
	PAY-006
	
Feature Name
	Refund Payment
	
Module
	Payments
	
Prioridade
	Alta
	
Sprint
	Sprint 13
	
Status
	Ready for Development
	
Depends On
	PAY-005 – Funds Settlement
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-007 – Split Payment
	

1. Objetivo de Negócio
Permitir o reembolso total ou parcial de recursos financeiros, registrando formalmente a operação e garantindo rastreabilidade completa de todo o processo.

2. Escopo
Esta Feature Inclui
Criação do reembolso
Reembolso total
Reembolso parcial
Registro do motivo
Registro do solicitante
Atualização dos estados
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Chargeback
Contestação bancária
Conciliação financeira

3. User Story
Como plataforma
Quero registrar um reembolso
Para que recursos possam retornar ao comprador quando permitido pelas regras da plataforma.

4. Business Rules
BR-001
Somente pagamentos elegíveis poderão ser reembolsados.

BR-002
Cada reembolso deverá registrar obrigatoriamente:
pagamento;
valor;
motivo;
solicitante;
data e hora.

BR-003
Tipos de motivo iniciais:
Cancelamento antes da execução
Disputa procedente
Erro operacional
Reembolso administrativo
Cobrança indevida
Outro
Os motivos deverão ser configuráveis pela Administração.

BR-004
O reembolso poderá ser:
Total
Parcial

BR-005
Cada Payment poderá possuir múltiplos reembolsos, desde que a soma dos valores não ultrapasse o valor originalmente liquidado.

BR-006
Status possíveis:
PENDING

PROCESSING

COMPLETED

FAILED

BR-007
Toda operação deverá ser auditada.

5. Fluxo Funcional
Evento elegível
↓
Criar FundsRefund
↓
Solicitar reembolso ao gateway
↓
Atualizar status
↓
Registrar auditoria
↓
Publicar eventos

6. Backend Implementation
6.1 Aggregate
Criar:
FundsRefund
Atributos
id

paymentId

amount

currency

reason

requestedBy

status

providerRefundId

requestedAt

completedAt

createdAt

updatedAt

Criar Value Object:
RefundReason

6.2 Repository
Criar:
FundsRefundRepository

6.3 Services
Criar:
FundsRefundService
Responsabilidades:
validar elegibilidade;
solicitar reembolso;
atualizar estados;
publicar eventos.

6.4 Use Cases
Criar:
RefundPaymentUseCase

6.5 DTOs
Não aplicável.
Fluxo interno.

6.6 Exceptions
Criar:
RefundNotAllowedException
RefundLimitExceededException
RefundFailedException

7. Database
Criar tabela:
funds_refunds
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
amount
	DECIMAL(18,2)
	
currency
	CHAR(3)
	
reason
	VARCHAR(100)
	
requested_by
	UUID
	
provider_refund_id
	VARCHAR(200)
	
status
	VARCHAR(30)
	
requested_at
	TIMESTAMP
	
completed_at
	TIMESTAMP NULL
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	
Constraints
PK(id)
FK(payment_id)
Índices
payment_id
status
requested_at

8. API
Não haverá endpoint público.
Os reembolsos serão iniciados por eventos internos ou processos administrativos autorizados.

9. Logging
Registrar:
Refund ID
Payment ID
Valor
Motivo
Solicitante
Status
Timestamp
Correlation ID

10. Events
Publicar:
FundsRefund.Created

FundsRefund.Completed

FundsRefund.Failed
Consumidores previstos:
Marketplace
Trust Score
Analytics
Financeiro
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
reembolso total;
reembolso parcial;
limite excedido;
atualização dos estados;
publicação dos eventos.

12. Integration Tests
Validar:
integração com Payment Gateway;
persistência;
atualização dos estados;
publicação dos eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Reembolsos puderem ser registrados corretamente.
O limite financeiro for respeitado.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate FundsRefund
Value Object RefundReason
FundsRefundRepository
FundsRefundService
RefundPaymentUseCase
Migration da tabela funds_refunds
Eventos de domínio
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O reembolso estiver operacional.
O histórico estiver persistido.
O limite financeiro for respeitado.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
