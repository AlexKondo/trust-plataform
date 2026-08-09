
Trust Platform MVP
Feature Specification
TRS-004 — Determine Trust Level

Document Information
Campo
Valor
Feature ID
TRS-004
Feature Name
Determine Trust Level
Module
Trust Score
Priority
Critical
Sprint
Sprint 3
Status
Ready for Development
Depends On
TRS-003 – Calculate Trust Score
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-005 – Get Trust Score

1. Business Objective
Determinar automaticamente o nível de confiança (Trust Level) associado a um Trust Score, utilizando regras configuráveis de classificação.
O Trust Level representa a classificação oficial exibida ao usuário e utilizada pelos demais módulos para habilitar benefícios, permissões e experiências diferenciadas.

2. Scope
Esta Feature Inclui
Determinação do Trust Level
Atualização do Trust Score
Registro do histórico de mudança de nível
Registro de auditoria
Publicação de eventos

Esta Feature NÃO Inclui
Cálculo do Trust Score
Cadastro de níveis
Cadastro de benefícios
Cadastro de badges

3. User Story
Como plataforma
Quero classificar automaticamente um usuário em um nível de confiança
Para que sua reputação seja apresentada de forma clara e utilizada por outros módulos.

4. Business Rules
BR-001
Todo Trust Score deverá possuir exatamente um Trust Level vigente.

BR-002
A determinação do nível deverá ocorrer imediatamente após o cálculo do Trust Score.

BR-003
As regras de classificação deverão ser configuráveis e considerar, no mínimo:
faixa mínima de pontuação;
faixa máxima de pontuação (opcional);
nome do nível;
prioridade;
situação (ativa/inativa).

BR-004
Apenas níveis ativos poderão ser utilizados.

BR-005
Mudanças de nível deverão ser registradas em histórico.

BR-006
Caso o nível permaneça inalterado, nenhum novo registro de histórico deverá ser criado.

5. Functional Flow
Trust Score Calculado

↓

Carregar Trust Level Rules
↓
Encontrar regra correspondente
↓
Atualizar Trust Level
↓
Registrar histórico (se houver alteração)
↓
Persistir
↓
Publicar Evento

6. Backend Implementation
6.1 Service
Criar
TrustLevelEngine
Responsabilidades:
carregar regras de nível;
determinar o nível correspondente;
identificar mudança de nível.

6.2 Use Case
Criar
DetermineTrustLevelUseCase
Fluxo obrigatório
Buscar Trust Score.
Carregar regras de Trust Level.
Determinar o nível correspondente.
Comparar com o nível atual.
Atualizar Trust Score.
Registrar histórico (quando aplicável).
Persistir.
Registrar auditoria.
Publicar evento.

6.3 Repository
Utilizar
TrustScoreRepository
Criar
TrustLevelHistoryRepository

6.4 DTOs
Criar
DetermineTrustLevelResponse

6.5 Exceptions
Criar
TrustLevelNotFoundException
InvalidTrustLevelConfigurationException

7. Database
Criar tabela
trust_level_history
Campos
Campo
Tipo
id
UUID
trust_score_id
UUID
previous_level
VARCHAR
current_level
VARCHAR
changed_at
TIMESTAMP
Constraints
PK(id)
FK(trust_score_id)
Índices
Criar índices para:
trust_score_id
current_level
changed_at

8. Integração
Consumir:
TrustScore.Calculated
Publicar:
TrustLevel.Changed
(apenas quando houver alteração de nível)

9. Logging
Registrar:
Trust Score ID
Score calculado
Nível anterior
Novo nível
Resultado
Correlation ID

10. Eventos
Publicar
TrustLevel.Changed
Payload mínimo
{
  "trustScoreId": "UUID",
  "previousLevel": "SILVER",
  "currentLevel": "GOLD",
  "changedAt": "2026-08-03T18:30:00Z"
}

11. Testes Unitários
Implementar testes para:
Mudança válida de nível
Permanência no mesmo nível
Regra inexistente
Configuração inválida
Publicação do evento

12. Testes de Integração
Validar:
Consumo do evento
Atualização do nível
Registro do histórico
Auditoria
Publicação do evento

13. Acceptance Criteria
A Feature será considerada pronta quando:
Todo Trust Score possuir um Trust Level válido.
Mudanças de nível forem registradas em histórico.
Nenhum histórico duplicado for criado quando o nível permanecer o mesmo.
O evento TrustLevel.Changed for publicado quando aplicável.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
TrustLevelEngine
DetermineTrustLevelUseCase
Migration trust_level_history
TrustLevelHistoryRepository
DTOs
Testes Unitários
Testes de Integração

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O nível de confiança for determinado corretamente.
O histórico de mudanças estiver consistente.
O processamento respeitar as regras configuradas.
Todos os testes automatizados forem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
