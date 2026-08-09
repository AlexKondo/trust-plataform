
ID-004 — API Specification
Parte 3 de 3
Module: Identity
Document ID: ID-004
Version: 1.0
Status: Approved for Development

19. Endpoint — List Organizations
Retorna todas as organizações às quais a Identity autenticada pertence.
URL
GET /api/v1/organizations
Authentication:
Bearer Token obrigatório.

Success Response
HTTP 200
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "legalName": "Trust Tecnologia Ltda.",
      "tradeName": "Trust",
      "role": "OWNER",
      "status": "ACTIVE"
    }
  ]
}

20. Endpoint — Create Organization
URL
POST /api/v1/organizations
Authentication:
Bearer Token obrigatório.

Request
{
  "legalName": "Trust Tecnologia Ltda.",
  "tradeName": "Trust",
  "taxId": "12.345.678/0001-90",
  "country": "BR"
}

Success Response
HTTP 201
{
  "success": true,
  "data": {
    "organizationId": "uuid"
  }
}

Possible Errors
Code
HTTP
TAX_ID_ALREADY_EXISTS
409
INVALID_TAX_ID
422
VALIDATION_ERROR
422

21. Endpoint — Get Organization
URL
GET /api/v1/organizations/{organizationId}
Authentication:
Bearer Token obrigatório.

Path Parameters
Parameter
Description
organizationId
UUID da organização

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "id": "uuid",
    "legalName": "Trust Tecnologia Ltda.",
    "tradeName": "Trust",
    "taxId": "12.345.678/0001-90",
    "verificationStatus": "PENDING"
  }
}

22. Endpoint — List Memberships
Lista os membros de uma organização.
URL
GET /api/v1/organizations/{organizationId}/members
Authentication:
Bearer Token obrigatório.

Success Response
HTTP 200
{
  "success": true,
  "data": [
    {
      "identityId": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "role": "ADMIN",
      "status": "ACTIVE"
    }
  ]
}

23. Endpoint — Invite Member
URL
POST /api/v1/organizations/{organizationId}/members
Authentication:
Bearer Token obrigatório.

Request
{
  "email": "user@example.com",
  "role": "BUYER"
}

Success Response
HTTP 201
{
  "success": true,
  "data": {
    "membershipId": "uuid"
  }
}

Business Rules
Apenas usuários autorizados poderão convidar membros.
O e-mail informado deverá corresponder a uma Identity existente.
O convite criará um registro na tabela memberships com status inicial apropriado (por exemplo, PENDING).

24. Endpoint — Update Membership
URL
PUT /api/v1/organizations/{organizationId}/members/{membershipId}
Authentication:
Bearer Token obrigatório.

Request
{
  "role": "ADMIN",
  "status": "ACTIVE"
}

Success Response
HTTP 200
{
  "success": true,
  "data": {
    "updated": true
  }
}

25. Endpoint — Remove Member
URL
DELETE /api/v1/organizations/{organizationId}/members/{membershipId}
Authentication:
Bearer Token obrigatório.

Success Response
HTTP 204
Sem conteúdo.

Business Rules
O membro será removido da organização por exclusão lógica do vínculo (membership).
A Identity não será excluída da plataforma.

26. Pagination
Os endpoints que retornam coleções poderão suportar paginação.
Query Parameters
Parameter
Description
Default
page
Número da página
1
pageSize
Quantidade de registros
20

Paginated Response
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 135,
    "totalPages": 7
  }
}

27. Filtering
Os endpoints poderão suportar filtros por meio de parâmetros de consulta.
Exemplo:
GET /api/v1/organizations?status=ACTIVE

28. Sorting
Ordenação deverá utilizar os parâmetros:
sortBy
sortOrder
Exemplo:
GET /api/v1/organizations?sortBy=createdAt&sortOrder=desc
Valores aceitos para sortOrder:
asc
desc

29. Error Codes
Code
Description
VALIDATION_ERROR
Dados inválidos
INVALID_CREDENTIALS
Credenciais inválidas
UNAUTHORIZED
Não autenticado
FORBIDDEN
Sem permissão
RESOURCE_NOT_FOUND
Recurso não encontrado
CONFLICT
Conflito de dados
ACCOUNT_DISABLED
Conta desabilitada
ACCOUNT_LOCKED
Conta bloqueada
SESSION_EXPIRED
Sessão expirada
SESSION_REVOKED
Sessão revogada
INTERNAL_ERROR
Erro interno

30. API Versioning
A versão da API deverá ser identificada na URL.
Exemplo:
/api/v1/
Mudanças incompatíveis deverão ser publicadas em uma nova versão (por exemplo, /api/v2/), preservando compatibilidade com clientes existentes durante o período de transição.

31. Acceptance Criteria
A API será considerada implementada quando:
Todos os endpoints especificados estiverem disponíveis.
Todos os contratos de requisição e resposta forem respeitados.
Os códigos HTTP corresponderem à especificação.
As validações obrigatórias forem implementadas.
Os mecanismos de autenticação funcionarem conforme definido.
Os testes de integração forem aprovados.
A documentação permanecer sincronizada com a implementação.

32. Conclusion
Esta especificação define o contrato oficial da API do módulo Identity.
Qualquer alteração em endpoints, payloads, parâmetros ou códigos de resposta deverá resultar em atualização deste documento antes da implementação.
