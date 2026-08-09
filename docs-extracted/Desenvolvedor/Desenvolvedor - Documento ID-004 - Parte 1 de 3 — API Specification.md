
ID-004 — API Specification
Parte 1 de 3
Module: Identity
Document ID: ID-004
Version: 1.0
Status: Approved for Development
Depends on:
ID-001 – Product Specification
ID-002 – Domain Model
ID-003 – Database Schema

1. Purpose
Este documento define a API do módulo Identity.
Seu objetivo é especificar os contratos entre clientes (Frontend, Mobile e integrações) e os serviços de backend.

2. API Style
A API deverá seguir o padrão REST.
Características:
Comunicação via HTTPS
Payload em JSON
UTF-8
Stateless
Versionamento por URL
Exemplo:
/api/v1/identities

3. Authentication
Os endpoints são classificados em:
Public
Não requer autenticação.
Exemplos:
Login
Registro
Recuperação de senha

Authenticated
Requer Bearer Token válido.
Exemplo:
Authorization: Bearer <access_token>

4. Standard Headers
Request
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>

Response
Content-Type: application/json

5. Standard Response
Success
{
  "success": true,
  "data": {}
}

Error
{
  "success": false,
  "error": {
    "code": "IDENTITY_NOT_FOUND",
    "message": "Identity not found."
  }
}

6. HTTP Status Codes
Status
Description
200
Success
201
Created
204
No Content
400
Bad Request
401
Unauthorized
403
Forbidden
404
Not Found
409
Conflict
422
Validation Error
429
Too Many Requests
500
Internal Server Error

7. Endpoint — Register Identity
URL
POST /api/v1/auth/register
Authentication:
Not required

Request
{
  "email": "john@example.com",
  "phone": "+5511999999999",
  "password": "MyPassword123!",
  "firstName": "John",
  "lastName": "Doe"
}

Validation Rules
Field
Rules
email
Required, valid, unique
phone
Required, unique
password
Required
firstName
Required
lastName
Required

Success Response
HTTP 201
{
  "success": true,
  "data": {
    "identityId": "uuid"
  }
}

Possible Errors
Code
HTTP
EMAIL_ALREADY_EXISTS
409
PHONE_ALREADY_EXISTS
409
INVALID_EMAIL
422
INVALID_PHONE
422
WEAK_PASSWORD
422

8. Endpoint — Login
URL
POST /api/v1/auth/login
Authentication:
Not required.

Request
{
  "email": "john@example.com",
  "password": "MyPassword123!"
}

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "token",
    "expiresIn": 3600
  }
}

Possible Errors
Code
HTTP
INVALID_CREDENTIALS
401
ACCOUNT_LOCKED
403
ACCOUNT_DISABLED
403

9. Endpoint — Refresh Token
URL
POST /api/v1/auth/refresh
Authentication:
Refresh Token.

Request
{
  "refreshToken": "token"
}

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "accessToken": "new-jwt",
    "expiresIn": 3600
  }
}

Possible Errors
Code
HTTP
INVALID_REFRESH_TOKEN
401
SESSION_EXPIRED
401
SESSION_REVOKED
401

10. Endpoint — Logout
URL
POST /api/v1/auth/logout
Authentication:
Bearer Token.

Request
Sem corpo.

Success Response
HTTP 204
Sem conteúdo.

Business Rule
A sessão atual deverá ser revogada, invalidando o respectivo Refresh Token.
