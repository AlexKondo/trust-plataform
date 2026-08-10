Trust Platform MVP
Arquitetura Técnica
PAY-ARCH-002 — Trust Custody Architecture

Document Information
Campo
	Valor
	
Document ID
	PAY-ARCH-002
	
Module
	Payments
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Priority
	Critical
	
References
	PAY-001, PAY-002, PAY-ARCH-001
	

1. Objetivo
Definir a arquitetura do módulo Trust Custody, responsável pela custódia financeira das transações da Trust Platform, desacoplando o domínio de negócio dos detalhes operacionais dos gateways de pagamento.

2. Motivação
O principal objetivo da Trust Platform é gerar confiança entre as partes.
A confiança não é criada pelo gateway de pagamento.
Ela é criada pela capacidade da plataforma de:
custodiar recursos;
liberar recursos somente quando as condições forem atendidas;
registrar todas as etapas da transação;
garantir rastreabilidade;
permitir auditoria completa.
Por esse motivo, a plataforma adotará oficialmente o conceito de Trust Custody como um domínio próprio.

3. Princípios Arquiteturais
O módulo deverá seguir:
Domain-Driven Design (DDD)
Clean Architecture
Event-Driven Architecture
Hexagonal Architecture
Event Sourcing Ready
SOLID

4. Arquitetura
MarketplaceOrder

↓

Payment

↓

PaymentAuthorization

↓

TrustCustody

↓

Release
↓
Settlement
↓
Refund
O domínio financeiro passa a ser organizado em torno da custódia dos recursos, e não da API de um provedor específico.

5. Responsabilidades do TrustCustody
O Aggregate TrustCustody será responsável por:
registrar a entrada dos recursos sob custódia;
controlar o estado da custódia;
validar regras de liberação;
registrar retenções;
registrar liberações;
registrar devoluções;
publicar eventos financeiros.
O Aggregate não será responsável por executar operações diretamente no gateway de pagamento.

6. Máquina de Estados
Estados propostos:
CREATED

↓

FUNDS_RESERVED

↓

IN_CUSTODY

↓

READY_FOR_RELEASE

↓

RELEASED

↓

SETTLED
Fluxos alternativos:
REFUNDED
CANCELLED
FAILED

7. Eventos de Domínio
O Aggregate deverá publicar eventos como:
TrustCustody.Created

Funds.Reserved

Funds.Held

Funds.Released

Funds.Settled

Funds.Refunded

Funds.CustodyFailed
Todos os módulos consumidores deverão reagir a esses eventos, nunca acessar diretamente o Aggregate.

8. Regras de Liberação
A liberação dos recursos dependerá de políticas configuráveis.
Exemplos:
confirmação do cliente;
ausência de disputa;
aprovação administrativa;
prazo de garantia expirado;
regras específicas da categoria.
Essas regras deverão ser implementadas por um componente dedicado:
TrustCustodyPolicyService

9. Integração com Marketplace
O Marketplace nunca conhecerá o TrustCustody.
Ele apenas publicará eventos como:
MarketplaceOrder.CustomerConfirmed

MarketplaceDispute.Opened

MarketplaceDispute.Resolved
O módulo Payments consumirá esses eventos.

10. Integração com Payment Gateway
A integração ocorrerá exclusivamente através da interface:
PaymentGateway
O Aggregate TrustCustody jamais conhecerá SDKs ou APIs externas.

11. Auditoria
Toda movimentação deverá registrar:
usuário ou processo responsável;
data e hora;
estado anterior;
novo estado;
origem da alteração;
Correlation ID;
Idempotency Key.
Nenhum registro poderá ser removido.

12. Observabilidade
Registrar:
tempo de retenção;
tempo até liberação;
falhas;
tentativas;
gateway utilizado;
latência;
erros.
Esses dados alimentarão o módulo de Observabilidade.

13. Segurança
Todos os dados financeiros deverão seguir:
PCI DSS (quando aplicável);
criptografia em repouso;
criptografia em trânsito;
trilha de auditoria imutável;
segregação de funções administrativas.

14. Benefícios
Esta arquitetura proporciona:
independência de gateways;
forte rastreabilidade;
desacoplamento entre Marketplace e Pagamentos;
flexibilidade para múltiplos meios de pagamento;
suporte futuro a carteiras digitais;
evolução para novos instrumentos financeiros;
base para expansão internacional.

15. Decisão Arquitetural
A Trust Platform adotará oficialmente o Aggregate TrustCustody como o responsável pela gestão da custódia financeira das transações.
Todos os processos de retenção, liberação, liquidação e devolução deverão ser modelados em torno desse Aggregate.
Nenhum módulo externo poderá executar operações financeiras diretamente sem respeitar o ciclo de vida da Custódia Trust.
Esta decisão passa a fazer parte da arquitetura oficial da plataforma.
