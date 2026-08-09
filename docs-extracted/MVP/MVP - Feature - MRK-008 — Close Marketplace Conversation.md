
Trust Platform MVP
Feature Specification
MRK-008 — Close Marketplace Conversation

Document Information
Campo
Valor
Feature ID
MRK-008
Feature Name
Close Marketplace Conversation
Module
Marketplace
Priority
High
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-007 – Manage Marketplace Conversations
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-009 – Archive Marketplace Conversation

1. Business Objective
Permitir que uma conversa de negociação seja encerrada quando não houver mais necessidade de troca de mensagens, preservando seu histórico para consulta, auditoria e eventual utilização em processos de disputa.

2. Scope
Esta Feature Inclui
Encerramento da conversa
Atualização do status
Registro da data de encerramento
Identificação do usuário que realizou o encerramento
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Exclusão da conversa
Arquivamento
Reabertura da conversa
Exclusão de mensagens

3. User Story
Como participante de uma negociação
Quero encerrar uma conversa
Para que ela não receba novas mensagens após o término da negociação.

4. Business Rules
BR-001
Somente participantes da conversa poderão encerrá-la.

BR-002
Somente conversas com status OPEN poderão ser encerradas.

BR-003
Após o encerramento, nenhuma nova mensagem poderá ser enviada.

BR-004
Todo o histórico de mensagens deverá permanecer disponível para consulta.

BR-005
O sistema deverá registrar:
usuário responsável pelo encerramento;
data e hora do encerramento;
motivo (opcional).

BR-006
O status da conversa deverá ser alterado para:
CLOSED

5. Functional Flow
Usuário autenticado
↓
Seleciona conversa
↓
Solicita encerramento
↓
Validar participante
↓
Validar status OPEN
↓
Atualizar status para CLOSED
↓
Registrar closedAt
↓
Registrar auditoria
↓
Publicar evento
↓
HTTP 200

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceConversation
Adicionar atributos:
closedAt

closedBy
closeReason
Adicionar comportamento:
close()

6.2 Repository
Atualizar:
MarketplaceConversationRepository
Métodos:
findById()
save()

6.3 Services
Criar:
MarketplaceConversationLifecycleService
Responsabilidades:
validar encerramento;
atualizar status;
registrar auditoria.

6.4 Use Cases
Criar:
CloseMarketplaceConversationUseCase

6.5 DTOs
Criar:
CloseMarketplaceConversationRequest
CloseMarketplaceConversationResponse

6.6 Exceptions
Criar:
MarketplaceConversationAlreadyClosedException
MarketplaceConversationAccessDeniedException
MarketplaceConversationNotFoundException

7. Database
Atualizar tabela:
marketplace_conversations
Adicionar campos:
Campo
Tipo
closed_at
TIMESTAMP NULL
closed_by
UUID NULL
close_reason
TEXT NULL
Atualizar:
status
updated_at

8. API
Endpoint
POST /api/v1/marketplace/conversations/{conversationId}/close
Request
{
  "reason": "Negotiation completed."
}
Responses
200 OK
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Conversation ID
Usuário responsável
Motivo
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceConversation.Closed
Payload mínimo:
{
  "conversationId": "UUID",
  "closedBy": "UUID",
  "closedAt": "2026-08-03T18:00:00Z"
}

11. Unit Tests
Implementar testes para:
encerramento válido;
tentativa de encerrar conversa inexistente;
tentativa de encerrar conversa já encerrada;
envio de mensagens após encerramento;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência;
atualização do status;
bloqueio de novas mensagens;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Participantes puderem encerrar conversas.
Novas mensagens não puderem ser enviadas após o encerramento.
O histórico permanecer disponível.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Atualização da migration marketplace_conversations
Atualização do Aggregate MarketplaceConversation
Repository atualizado
MarketplaceConversationLifecycleService
CloseMarketplaceConversationUseCase
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O encerramento estiver operacional.
O histórico permanecer íntegro.
Nenhuma nova mensagem puder ser enviada.
O evento MarketplaceConversation.Closed for publicado corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
