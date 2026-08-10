Trust Platform MVP
Especificação da Feature
PAY-003 — Hold Funds (Custódia Financeira)

Document Information
Campo
	Valor
	
Feature ID
	PAY-003
	
Feature Name
	Hold Funds
	
Module
	Payments
	
Prioridade
	Crítica
	
Sprint
	Sprint 12
	
Status
	Ready for Development
	
Depends On
	PAY-002 – Authorize Payment
	
References
	PAY-ARCH-001, PAY-ARCH-002
	
Blocks
	PAY-004 – Release Funds
	

1. Objetivo de Negócio
Registrar que os recursos financeiros autorizados passaram oficialmente para o estado de Custódia Trust, permanecendo protegidos até que as condições para sua liberação sejam atendidas.
A Custódia Trust representa o compromisso da plataforma em manter os recursos indisponíveis para o vendedor enquanto a transação ainda estiver em andamento ou sujeita às políticas de retenção.

2. Escopo
Esta Feature Inclui
Criação da Custódia Trust
Associação ao Payment
Associação ao Marketplace Order
Registro do valor custodiado
Registro da data de início da custódia
Atualização do estado do pagamento
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Liberação dos recursos
Liquidação financeira
Estorno
Split
Conciliação

3. User Story
Como plataforma
Quero colocar os recursos financeiros sob Custódia Trust
Para que comprador e vendedor tenham segurança durante a execução da transação.

4. Business Rules
BR-001
Somente pagamentos com status:
AUTHORIZED
poderão entrar em Custódia Trust.

BR-002
Cada Payment poderá possuir apenas uma Custódia Trust ativa.

BR-003
Ao iniciar a custódia:
Status do Payment:
FUNDS_IN_CUSTODY

Status da TrustCustody:
IN_CUSTODY

BR-004
A Custódia Trust registrará obrigatoriamente:
pagamento;
pedido;
comprador;
vendedor;
valor;
moeda;
data e hora de início.

BR-005
Durante a custódia, nenhum recurso poderá ser liberado ao vendedor sem atender às políticas definidas pelo TrustCustodyPolicyService.

BR-006
A Custódia Trust deverá ser totalmente auditável.

BR-007
O início da custódia deverá publicar eventos para os módulos consumidores.

5. Fluxo Funcional
Payment autorizado
↓
Validar elegibilidade
↓

Criar TrustCustody

↓

Atualizar Payment

↓

Status = FUNDS_IN_CUSTODY

↓
Registrar auditoria
↓
Publicar eventos
↓
Fim

6. Backend Implementation
6.1 Aggregate
Criar:
TrustCustody
Atributos
id

paymentId

orderId

buyerId

sellerId

amount

currency
status
startedAt
createdAt
updatedAt

6.2 Repository
Criar:
TrustCustodyRepository
Métodos:
save()
findById()
findByPaymentId()
existsByPaymentId()

6.3 Services
Criar:
TrustCustodyService
Responsabilidades:
iniciar custódia;
validar elegibilidade;
impedir duplicidade;
atualizar Payment;
publicar eventos.

Criar:
TrustCustodyPolicyService
Responsável por:
validar políticas de retenção;
determinar elegibilidade para futura liberação;
aplicar regras específicas por categoria.

6.4 Use Cases
Criar:
HoldFundsUseCase

6.5 DTOs
Não aplicável.
A criação ocorrerá por integração interna após a autorização do pagamento.

6.6 Exceptions
Criar:
TrustCustodyAlreadyExistsException
TrustCustodyCreationException
TrustCustodyPolicyViolationException

7. Database
Criar tabela:
trust_custodies
Campo
	Tipo
	
id
	UUID
	
payment_id
	UUID
	
order_id
	UUID
	
buyer_id
	UUID
	
seller_id
	UUID
	
amount
	DECIMAL(18,2)
	
currency
	CHAR(3)
	
status
	VARCHAR(30)
	
started_at
	TIMESTAMP
	
created_at
	TIMESTAMP
	
updated_at
	TIMESTAMP
	
Constraints
PK(id)
FK(payment_id)
FK(order_id)
UNIQUE(payment_id)
Índices
payment_id
order_id
status
started_at

8. API
Não haverá endpoint público.
O início da Custódia Trust será executado automaticamente após a autorização do pagamento.

9. Logging
Registrar:
TrustCustody ID
Payment ID
Marketplace Order ID
Valor
Moeda
Status
Timestamp
Correlation ID
Idempotency Key

10. Events
Publicar:
TrustCustody.Created

Funds.Held
Consumidores previstos:
Marketplace
Analytics
Auditoria
IA
Notificações

11. Unit Tests
Implementar testes para:
criação válida;
duplicidade por Payment;
atualização do Payment;
publicação dos eventos;
validação das políticas de custódia.

12. Integration Tests
Validar:
criação da TrustCustody;
atualização do Payment;
persistência;
publicação dos eventos;
integração com o TrustCustodyPolicyService.

13. Acceptance Criteria
A Feature será considerada pronta quando:
A Custódia Trust for criada automaticamente.
O Payment passar para FUNDS_IN_CUSTODY.
Apenas uma custódia existir por pagamento.
Os eventos forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate TrustCustody
TrustCustodyRepository
TrustCustodyService
TrustCustodyPolicyService
HoldFundsUseCase
Migration da tabela trust_custodies
Eventos de domínio
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A Custódia Trust estiver operacional.
O Payment refletir corretamente o estado de custódia.
As políticas de retenção forem aplicadas.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
