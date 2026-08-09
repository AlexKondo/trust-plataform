
Trust Platform MVP
Feature Specification
TRS-020 — Get Trust Profile Access History

Document Information
Campo
Valor
Feature ID
TRS-020
Feature Name
Get Trust Profile Access History
Module
Trust Score
Priority
Medium
Sprint
Sprint 6
Status
Ready for Development
Depends On
TRS-019 – Revoke Shared Trust Profile
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
End of Trust Score Module

1. Business Objective
Permitir que o proprietário de um Trust Profile visualize o histórico completo de acessos realizados por meio dos links de compartilhamento, garantindo transparência, rastreabilidade e maior controle sobre a exposição de suas informações.

2. Scope
Esta Feature Inclui
Consulta do histórico de acessos
Paginação dos registros
Filtros por período
Filtros por link compartilhado
Ordenação cronológica
Auditoria da consulta

Esta Feature NÃO Inclui
Exclusão do histórico
Alteração dos registros
Compartilhamento do histórico
Exportação dos registros

3. User Story
Como proprietário do Trust Profile
Quero consultar o histórico de acessos aos meus links compartilhados
Para que eu saiba quando, por quem e quantas vezes meu perfil foi visualizado.

4. Business Rules
BR-001
Somente o proprietário do Trust Profile poderá consultar seu histórico.

BR-002
Cada acesso deverá registrar, no mínimo:
Link utilizado
Data e hora
Endereço IP
User-Agent
Resultado do acesso

BR-003
O histórico deverá permanecer disponível mesmo para links expirados ou revogados.

BR-004
Os registros deverão ser ordenados do mais recente para o mais antigo.

BR-005
A consulta deverá suportar paginação.

BR-006
Nenhum registro poderá ser alterado ou excluído por usuários.

5. Functional Flow
Usuário autenticado
↓
Solicita histórico
↓
Validar propriedade
↓
Buscar registros
↓
Aplicar filtros
↓
Ordenar resultados
↓
Paginar
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Criar:
TrustProfileAccessLog
Atributos mínimos
id

shareId

identityId

accessedAt

ipAddress
userAgent
status
correlationId
createdAt

6.2 Repository
Criar:
TrustProfileAccessLogRepository
Métodos mínimos:
save()
findByIdentity()
findByShare()
findByPeriod()
findPaged()

6.3 Use Case
Criar:
GetTrustProfileAccessHistoryUseCase

6.4 DTOs
Criar:
TrustProfileAccessHistoryResponse
TrustProfileAccessLogResponse

6.5 Exceptions
Criar:
TrustProfileAccessHistoryNotFoundException
UnauthorizedAccessHistoryException

7. Database
Criar tabela:
trust_profile_access_logs
Campos
Campo
Tipo
id
UUID
share_id
UUID
identity_id
UUID
accessed_at
TIMESTAMP
ip_address
VARCHAR(45)
user_agent
VARCHAR(1000)
status
VARCHAR(30)
correlation_id
UUID
created_at
TIMESTAMP
Constraints
PK(id)
FK(share_id)
FK(identity_id)
Índices
Criar índices para:
identity_id
share_id
accessed_at
status

8. API
Endpoint
GET /api/v1/trust-profile/access-history
Query Parameters
Parâmetro
Obrigatório
Descrição
page
Não
Página
size
Não
Quantidade de registros
shareId
Não
Filtrar por link
startDate
Não
Data inicial
endDate
Não
Data final

Responses
200 OK
401 Unauthorized
403 Forbidden

9. Logging
Registrar:
Identity ID
Quantidade de registros retornados
Filtros utilizados
Correlation ID

10. Events
Esta Feature não publica eventos de negócio.
Toda atividade deverá ser registrada apenas para auditoria.

11. Unit Tests
Implementar testes para:
consulta paginada;
filtros por período;
filtros por link;
ordenação cronológica;
autorização;
auditoria.

12. Integration Tests
Validar:
endpoint;
paginação;
filtros;
persistência dos logs;
autorização.

13. Acceptance Criteria
A Feature será considerada pronta quando:
O proprietário visualizar corretamente o histórico de acessos.
A paginação funcionar corretamente.
Os filtros retornarem resultados consistentes.
O histórico permanecer disponível para links expirados e revogados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_profile_access_logs
Aggregate TrustProfileAccessLog
Repository
GetTrustProfileAccessHistoryUseCase
Endpoint GET
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O histórico de acessos estiver disponível.
Os filtros e paginação funcionarem corretamente.
Os registros forem imutáveis.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
