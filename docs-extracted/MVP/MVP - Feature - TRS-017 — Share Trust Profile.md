
Trust Platform MVP
Feature Specification
TRS-017 — Share Trust Profile

Document Information
Campo
Valor
Feature ID
TRS-017
Feature Name
Share Trust Profile
Module
Trust Score
Priority
High
Sprint
Sprint 6
Status
Ready for Development
Depends On
TRS-016 – Manage Visibility Policies
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-018 – Trust Profile Verification Link

1. Business Objective
Permitir que usuários compartilhem seu Trust Profile com terceiros por meio de um link seguro, possibilitando a consulta pública das informações permitidas pelas políticas de visibilidade da plataforma.

2. Scope
Esta Feature Inclui
Geração de link de compartilhamento
Revogação de links
Configuração de expiração
Controle de status do link
Auditoria
Consulta pública utilizando o link

Esta Feature NÃO Inclui
Alteração do Trust Profile
Alteração das políticas de visibilidade
Compartilhamento em redes sociais
Download do perfil

3. User Story
Como usuário da plataforma
Quero compartilhar meu Trust Profile
Para que terceiros possam verificar minha reputação de forma segura e confiável.

4. Business Rules
BR-001
Cada link de compartilhamento deverá possuir um identificador único e criptograficamente seguro.

BR-002
O usuário poderá possuir múltiplos links ativos.

BR-003
Cada link poderá possuir data de expiração opcional.

BR-004
O proprietário poderá revogar um link a qualquer momento.

BR-005
Após revogado ou expirado, o link deverá retornar HTTP 410 (Gone).

BR-006
O conteúdo exibido deverá respeitar integralmente as Visibility Policies configuradas.

BR-007
O acesso ao link deverá ser registrado para fins de auditoria.

5. Functional Flow
Usuário
↓
Solicita compartilhamento
↓
Gerar Token Seguro
↓
Persistir Link
↓
Retornar URL
↓
Terceiro acessa URL
↓
Validar Token
↓
Verificar Expiração
↓
Aplicar Visibility Policies
↓
Retornar Trust Profile Público
↓
Registrar Auditoria

6. Backend Implementation
6.1 Aggregate
Criar:
TrustProfileShare
Atributos mínimos
id

identityId

shareToken

status

expiresAt

lastAccessAt

accessCount

createdAt

updatedAt

6.2 Repository
Criar:
TrustProfileShareRepository
Métodos mínimos:
save()
findByToken()
findByIdentity()
revoke()
incrementAccessCount()

6.3 Use Cases
Criar:
CreateTrustProfileShareUseCase
RevokeTrustProfileShareUseCase
GetSharedTrustProfileUseCase
ListTrustProfileSharesUseCase

6.4 DTOs
Criar:
CreateTrustProfileShareRequest
CreateTrustProfileShareResponse
SharedTrustProfileResponse
TrustProfileShareResponse

6.5 Exceptions
Criar:
TrustProfileShareNotFoundException
TrustProfileShareExpiredException
TrustProfileShareRevokedException
InvalidShareTokenException

7. Database
Criar tabela:
trust_profile_shares
Campos
Campo
Tipo
id
UUID
identity_id
UUID
share_token
VARCHAR(255)
status
VARCHAR(30)
expires_at
TIMESTAMP NULL
last_access_at
TIMESTAMP NULL
access_count
BIGINT
created_at
TIMESTAMP
updated_at
TIMESTAMP
Constraints
PK(id)
UNIQUE(share_token)
Índices
Criar índices para:
identity_id
share_token
status
expires_at

8. API
Criar Link
POST /api/v1/trust-profile/shares

Listar Links
GET /api/v1/trust-profile/shares

Revogar Link
DELETE /api/v1/trust-profile/shares/{id}

Consultar Perfil Compartilhado
GET /public/trust-profile/{shareToken}

Respostas
200 OK
401 Unauthorized
404 Not Found
410 Gone

9. Logging
Registrar:
Identity ID
Share ID
Share Token
Endereço IP do acesso
User-Agent
Horário do acesso
Correlation ID

10. Events
Publicar:
TrustProfile.Shared

TrustProfileShare.Revoked

TrustProfileShare.Accessed

11. Unit Tests
Implementar testes para:
geração de token único;
criação do link;
expiração;
revogação;
incremento do contador de acessos;
aplicação das Visibility Policies;
publicação dos eventos.

12. Integration Tests
Validar:
persistência;
geração de links;
consulta pública;
revogação;
expiração;
auditoria;
publicação de eventos.

13. Acceptance Criteria
A Feature será considerada pronta quando:
Usuários puderem gerar links públicos para seus Trust Profiles.
Apenas informações autorizadas forem exibidas.
Links expirados ou revogados deixarem de funcionar.
Todos os acessos forem auditados.
Todos os testes automatizados forem aprovados.

14. Deliverables
O desenvolvedor deverá entregar:
Migration trust_profile_shares
Aggregate TrustProfileShare
Repository
Use Cases
Endpoints públicos e autenticados
DTOs
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

15. Definition of Done
A Feature somente poderá ser encerrada quando:
O compartilhamento do Trust Profile estiver operacional.
O controle de expiração funcionar corretamente.
A revogação dos links estiver implementada.
Todos os acessos forem auditados.
Todos os eventos forem publicados corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
