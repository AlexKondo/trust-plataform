Trust Platform
ARCH-008 — Data Architecture & Governance
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-008
	
Document Name
	Data Architecture & Governance
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering / Data
	
Applies To
	Todos os módulos e serviços da Trust Platform
	
Depends On
	ENG-000, ARCH-001, ARCH-002, ARCH-004, ARCH-005, ARCH-006, ARCH-007
	
1. Objetivo
Definir os princípios para arquitetura, ownership, armazenamento, integração, qualidade, governança, segurança e uso analítico dos dados da Trust Platform, garantindo que os dados sejam tratados como ativos de negócio sem comprometer o isolamento dos domínios.
2. Princípios
Data Ownership by Domain.
Single Source of Truth por domínio.
Data as a Product para dados analíticos compartilhados.
Privacy by Design.
Security by Default.
Schema First.
Data Quality by Default.
Lineage and Traceability.
Minimize Duplication; tolerate purposeful denormalization.
3. Data Ownership
Cada bounded context é proprietário dos dados de seu domínio.
Marketplace é owner dos dados de pedidos e transações de marketplace.
Payments é owner dos dados financeiros operacionais.
Identity é owner de identidade e acesso.
Trust Score é owner de seus modelos e resultados.
Audit é owner de registros de auditoria.
Analytics não deverá alterar dados operacionais de origem.
4. Database per Domain
Serviços não deverão acessar diretamente tabelas pertencentes a outro domínio.
Cada domínio possui seu storage lógico.
Integração ocorre por API, eventos ou produtos de dados autorizados.
Compartilhamento de banco somente por exceção arquitetural formal.
5. Polyglot Persistence
A tecnologia de armazenamento deverá ser escolhida conforme o padrão de acesso e o domínio.
Relational DB para transações consistentes.
Document store quando estrutura flexível justificar.
Cache para baixa latência.
Object storage para documentos e evidências.
Search index para pesquisa.
Event/stream storage para fluxos de eventos.
Analytical warehouse/lakehouse para analytics.
6. Operational vs Analytical Data
Dados operacionais e analíticos terão responsabilidades distintas.
OLTP para operações de negócio.
OLAP/Lakehouse para análises.
Analytics não deverá consultar bancos transacionais críticos diretamente em alta escala.
Dados analíticos deverão possuir lineage até a origem.
7. Data Platform
Operational Domains → Events / CDC → Data Platform → Warehouse/Lakehouse → BI / AI
A plataforma analítica poderá consumir eventos e mecanismos de captura autorizados sem criar dependência inversa dos domínios operacionais.
8. Data Contracts
Dados compartilhados entre domínios deverão possuir contratos explícitos.
Schema.
Owner.
Version.
Definition.
Data classification.
Freshness expectation.
Quality rules.
Consumers.
9. Data Classification
Classe
	Exemplo
	Controle
	
Public
	Dados públicos da plataforma
	Controle básico
	
Internal
	Dados operacionais internos
	Acesso autenticado
	
Confidential
	Dados comerciais e operacionais sensíveis
	Acesso restrito
	
Restricted
	PII sensível, credenciais, dados financeiros críticos
	Criptografia + acesso rigoroso
	
10. Data Quality
Dados críticos deverão possuir regras de qualidade.
Completeness.
Accuracy.
Consistency.
Uniqueness.
Timeliness.
Validity.
Falhas críticas de qualidade deverão ser observáveis e, quando necessário, gerar Data Quality Cases.
11. Master Data
Entidades compartilhadas deverão possuir owner formal e definição canônica.
User / Identity.
Organization.
Product/Service quando aplicável.
Currency.
Country.
Category.
Payment Method.
Domínios consumidores não deverão criar versões conflitantes de master data sem justificativa.
12. Data Lineage
Dados analíticos críticos deverão permitir rastrear sua origem e transformações.
Source → Event/CDC → Transformation → Dataset → Metric → Decision
13. Data Retention
Cada domínio deve definir políticas de retenção.
Dados financeiros, auditoria e PII terão políticas próprias.
Retenção não deve ser indefinida por padrão.
Legal Hold deverá prevalecer quando aplicável.
Eliminação deve ser segura e auditável.
14. Privacy & LGPD
Minimização.
Finalidade.
Controle de acesso.
Pseudonimização quando apropriado.
Anonimização para analytics quando possível.
Gestão de consentimento quando aplicável.
Controle de transferência internacional.
15. Data Access
Least Privilege.
Access policies por domínio.
Service Accounts com escopo mínimo.
Auditoria de acessos sensíveis.
Separação entre leitura operacional e analytics.
16. Data Migration
Migrações deverão ser planejadas, versionadas e reversíveis quando tecnicamente possível.
Schema migrations versionadas.
Backward compatibility durante transição.
Data validation pós-migração.
Plano de rollback ou recovery.
Auditoria das mudanças críticas.
17. Backup & Recovery
Backups automatizados.
Criptografia.
Testes periódicos de restore.
RPO/RTO definidos para dados críticos.
Backups isolados do ambiente principal.
18. Data for AI
Dados utilizados por IA deverão respeitar ownership, classificação, autorização e lineage.
AI não deve acessar dados indiscriminadamente.
Retrieval deve respeitar permissões do usuário/agent.
Dados usados em treinamento/fine-tuning devem possuir autorização e governança.
Prompts e outputs não devem se tornar armazenamento informal de dados sensíveis.
19. Data Products
Quando dados de um domínio forem utilizados amplamente por Analytics, AI ou outros consumidores, poderão ser publicados como Data Products.
Owner.
Schema.
Documentation.
Quality SLA.
Freshness SLA.
Access policy.
Lineage.
20. Analytics & Metrics Governance
Métricas de negócio críticas deverão possuir definição única.
Nome.
Definição.
Fórmula.
Owner.
Fonte.
Periodicidade.
Dimensões permitidas.
Isso evita múltiplas versões de métricas como GMV, settlement rate, refund rate, active users ou Trust Score.
21. Anti-Patterns Proibidos
Banco compartilhado entre domínios sem ADR.
Analytics consultando tabelas transacionais em escala sem camada adequada.
PII replicada sem finalidade.
Dados sem owner.
Dataset sem definição.
Alteração manual de dados produtivos sem trilha de auditoria.
Modelo de IA acessando dados sem autorização.
22. Definition of Done
Data owner definido.
Classificação definida.
Schema documentado.
Access policy definida.
Retention definida.
Quality rules definidas para dados críticos.
Backup/recovery definidos.
Lineage definido para dados analíticos.
Auditoria implementada para acesso sensível.
23. Decisão Arquitetural
A Trust Platform adotará Data Ownership por domínio, isolamento de armazenamento operacional, contratos explícitos para dados compartilhados e uma camada analítica desacoplada. Dados críticos deverão possuir classificação, owner, qualidade, retenção, segurança e lineage definidos.
24. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-001 — Event-Driven Architecture
ARCH-002 — Domain Events Standard
ARCH-004 — Observability & Monitoring
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-007 — AI Integration Architecture
25. Princípio Fundamental
Dados têm dono, propósito, qualidade e ciclo de vida; não são propriedade de nenhum serviço por acaso.
