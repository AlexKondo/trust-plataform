
Trust Platform MVP
Feature Specification
TRS-014 — Get My Trust Badges

Document Information
Campo
Valor
Feature ID
TRS-014
Feature Name
Get My Trust Badges
Module
Trust Score
Priority
High
Sprint
Sprint 5
Status
Ready for Development
Depends On
TRS-013 – Award Trust Badges
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-015 – Public Trust Profile

1. Business Objective
Disponibilizar ao usuário uma visão consolidada de suas conquistas (Trust Badges), incluindo badges ativos, permanentes, históricos e em progresso, incentivando engajamento, reconhecimento e evolução contínua da reputação.

2. Scope
Esta Feature Inclui
Consulta dos badges do usuário
Classificação por categoria
Consulta do progresso para badges ainda não conquistados
Exibição de informações de raridade
Registro de auditoria

Esta Feature NÃO Inclui
Concessão de badges
Administração de badges
Revogação de badges

3. User Story
Como usuário autenticado
Quero visualizar minhas conquistas
Para que eu acompanhe minha reputação, meu progresso e reconheça objetivos futuros.

4. Business Rules
BR-001
Os badges deverão ser apresentados nas seguintes categorias:
ACTIVE
PERMANENT
HISTORICAL
IN_PROGRESS

BR-002
Cada badge deverá apresentar, no mínimo:
nome;
descrição;
ícone;
raridade;
data de conquista (quando aplicável);
visibilidade.

BR-003
Para badges em progresso, o sistema deverá informar os critérios pendentes e, quando possível, um indicador percentual de evolução.

BR-004
Badges privados (PRIVATE) deverão ser exibidos apenas ao próprio usuário e aos administradores autorizados.

BR-005
A consulta será somente leitura.

5. Functional Flow
Usuário autenticado

↓

GET /api/v1/trust-profile/badges

↓
Validar autorização
↓
Buscar AwardedBadges
↓
Buscar Badges elegíveis em progresso
↓
Classificar por categoria
↓
Registrar auditoria
↓
HTTP 200

6. Backend Implementation
6.1 Service
Criar:
TrustBadgePresentationService
Responsabilidades:
consolidar badges concedidos;
identificar badges em progresso;
calcular progresso estimado;
organizar a resposta por categorias.

6.2 Use Case
Criar:
GetMyTrustBadgesUseCase
Fluxo obrigatório
Validar autenticação.
Buscar AwardedBadge.
Buscar badges configurados.
Identificar badges elegíveis em progresso.
Classificar resultados.
Registrar auditoria.
Retornar resposta.

6.3 Repositories
Utilizar:
AwardedBadgeRepository
TrustBadgeRepository

6.4 DTOs
Criar:
GetMyTrustBadgesResponse
TrustBadgeResponse
BadgeProgressResponse

6.5 Exceptions
Criar:
AwardedBadgeNotFoundException
TrustBadgePresentationException

7. Database
Nenhuma alteração estrutural.

8. API
Endpoint
GET /api/v1/trust-profile/badges
Header
Authorization: Bearer {accessToken}
Response
HTTP 200
{
  "success": true,
  "data": {
    "active": [
      {
        "code": "VERIFIED_IDENTITY",
        "name": "Identidade Verificada",
        "rarity": "COMMON",
        "earnedBy": 82.4,
        "awardedAt": "2026-03-15T10:20:00Z"
      }
    ],
    "permanent": [
      {
        "code": "EARLY_ADOPTER",
        "name": "Early Adopter",
        "rarity": "LEGENDARY",
        "earnedBy": 0.3
      }
    ],
    "historical": [],
    "inProgress": [
      {
        "code": "TRUSTED_EXPERT",
        "progress": 84,
        "missingRequirements": [
          "Receber mais 3 avaliações positivas."
        ]
      }
    ]
  }
}

Possíveis Erros
401 Unauthorized
403 Forbidden
500 Internal Server Error

9. Frontend
A interface deverá:
destacar badges ativos;
diferenciar visualmente raridades;
apresentar o progresso para conquistas futuras;
permitir expansão futura para coleções, temporadas e campanhas;
suportar ordenação por data, raridade ou categoria.

10. Logging
Registrar:
Identity ID
Quantidade de badges ativos
Quantidade de badges históricos
Quantidade de badges em progresso
Correlation ID

11. Eventos
Esta Feature não publica eventos de negócio.
O acesso deverá ser registrado para fins de auditoria.

12. Testes Unitários
Implementar testes para:
classificação correta dos badges;
cálculo do progresso;
ocultação de badges privados para terceiros;
organização das categorias;
registro da auditoria.

13. Testes de Integração
Validar:
endpoint;
autorização;
integração com AwardedBadge;
apresentação dos badges;
auditoria.

14. Acceptance Criteria
A Feature será considerada pronta quando:
O usuário visualizar corretamente seus badges.
Os badges forem organizados nas categorias previstas.
O progresso das próximas conquistas for apresentado quando aplicável.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
TrustBadgePresentationService
GetMyTrustBadgesUseCase
Endpoint GET /api/v1/trust-profile/badges
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A apresentação dos badges estiver consistente.
As regras de visibilidade forem respeitadas.
O progresso dos badges for calculado corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
