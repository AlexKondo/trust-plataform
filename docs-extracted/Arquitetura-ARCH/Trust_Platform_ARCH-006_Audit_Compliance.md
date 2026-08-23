Trust Platform
ARCH-006 — Audit & Compliance
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-006
	
Document Name
	Audit & Compliance
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Compliance
	
Applies To
	Todos os módulos e serviços da Trust Platform
	
Depends On
	ENG-000, ARCH-001, ARCH-002, ARCH-004, ARCH-005
	
1. Objetivo
Definir a arquitetura oficial de auditoria, trilhas de evidência e controles de compliance da Trust Platform, garantindo que ações relevantes sejam rastreáveis, atribuíveis, protegidas contra alteração indevida e recuperáveis para investigação.
2. Princípios
Auditability by Default.
Imutabilidade para registros críticos.
Rastreabilidade ponta a ponta.
Segregação de funções.
Least Privilege.
Evidence First.
Privacy by Design.
Retenção orientada a risco e requisito legal.
Não repudiation quando tecnicamente aplicável.
3. Audit Domain
A Trust deverá possuir uma capacidade central de Audit & Compliance, sem retirar dos domínios a responsabilidade de produzir os eventos necessários para auditoria.
AuditEvent
AuditEvidence
ComplianceCase
RetentionPolicy
AuditAccessLog
4. O que deve ser auditado
Login, logout e alterações de autenticação.
Criação, alteração e revogação de permissões.
Operações financeiras críticas.
Criação e alteração de pedidos.
Alterações de dados sensíveis.
Disputas e Financial Cases.
Reembolsos, liberações e distribuições.
Alterações de políticas.
Ações administrativas.
Uso de ferramentas por AI Agents.
Alterações de configuração relevantes.
5. Audit Event
Um Audit Event representa uma ação ou mudança relevante para segurança, compliance ou investigação.
Campo
	Tipo
	Obrigatório
	
auditEventId
	UUID
	Sim
	
eventType
	String
	Sim
	
occurredAt
	Timestamp
	Sim
	
actorType
	String
	Sim
	
actorId
	String
	Sim
	
organizationId
	UUID
	Quando aplicável
	
resourceType
	String
	Sim
	
resourceId
	String
	Sim
	
action
	String
	Sim
	
result
	String
	Sim
	
correlationId
	String
	Sim
	
metadata
	JSON
	Quando necessário
	
6. Actor Types
USER
ADMIN
SERVICE
SYSTEM
AI_AGENT
EXTERNAL_PARTNER
7. Imutabilidade
Registros de auditoria críticos não poderão ser alterados ou excluídos por usuários operacionais.
Storage append-only quando possível.
Controle de acesso restritivo.
Hash chaining ou assinatura digital poderá ser utilizada para evidências de alta criticidade.
Correções devem gerar novo evento, nunca sobrescrever o evento original.
8. Audit Trail vs Application Logs
Logs operacionais e Audit Trail são conceitos diferentes.
Logs ajudam a operar e diagnosticar sistemas.
Audit Trail prova quem fez o quê, quando, em qual recurso e com qual resultado.
Logs podem ter retenção operacional menor.
Audit Records críticos devem seguir política própria de retenção e proteção.
9. Evidências
Casos de compliance ou investigação poderão possuir evidências associadas.
Documentos.
Imagens.
Registros de comunicação.
Referências de transação.
Decisões administrativas.
Logs selecionados.
Eventos financeiros.
Evidências devem possuir hash, origem, timestamp e controle de acesso quando necessário.
10. Compliance Cases
O domínio de Compliance poderá reutilizar o conceito de FinancialCase, mas deverá possuir casos específicos quando o contexto não for financeiro.
ComplianceCase
FraudCase
PrivacyCase
SecurityIncident
A arquitetura deverá evitar duplicação de mecanismos de workflow, histórico e evidências quando os domínios possuírem necessidades semelhantes.
11. Segregação de Funções
Quem solicita uma operação crítica não deve necessariamente ser quem a aprova.
Operações administrativas sensíveis podem exigir dupla aprovação.
Auditores não devem possuir permissões operacionais desnecessárias.
Agentes de IA não podem aprovar sozinhos ações de alto risco quando houver exigência de human-in-the-loop.
12. Financial Audit
O módulo financeiro deverá manter rastreabilidade entre:
Payment → Custody → Release → Settlement → Refund / Distribution → Ledger → Reconciliation
Cada etapa crítica deverá possuir referências cruzadas suficientes para reconstrução da transação.
13. Audit Access
O acesso aos próprios registros de auditoria também deverá ser auditado.
Quem consultou.
Quando consultou.
Qual recurso consultou.
Finalidade, quando exigida.
Resultado do acesso.
14. Retenção
As políticas de retenção deverão considerar criticidade, finalidade, requisitos contratuais, regulatórios e legais.
Não utilizar uma única retenção para todos os dados.
Definir retention owner.
Documentar período e justificativa.
Executar descarte seguro quando permitido.
Preservar evidências sujeitas a investigação ou legal hold.
15. Legal Hold
Quando uma investigação exigir preservação de registros, o mecanismo de Legal Hold deverá impedir sua eliminação enquanto a retenção extraordinária estiver ativa.
16. LGPD
Minimizar dados pessoais em auditoria.
Definir finalidade.
Controlar acesso.
Aplicar retenção adequada.
Permitir tratamento de solicitações relacionadas a titulares conforme requisitos legais.
Não utilizar auditoria como justificativa para retenção ilimitada.
17. AI Auditability
Decisões relevantes tomadas ou apoiadas por IA deverão ser auditáveis.
Agent ID.
Model/version quando aplicável.
Prompt ou referência segura ao contexto.
Ferramentas utilizadas.
Inputs relevantes.
Output/decision.
Human approval quando aplicável.
Timestamp.
Correlation ID.
Dados sensíveis deverão seguir as mesmas regras de minimização e proteção aplicáveis ao restante da plataforma.
18. Audit Events e Event Architecture
A publicação de eventos de domínio definida em ARCH-001 e ARCH-002 deverá permitir que o Audit Domain construa sua trilha sem acoplamento direto aos bancos dos demais domínios.
19. Compliance Controls
Controle de acesso.
Segregação de funções.
Due diligence quando aplicável.
Monitoramento de operações de risco.
Gestão de evidências.
Gestão de incidentes.
Revisão periódica de permissões.
20. Anti-Patterns Proibidos
Alterar ou apagar audit records para corrigir informação.
Guardar evidência crítica apenas em logs temporários.
Permitir que administradores operacionais apaguem seus próprios rastros.
Auditoria sem actorId.
Auditoria sem timestamp.
Auditoria sem identificação do recurso.
Usar dados pessoais excessivos sem finalidade.
21. Definition of Done
Audit events definidos para operações críticas.
Actor e resource identificados.
Imutabilidade implementada para registros críticos.
Retenção definida.
Controle de acesso implementado.
Acesso aos audit records auditado.
Evidências protegidas quando aplicável.
Testes de auditoria executados.
22. Decisão Arquitetural
A Trust Platform adotará Audit & Compliance como capacidade transversal. Os domínios deverão produzir fatos e metadados suficientes para auditoria, enquanto a camada central manterá trilhas e evidências críticas com proteção adequada, retenção definida e acesso controlado.
23. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-004 — Observability & Monitoring
ARCH-005 — Security & Authorization
PAY-008 — Financial Ledger
PAY-009 — Financial Case Management
PAY-010 — Financial Reconciliation
24. Princípio Fundamental
Se uma ação importante não pode ser reconstruída, a plataforma não possui confiança suficiente sobre o que aconteceu.
