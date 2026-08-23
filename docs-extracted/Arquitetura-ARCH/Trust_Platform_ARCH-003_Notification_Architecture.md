Trust Platform
ARCH-003 — Notification Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-003
	
Document Name
	Notification Architecture
	
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
Definir a arquitetura central de notificações da Trust Platform, permitindo que eventos de negócio sejam transformados em comunicações confiáveis, rastreáveis, configuráveis e multicanal, sem acoplamento entre os domínios de negócio e provedores de comunicação.
2. Motivação
Marketplace, Payments, Identity, Trust Score, Trust Economy, AI e demais módulos precisarão notificar usuários sobre eventos relevantes. Cada domínio não deverá implementar diretamente e-mail, push, SMS ou WhatsApp. Essa responsabilidade será centralizada em uma camada de Notifications.
A arquitetura deverá permitir adicionar ou trocar provedores de comunicação sem alterar os domínios produtores.
3. Princípios
Notificações são consequências de eventos de negócio, não responsabilidades dos domínios produtores.
Preferir comunicação assíncrona.
Suportar múltiplos canais através de uma abstração comum.
Permitir preferências e consentimentos por usuário.
Ser idempotente e auditável.
Permitir retry, fallback e DLQ.
Templates e conteúdo devem ser versionados.
Dados pessoais devem ser minimizados.
Comunicações críticas devem possuir rastreabilidade ponta a ponta.
4. Arquitetura de Referência
Domain Event → Notification Orchestrator → Notification Queue
                                  ↓
                 Template / Preference / Policy
                                  ↓
             Email | Push | SMS | WhatsApp | In-App
5. Notification Domain
Criar um bounded context próprio para notificações, responsável por orquestrar a entrega e manter seu estado operacional.
Notification
NotificationTemplate
NotificationPreference
NotificationDelivery
NotificationPolicy
6. Notification Orchestrator
O Notification Orchestrator será o componente responsável por receber eventos relevantes, determinar se uma notificação deve ser enviada, selecionar canais e criar as entregas.
Interpretar o evento de origem.
Aplicar NotificationPolicy.
Consultar preferências do destinatário.
Selecionar template e idioma.
Criar uma ou mais NotificationDelivery.
Publicar as entregas para processamento assíncrono.
7. Canais
Canal
	Uso
	Prioridade MVP
	
In-App
	Alertas dentro da plataforma
	Alta
	
E-mail
	Comunicações transacionais e operacionais
	Alta
	
Push
	Alertas rápidos
	Média
	
WhatsApp
	Comunicações transacionais, quando permitido
	Média
	
SMS
	Comunicações críticas/fallback
	Baixa
	
8. Abstração de Providers
Os canais deverão utilizar Ports & Adapters.
EmailProvider
PushProvider
SmsProvider
WhatsAppProvider
Exemplos de provedores poderão ser adicionados posteriormente sem alterar o domínio de Notifications.
9. Templates
Templates deverão ser entidades versionadas e independentes do código.
Template ID
Channel
Language
Version
Subject, quando aplicável
Body
Variables
Status
CreatedAt / UpdatedAt
O produto será desenvolvido inicialmente em português (pt-BR). A arquitetura deverá suportar internacionalização desde o início.
10. Preferências do Usuário
O usuário deverá poder controlar canais e categorias de comunicação quando legal e operacionalmente permitido.
Preferência por canal.
Preferência por categoria.
Idioma.
Horários permitidos, quando aplicável.
Opt-in/opt-out conforme legislação e finalidade.
Notificações obrigatórias de segurança, transação ou requisitos legais poderão seguir regras específicas e não necessariamente poderão ser desativadas.
11. Notification Policy
NotificationPolicy deverá determinar:
Se o evento gera notificação.
Quem deve receber.
Quais canais podem ser utilizados.
Prioridade.
Fallback.
Janela de envio.
Regras de deduplicação.
12. Delivery Lifecycle
CREATED → QUEUED → PROCESSING → SENT → DELIVERED
                         ↘ FAILED → RETRY → DLQ
