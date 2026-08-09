
Trust Platform MVP
Feature Specification
VRF-002 — Submit Verification Evidence

Document Information
Campo
Valor
Feature ID
VRF-002
Feature Name
Submit Verification Evidence
Module
Verification
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
VRF-001 – Create Verification
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
VRF-003 – Review Verification

1. Business Objective
Permitir que o usuário envie as evidências necessárias para uma Verification.
As evidências poderão ser imagens, documentos, vídeos, arquivos PDF ou outros formatos suportados, conforme o tipo de verificação.
Após o envio bem-sucedido, a Verification deverá estar pronta para processamento automático e/ou revisão manual.

2. Scope
Esta Feature Inclui
Upload de evidências
Associação das evidências à Verification
Validação dos arquivos
Registro dos metadados
Alteração do status da Verification
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
OCR
Face Match
Revisão manual
Aprovação
Rejeição

3. User Story
Como um usuário com uma Verification ativa
Quero enviar as evidências solicitadas
Para que minha verificação possa ser analisada.

4. Business Rules
BR-001
Somente Verifications com status WAITING_FOR_EVIDENCE poderão receber novas evidências.

BR-002
Cada tipo de Verification deverá definir seus requisitos mínimos de evidências.
Exemplos:
DOCUMENT → frente e verso do documento
ADDRESS → comprovante de endereço
PHONE → código OTP
BIOMETRIC → selfie ou vídeo
BANK_ACCOUNT → comprovante bancário

BR-003
Todos os arquivos deverão passar por validação de:
formato
tamanho máximo
integridade
tipo MIME permitido

BR-004
Os arquivos deverão ser armazenados em repositório seguro, utilizando identificadores únicos.

BR-005
Após o envio de todas as evidências obrigatórias, o status da Verification deverá ser alterado para:
PENDING_REVIEW

BR-006
Caso ainda existam evidências obrigatórias pendentes, a Verification permanecerá em:
WAITING_FOR_EVIDENCE

5. Functional Flow
Usuário autenticado
↓
Seleciona Verification
↓
Upload das evidências
↓
POST /api/v1/verifications/{verificationId}/evidence
↓
Validar Verification
↓
Validar Arquivos
↓
Persistir Evidências
↓
Atualizar Status
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 201

6. Backend Implementation
6.1 Entity
Criar
VerificationEvidence

Atributos
id

verificationId

type

storageKey

fileName

mimeType
fileSize
checksum
uploadedAt

6.2 Repository
Criar
VerificationEvidenceRepository
Métodos mínimos
save()
findByVerification()
delete()
exists()

6.3 Use Case
Criar
SubmitVerificationEvidenceUseCase
Fluxo obrigatório
Validar autenticação.
Buscar Verification.
Validar status.
Validar arquivos.
Armazenar evidências.
Persistir metadados.
Verificar se todas as evidências obrigatórias foram enviadas.
Atualizar status da Verification.
Registrar auditoria.
Publicar evento.
Retornar resultado.

6.4 Services
Criar
EvidenceStorageService
EvidenceValidationService
Responsabilidades:
armazenamento seguro
validação dos arquivos
geração de checksum
remoção de arquivos, quando necessário

6.5 DTOs
Criar
SubmitVerificationEvidenceRequest
SubmitVerificationEvidenceResponse

6.6 Exceptions
Criar
InvalidEvidenceException

UnsupportedFileTypeException

EvidenceTooLargeException

VerificationNotWaitingForEvidenceException

7. Database
Criar tabela
verification_evidences

Campos
Campo
Tipo
id
UUID
verification_id
UUID
type
VARCHAR
storage_key
VARCHAR
file_name
VARCHAR
mime_type
VARCHAR
file_size
BIGINT
checksum
VARCHAR
uploaded_at
TIMESTAMP

Constraints
PK(id)
FK(verification_id)

Índices
Criar índices para:
verification_id
type

8. API
Endpoint
POST /api/v1/verifications/{verificationId}/evidence

Header
Authorization: Bearer {accessToken}

Content-Type
multipart/form-data

Response
HTTP 201
{
  "success": true,
  "data": {
    "verificationId": "UUID",
    "status": "PENDING_REVIEW"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
404 Verification Not Found
409 Invalid Verification Status
413 File Too Large
415 Unsupported Media Type
500 Internal Server Error

9. Frontend
A tela de Verification deverá:
Exibir os documentos obrigatórios.
Permitir upload múltiplo quando aplicável.
Exibir progresso do upload.
Validar tamanho e formato antes do envio.
Permitir substituir evidências enquanto a Verification estiver em WAITING_FOR_EVIDENCE.
Exibir confirmação após o envio.

10. Logging
Registrar:
Identity ID
Verification ID
Tipos de evidência enviados
Quantidade de arquivos
Resultado
Correlation ID
Nunca registrar conteúdo dos arquivos.

11. Eventos
Publicar
Verification.EvidenceSubmitted
Payload mínimo
{
  "verificationId": "UUID",
  "evidenceCount": 2,
  "status": "PENDING_REVIEW",
  "submittedAt": "2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para:
Upload válido
Arquivo inválido
Arquivo acima do limite
Tipo de arquivo não permitido
Atualização de status
Publicação do evento

13. Testes de Integração
Validar:
Endpoint
Upload dos arquivos
Persistência dos metadados
Armazenamento
Auditoria
Publicação do evento

14. Acceptance Criteria
A Feature será considerada pronta quando:
As evidências forem armazenadas corretamente.
Os metadados forem persistidos.
O status da Verification for atualizado conforme as regras.
O evento Verification.EvidenceSubmitted for publicado.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration verification_evidences
Entity VerificationEvidence
VerificationEvidenceRepository
EvidenceStorageService
EvidenceValidationService
SubmitVerificationEvidenceUseCase
DTOs
Endpoint POST /api/v1/verifications/{verificationId}/evidence
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
As evidências forem armazenadas com segurança.
As regras de validação forem respeitadas.
O status da Verification for atualizado corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
