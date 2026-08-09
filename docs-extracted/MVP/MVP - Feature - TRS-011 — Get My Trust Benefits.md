
Trust Platform MVP
Feature Specification
TRS-011 — Get My Trust Benefits

Document Information
Campo
Valor
Feature ID
TRS-011
Feature Name
Get My Trust Benefits
Module
Trust Score
Priority
High
Sprint
Sprint 4
Status
Ready for Development
Depends On
TRS-010 – Manage Trust Benefits
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-012 – Manage Trust Badges

1. Business Objective
Disponibilizar ao usuário uma visão consolidada dos benefícios relacionados à sua reputação, classificando-os em benefícios ativos, benefícios potencialmente desbloqueáveis e benefícios indisponíveis, com informações claras sobre elegibilidade e progresso.

2. Scope
Esta Feature Inclui
Consulta dos benefícios do usuário
Avaliação de elegibilidade
Classificação por status
Explicação do motivo da indisponibilidade
Indicação de progresso para benefícios desbloqueáveis
Registro de auditoria

Esta Feature NÃO Inclui
Concessão do benefício
Resgate de benefícios
Administração de benefícios

3. User Story
Como usuário autenticado
Quero visualizar meus benefícios de confiança
Para que eu saiba quais vantagens posso utilizar e quais ações podem ampliar meus benefícios.

4. Business Rules
BR-001
Cada benefício deverá ser classificado em exatamente um dos seguintes estados:
ACTIVE
UNLOCKABLE
UNAVAILABLE

BR-002
A elegibilidade deverá considerar a expressão configurada no benefício (eligibilityExpression).

BR-003
Para benefícios classificados como UNLOCKABLE, o sistema deverá informar, sempre que possível, os principais critérios ainda não atendidos (por exemplo, Trust Level, pontuação mínima ou categoria).

BR-004
Benefícios expirados ou inativos não deverão ser apresentados como ativos.

BR-005
A consulta será somente leitura e não alterará qualquer estado do usuário.

5. Functional Flow
Usuário autenticado

↓

GET /api/v1/trust-profile/benefits

↓
Validar autorização
↓
Carregar Trust Profile
↓
Carregar benefícios ativos
↓
Avaliar elegibilidade
↓
Classificar benefícios
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Service
Criar:
TrustBenefitEligibilityService
Responsabilidades:
avaliar eligibilityExpression;
classificar benefícios;
identificar critérios pendentes;
produzir a resposta consolidada.

6.2 Use Case
Criar:
GetMyTrustBenefitsUseCase
Fluxo obrigatório
Validar autenticação.
Buscar Trust Profile.
Buscar benefícios ativos.
Avaliar elegibilidade.
Classificar benefícios.
Registrar auditoria.
Retornar resposta.

6.3 Repositories
Utilizar:
TrustBenefitRepository
TrustScoreRepository
TrustPassportRepository

6.4 DTOs
Criar:
GetMyTrustBenefitsResponse
TrustBenefitResponse
UnlockRequirementResponse

6.5 Exceptions
Criar:
TrustProfileNotFoundException
TrustBenefitEvaluationException

7. Database
Nenhuma alteração estrutural.

8. API
Endpoint
GET /api/v1/trust-profile/benefits
Header
Authorization: Bearer {accessToken}
Response
HTTP 200
{
  "success": true,
  "data": {
    "active": [
      {
        "code": "FREE_SHIPPING",
        "name": "Frete Grátis",
        "description": "Frete grátis para compras elegíveis."
      }
    ],
    "unlockable": [
      {
        "code": "PREMIUM_SUPPORT",
        "name": "Atendimento Premium",
        "missingRequirements": [
          "Atingir Trust Level Diamond"
        ]
      }
    ],
    "unavailable": [
      {
        "code": "GLOBAL_INSURANCE",
        "name": "Seguro Internacional",
        "reason": "Disponível apenas para organizações."
      }
    ]
  }
}

Possíveis Erros
401 Unauthorized
403 Forbidden
404 Trust Profile Not Found
500 Internal Server Error

9. Frontend
A interface deverá:
destacar benefícios ativos;
apresentar claramente o progresso para benefícios desbloqueáveis;
explicar, em linguagem amigável, os motivos da indisponibilidade;
suportar futuras extensões como filtros, categorias e campanhas.

10. Logging
Registrar:
Identity ID
Trust Score ID
Quantidade de benefícios ativos
Quantidade de benefícios desbloqueáveis
Quantidade de benefícios indisponíveis
Correlation ID

11. Eventos
Esta Feature não publica eventos de negócio.
O acesso deverá ser registrado apenas para fins de auditoria.

12. Testes Unitários
Implementar testes para:
classificação correta dos benefícios;
avaliação da elegibilidade;
geração dos critérios pendentes;
tratamento de benefícios expirados;
registro da auditoria.

13. Testes de Integração
Validar:
endpoint;
autorização;
integração com Trust Profile;
avaliação das regras de elegibilidade;
auditoria.

14. Acceptance Criteria
A Feature será considerada pronta quando:
O usuário visualizar corretamente seus benefícios ativos.
Os benefícios desbloqueáveis apresentarem critérios de progresso.
Os benefícios indisponíveis apresentarem justificativas.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
TrustBenefitEligibilityService
GetMyTrustBenefitsUseCase
Endpoint GET /api/v1/trust-profile/benefits
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A elegibilidade dos benefícios estiver correta.
A classificação dos benefícios estiver consistente.
As justificativas forem apresentadas adequadamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