13. Idempotência e Deduplicação
Uma mesma consequência de negócio não deverá gerar notificações duplicadas.
Utilizar chave derivada do evento e da finalidade da notificação.
Registrar eventId e notificationId.
Proteger canais contra reenvios indevidos.
Permitir reprocessamento controlado.
14. Retry, Fallback e DLQ
Retry exponencial para falhas transitórias.
Quantidade máxima configurável.
Fallback de canal somente quando definido pela policy.
Mensagens não processáveis devem ir para DLQ.
Reprocessamento deve ser auditável.
15. Prioridades
CRITICAL — segurança, fraude, autenticação e eventos financeiros críticos.
HIGH — transações, pedidos, pagamentos e disputas.
NORMAL — atualizações operacionais.
LOW — comunicações informativas e promocionais.
16. Segurança e Privacidade
Não armazenar credenciais de canais no domínio.
Proteger tokens e chaves dos providers.
Minimizar dados pessoais nos payloads.
Evitar conteúdo financeiro sensível em canais inadequados.
Registrar consentimento quando exigido.
Controlar acesso a templates e configurações administrativas.
17. Observabilidade
Registrar notificationId, eventId, recipientId, channel e provider.
Métricas de envio, entrega, falha, retry e latência.
Dashboards por canal e provider.
Tracing distribuído com correlationId.
Alertas para degradação de entrega.
18. Auditoria
Notificações transacionais e críticas deverão manter histórico suficiente para responder:
Qual evento originou a notificação?
Quem era o destinatário?
Qual canal foi utilizado?
Qual template e versão foram usados?
Quando foi enviada?
Quando foi entregue?
Qual provider processou?
Por que falhou, quando aplicável?
19. Eventos de Notifications
Notification.Created
Notification.Sent
Notification.Delivered
Notification.Failed
Notification.Suppressed
Esses eventos poderão alimentar Analytics, Observability, Customer Support e auditoria.
20. Anti-Patterns Proibidos
Marketplace enviando e-mail diretamente.
Payments chamando WhatsApp diretamente.
Template hardcoded em regra de negócio.
Dependência direta de SDK de provider dentro de domínio.
Envio síncrono como padrão.
Notificações sem idempotência.
Armazenamento de credenciais em código-fonte.
21. Aplicação aos Módulos Existentes
MarketplaceOrder.CustomerConfirmed → Notification Orchestrator → confirmação ao comprador/vendedor.
Payment.Authorized → notificação financeira quando aplicável.
Funds.Released / Funds.Settled → atualização ao vendedor.
FinancialCase.Opened → alerta ao responsável.
Trust Score atualizado → comunicação ao usuário quando houver regra de produto.
22. API
O MVP poderá expor APIs administrativas e de consulta, mas os domínios de negócio não deverão utilizar uma API de envio direto para substituir o fluxo orientado a eventos.
GET /api/v1/notifications/{notificationId}
GET /api/v1/users/{userId}/notification-preferences
PATCH /api/v1/users/{userId}/notification-preferences
23. Definition of Done
Canal implementado através de adapter.
Template versionado.
Policy definida.
Preferências respeitadas.
Idempotência implementada.
Retry e DLQ configurados.
Observabilidade implementada.
Auditoria implementada para notificações críticas.
Testes unitários, integração e contrato executados.
24. Decisão Arquitetural
A Trust Platform adotará um Notification Domain centralizado e orientado a eventos. Domínios de negócio publicarão fatos; o Notification Orchestrator determinará se, como, quando e por qual canal a comunicação deverá ser realizada.
A arquitetura deverá suportar português como idioma inicial e internacionalização futura sem alteração estrutural do domínio.
25. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-004 — Observability & Monitoring
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
26. Princípio Fundamental
Domínios produzem fatos. Notifications transforma fatos em comunicação confiável.
