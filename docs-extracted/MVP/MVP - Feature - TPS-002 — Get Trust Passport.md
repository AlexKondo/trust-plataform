
Trust Platform MVP
Feature Specification
TPS-002 — Get Trust Passport

Document Information
Campo
Valor
Feature ID
TPS-002
Feature Name
Get Trust Passport
Module
Trust Passport
Priority
High
Sprint
Sprint 2
Status
Ready for Development
Depends On
TPS-001 – Create Trust Passport
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TPS-003 – Update Trust Passport

1. Business Objective
Permitir que um usuário autenticado consulte seu próprio Trust Passport, obtendo uma visão consolidada do estado atual de sua identidade confiável na plataforma.
Esta funcionalidade será utilizada pelo aplicativo, portal web e demais módulos da Trust Platform.

2. Scope
Esta Feature Inclui
Consulta do Trust Passport
Consulta do status geral
Consulta do percentual de completude
Consulta dos atributos verificados
Registro de auditoria

Esta Feature NÃO Inclui
Atualização do Passport
Trust Score detalhado
Histórico
Badges
Configurações de privacidade

3. User Story
Como um usuário autenticado
Quero visualizar meu Trust Passport
Para que eu acompanhe meu nível atual de confiança e o progresso das verificações.

4. Business Rules
BR-001
Somente usuários autenticados poderão consultar um Trust Passport.

BR-002
O usuário somente poderá consultar seu próprio Trust Passport, salvo perfis administrativos autorizados por política de acesso.

BR-003
Caso o Trust Passport ainda não exista, deverá ser retornado erro apropriado.

BR-004
O percentual de completude (profileCompletion) deverá ser calculado pelo domínio e refletir o estado atual dos atributos obrigatórios.

BR-005
A consulta não poderá alterar qualquer dado persistido.

5. Functional Flow
Usuário autenticado

↓

GET /api/v1/trust-passports/me

↓
Validar Access Token
↓
Obter Identity
↓
Localizar Trust Passport
↓
Montar DTO
↓
Registrar Auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar
GetTrustPassportUseCase
Fluxo obrigatório
Validar autenticação.
Obter Identity.
Buscar Trust Passport.
Montar DTO de resposta.
Registrar auditoria.
Retornar resultado.

6.2 Repository
Atualizar
TrustPassportRepository
Métodos
findByIdentityId()
existsByIdentityId()

6.3 DTOs
Criar
GetTrustPassportResponse

Estrutura do DTO
trustPassportId
identityId
status
profileCompletion

emailVerified

phoneVerified

documentVerified

addressVerified

createdAt

updatedAt

6.4 Exceptions
Criar
TrustPassportNotFoundException

7. Database
Nenhuma alteração estrutural.
Utilizar a tabela:
trust_passports

8. API
Endpoint
GET /api/v1/trust-passports/me

Header
Authorization: Bearer {accessToken}

Response
{
  "success": true,
  "data": {
    "trustPassportId": "UUID",
    "status": "ACTIVE",
    "profileCompletion": 35.0,
    "emailVerified": true,
    "phoneVerified": false,
    "documentVerified": false,
    "addressVerified": false,
    "createdAt": "2026-08-03T18:30:00Z",
    "updatedAt": "2026-08-03T18:30:00Z"
  }
}

Possíveis Erros
401 Unauthorized
404 Trust Passport Not Found
500 Internal Server Error

9. Frontend
Criar a tela:
/trust-passport
Apresentar:
Status do Passport
Percentual de completude
Lista de verificações
Indicadores visuais de verificação concluída ou pendente
Data da última atualização
A interface deverá permitir futura expansão para Trust Score, Badges e Reputação.

10. Logging
Registrar
Identity ID
Trust Passport ID
Resultado
Tempo de processamento
Correlation ID

11. Eventos
Nenhum evento deverá ser publicado, pois a operação é exclusivamente de leitura.

12. Testes Unitários
Implementar testes para
Passport existente
Passport inexistente
Usuário não autenticado
Mapeamento correto do DTO

13. Testes de Integração
Validar
Endpoint
Autenticação
Persistência
Resposta da API
Auditoria

14. Acceptance Criteria
A Feature será considerada pronta quando
O usuário autenticado conseguir consultar seu Trust Passport.
Apenas o próprio Passport puder ser consultado, salvo exceções autorizadas.
O DTO retornar todos os campos previstos.
Nenhum dado for alterado durante a consulta.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
GetTrustPassportUseCase
Atualização do TrustPassportRepository
DTOs
Endpoint GET /api/v1/trust-passports/me
Tela /trust-passport
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
O Trust Passport for retornado corretamente.
A autorização de acesso estiver validada.
Os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
