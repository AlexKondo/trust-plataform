
Trust Platform MVP
Feature Specification
VRF-001 — Create Verification

Document Information
Campo
Valor
Feature ID
VRF-001
Feature Name
Create Verification
Module
Verification
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
TPS-001 – Create Trust Passport
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
VRF-002 – Submit Verification Evidence

1. Business Objective
Criar uma nova solicitação de verificação vinculada a um Trust Passport.
A verificação representa um processo formal de validação de um atributo de confiança, como documento de identidade, telefone, endereço, conta bancária, empresa, biometria ou outros tipos suportados pela plataforma.

2. Scope
Esta Feature Inclui
Criação de uma Verification
Associação ao Trust Passport
Definição do tipo de verificação
Inicialização do fluxo de verificação
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Envio de evidências
Revisão
Aprovação
Rejeição
Cálculo do Trust Score

3. User Story
Como um usuário com Trust Passport ativo
Quero iniciar uma nova verificação
Para que eu possa comprovar atributos da minha identidade e aumentar meu nível de confiança.

4. Business Rules
BR-001
Somente Trust Passports com status ACTIVE poderão iniciar verificações.

BR-002
O tipo da verificação deverá ser suportado pela plataforma.
Tipos iniciais:
DOCUMENT
PHONE
EMAIL
ADDRESS
BANK_ACCOUNT
BUSINESS
BIOMETRIC

BR-003
Não poderá existir mais de uma verificação ativa (PENDING, IN_REVIEW ou WAITING_FOR_EVIDENCE) para o mesmo Trust Passport e o mesmo tipo de verificação.

BR-004
Uma nova tentativa poderá ser criada após uma verificação ter sido concluída com status REJECTED, EXPIRED ou CANCELLED.

BR-005
Toda verificação deverá iniciar com status:
WAITING_FOR_EVIDENCE

BR-006
Cada verificação deverá possuir um identificador único e manter vínculo permanente com o Trust Passport, preservando o histórico de todas as tentativas.

5. Functional Flow
Usuário autenticado
↓
Seleciona tipo de verificação
↓

POST /api/v1/verifications

↓

Validar Trust Passport

↓
Validar tipo
↓
Verificar duplicidade
↓
Criar Verification
↓
Persistir
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate Root
Criar
Verification

Atributos
id

trustPassportId

type

status

providerId

currentAttempt

createdAt
updatedAt

6.2 Repository
Criar
VerificationRepository
Métodos mínimos
save()
findById()
findActiveByPassportAndType()
findByTrustPassportId()
existsActiveVerification()
update()

6.3 Use Case
Criar
CreateVerificationUseCase
Fluxo obrigatório
Validar autenticação.
Buscar Trust Passport.
Validar status do Passport.
Validar tipo de verificação.
Verificar existência de verificação ativa do mesmo tipo.
Criar Aggregate Verification.
Persistir.
Registrar auditoria.
Publicar evento.
Retornar resultado.

6.4 Domain Services
Criar
VerificationFactory
Responsável por inicializar corretamente uma nova Verification.

6.5 DTOs
Criar
CreateVerificationRequest
CreateVerificationResponse

6.6 Exceptions
Criar
VerificationAlreadyExistsException
UnsupportedVerificationTypeException
TrustPassportInactiveException

7. Database
Criar tabela
verifications

Campos
Campo
Tipo
id
UUID
trust_passport_id
UUID
type
VARCHAR
status
VARCHAR
provider_id
UUID NULL
current_attempt
INTEGER
created_at
TIMESTAMP
updated_at
TIMESTAMP

Constraints
PK(id)
FK(trust_passport_id)
Índice para (trust_passport_id, type, status)
A regra de unicidade para verificações ativas deverá ser garantida pela lógica de domínio e, quando possível, por restrições do banco de dados (como índices parciais, se suportados).

8. API
Endpoint
POST /api/v1/verifications

Header
Authorization: Bearer {accessToken}

Request
{
  "type": "DOCUMENT"
}

Response
HTTP 201
{
  "success": true,
  "data": {
    "verificationId": "UUID",
    "type": "DOCUMENT",
    "status": "WAITING_FOR_EVIDENCE"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
404 Trust Passport Not Found
409 Verification Already Exists
422 Unsupported Verification Type
500 Internal Server Error

9. Frontend
Na tela do Trust Passport, disponibilizar a ação "Iniciar Verificação".
Fluxo:
Exibir os tipos de verificação disponíveis.
Não permitir iniciar uma verificação já ativa do mesmo tipo.
Após a criação, redirecionar o usuário para o fluxo de envio de evidências.

10. Logging
Registrar:
Identity ID
Trust Passport ID
Verification ID
Tipo de verificação
Resultado
Correlation ID

11. Eventos
Publicar
Verification.Created
Payload mínimo
{
  "verificationId": "UUID",
  "trustPassportId": "UUID",
  "type": "DOCUMENT",
  "status": "WAITING_FOR_EVIDENCE",
  "createdAt": "2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para:
Criação válida
Tipo suportado
Tipo não suportado
Verificação ativa existente
Trust Passport inativo
Publicação do evento

13. Testes de Integração
Validar:
Endpoint
Persistência
Regra de unicidade
Auditoria
Publicação do evento

14. Acceptance Criteria
A Feature será considerada pronta quando:
Uma nova Verification puder ser criada para um Trust Passport ativo.
Não seja possível criar duas verificações ativas do mesmo tipo.
O status inicial seja WAITING_FOR_EVIDENCE.
O evento Verification.Created seja publicado.
Todos os testes automatizados sejam aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Migration verifications
Aggregate Verification
VerificationRepository
VerificationFactory
CreateVerificationUseCase
DTOs
Endpoint POST /api/v1/verifications
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
As regras de negócio forem respeitadas.
A integridade do domínio Verification estiver garantida.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
