
Trust Platform MVP
Feature Specification
TRS-018 — Trust Profile Verification Link

Document Information
Campo
Valor
Feature ID
TRS-018
Feature Name
Trust Profile Verification Link
Module
Trust Score
Priority
High
Sprint
Sprint 6
Status
Ready for Development
Depends On
TRS-017 – Share Trust Profile
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-019 – Revoke Shared Trust Profile

1. Business Objective
Permitir que qualquer pessoa ou organização valide a autenticidade de um Trust Profile compartilhado, garantindo que as informações visualizadas pertencem à plataforma Trust e não foram adulteradas.

2. Scope
Esta Feature Inclui
Validação pública de links compartilhados
Verificação de autenticidade
Validação de integridade
Exibição do status da verificação
Auditoria das consultas

Esta Feature NÃO Inclui
Compartilhamento do perfil
Alteração do perfil
Alteração das políticas de visibilidade
Revogação do link

3. User Story
Como terceiro interessado
Quero verificar se um Trust Profile compartilhado é autêntico
Para que eu possa confiar nas informações apresentadas antes de realizar uma negociação.

4. Business Rules
BR-001
A validação deverá ocorrer exclusivamente através de links emitidos pela plataforma.

BR-002
A plataforma deverá validar:
existência do link;
status do compartilhamento;
expiração;
integridade do token.

BR-003
Caso todas as validações sejam aprovadas, o perfil deverá ser identificado como:
Verified by Trust Platform

BR-004
Caso alguma validação falhe, o sistema deverá retornar uma mensagem informando que o perfil não pôde ser autenticado.

BR-005
Todas as verificações deverão ser registradas em auditoria.

5. Functional Flow
Usuário acessa Link
↓
Validar Token
↓
Validar Integridade
↓
Validar Expiração
↓
Validar Status
↓
Perfil Autêntico?
↓
SIM
↓
Exibir "Verified by Trust Platform"

↓
Registrar Auditoria
↓
HTTP 200
↓
NÃO
↓
HTTP 404 ou HTTP 410

6. Backend Implementation
6.1 Service
Criar:
TrustProfileVerificationService
Responsabilidades:
validar autenticidade do link;
validar integridade;
validar status;
produzir resultado da verificação.

6.2 Use Case
Criar:
VerifySharedTrustProfileUseCase

6.3 DTOs
Criar:
VerifyTrustProfileResponse
VerificationStatusResponse

6.4 Repository
Utilizar:
TrustProfileShareRepository

6.5 Exceptions
Criar:
InvalidTrustProfileShareException
ExpiredTrustProfileShareException
RevokedTrustProfileShareException

7. Database
Nenhuma alteração estrutural.

8. API
Endpoint
GET /public/trust-profile/{shareToken}/verify
Response
HTTP 200
{
  "verified": true,
  "status": "VALID",
  "message": "Verified by Trust Platform",
  "verifiedAt": "2026-08-03T15:30:00Z"
}

Possíveis Erros
404 Not Found
410 Gone

9. Logging
Registrar:
Share Token
Resultado da verificação
IP de origem
User-Agent
Correlation ID

10. Events
Publicar:
TrustProfile.Verified

11. Unit Tests
Implementar testes para:
validação de token;
validação de expiração;
validação de status;
retorno correto para links inválidos;
publicação de eventos.

12. Integration Tests
Validar:
endpoint público;
validação completa;
auditoria;
publicação do evento.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Links válidos forem autenticados corretamente.
Links expirados forem rejeitados.
Links revogados forem rejeitados.
Todas as consultas forem auditadas.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
TrustProfileVerificationService
VerifySharedTrustProfileUseCase
Endpoint de verificação
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A verificação pública estiver operacional.
Os resultados forem consistentes.
Todas as consultas forem auditadas.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
