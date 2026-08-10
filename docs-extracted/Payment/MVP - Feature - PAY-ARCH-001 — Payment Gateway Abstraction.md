Trust Platform MVP
Arquitetura Técnica
PAY-ARCH-001 — Payment Gateway Abstraction

Document Information
Campo
	Valor
	
Document ID
	PAY-ARCH-001
	
Module
	Payments
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Priority
	Critical
	
References
	PAY-001
	

1. Objetivo
Definir a arquitetura de integração entre o domínio de Pagamentos da Trust Platform e provedores externos de pagamento, garantindo desacoplamento, extensibilidade, alta disponibilidade e facilidade para substituição ou utilização simultânea de múltiplos gateways.

2. Motivação
A Trust Platform não deverá depender da API ou do modelo de dados de um único provedor de pagamentos.
Toda integração externa deverá ocorrer através de contratos internos padronizados, preservando a independência do domínio.

3. Princípios Arquiteturais
A arquitetura deverá seguir:
Domain-Driven Design (DDD)
Clean Architecture
Hexagonal Architecture (Ports & Adapters)
Event-Driven Architecture
SOLID
Open/Closed Principle

4. Arquitetura
                   Payments Domain

                         │

                 PaymentGateway (Port)

                         │

      ┌──────────────────┼──────────────────┐

      │                  │                  │

MercadoPagoAdapter  StripeAdapter    AdyenAdapter

      │                  │                  │

Mercado Pago API     Stripe API       Adyen API
O domínio conhece apenas a interface PaymentGateway.
Nunca conhecerá APIs específicas.

5. Port
Interface:
public interface PaymentGateway {

    AuthorizationResult authorize(...);

    CaptureResult capture(...);

    RefundResult refund(...);

    CancelResult cancel(...);
    PaymentStatusResult getStatus(...);
}
O domínio utilizará exclusivamente essa interface.

6. Adapter
Cada gateway implementará sua própria adaptação.
Exemplos:
MercadoPagoGateway
StripeGateway
AdyenGateway
PagarMeGateway
StoneGateway
Todos deverão implementar exatamente o mesmo contrato.

7. Seleção do Gateway
A escolha do gateway será realizada por um componente dedicado.
Payment Provider Resolver
Critérios possíveis:
configuração por país;
configuração por moeda;
disponibilidade;
custo;
categoria do parceiro;
regras administrativas.
O domínio não conhecerá essas regras.

8. Webhooks
Todos os webhooks externos serão recebidos por um módulo específico.
Webhook Controller

↓

Webhook Validation

↓

Webhook Translator

↓
Domain Event
Jamais atualizar diretamente entidades do domínio.

9. Idempotência
Todas as operações deverão ser idempotentes.
Cada requisição deverá possuir:
Idempotency Key
Correlation ID
Operações duplicadas nunca poderão gerar cobranças duplicadas.

10. Retries
Falhas temporárias deverão utilizar:
Retry exponencial
Dead Letter Queue
Circuit Breaker
Jamais utilizar loops infinitos.

11. Timeouts
Todas as chamadas externas deverão possuir timeout configurável.
Valores deverão ser definidos por configuração e não por código.

12. Observabilidade
Registrar:
Latência
Tempo de resposta
Gateway utilizado
Código retornado
Tentativas
Erros
Essas informações alimentarão o módulo de Observabilidade.

13. Segurança
Nunca armazenar:
CVV
PAN completo
Tokens sensíveis do gateway
Seguir integralmente os requisitos aplicáveis do PCI DSS.

14. Eventos
Os adaptadores nunca publicarão eventos diretamente.
Eles retornarão resultados ao domínio.
Somente o domínio publicará:
Payment.Authorized
Payment.Captured
Payment.Refunded
Payment.Cancelled

15. Estratégia Multi Gateway
A plataforma deverá suportar:
múltiplos gateways ativos;
failover entre gateways (quando aplicável);
migração sem impacto para o domínio;
inclusão de novos provedores sem alteração do código do domínio.

16. Benefícios
Esta arquitetura proporciona:
baixo acoplamento;
facilidade de manutenção;
testes simplificados;
alta escalabilidade;
substituição de provedores sem impacto no domínio;
suporte nativo a múltiplos gateways;
preparação para expansão internacional.

17. Decisão Arquitetural
A Trust Platform adotará oficialmente o padrão Ports & Adapters (Hexagonal Architecture) para todas as integrações com provedores de pagamento.
Nenhuma entidade do domínio poderá depender diretamente de SDKs, APIs ou modelos de dados específicos de um gateway.
Essa decisão é obrigatória para todos os desenvolvimentos relacionados ao módulo de Pagamentos.
