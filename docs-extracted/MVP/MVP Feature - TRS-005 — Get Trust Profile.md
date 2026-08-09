
Trust Platform MVP
Feature Specification
TRS-005 — Get Trust Profile

Document Information
Campo
Valor
Feature ID
TRS-005
Feature Name
Get Trust Profile
Module
Trust Score
Priority
High
Sprint
Sprint 3
Status
Ready for Development
Depends On
TRS-004 – Determine Trust Level
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-006 – Get Trust Score History

1. Business Objective
Disponibilizar uma visão consolidada da reputação do usuário, reunindo informações de Trust Score, Trust Level, Trust Passport e indicadores relevantes para que o próprio usuário e sistemas autorizados compreendam seu estado atual de confiança.

2. Scope
Esta Feature Inclui
Consulta do Trust Score atual
Consulta do Trust Level
Consulta do percentual de completude do Trust Passport
Consulta dos atributos verificados
Consulta da data da última atualização
Registro de auditoria

Esta Feature NÃO Inclui
Histórico detalhado de eventos
Recalcular o Trust Score
Alteração de regras
Administração de níveis

3. User Story
Como usuário autenticado
Quero visualizar meu perfil de confiança
Para que eu entenda meu nível atual e acompanhe minha evolução.

4. Business Rules
BR-001
Cada usuário poderá consultar apenas o próprio Trust Profile, salvo perfis administrativos autorizados.

BR-002
O Trust Profile deverá representar o estado consolidado mais recente.

BR-003
As informações deverão ser obtidas de suas respectivas fontes oficiais:
Trust Score
Trust Passport
Verification (quando necessário)
Trust Level

BR-004
Este endpoint será somente leitura.
Nenhuma atualização de estado poderá ocorrer durante a consulta.

BR-005
Informações sensíveis (como evidências de verificação) não deverão ser retornadas.

5. Functional Flow
Usuário autenticado

↓

GET /api/v1/trust-profile

↓
Validar autorização
↓
Buscar Trust Score
↓
Buscar Trust Passport
↓
Consolidar dados
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar
GetTrustProfileUseCase
Fluxo obrigatório
Validar autenticação.
Localizar Trust Passport.
Buscar Trust Score.
Consolidar informações do perfil.
Registrar auditoria.
Retornar resposta.

6.2 Repositories
Utilizar:
TrustPassportRepository
TrustScoreRepository

6.3 DTOs
Criar
GetTrustProfileResponse
VerifiedAttributeResponse
TrustLevelResponse

6.4 Exceptions
Criar
TrustProfileNotFoundException
TrustProfileAccessDeniedException

7. Database
Nenhuma alteração estrutural.

8. API
Endpoint
GET /api/v1/trust-profile

Header
Authorization: Bearer {accessToken}

Response
HTTP 200
{
  "success": true,
  "data": {
    "trustScore": 742,
    "trustLevel": {
      "code": "GOLD",
      "name": "Gold"
    },
    "profileCompletion": 85,
    "verifiedAttributes": [
      "EMAIL",
      "PHONE",
      "DOCUMENT"
    ],
    "lastUpdatedAt": "2026-08-03T18:30:00Z"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
403 Forbidden
404 Trust Profile Not Found
500 Internal Server Error

9. Frontend
A tela deverá apresentar, no mínimo:
Trust Level em destaque.
Pontuação atual.
Barra de progresso de completude do perfil.
Lista de atributos verificados.
Data da última atualização.
A interface deverá permitir que futuras funcionalidades adicionem badges, benefícios e recomendações sem alterar o contrato principal da API.

10. Logging
Registrar:
Identity ID
Trust Passport ID
Trust Score ID
Resultado da consulta
Correlation ID

11. Eventos
Esta Feature não publica eventos de negócio.
O registro de acesso deverá ocorrer apenas por mecanismos de auditoria e observabilidade.

12. Testes Unitários
Implementar testes para:
Consulta válida
Perfil inexistente
Acesso negado
Consolidação correta dos dados
Registro da auditoria

13. Testes de Integração
Validar:
Endpoint
Autorização
Consolidação entre módulos
Auditoria

14. Acceptance Criteria
A Feature será considerada pronta quando:
Usuários autorizados puderem consultar o próprio Trust Profile.
O Trust Score e o Trust Level forem apresentados corretamente.
Apenas informações permitidas forem retornadas.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
GetTrustProfileUseCase
DTOs
Endpoint GET /api/v1/trust-profile
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
O Trust Profile for retornado de forma consistente.
As regras de autorização forem respeitadas.
Nenhuma informação sensível for exposta.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
