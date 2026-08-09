
Trust Platform MVP
Feature Specification
MRK-007 — Manage Marketplace Conversations

Document Information
Campo
Valor
Feature ID
MRK-007
Feature Name
Manage Marketplace Conversations
Module
Marketplace
Priority
Critical
Sprint
Sprint 7
Status
Ready for Development
Depends On
MRK-006 – Contact Listing Owner
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
MRK-008 – Close Marketplace Conversation

1. Business Objective
Permitir que compradores e vendedores gerenciem suas conversas de negociação dentro da Trust Platform, mantendo um histórico completo, seguro e auditável de todas as mensagens trocadas.

2. Scope
Esta Feature Inclui
Envio de mensagens
Recebimento de mensagens
Listagem de conversas
Consulta do histórico de mensagens
Controle de mensagens lidas
Atualização da última atividade
Auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Compartilhamento de arquivos
Chamadas de voz
Chamadas de vídeo
Pagamentos
Avaliações

3. User Story
Como participante de uma negociação
Quero trocar mensagens com a outra parte
Para que possamos negociar diretamente pela plataforma.

4. Business Rules
BR-001
Somente comprador e vendedor poderão acessar a conversa.

BR-002
Somente conversas com status OPEN poderão receber novas mensagens.

BR-003
Toda mensagem deverá possuir remetente identificado.

BR-004
Mensagens não poderão ser editadas após o envio.

BR-005
Mensagens não poderão ser excluídas pelos participantes.

BR-006
Cada mensagem deverá registrar:
data e hora;
remetente;
conteúdo;
status de leitura.

BR-007
O envio de uma mensagem deverá atualizar automaticamente o campo lastMessageAt da conversa.

BR-008
Todas as mensagens deverão permanecer disponíveis para auditoria.

5. Functional Flow
Usuário autenticado
↓
Seleciona conversa
↓
Validar participante
↓
Enviar mensagem
↓
Persistir mensagem
↓
Atualizar conversa
↓
Registrar auditoria
↓
Publicar evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Atualizar:
MarketplaceConversation
Criar Aggregate:
MarketplaceMessage
Atributos mínimos
id
conversationId
senderId
message
read
readAt
sentAt
createdAt

6.2 Repository
Criar:
MarketplaceMessageRepository
Métodos mínimos:
save()
findByConversation()
markAsRead()
countUnread()

6.3 Services
Criar:
MarketplaceMessagingService
Responsabilidades:
validar participantes;
enviar mensagens;
atualizar status de leitura;
atualizar última atividade.

6.4 Use Cases
Criar:
SendMarketplaceMessageUseCase
GetMarketplaceConversationUseCase
ListMarketplaceConversationsUseCase
MarkMarketplaceMessagesAsReadUseCase

6.5 DTOs
Criar:
SendMarketplaceMessageRequest
MarketplaceConversationResponse
MarketplaceMessageResponse
MarketplaceConversationSummaryResponse

6.6 Exceptions
Criar:
MarketplaceConversationClosedException
MarketplaceConversationAccessDeniedException
MarketplaceMessageValidationException

7. Database
Criar tabela:
marketplace_messages
Campos
Campo
Tipo
id
UUID
conversation_id
UUID
sender_id
UUID
message
TEXT
read
BOOLEAN
read_at
TIMESTAMP NULL
sent_at
TIMESTAMP
created_at
TIMESTAMP
Constraints
PK(id)
FK(conversation_id)
FK(sender_id)
Índices
Criar índices para:
conversation_id
sender_id
sent_at
read

8. API
Listar conversas
GET /api/v1/marketplace/conversations

Consultar conversa
GET /api/v1/marketplace/conversations/{conversationId}

Enviar mensagem
POST /api/v1/marketplace/conversations/{conversationId}/messages

Marcar mensagens como lidas
PATCH /api/v1/marketplace/conversations/{conversationId}/read
Responses
200 OK
201 Created
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict

9. Logging
Registrar:
Conversation ID
Message ID
Sender ID
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceMessage.Sent

MarketplaceConversation.Read
Payload mínimo:
{
  "conversationId": "UUID",
  "messageId": "UUID",
  "senderId": "UUID",
  "sentAt": "2026-08-03T17:30:00Z"
}

11. Unit Tests
Implementar testes para:
envio de mensagens;
leitura de mensagens;
listagem de conversas;
acesso por participante autorizado;
bloqueio para terceiros;
conversa encerrada;
publicação de eventos.

12. Integration Tests
Validar:
endpoints;
persistência;
atualização de lastMessageAt;
marcação como lida;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Participantes puderem trocar mensagens.
Apenas participantes autorizados acessarem a conversa.
O histórico permanecer íntegro.
O status de leitura funcionar corretamente.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration marketplace_messages
Aggregate MarketplaceMessage
Repository
MarketplaceMessagingService
Use Cases
Endpoints
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O envio de mensagens estiver operacional.
O histórico estiver íntegro.
O controle de leitura funcionar corretamente.
Os eventos forem publicados corretamente.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
