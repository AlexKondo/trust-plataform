Trust Platform
ARCH-001 — Event-Driven Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-001
	
Document Name
	Event-Driven Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Todos os módulos e serviços da Trust Platform
	
1. Objetivo
Definir o padrão oficial de comunicação assíncrona entre os domínios da Trust Platform, estabelecendo uma arquitetura orientada a eventos que permita baixo acoplamento, escalabilidade, resiliência, rastreabilidade e evolução independente dos módulos.
2. Motivação
A Trust Platform será composta por múltiplos domínios independentes, como Identity, Marketplace, Payments, Trust Score, Trust Economy, Notifications, AI e futuros módulos. A comunicação direta e excessivamente síncrona entre esses domínios criaria dependências difíceis de manter e ampliaria o impacto de mudanças.
A arquitetura orientada a eventos será, portanto, o padrão preferencial para comunicação entre domínios.
3. Princípios Arquiteturais
Cada domínio é proprietário de seu modelo e de suas regras de negócio.
Domínios não acessam diretamente bancos de dados pertencentes a outros domínios.
Eventos de domínio são o principal mecanismo de propagação de mudanças entre contextos.
Consumidores devem ser idempotentes.
Eventos devem possuir contrato versionado e metadados de rastreabilidade.
Falhas de consumidores não devem bloquear indefinidamente o produtor.
Operações críticas devem possuir estratégia de retry e Dead Letter Queue (DLQ).
Integrações síncronas são permitidas quando a resposta imediata for parte essencial do caso de uso.
4. Arquitetura de Referência
Modelo conceitual:
Domain A → Event Bus → Domain B
                     ↘ Domain C
                     ↘ Domain D
