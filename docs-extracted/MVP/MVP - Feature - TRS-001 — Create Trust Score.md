
Trust Platform MVP
Feature Specification
TRS-001 — Create Trust Score

Document Information
Campo
Valor
Feature ID
TRS-001
Feature Name
Create Trust Score
Module
Trust Score
Priority
Critical
Sprint
Sprint 3
Status
Ready for Development
Depends On
TPS-001 – Create Trust Passport
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-002 – Register Trust Event

1. Business Objective
Criar o registro inicial do Trust Score para um Trust Passport, estabelecendo a entidade responsável por consolidar a pontuação de confiança do usuário ao longo de todo o seu ciclo de vida na plataforma.
O Trust Score será a representação oficial da confiança calculada pela plataforma.

2. Scope
Esta Feature Inclui
Criação do Trust Score
Associação ao Trust Passport
Inicialização da pontuação
Inicialização do nível de confiança
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Cálculo da pontuação
Recalcular Score
Histórico
Badges
Ranking

3. User Story
Como plataforma
Quero criar um Trust Score para cada Trust Passport
Para que a evolução da confiança possa ser registrada desde o primeiro momento.

4. Business Rules
BR-001
Cada Trust Passport deverá possuir exatamente um Trust Score ativo.

BR-002
O Trust Score deverá ser criado automaticamente após a criação do Trust Passport.

BR-003
O Score inicial deverá ser:
0 pontos

BR-004
O nível inicial deverá ser:
UNVERIFIED

BR-005
O cálculo do Score ocorrerá exclusivamente em Features posteriores.

5. Functional Flow
Trust Passport Criado

↓

Evento TrustPassport.Created

↓

Consumir Evento

↓

Criar Trust Score
↓
Persistir
↓
Registrar Auditoria
↓
Publicar Evento

6. Backend Implementation
6.1 Aggregate Root
Criar
TrustScore

Atributos
id

trustPassportId

score

level

createdAt

updatedAt

6.2 Repository
Criar
TrustScoreRepository
Métodos
save()
findByPassport()
findById()
update()

6.3 Event Consumer
Criar
TrustPassportCreatedConsumer
Consumindo
TrustPassport.Created

6.4 Use Case
Criar
CreateTrustScoreUseCase
Fluxo obrigatório
Receber evento.
Validar idempotência.
Localizar Trust Passport.
Verificar inexistência de Trust Score.
Criar Aggregate.
Persistir.
Registrar auditoria.
Publicar evento.

6.5 DTOs
Criar
TrustPassportCreatedEvent
CreateTrustScoreResponse

6.6 Exceptions
Criar
TrustScoreAlreadyExistsException
TrustPassportNotFoundException

7. Database
Criar tabela
trust_scores

Campos
Campo
Tipo
id
UUID
trust_passport_id
UUID
score
INTEGER
level
VARCHAR
created_at
TIMESTAMP
updated_at
TIMESTAMP

Constraints
PK(id)
FK(trust_passport_id)
UNIQUE(trust_passport_id)

8. Integração
Consumir:
TrustPassport.Created
Publicar:
TrustScore.Created

9. Logging
Registrar:
Event ID
Trust Passport ID
Trust Score ID
Resultado
Correlation ID

10. Eventos
Publicar
TrustScore.Created
Payload mínimo
{
  "trustScoreId": "UUID",
  "trustPassportId": "UUID",
  "score": 0,
  "level": "UNVERIFIED"
}

11. Testes Unitários
Implementar testes para:
Criação válida
Duplicidade
Idempotência
Evento publicado

12. Testes de Integração
Validar:
Consumo do evento
Persistência
Publicação do evento
Auditoria

13. Acceptance Criteria
A Feature será considerada pronta quando:
Todo Trust Passport possuir um Trust Score.
Apenas um Trust Score existir por Passport.
O Score inicial for zero.
O nível inicial for UNVERIFIED.
O evento TrustScore.Created for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_scores
Aggregate TrustScore
Repository
Consumer
Use Case
DTOs
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
Todos os entregáveis estiverem implementados.
O processamento for idempotente.
O Trust Score for criado corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
