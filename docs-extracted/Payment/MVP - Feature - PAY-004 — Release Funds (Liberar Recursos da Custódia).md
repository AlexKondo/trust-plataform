Trust Platform MVP
Especificação da Feature
PAY-004 — Release Funds (Liberar Recursos da Custódia)

Document Information
Campo
	Valor
	
Feature ID
	PAY-004
	
Feature Name
	Release Funds
	
Module
	Payments
	
Prioridade
	Crítica
	
Sprint
	Sprint 12
	
Status
	Ready for Development
	
Depends On
	PAY-003 – Hold Funds
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-005 – Refund Payment
	

1. Objetivo de Negócio
Liberar os recursos financeiros mantidos em Custódia Trust quando todas as condições da transação forem atendidas, autorizando sua transferência ao beneficiário.

2. Escopo
Esta Feature Inclui
Validação das regras de liberação
Alteração do estado da custódia
Solicitação de liberação ao gateway
Atualização do pagamento
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Liquidação bancária
Estorno
Split financeiro
Conciliação

3. User Story
Como plataforma
Quero liberar os recursos custodiados
Para que o vendedor receba o pagamento somente após o cumprimento das condições estabelecidas.

4. Business Rules
BR-001
Somente custódias com status:
IN_CUSTODY
poderão iniciar o processo de liberação.

BR-002
A elegibilidade para liberação será avaliada exclusivamente pelo:
TrustReleasePolicyService

BR-003
Caso a política aprove:
Status:
READY_FOR_RELEASE

BR-004
Após confirmação do gateway:
Status da TrustCustody:
RELEASED
Status do Payment:
FUNDS_RELEASED

BR-005
Caso a política negue a liberação, nenhuma alteração financeira será realizada.

BR-006
Todas as decisões deverão ser auditadas.

5. Fluxo Funcional
Evento elegível

↓

TrustReleasePolicyService

↓

ALLOW_RELEASE?

↓

Atualizar TrustCustody

↓

READY_FOR_RELEASE

↓

PaymentGateway.release()

↓

Gateway confirma

↓

RELEASED

↓

Atualizar Payment
↓
Publicar eventos

6. Backend Implementation
6.1 Aggregate
Atualizar:
TrustCustody
Adicionar estados:
READY_FOR_RELEASE

RELEASED

6.2 Repository
Atualizar:
TrustCustodyRepository

6.3 Services
Criar:
TrustReleasePolicyService
Responsabilidades:
validar elegibilidade;
aplicar políticas de retenção;
decidir sobre a liberação.

Criar:
FundsReleaseService
Responsabilidades:
executar liberação;
atualizar Payment;
publicar eventos.

6.4 Use Cases
Criar:
ReleaseFundsUseCase

6.5 DTOs
Não aplicável.
Operação executada internamente.

6.6 Exceptions
Criar:
FundsReleaseNotAllowedException
TrustCustodyNotEligibleException

7. Database
Nenhuma nova tabela.
Atualizar:
trust_custodies
Campo:
status

8. API
Não haverá endpoint público.
A operação será iniciada por eventos internos da plataforma.

9. Logging
Registrar:
TrustCustody ID
Payment ID
Resultado da política
Gateway
Timestamp
Correlation ID

10. Events
Publicar:
Funds.ReadyForRelease

Funds.Released
Consumidores previstos:
Settlement
Analytics
Trust Economy
Auditoria
Notificações

11. Unit Tests
Implementar testes para:
liberação autorizada;
política negando liberação;
atualização dos estados;
publicação dos eventos.

12. Integration Tests
Validar:
integração com TrustReleasePolicyService;
integração com PaymentGateway;
atualização da custódia;
atualização do Payment.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas custódias elegíveis forem liberadas.
A política decidir corretamente.
Os estados forem atualizados.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização do Aggregate TrustCustody
TrustReleasePolicyService
FundsReleaseService
ReleaseFundsUseCase
Eventos de domínio
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A política de liberação estiver operacional.
A Custódia Trust puder ser liberada corretamente.
O Payment refletir o novo estado.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
