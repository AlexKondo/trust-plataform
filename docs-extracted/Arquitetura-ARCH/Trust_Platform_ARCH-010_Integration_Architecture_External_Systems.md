Trust Platform
ARCH-010 — Integration Architecture & External Systems
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-010
	
Document Name
	Integration Architecture & External Systems
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Integrações com ERPs, bancos, gateways, parceiros, marketplaces e serviços externos
	
Depends On
	ENG-000, ARCH-001, ARCH-002, ARCH-005, ARCH-009
	
1. Objetivo
Definir o padrão para integração da Trust Platform com sistemas externos, parceiros e plataformas de terceiros, garantindo desacoplamento, segurança, resiliência, rastreabilidade, governança e capacidade de substituição de fornecedores.
2. Princípios
External systems are untrusted by default.
Ports & Adapters.
Provider abstraction.
Least Privilege.
Contract First.
Retry with control.
Idempotency.
Observability.
Graceful degradation.
Replaceability by design.
3. Tipos de Integração
Tipo
	Exemplo
	Padrão
	
REST API
	ERP, parceiro, SaaS
	API Adapter
	
Webhook
	Callback de parceiro
	Webhook Adapter
	
Event Streaming
	Parceiro/event bus
	Event Adapter
	
File/SFTP
	Integração legada
	File Adapter
	
Database/CDC
	Sistemas legados autorizados
	CDC Adapter
	
Payment Provider
	Gateway financeiro
	Provider Adapter
	
4. Integration Layer
Integrações externas deverão ser isoladas através de adapters e gateways apropriados.
Domain → Port → Integration Adapter → External System
O domínio não deverá conhecer detalhes de SDKs, URLs, formatos proprietários ou credenciais do fornecedor.
5. Provider Abstraction
Quando houver múltiplos fornecedores para a mesma capacidade, deverá existir uma interface comum.
PaymentProvider.
EmailProvider.
IdentityProvider.
StorageProvider.
MessagingProvider.
ShippingProvider.
A troca de provider deverá exigir alteração mínima no domínio.
6. External System Registry
A plataforma deverá manter um catálogo de integrações.
System ID.
Provider.
Purpose.
Owner.
Environment.
Contract/version.
Authentication method.
Data classification.
Criticality.
SLA/SLO.
Fallback.
Status.
7. Authentication
OAuth2/OIDC quando suportado.
API Keys somente quando necessárias e com rotação.
mTLS para integrações de alta criticidade quando aplicável.
HMAC/signatures para webhooks.
Secrets em Secret Manager.
Credenciais separadas por ambiente.
8. Data Exchange
Dados enviados a terceiros deverão respeitar classificação e minimização.
Somente dados necessários.
Contrato explícito.
Criptografia em trânsito.
Validação de schema.
Proteção de PII.
Controle de residência/transferência quando aplicável.
9. Resilience
Timeout obrigatório.
Retry com backoff.
Circuit breaker.
Bulkhead isolation.
Rate limiting.
Fallback quando suportado.
Dead Letter Queue para mensagens assíncronas.
10. Idempotency
Operações críticas com sistemas externos deverão possuir mecanismo de idempotência.
Idempotency-Key.
External transaction ID.
Deduplication store.
Reconciliação posterior quando a resposta externa for ambígua.
11. Ambiguous Outcomes
Quando um sistema externo não responder ou retornar timeout após uma operação potencialmente executada, a Trust não deverá assumir automaticamente que a operação falhou.
UNKNOWN → Reconciliation → CONFIRMED / FAILED
Esse princípio é especialmente importante para Payments, Orders e integrações financeiras.
12. Integration Events
Integrações assíncronas deverão seguir ARCH-001 e ARCH-002.
Event ID.
Version.
Correlation ID.
Timestamp.
Schema.
Retry.
DLQ.
Replay control.
13. Webhooks
Assinatura obrigatória quando suportada.
Validação de origem.
Timestamp/anti-replay.
Idempotência.
Retry.
Audit trail.
14. File Integrations
Integrações por arquivo deverão possuir:
Schema version.
File naming convention.
Checksum.
Encryption.
Delivery confirmation.
Duplicate detection.
Archive.
Error quarantine.
15. Legacy Systems
Sistemas legados deverão ser isolados através de adapters. A arquitetura interna da Trust não deverá reproduzir limitações do legado.
Anti-Corruption Layer.
Canonical internal model.
Transformation layer.
Legacy-specific retry.
16. External Dependencies and SLA
Criticality classification.
Provider SLA.
Expected latency.
Availability target.
Rate limits.
Support escalation.
Business continuity plan.
17. Observability
Provider latency.
Success/failure rate.
Timeouts.
Retry count.
Rate-limit errors.
Provider availability.
Correlation ID.
External transaction ID.
18. Security
External systems treated as untrusted.
Least privilege.
Network segmentation where appropriate.
Credential rotation.
Certificate management.
Payload validation.
Security event logging.
19. Reconciliation
Integrações críticas deverão possuir reconciliação quando o estado interno e externo puderem divergir.
Periodic reconciliation.
On-demand reconciliation.
Exception queue.
Manual investigation.
Financial reconciliation integration.
20. Business Continuity
Fallback provider quando economicamente e tecnicamente viável.
Queueing during temporary provider outage.
Manual operating procedure for critical processes.
Recovery runbook.
Provider exit strategy.
21. Vendor Lock-in
A Trust deverá minimizar lock-in através de abstrações, contratos internos e adapters.
Não expor modelos proprietários de provider ao domínio.
Manter IDs internos independentes.
Manter contratos internos canônicos.
Documentar dependências específicas.
22. AI & External Providers
Integrações com modelos de IA e provedores externos deverão seguir ARCH-007, incluindo model abstraction, data governance, auditability e provider controls.
23. Anti-Patterns Proibidos
SDK de terceiro diretamente no domínio.
Credenciais hardcoded.
Sem timeout.
Retry infinito.
Assumir sucesso/falha em timeout ambíguo.
Dependência de formato proprietário em toda a plataforma.
Webhook sem autenticação.
Ausência de reconciliação em integração financeira crítica.
24. Definition of Done
Integration contract definido.
Adapter implementado.
Authentication configurada.
Timeout e retry definidos.
Idempotência definida.
Observabilidade implementada.
Security review realizado.
Reconciliation definida quando necessária.
Runbook de falha disponível.
25. Decisão Arquitetural
A Trust Platform adotará uma Integration Layer baseada em Ports & Adapters, tratando sistemas externos como dependências não confiáveis e substituíveis. Integrações críticas deverão possuir autenticação forte, idempotência, resiliência, observabilidade e reconciliação.
26. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-004 — Observability & Monitoring
ARCH-005 — Security & Authorization
ARCH-008 — Data Architecture & Governance
ARCH-009 — API Architecture & Standards
ARCH-007 — AI Integration Architecture
27. Princípio Fundamental
O sistema externo pode mudar; o domínio da Trust não deve precisar mudar com ele.
