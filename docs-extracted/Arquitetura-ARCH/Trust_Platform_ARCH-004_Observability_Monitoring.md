Trust Platform
ARCH-004 — Observability & Monitoring
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-004
	
Document Name
	Observability & Monitoring
	
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
	
Depends On
	ENG-000, ARCH-001, ARCH-002
	
1. Objetivo
Definir o padrão de observabilidade da Trust Platform para permitir que equipes detectem, diagnostiquem, investiguem e previnam falhas por meio de logs estruturados, métricas, traces distribuídos, dashboards e alertas.
2. Motivação
Uma plataforma orientada a eventos e composta por múltiplos domínios exige visibilidade ponta a ponta. Não basta saber que um serviço falhou; precisamos identificar onde, quando, por quê, qual transação foi afetada e qual impacto foi gerado.
Observabilidade será tratada como requisito arquitetural obrigatório, e não como atividade posterior à implementação.
3. Princípios
Observability by Default.
Logs, Metrics e Traces devem funcionar de forma complementar.
Todo fluxo crítico deve possuir correlação ponta a ponta.
Dados de observabilidade devem ser estruturados e pesquisáveis.
Alertas devem ser acionáveis e possuir owner.
Informações sensíveis devem ser minimizadas ou mascaradas.
Monitoramento deve considerar experiência do usuário e saúde do negócio.
4. Os Três Pilares
Pilar
	Objetivo
	Exemplos
	
Logs
	Registrar eventos técnicos e operacionais
	Erro, auditoria técnica, processamento
	
Metrics
	Medir comportamento agregado
	Latência, throughput, erros, fila
	
Traces
	Acompanhar uma operação ponta a ponta
	Request → Event → Consumer → Provider
	
5. Distributed Tracing
A plataforma deverá utilizar tracing distribuído para acompanhar operações entre serviços.
traceId para representar a jornada completa.
spanId para representar cada operação.
correlationId para correlação de negócio.
causationId para rastrear cadeias causais de eventos.
Propagação de contexto entre APIs, filas, eventos e workers.
6. OpenTelemetry
OpenTelemetry será adotado como padrão de instrumentação, mantendo a plataforma desacoplada do backend específico de observabilidade.
Instrumentação de APIs.
Instrumentação de consumers/producers.
Instrumentação de bancos e chamadas externas.
Exportação para o stack de observabilidade definido pela infraestrutura.
7. Logging
Todos os serviços deverão produzir logs estruturados.
timestamp
level
service
environment
traceId
correlationId
eventId, quando aplicável
aggregateId, quando aplicável
message
errorCode, quando aplicável
Logs não deverão conter senhas, tokens, CVV, chaves privadas ou dados pessoais desnecessários.
8. Log Levels
DEBUG — diagnóstico controlado; não deve ser padrão em produção.
INFO — eventos operacionais relevantes.
WARN — condição anormal sem falha crítica.
ERROR — falha que exige investigação.
CRITICAL — impacto relevante na operação ou integridade.
9. Metrics
Cada serviço deverá expor métricas técnicas e, quando aplicável, métricas de negócio.
Request rate.
Error rate.
Latency / p50 / p95 / p99.
CPU e memória.
Database latency.
Queue depth.
Consumer lag.
Retry count.
DLQ size.
External provider availability.
10. Business Observability
A Trust não deverá monitorar apenas infraestrutura. Indicadores de negócio serão parte da observabilidade.
Payments authorized.
Funds in custody.
Funds released.
Settlement failures.
Refund failures.
Financial reconciliation issues.
Notifications failed.
Marketplace transactions impacted.
Trust Score calculation failures.
11. Service Level Objectives
Serviços críticos deverão possuir SLOs documentados. Exemplos iniciais:
Indicador
	Exemplo inicial
	Observação
	
Availability
	≥ 99.9%
	Serviços críticos
	
API p95
	≤ 500 ms
	Ajustar por caso de uso
	
Event processing
	≤ 60 s
	Fluxos não críticos
	
Critical event loss
	0
	Não pode haver perda silenciosa
	
DLQ critical messages
	0 abertas sem owner
	Operação deve tratar
	
Os valores são referências iniciais e deverão ser refinados por serviço.
12. Alerting
Alertas deverão ser baseados em impacto e não apenas em sintomas técnicos.
CRITICAL — resposta imediata.
HIGH — investigação prioritária.
MEDIUM — acompanhamento operacional.
LOW — tendência ou manutenção.
Todo alerta crítico deverá possuir runbook, owner e canal de escalonamento.
13. Dashboards
Executive Health — visão geral da plataforma.
Service Health — disponibilidade, latência e erros.
Event Platform — throughput, lag, retries e DLQ.
Payments Health — autorização, custódia, settlement, refunds e reconciliação.
Notifications Health — envio e entrega por canal.
Security & Audit — eventos relevantes de segurança e compliance.
14. Error Tracking
Erros deverão possuir códigos estáveis quando fizer sentido, permitindo agregação e análise sem depender apenas da mensagem textual.
15. Correlation e Incident Investigation
Uma investigação deverá conseguir partir de um identificador de negócio e reconstruir o caminho técnico.
Business ID → correlationId → traceId → events → services → provider
16. Retenção
Logs, métricas e traces terão políticas de retenção distintas.
Dados críticos de auditoria não devem depender da retenção operacional de logs.
Informações financeiras e de compliance deverão seguir políticas específicas.
Retenção deverá considerar custo, segurança e requisitos legais.
17. Segurança e Privacidade
Mascarar dados pessoais e financeiros quando possível.
Restringir acesso a logs e traces.
Auditar acesso a informações sensíveis.
Não utilizar observabilidade como depósito de dados de negócio completos.
18. Monitoramento de Dependências Externas
Providers externos deverão ser monitorados separadamente.
Disponibilidade.
Latência.
Taxa de erro.
Timeouts.
Rate limits.
Falhas por provider.
Fallback status.
19. Observabilidade de Eventos
Eventos publicados por segundo.
Eventos consumidos por segundo.
Consumer lag.
Retry rate.
DLQ messages.
Processing latency.
Event failure rate.
20. Incident Management
Incidentes relevantes deverão possuir:
Incident ID.
Severity.
Owner.
Start time.
Impact.
Timeline.
Root cause.
Resolution.
Corrective actions.
Post-mortems deverão buscar melhoria sistêmica e não culpabilização individual.
21. Anti-Patterns Proibidos
Serviço sem logs estruturados.
Alertas sem owner.
Logs contendo segredos.
Monitorar apenas CPU e memória.
Ausência de correlationId em fluxos críticos.
Usar logs como único mecanismo de auditoria.
Dashboards sem definição de ação.
22. Definition of Done
Logs estruturados implementados.
Métricas técnicas implementadas.
Traces distribuídos implementados quando aplicável.
CorrelationId propagado.
Dashboards definidos.
Alertas definidos para condições críticas.
Runbooks documentados para alertas críticos.
Dados sensíveis protegidos.
Testes de observabilidade executados.
23. Decisão Arquitetural
Observabilidade será requisito obrigatório para todos os novos serviços da Trust Platform. OpenTelemetry será o padrão de instrumentação. O stack específico de armazenamento e visualização poderá evoluir sem alterar o contrato de instrumentação.
24. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-003 — Notification Architecture
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
25. Princípio Fundamental
Se não conseguimos observar uma operação crítica, não conseguimos gerenciá-la com confiança.
