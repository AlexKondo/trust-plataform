Trust Platform
ARCH-016 — File & Document Management Architecture
Architecture Decision Record (ADR) • Version 1.0 • Status: Approved
Document Information
Document ID
	ARCH-016
	
Document Name
	File & Document Management Architecture
	
Type
	Architecture Decision Record (ADR)
	
Status
	Approved
	
Version
	1.0
	
Owner
	Trust Platform Engineering
	
Applies To
	Documentos, anexos, comprovantes, imagens, evidências e arquivos gerenciados pela Trust Platform
	
Depends On
	ENG-000, ARCH-005, ARCH-006, ARCH-008, ARCH-009, ARCH-015
	
1. Objetivo
Definir a arquitetura para upload, armazenamento, acesso, versionamento, classificação, processamento, retenção e exclusão de arquivos e documentos, garantindo segurança, rastreabilidade, escalabilidade e independência do storage provider.
2. Princípios
Object Storage by Default.
Metadata separated from binary content.
Secure by Default.
Private by Default.
Access controlled.
Content integrity.
Immutable evidence when required.
Lifecycle governed.
Provider abstraction.
3. Architecture
Client → File API → Metadata Service → Object Storage
             ↓
      Scan / Processing / Audit
O conteúdo binário deverá ficar em object storage; metadados e referências permanecerão no domínio proprietário.
4. File Domain
A capacidade transversal de File Management poderá manter:
File
FileVersion
FileMetadata
FileAccessGrant
FileProcessingJob
5. Metadata
Campo
	Obrigatório
	Observação
	
fileId
	Sim
	ID interno
	
ownerId
	Sim
	Proprietário
	
organizationId
	Quando aplicável
	Tenant
	
fileName
	Sim
	Nome original
	
contentType
	Sim
	MIME type
	
size
	Sim
	Bytes
	
checksum
	Sim
	Integridade
	
classification
	Sim
	Data classification
	
storageKey
	Sim
	Referência interna
	
version
	Sim
	Versão
	
createdAt
	Sim
	Timestamp
	
6. Upload Flow
Request Upload → Authorization → Signed Upload → Scan → Metadata → Available
Pre-signed URLs quando apropriado.
Upload direto para object storage.
Validação de tamanho e tipo.
Malware scanning.
Checksum validation.
Metadata registration.
7. Download Flow
Authenticate.
Authorize resource.
Generate controlled access URL.
Log access when required.
Expire URL.
URLs de acesso temporárias deverão ter validade limitada.
8. Security
Private buckets/storage.
Encryption at rest.
TLS in transit.
Least privilege.
Malware scanning.
Content type validation.
File size limits.
Access audit.
9. Authorization
A posse do arquivo não implica autorização universal.
Owner access.
Organization access.
Explicit grants.
Case-based access.
Role-based access.
Temporary access.
10. File Classification
Classe
	Exemplo
	Controle
	
Public
	Documento explicitamente público
	Acesso público controlado
	
Internal
	Arquivo operacional
	Autenticação
	
Confidential
	Contrato comercial
	Acesso restrito
	
Restricted
	Documento financeiro/PII sensível
	Criptografia + acesso rigoroso
	
11. Versioning
Cada alteração relevante cria FileVersion.
Versões anteriores poderão ser preservadas conforme policy.
Checksum por versão.
Audit trail.
Rollback quando necessário.
12. Immutable Evidence
Evidências de auditoria, compliance ou disputas poderão ser marcadas como imutáveis.
Retention lock.
Checksum.
Original timestamp.
Access audit.
No overwrite.
13. Document Processing
Processamentos assíncronos poderão incluir:
OCR.
Virus scan.
Metadata extraction.
Thumbnail generation.
Document classification.
Text extraction for search.
AI-assisted extraction, quando autorizado.
14. AI & Documents
Documentos poderão alimentar recursos de AI/RAG, respeitando permissões e classificação.
Authorization inherited from source.
Document version tracked.
Source reference retained.
Sensitive content filtered when required.
Processing provider governed.
15. Search Integration
Documentos elegíveis poderão ser indexados conforme ARCH-015.
Text extraction.
Metadata indexing.
Security trimming.
Reindex on version change.
Delete/tombstone on removal.
16. Retention & Lifecycle
Active → Archived → Retention Hold → Eligible for Deletion → Deleted
Retention policy por tipo.
Legal Hold.
Compliance retention.
Automatic lifecycle rules.
17. Deletion
Logical deletion quando necessário.
Physical deletion conforme retention policy.
Audit event.
Propagation to indexes/caches.
Recovery window quando aplicável.
18. File Integrity
Checksum.
Content length.
MIME validation.
Optional digital signature for critical evidence.
Integrity verification after processing.
19. Storage Provider Abstraction
O domínio não deverá depender diretamente do SDK do storage provider.
ObjectStorage interface.
Provider adapter.
Internal storage keys.
Provider-independent file IDs.
20. Large Files
Multipart upload.
Resumable upload.
Maximum size by use case.
Async processing.
Progress tracking.
21. Observability
Upload success/failure.
Download success/failure.
Processing latency.
Scan failures.
Storage errors.
File access events.
22. Privacy & LGPD
Minimize copies.
Access control.
Retention.
Deletion workflow.
Data subject rights when applicable.
International transfer controls.
23. Anti-Patterns Proibidos
Arquivos binários no banco transacional sem justificativa.
Bucket público por padrão.
URL permanente para documento privado.
Arquivo sem owner.
Arquivo sem classificação.
Documento crítico sem checksum.
AI acessando documentos sem autorização.
24. Definition of Done
Metadata model definido.
Storage abstraction implementada.
Upload/download seguro.
Malware scanning definido.
Authorization implementada.
Retention definida.
Audit trail implementado.
Search integration definida quando aplicável.
AI processing governed quando aplicável.
25. Decisão Arquitetural
A Trust Platform adotará object storage como padrão para conteúdo binário, separando arquivos de seus metadados transacionais. Acesso será privado e autorizado por padrão, com versionamento, integridade, lifecycle, auditoria e abstração do provider.
26. Documentos Relacionados
ENG-000 — Trust Engineering Principles
ARCH-005 — Security & Authorization
ARCH-006 — Audit & Compliance
ARCH-008 — Data Architecture & Governance
ARCH-009 — API Architecture & Standards
ARCH-015 — Search Architecture & Indexing
ARCH-007 — AI Integration Architecture
27. Princípio Fundamental
Um arquivo pode ser armazenado como binário, mas sua segurança, origem, integridade, versão e contexto são dados de negócio.
