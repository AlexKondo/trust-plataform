
Trust Platform MVP
Feature Specification
TRS-003 — Calculate Trust Score

Document Information
Campo
Valor
Feature ID
TRS-003
Feature Name
Calculate Trust Score
Module
Trust Score
Priority
Critical
Sprint
Sprint 3
Status
Ready for Development
Depends On
TRS-002 – Register Trust Event
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-004 – Get Trust Score

1. Business Objective
Calcular a pontuação oficial de confiança de um Trust Score utilizando o histórico de Trust Events registrados e as regras vigentes de pontuação.
O cálculo deverá ser determinístico, auditável, repetível e independente dos módulos que originaram os eventos.

2. Scope
Esta Feature Inclui
Leitura dos Trust Events
Aplicação das regras de pontuação
Atualização do Score
Atualização do nível de confiança
Registro do cálculo
Publicação de evento

Esta Feature NÃO Inclui
Registro de novos eventos
Criação de regras
Alteração manual do Score

3. User Story
Como plataforma
Quero calcular a pontuação de confiança
Para que ela represente corretamente o histórico do usuário.

4. Business Rules
BR-001
Somente Trust Events válidos poderão participar do cálculo.

BR-002
Cada evento será processado conforme a regra correspondente.

BR-003
As regras deverão permitir configurar, no mínimo:
Pontuação positiva ou negativa
Peso
Limite máximo de ocorrências
Categoria
Situação ativa/inativa

BR-004
Eventos sem regra ativa não deverão alterar o Score.

BR-005
O cálculo deverá ser determinístico.
Para um mesmo conjunto de eventos e regras, o resultado deverá ser sempre idêntico.

BR-006
Ao final do processamento, deverão ser atualizados:
score
trustLevel
updatedAt

5. Functional Flow
Trust Events

↓

Carregar Regras

↓
Aplicar Motor de Regras
↓
Calcular Score
↓
Determinar Trust Level
↓
Persistir
↓
Registrar Auditoria
↓
Publicar Evento

6. Backend Implementation
6.1 Service
Criar
TrustScoreEngine
Responsabilidades:
carregar regras;
processar eventos;
calcular pontuação;
determinar nível de confiança.

6.2 Use Case
Criar
CalculateTrustScoreUseCase
Fluxo obrigatório
Buscar Trust Score.
Buscar Trust Events.
Carregar regras ativas.
Executar TrustScoreEngine.
Atualizar Trust Score.
Persistir.
Registrar auditoria.
Publicar evento.

6.3 DTOs
Criar
CalculateTrustScoreResponse

6.4 Exceptions
Criar
TrustRuleNotFoundException
TrustScoreCalculationException

7. Database
Nenhuma nova tabela.
Atualizar:
trust_scores
Campos atualizados:
Campo
Tipo
score
INTEGER
level
VARCHAR
updated_at
TIMESTAMP

8. Integração
Consumir:
TrustScore.EventRegistered
Publicar:
TrustScore.Calculated

9. Logging
Registrar:
Trust Score ID
Quantidade de eventos processados
Quantidade de regras aplicadas
Score anterior
Novo Score
Trust Level
Correlation ID

10. Eventos
Publicar
TrustScore.Calculated
Payload mínimo
{
  "trustScoreId": "UUID",
  "previousScore": 120,
  "newScore": 170,
  "level": "TRUSTED",
  "calculatedAt": "2026-08-03T18:30:00Z"
}

11. Testes Unitários
Implementar testes para:
Cálculo válido
Eventos sem regra
Limite máximo de ocorrências
Eventos negativos
Determinação do Trust Level
Publicação do evento

12. Testes de Integração
Validar:
Execução do motor
Atualização do Trust Score
Auditoria
Publicação do evento

13. Acceptance Criteria
A Feature será considerada pronta quando:
O Score refletir corretamente os eventos registrados.
Apenas regras ativas forem aplicadas.
O cálculo for determinístico.
O nível de confiança for atualizado.
O evento TrustScore.Calculated for publicado.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
TrustScoreEngine
CalculateTrustScoreUseCase
Atualização do Aggregate TrustScore
DTOs
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O motor de cálculo estiver implementado.
O Score for atualizado corretamente.
O cálculo for reproduzível e auditável.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
