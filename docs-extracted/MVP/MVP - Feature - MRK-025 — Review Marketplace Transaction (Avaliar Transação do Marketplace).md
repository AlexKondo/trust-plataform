
Trust Platform MVP
Especificação da Feature
MRK-025 — Review Marketplace Transaction (Avaliar Transação do Marketplace)

Document Information
Campo
Valor
Feature ID
MRK-025
Feature Name
Review Marketplace Transaction
Module
Marketplace
Prioridade
Alta
Sprint
Sprint 11
Status
Ready for Development
Depends On
MRK-024 – Resolve Marketplace Dispute
References
DOC-001 até DOC-007
Blocks
Módulo Marketplace concluído

1. Objetivo de Negócio
Permitir que os participantes registrem uma avaliação estruturada sobre a transação realizada, produzindo informações confiáveis que contribuam para a reputação dos usuários, melhoria contínua da plataforma e evolução dos algoritmos de recomendação.

2. Escopo
Esta Feature Inclui
Registro da avaliação
Nota geral
Notas por critérios
Comentários
Recomendação
Associação ao pedido
Auditoria
Publicação de eventos
Notificações

Esta Feature NÃO Inclui
Atualização do Trust Score
Distribuição de recompensas
Moderação da avaliação
Resposta do avaliado
Resumos gerados por IA
Essas funcionalidades serão implementadas em módulos especializados.

3. User Story
Como participante de uma transação concluída
Quero avaliar minha experiência
Para que outros usuários tenham informações confiáveis e a plataforma possa melhorar continuamente seus mecanismos de confiança.

4. Business Rules
BR-001
Somente participantes da transação poderão registrar avaliações.

BR-002
Cada participante poderá registrar apenas uma avaliação por pedido.

BR-003
A avaliação somente poderá ser realizada após:
COMPLETED
CLOSED
DISPUTE_RESOLVED (quando aplicável e permitido pelas políticas da plataforma)

BR-004
A avaliação registrará obrigatoriamente:
nota geral (1 a 5 estrelas).

BR-005
Opcionalmente poderão ser registrados:
qualidade;
comunicação;
pontualidade;
custo-benefício;
organização;
comentário;
recomendação ("Recomendaria este profissional?").
Os critérios deverão ser configuráveis pela Administração da plataforma.

BR-006
Fotos, vídeos e demais evidências da avaliação serão gerenciados pelo módulo de Evidências e apenas referenciados quando necessário.

BR-007
Após o registro:
a avaliação permanecerá imutável, salvo regras específicas de edição definidas pela plataforma;
será publicado evento para os módulos consumidores.

5. Fluxo Funcional
Participante acessa pedido
↓
Seleciona "Avaliar"
↓
Validar elegibilidade
↓
Criar MarketplaceReview
↓
Registrar critérios
↓
Registrar comentário
↓
Registrar auditoria
↓
Publicar eventos
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate
Criar:
MarketplaceReview
Atributos
id

orderId

reviewerId

reviewedUserId

overallScore

recommended

comment
createdAt
updatedAt

Criar Value Object:
ReviewScores
Campos iniciais:
quality
communication
punctuality
costBenefit
organization

6.2 Repository
Criar:
MarketplaceReviewRepository

6.3 Services
Criar:
MarketplaceReviewService
Responsabilidades:
validar elegibilidade;
registrar avaliação;
impedir duplicidade;
publicar eventos.

6.4 Use Cases
Criar:
ReviewMarketplaceTransactionUseCase

6.5 DTOs
Criar:
ReviewMarketplaceTransactionRequest
ReviewMarketplaceTransactionResponse

6.6 Exceptions
Criar:
MarketplaceReviewAlreadyExistsException
MarketplaceReviewNotAllowedException

7. Database
Criar tabela:
marketplace_reviews
Campo
Tipo
id
UUID
order_id
UUID
reviewer_id
UUID
reviewed_user_id
UUID
overall_score
SMALLINT
recommended
BOOLEAN
comment
TEXT NULL
created_at
TIMESTAMP
updated_at
TIMESTAMP
Criar tabela:
marketplace_review_scores
Campo
Tipo
review_id
UUID
criterion
VARCHAR(100)
score
SMALLINT
Constraints
PK(id) em marketplace_reviews
FK(order_id)
FK(reviewer_id)
FK(reviewed_user_id)
FK(review_id)
UNIQUE(order_id, reviewer_id)
Índices
reviewed_user_id
overall_score
created_at

8. API
Endpoint
POST /api/v1/marketplace/orders/{orderId}/reviews

9. Logging
Registrar:
Review ID
Order ID
Reviewer ID
Reviewed User ID
Nota geral
Timestamp
Correlation ID

10. Events
Publicar:
MarketplaceReview.Created
Consumidores previstos:
Trust Score
Trust Economy
IA
Analytics
Busca
Recomendações
Notificações
Auditoria

11. Unit Tests
Implementar testes para:
criação válida;
tentativa de avaliação duplicada;
usuário não elegível;
publicação do evento.

12. Integration Tests
Validar:
endpoint;
persistência da avaliação;
persistência dos critérios;
publicação dos eventos;
integração com módulos consumidores.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Apenas participantes elegíveis puderem avaliar.
Cada participante registrar apenas uma avaliação por pedido.
A avaliação for persistida corretamente.
O evento MarketplaceReview.Created for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Aggregate MarketplaceReview
Value Object ReviewScores
MarketplaceReviewRepository
MarketplaceReviewService
ReviewMarketplaceTransactionUseCase
Migrations das tabelas marketplace_reviews e marketplace_review_scores
Endpoint POST
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
A avaliação estiver operacional.
A duplicidade for impedida.
Os critérios forem persistidos corretamente.
O evento MarketplaceReview.Created for publicado.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
