
Trust Platform MVP
Feature Specification
IDN-005 — Get Current Identity

Document Information
Campo
Valor
Feature ID
IDN-005
Feature Name
Get Current Identity
Module
Identity
Priority
Critical
Sprint
Sprint 1
Status
Ready for Development
Depends On
IDN-003 – Authenticate Identity
Blocks
Workspace MVP

1. Business Objective
Implementar a funcionalidade responsável por retornar as informações da Identity atualmente autenticada.
Esta será a principal API utilizada pelo frontend após o login para carregar os dados do usuário e inicializar a aplicação.
A API deverá retornar apenas informações públicas e necessárias para o funcionamento da plataforma.
Nenhuma informação sensível deverá ser retornada.

2. Scope
Esta Feature Inclui
Identificação da Identity autenticada
Consulta da Identity
Retorno das informações do perfil
Retorno do status da conta

Esta Feature NÃO Inclui
Atualização de perfil
Alteração de senha
Upload de foto
Trust Passport
Permissões detalhadas
Organizações

3. User Story
Como um usuário autenticado
Quero consultar meus dados
Para que a plataforma possa carregar meu perfil e personalizar minha experiência.

4. Business Rules
BR-001
Somente usuários autenticados poderão acessar esta API.

BR-002
O Access Token deverá ser obrigatório.

BR-003
A Identity deverá possuir status ACTIVE.

BR-004
A senha nunca poderá ser retornada.

BR-005
Nenhum hash poderá ser retornado.

BR-006
Nenhum Refresh Token poderá ser retornado.

BR-007
Nenhum dado interno utilizado apenas pelo backend poderá ser exposto.

5. Functional Flow
Frontend

↓

GET /api/v1/me

↓
JWT Authentication
↓
Extrair Identity ID
↓
Buscar Identity
↓
Montar Response
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar
GetCurrentIdentityUseCase
Responsabilidades
Validar Access Token.
Extrair Identity ID.
Buscar Identity.
Validar status ACTIVE.
Construir Response.
Retornar resultado.

6.2 Repository
Adicionar ao IdentityRepository
findCurrent(identityId)

6.3 DTOs
Criar
GetCurrentIdentityResponse

6.4 Mapper
Criar
IdentityResponseMapper
Responsabilidade
Converter a Entity Identity em Response DTO.

6.5 Exceptions
Criar
IdentityNotFoundException
UnauthorizedException

7. Database
Nenhuma alteração estrutural.
Utilizar a tabela
identities

8. API
Endpoint
GET /api/v1/me

Header obrigatório
Authorization: Bearer {accessToken}

Response
HTTP 200
{
  "success": true,
  "data": {
    "identityId": "UUID",
    "fullName": "John Doe",
    "email": "john@email.com",
    "status": "ACTIVE",
    "createdAt": "2026-08-03T10:00:00Z",
    "lastLoginAt": "2026-08-04T08:30:00Z"
  }
}

Possíveis Erros
401 Unauthorized
403 Identity Not Active
404 Identity Not Found
500 Internal Error

9. Frontend
Nenhuma nova página.
Após o login bem-sucedido, o frontend deverá:
Armazenar o Access Token.
Chamar automaticamente GET /api/v1/me.
Armazenar os dados da Identity.
Disponibilizar essas informações para toda a aplicação.
Os dados retornados deverão ser utilizados para:
Cabeçalho da aplicação
Menu do usuário
Configurações
Dashboard
Workspace

10. Logging
Registrar
Identity ID
Tempo de resposta
Resultado da consulta
Não registrar:
Access Token
Dados sensíveis

11. Eventos
Esta Feature não publica eventos.
Trata-se apenas de uma consulta.

12. Testes Unitários
Implementar testes para
Consulta válida
Token inválido
Token expirado
Identity inexistente
Identity inativa
Mapeamento do Response

13. Testes de Integração
Validar
JWT
Endpoint
Repository
Banco de dados
Response JSON

14. Acceptance Criteria
A Feature será considerada pronta quando
Apenas usuários autenticados conseguirem acessar a API.
Os dados da Identity forem retornados corretamente.
Nenhuma informação sensível for exposta.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
GetCurrentIdentityUseCase
IdentityResponseMapper
Atualização do IdentityRepository
DTO Response
Endpoint GET /api/v1/me
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
Todos os testes automatizados estiverem aprovados.
O endpoint retornar corretamente os dados da Identity autenticada.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
