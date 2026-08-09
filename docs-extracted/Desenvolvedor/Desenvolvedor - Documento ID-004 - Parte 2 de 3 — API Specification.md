
ID-004 — API Specification
Parte 2 de 3
Module: Identity
Document ID: ID-004
Version: 1.0
Status: Approved for Development

11. Endpoint — Get Current Identity
URL
GET /api/v1/profile
Authentication:
Bearer Token obrigatório.

Request
Sem corpo.

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "john@example.com",
    "phone": "+5511999999999",
    "firstName": "John",
    "lastName": "Doe",
    "profilePhotoUrl": "https://...",
    "language": "en-US",
    "timezone": "America/Sao_Paulo",
    "country": "Brazil",
    "city": "Valinhos",
    "status": "ACTIVE"
  }
}

Possible Errors
Code
HTTP
UNAUTHORIZED
401
IDENTITY_NOT_FOUND
404

12. Endpoint — Update Current Identity
URL
PUT /api/v1/profile
Authentication:
Bearer Token obrigatório.

Request
{
  "firstName": "John",
  "lastName": "Doe",
  "language": "en-US",
  "timezone": "America/Sao_Paulo",
  "country": "Brazil",
  "city": "Valinhos",
  "profilePhotoUrl": "https://..."
}

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "updated": true
  }
}

Validation Rules
Field
Rule
firstName
Required
lastName
Required
language
ISO Language
timezone
Valid IANA Time Zone
country
Optional
city
Optional
profilePhotoUrl
Optional

13. Endpoint — Change Password
URL
POST /api/v1/profile/change-password
Authentication:
Bearer Token obrigatório.

Request
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}

Success Response
HTTP 204
Sem conteúdo.

Possible Errors
Code
HTTP
INVALID_PASSWORD
401
WEAK_PASSWORD
422

Business Rules
A senha atual deve ser validada.
A nova senha deve atender à política de segurança.
Todas as demais sessões poderão ser revogadas conforme configuração da plataforma.

14. Endpoint — Forgot Password
URL
POST /api/v1/auth/forgot-password
Authentication:
Não requerida.

Request
{
  "email": "john@example.com"
}

Success Response
HTTP 204
Sem conteúdo.

Business Rules
Se o e-mail existir, enviar instruções para redefinição.
A resposta deve ser a mesma mesmo quando o e-mail não existir, evitando enumeração de usuários.

15. Endpoint — Reset Password
URL
POST /api/v1/auth/reset-password
Authentication:
Não requerida.

Request
{
  "token": "reset-token",
  "newPassword": "NewPassword123!"
}

Success Response
HTTP 204
Sem conteúdo.

Possible Errors
Code
HTTP
INVALID_TOKEN
400
TOKEN_EXPIRED
400
WEAK_PASSWORD
422

16. Endpoint — List Active Sessions
URL
GET /api/v1/sessions
Authentication:
Bearer Token obrigatório.

Request
Sem corpo.

Success Response
HTTP 200
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "deviceName": "Windows Desktop",
      "browser": "Chrome",
      "operatingSystem": "Windows 11",
      "ipAddress": "192.168.1.100",
      "country": "Brazil",
      "city": "Valinhos",
      "lastActivity": "2026-08-03T14:25:00Z",
      "current": true
    }
  ]
}

17. Endpoint — Revoke Session
URL
DELETE /api/v1/sessions/{sessionId}
Authentication:
Bearer Token obrigatório.

Path Parameters
Parameter
Description
sessionId
UUID da sessão

Success Response
HTTP 204
Sem conteúdo.

Business Rules
O usuário poderá revogar qualquer uma de suas próprias sessões.
A sessão atual não poderá ser removida por este endpoint; para ela deverá ser utilizado o endpoint de logout.

18. Common Validation Errors
Code
Description
VALIDATION_ERROR
Dados inválidos
REQUIRED_FIELD
Campo obrigatório
INVALID_FORMAT
Formato inválido
RESOURCE_NOT_FOUND
Recurso inexistente
CONFLICT
Conflito de dados
UNAUTHORIZED
Usuário não autenticado
FORBIDDEN
Usuário sem permissão
