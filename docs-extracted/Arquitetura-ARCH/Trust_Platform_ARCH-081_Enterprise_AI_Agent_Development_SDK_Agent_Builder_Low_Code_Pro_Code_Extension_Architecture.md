Trust Platform
ARCH-081 — Enterprise AI Agent Development SDK, Agent Builder & Low-Code/Pro-Code Extension Architecture
Architecture Standard • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-081
	
Document Name
	Enterprise AI Agent Development SDK, Agent Builder & Low-Code/Pro-Code Extension Architecture
	
Type
	Architecture Standard
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform AI Platform / Developer Platform / Product
	
Applies To
	Agent development SDK, Agent Builder, templates, tools, workflows, extensions, testing, packaging, publishing and tenant-private development
	
Depends On
	ENG-000, ARCH-041, ARCH-057, ARCH-078, ARCH-079, ARCH-080
	
1. Objetivo
Definir uma plataforma de desenvolvimento para criação de AI Agents e capabilities por equipes internas, parceiros e clientes autorizados, suportando low-code e pro-code sem permitir que extensibility bypass security, policy, governance ou tenant isolation.
2. Princípios
Build on governed platform primitives.
Low-code and pro-code share the same runtime controls.
Developer convenience never bypasses security.
Extensions declare permissions and dependencies.
Agent packages are versioned and immutable.
Testing is required before publishing.
Tenant-private development remains within the platform baseline.
Production credentials are never embedded in Agent code.
3. Development Lifecycle
Design → Build → Test → Evaluate → Package → Approve → Publish → Deploy → Monitor
4. Development Modes
Modo
	Perfil
	Uso
	
Low-Code
	Business/Power User
	Agent builder
	
Pro-Code
	Developer
	SDK/API
	
Hybrid
	Advanced team
	Builder + custom code
	
Private
	Customer team
	Tenant-specific Agent
	
5. Agent Builder
Agent template.
Instructions.
Tools.
Knowledge sources.
Policies.
Workflow steps.
Human approval.
Autonomy ceiling.
6. SDK
Agent SDK.
Tool SDK.
Workflow SDK.
Evaluation SDK.
Observability SDK.
Policy integration.
7. Agent Manifest
Agent ID.
Version.
Owner.
Capabilities.
Permissions.
Tools.
Models.
Data domains.
Risk tier.
Autonomy tier.
Dependencies.
8. Extension Model
Tool extension.
Workflow extension.
Connector.
Knowledge provider.
UI extension.
Event handler.
9. Permission Declaration
Read data.
Write data.
External action.
Tool invocation.
Financial action.
Administrative action.
10. Sandboxing
Isolated execution.
Resource quotas.
Network restrictions.
Filesystem restrictions.
Secret isolation.
Execution timeout.
11. Secrets
Secret references only.
Central secret manager.
Rotation.
No plaintext credentials.
12. Tool Development
Tool contract.
Input schema.
Output schema.
Permission scope.
Side-effect classification.
Idempotency.
13. Workflow Development
Steps.
State.
Transitions.
Timeout.
Retry.
Compensation.
Human approval.
14. Knowledge Development
Approved sources.
Retrieval configuration.
Access policy.
Freshness.
Provenance.
15. Testing
Unit tests.
Integration tests.
Agent evaluation.
Security tests.
Policy tests.
Tool tests.
Tenant isolation.
16. Evaluation
Golden datasets.
Regression.
Safety.
Quality.
Cost.
Latency.
17. Local Development
Mock tools.
Sandbox models.
Test tenant.
Test data.
No production credentials.
18. Environment Promotion
Dev → Test → Evaluation → Staging → Production
19. Package & Artifact
Immutable package.
Manifest.
Dependencies.
Checksums/signature.
Release notes.
20. Publishing
Automated validation.
Security review.
AI governance review where required.
Approval.
Marketplace publication.
21. Customer-Private Development
Tenant namespace.
Tenant data access.
Tenant policies.
Platform baseline.
Private publishing.
22. Pro-Code Extension APIs
Versioned SDK.
Stable interfaces.
Compatibility policy.
Deprecation.
Error model.
23. Low-Code Governance
Approved components.
Permission visibility.
Risk classification.
Validation before publish.
No hidden privileged actions.
24. AI Buyer Extensions
O AI Buyer deverá ser extensível por tools, policies, workflows e connectors, sem alterar o core de autonomy, authorization ou governance.
Category-specific tools.
Supplier connectors.
ERP connectors.
Approval workflows.
Procurement knowledge.
Custom policy rules.
25. AI Buyer Builder
Procurement Agent template.
Category scope.
Supplier scope.
Budget.
Approval thresholds.
Autonomy ceiling.
Allowed tools.
26. Extension Safety
Permission review.
Tool risk classification.
Data access review.
Side-effect review.
Evaluation.
Kill switch.
27. Developer Observability
Build logs.
Evaluation results.
Agent runs.
Tool calls.
Errors.
Policy denials.
28. Testing
SDK compatibility.
Sandbox escape.
Permission bypass.
Secret leakage.
Tenant isolation.
Tool abuse.
Agent regression.
29. Anti-Patterns Proibidos
Custom code bypassing policy engine.
Production secrets in Agent code.
Low-code component with hidden privileged action.
Publishing without evaluation.
Tenant-private Agent bypassing platform security baseline.
Direct database access from Agent extensions.
30. Definition of Done
Agent Builder defined.
SDK defined.
Manifest defined.
Extension model defined.
Sandbox defined.
Testing defined.
Publishing defined.
AI Buyer extension model defined.
31. Decisão Arquitetural
A Trust Platform oferecerá low-code e pro-code development paths sobre o mesmo governed Agent Runtime. Todas as extensões deverão declarar permissions, dependencies e side effects, passando pelos mesmos controls de security, policy, evaluation e governance.
32. Relação com AI Buyer
O AI Buyer será extensível sem perder sua governança central. Clientes poderão adicionar tools, connectors, policies e workflows específicos de procurement, mas não poderão modificar diretamente o autonomy enforcement, authorization boundary ou kill-switch controls.
33. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-041 — AI Agent Runtime, Tool Gateway & Agent Governance Architecture
ARCH-057 — Developer Platform, SDK, API Versioning & Extensibility Architecture
ARCH-078 — Enterprise AI Evaluation, Red Teaming, Safety & Model Risk Management Architecture
ARCH-079 — Enterprise AI Governance Operating Model, AI Risk Committee & Responsible AI Lifecycle Architecture
ARCH-080 — Enterprise AI Agent Marketplace, Capability Registry & Agent Lifecycle Architecture
34. Princípio Fundamental
Extensibilidade deve aumentar a capacidade da plataforma sem diminuir sua governabilidade: código, low-code, tools e workflows diferentes devem convergir para os mesmos limites de segurança, policy, avaliação e auditoria.
