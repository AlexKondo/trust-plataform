Trust Platform
ARCH-020 — Notification & Communication Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-020
	
Document Name
	Notification & Communication Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Notificações in-app, e-mail, SMS, push, webhooks e futuras integrações de comunicação
	
Depends On
	ENG-000, ARCH-001, ARCH-002, ARCH-005, ARCH-009, ARCH-010, ARCH-019
	
1. Objetivo
Definir uma arquitetura de comunicação desacoplada para entregar notificações e mensagens transacionais de forma confiável, observável, segura e configurável, permitindo múltiplos canais e provedores sem acoplamento dos domínios de negócio.
2. Princípios
Notification is an asynchronous capability.
Domain services emit business events; Notification decides delivery.
Provider abstraction.
At-least-once delivery with idempotent processing.
User preference and consent aware.
Critical notifications require stronger delivery guarantees.
Do not expose sensitive information unnecessarily.
Every delivery should be observable.
3. Architecture
Domain Event → Notification Orchestrator → Template → Channel Adapter → Provider → User
O domínio não deverá chamar diretamente provedores de e-mail, SMS ou push para eventos normais de negócio.
4. Notification Types
Tipo
	Exemplo
	Tratamento
	
Transactional
	Pagamento aprovado
	Alta prioridade
	
Operational
	Pedido atualizado
	Normal
	
Security
	Login suspeito
	Alta prioridade
	
Compliance
	Documento pendente
	Controlado
	
Marketing
	Campanha
	Consentimento/preferences
	
System
	Manutenção
	Platform controlled
	
5. Channels
In-App.
E-mail.
Push notification.
SMS.
WhatsApp ou canais externos quando legal e tecnicamente apropriado.
Webhook para sistemas parceiros.
6. Channel Abstraction
Cada canal deverá possuir adapter/provider abstraction.
EmailProvider.
SmsProvider.
PushProvider.
WebhookProvider.
A substituição do provider não deverá exigir alterações nos domínios.
7. Notification Event
Evento interno de notificação deverá conter:
notificationId.
eventType.
recipient.
organizationId quando aplicável.
templateId.
priority.
channel policy.
correlationId.
createdAt.
8. Templates
Templates serão artefatos versionados.
Template ID.
Version.
Language.
Channel.
Variables schema.
Owner.
Approval status.
9. Localization
O produto será desenvolvido inicialmente em português (pt-BR). A arquitetura deverá permitir múltiplos idiomas.
Locale per user.
Fallback locale.
Template per language.
Date/number/currency localization.
Future support for English and other languages.
10. User Preferences
Channel preferences.
Notification categories.
Quiet hours quando aplicável.
Frequency controls.
Marketing consent.
Security notifications cannot be silently disabled when legally/operationally required.
11. Delivery Semantics
A plataforma deverá preferir at-least-once processing, com idempotência para evitar duplicações.
Retry.
Deduplication.
DLQ.
Provider message ID.
Delivery status.
12. Priority
Prioridade
	Exemplo
	SLA conceitual
	
Critical
	Security/payment issue
	Immediate/best effort high priority
	
High
	Order/payment update
	Minutes
	
Normal
	Operational notification
	Minutes-hours
	
Low
	Digest/non-critical
	Batch permitted
	
13. Retry Strategy
Exponential backoff.
Maximum attempts.
Provider-specific retry policy.
Do not retry permanent failures.
DLQ after exhaustion.
14. Provider Failover
Quando tecnicamente e economicamente viável, canais críticos poderão possuir provider alternativo.
Primary provider.
Secondary provider.
Health monitoring.
Controlled failover.
Reconciliation of delivery status.
15. Webhooks
Webhooks outbound seguirão ARCH-010.
Signature.
Retry.
Idempotency.
Delivery log.
Endpoint health.
16. Security
Do not include sensitive data unnecessarily.
Signed links for private documents.
Template injection protection.
Secret management.
Provider credentials isolated.
Access to notification history controlled.
17. Privacy & Consent
Purpose limitation.
Consent where required.
Opt-out handling.
Retention of delivery records.
Data minimization.
Audit of preference changes.
18. Notification History
A plataforma poderá manter histórico de notificações para permitir troubleshooting e experiência do usuário.
Notification status.
Channel.
Provider.
Timestamp.
Delivery result.
Read/seen status when supported.
19. Observability
Queued.
Sent.
Delivered.
Failed.
Bounced.
Opened/read when available.
Provider latency.
Retry count.
DLQ count.
20. Rate Limiting & Cost
Envio deverá respeitar ARCH-019.
Per-user limits.
Per-tenant limits.
Provider limits.
Cost controls.
Anti-spam protection.
21. AI-Generated Notifications
IA poderá gerar ou personalizar conteúdo apenas em casos autorizados.
Template/policy remains authoritative.
Sensitive data controls.
Human approval for high-risk communications when appropriate.
Audit of AI-generated content.
Fallback to deterministic template.
22. Failure Modes
Provider unavailable → retry/failover.
Template unavailable → fallback template.
Preference service unavailable → safe default according to policy.
Notification service unavailable → queue when possible.
Permanent delivery failure → DLQ/case.
23. Testing
Template rendering.
Localization.
Provider integration.
Retry.
Duplicate prevention.
Failover.
Preference enforcement.
Security notification delivery.
24. Anti-Patterns Proibidos
Domínio chamando SDK de e-mail diretamente.
Mensagem sem template/version.
Sem retry ou DLQ.
Enviar marketing sem preference/consent control.
PII excessiva na mensagem.
AI enviando comunicação crítica sem policy.
25. Definition of Done
Event contract definido.
Template versionado.
Channel adapter implementado.
Preference model definido.
Retry/DLQ implementados.
Provider abstraction implementada.
Observabilidade implementada.
Security/privacy review concluído.
26. Decisão Arquitetural
A Trust Platform adotará uma Notification Platform assíncrona, orientada a eventos, com templates versionados, preferências por usuário, abstração de providers, retry/idempotência, observabilidade e suporte inicial em português (pt-BR), preparada para múltiplos canais e idiomas.
27. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-005 — Security & Authorization
ARCH-009 — API Architecture & Standards
ARCH-010 — Integration Architecture & External Systems
ARCH-019 — Rate Limiting, Quotas & Abuse Prevention
ARCH-007 — AI Integration Architecture
28. Princípio Fundamental
O domínio informa o que aconteceu; a Notification Platform decide como, quando e por qual canal comunicar.
