
Trust Platform MVP
Feature Specification
TRS-007 — Rebuild Trust Score

Document Information
Campo
Valor
Feature ID
TRS-007
Feature Name
Rebuild Trust Score
Module
Trust Score
Priority
Critical
Sprint
Sprint 4
Status
Ready for Development
Depends On
TRS-006 – Get Trust Timeline
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-008 – Manage Trust Level Rules

1. Business Objective
Reconstruir integralmente o Trust Score e o Trust Level de uma identidade a partir do histórico completo de Trust Events, aplicando as regras vigentes de pontuação e classificação.
A operação garante consistência quando regras forem alteradas, eventos forem corrigidos ou houver necessidade de reprocessamento completo.

2. Scope
Esta Feature Inclui
Solicitação de rebuild
Criação de Job assíncrono
Reprocessamento dos eventos
Recalculo do Trust Score
Redeterminação do Trust Level
Geração de Snapshot
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Cadastro de regras
Exclusão de eventos
Alteração manual de pontuação

3. User Story
Como administrador autorizado
Quero reconstruir a reputação de uma identidade
Para que ela reflita corretamente as regras vigentes.

4. Business Rules
BR-001
O rebuild deverá utilizar exclusivamente os Trust Events persistidos.

BR-002
O processamento deverá considerar apenas regras ativas.

BR-003
O rebuild deverá ser executado de forma assíncrona.

BR-004
Cada solicitação deverá gerar um Job identificável.

BR-005
Ao final do processamento, deverá ser criado um Snapshot representando o estado reconstruído.

BR-006
Falhas deverão permitir nova execução sem comprometer a consistência dos dados (idempotência operacional).

5. Functional Flow
Administrador

↓

POST /api/v1/admin/trust-score/rebuild

↓
Validar autorização
↓
Criar Job
↓
Publicar Job na fila
↓

Worker executa rebuild

↓

Recalcular Score

↓

Determinar Trust Level

↓
Gerar Snapshot
↓
Registrar auditoria
↓
Publicar eventos

6. Backend Implementation
6.1 Use Cases
Criar:
RequestTrustScoreRebuildUseCase
ExecuteTrustScoreRebuildUseCase

6.2 Worker
Criar:
TrustScoreRebuildWorker
Responsabilidades:
consumir Job;
reconstruir a reputação;
atualizar Trust Score;
atualizar Trust Level;
gerar Snapshot;
finalizar Job.

6.3 Repositories
Utilizar:
TrustScoreRepository
TrustScoreEventRepository
TrustScoreSnapshotRepository

6.4 DTOs
Criar:
RequestTrustScoreRebuildRequest
RequestTrustScoreRebuildResponse

6.5 Exceptions
Criar:
TrustScoreRebuildException
TrustScoreRebuildJobNotFoundException

7. Database
Nenhuma alteração obrigatória nesta Feature.
Caso ainda não exista, o módulo de Jobs deverá ser utilizado para persistência e acompanhamento das execuções.

8. API
Endpoint
POST /api/v1/admin/trust-score/rebuild
Request
{
  "trustScoreId": "UUID"
}
Response
HTTP 202 Accepted
{
  "success": true,
  "jobId": "UUID",
  "status": "QUEUED"
}

Possíveis Erros
400 Validation Error
401 Unauthorized
403 Forbidden
404 Trust Score Not Found
409 Rebuild Already Running
500 Internal Server Error

9. Logging
Registrar:
Job ID
Trust Score ID
Executor
Data de início
Data de término
Quantidade de eventos processados
Resultado
Correlation ID

10. Eventos
Consumir:
Job.Started
Publicar:
TrustScore.RebuildStarted
TrustScore.RebuildCompleted
TrustScore.RebuildFailed

11. Testes Unitários
Implementar testes para:
Solicitação válida
Criação do Job
Execução do Worker
Rebuild completo
Falha durante o rebuild
Reexecução após falha

12. Testes de Integração
Validar:
Endpoint
Publicação na fila
Execução do Worker
Atualização do Trust Score
Atualização do Trust Level
Geração do Snapshot
Auditoria

13. Acceptance Criteria
A Feature será considerada pronta quando:
A solicitação gerar um Job assíncrono.
O Worker reconstruir corretamente a reputação.
O Snapshot final representar o estado reconstruído.
Os eventos de conclusão ou falha forem publicados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
RequestTrustScoreRebuildUseCase
ExecuteTrustScoreRebuildUseCase
TrustScoreRebuildWorker
DTOs
Endpoint administrativo
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O rebuild for executado de forma assíncrona.
O estado reconstruído for consistente e auditável.
O processamento suportar reexecuções seguras.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