O produtor publica um evento após uma mudança de estado relevante. O Event Bus distribui o evento aos consumidores autorizados, que processam a mensagem de forma independente.
5. Event Bus
A plataforma deverá possuir uma camada de mensageria/event streaming abstraída do domínio.
O domínio não deverá depender diretamente de um produto específico de mensageria.
A infraestrutura poderá utilizar tecnologias como Kafka, RabbitMQ, AWS EventBridge/SNS/SQS ou equivalente, conforme decisão de infraestrutura.
A tecnologia escolhida deverá suportar durabilidade, retry, observabilidade e controle de acesso.
6. Producers e Consumers
6.1 Producers
Produtores são responsáveis por publicar eventos quando mudanças relevantes do domínio ocorrerem.
Publicar somente eventos que representem fatos ocorridos.
Não publicar eventos como comandos disfarçados.
Garantir que o evento possua identificadores de correlação e causação.
6.2 Consumers
Consumidores são responsáveis por reagir aos eventos e executar suas próprias regras.
Nunca assumir que um evento será recebido apenas uma vez.
Implementar idempotência.
Não alterar diretamente o estado de outro domínio.
Registrar sucesso, falha e tentativas.
7. Domain Events
Eventos deverão representar fatos já ocorridos. Exemplos existentes na plataforma:
MarketplaceOrder.CustomerConfirmed
Payment.Created
Payment.Authorized
TrustCustody.Created
Funds.Released
Funds.Settled
FinancialCase.Opened
A especificação detalhada de naming, payload, versionamento e metadados será definida em ARCH-002 — Domain Events Standard.
8. Event Contract
Todo evento deverá possuir, no mínimo:
eventId
eventType
eventVersion
occurredAt
producer
aggregateType
aggregateId
correlationId
causationId
payload
O contrato deverá ser versionado e compatível com consumidores existentes sempre que possível.
9. Idempotência
A entrega duplicada de um evento é considerada possível. Todo consumidor de evento deverá conseguir processar a mesma mensagem mais de uma vez sem produzir efeitos financeiros ou operacionais duplicados.
10. Retry e Dead Letter Queue
Falhas transitórias deverão utilizar retry com backoff exponencial.
O número máximo de tentativas deverá ser configurável.
Mensagens que não possam ser processadas após as tentativas deverão ser direcionadas à DLQ.
Mensagens em DLQ deverão possuir processo de investigação e reprocessamento controlado.
11. Outbox Pattern
Operações em que uma mudança de estado no banco e a publicação de evento precisam manter consistência deverão utilizar o Outbox Pattern ou mecanismo equivalente.
Persistir a alteração de domínio e o evento na mesma unidade transacional quando aplicável.
Publicar o evento posteriormente através de um Outbox Publisher.
Garantir que uma falha de infraestrutura não resulte em perda silenciosa de eventos.
12. Ordenação
A plataforma não deverá assumir ordenação global de eventos. Quando a ordem for relevante, ela deverá ser garantida por chave de particionamento, sequência por aggregate ou mecanismo equivalente.
13. Segurança
Somente produtores e consumidores autorizados poderão publicar ou consumir determinados eventos.
Dados pessoais e financeiros deverão ser minimizados no payload.
Segredos, credenciais e dados sensíveis de autenticação nunca poderão ser publicados em eventos.
Acesso aos tópicos/filas deverá seguir princípio de menor privilégio.
14. Observabilidade
Todo processamento deverá ser rastreável por correlationId e eventId.
Devem existir métricas de throughput, latência, retry, falhas e mensagens em DLQ.
Logs deverão ser estruturados.
Traces distribuídos deverão acompanhar o fluxo quando suportado pela infraestrutura.
15. Event Versioning
Eventos são contratos públicos entre domínios e não devem sofrer breaking changes sem estratégia de migração.
Alterações compatíveis devem preservar consumidores existentes.
Breaking changes deverão criar nova versão do contrato.
Consumidores deverão declarar ou registrar a versão suportada quando aplicável.
16. Synchronous vs Asynchronous Communication
Comunicação síncrona poderá ser utilizada quando:
a resposta imediata for necessária para concluir a operação;
o caso de uso exigir confirmação em tempo real;
a consistência imediata for indispensável e não puder ser modelada de forma assíncrona.
Comunicação assíncrona deverá ser preferida quando:
um domínio apenas precisar reagir a um fato ocorrido;
o consumidor puder processar posteriormente;
a operação puder tolerar consistência eventual;
for desejável reduzir o acoplamento entre serviços.
17. Anti-Patterns Proibidos
Acesso direto ao banco de dados de outro domínio.
Eventos que contenham comandos implícitos como 'DoSomethingNow'.
Consumidores não idempotentes.
Dependência de ordenação global sem garantia técnica.
Publicação de dados sensíveis desnecessários.
Chamadas síncronas em cadeia entre muitos domínios.
Publicação de evento sem mecanismo de recuperação de falha.
18. Impacto nos Módulos Existentes
Os módulos já documentados deverão seguir este padrão.
Marketplace publica fatos de negócio e não chama diretamente o domínio financeiro para executar operações.
Payments consome eventos do Marketplace e publica eventos financeiros.
TrustCustody reage a eventos elegíveis e publica eventos de custódia.
Financial Ledger consome eventos financeiros e mantém o histórico imutável.
Financial Case Management pode ser acionado automaticamente por eventos de divergência.
Financial Reconciliation publica inconsistências e pode abrir Financial Cases.
19. Decisão Arquitetural
A Trust Platform adotará oficialmente Event-Driven Architecture como padrão de comunicação entre domínios. A comunicação síncrona permanecerá disponível para casos em que a resposta imediata seja essencial, mas não deverá ser utilizada como mecanismo padrão de integração entre bounded contexts.
Todo novo módulo deverá declarar seus produtores, consumidores, eventos, contratos, estratégias de retry, idempotência e observabilidade como parte de sua documentação técnica.
20. Próximos Documentos Relacionados
ARCH-002 — Domain Events Standard
ARCH-003 — Notification Architecture
ARCH-004 — Observability & Monitoring
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-007 — AI Integration Architecture
21. Definition of Done para Novos Domínios
Bounded Context definido.
Eventos de entrada e saída documentados.
Contratos de eventos definidos.
Idempotência implementada.
Retry e DLQ definidos.
Observabilidade implementada.
Controle de acesso configurado.
Testes de integração de eventos implementados.
22. Princípio Fundamental
Domínios devem comunicar fatos; não devem compartilhar implementação.
A arquitetura orientada a eventos existe para permitir que cada domínio evolua de forma independente, preservando a integridade do negócio e a capacidade da Trust Platform de crescer sem criar dependências frágeis.
