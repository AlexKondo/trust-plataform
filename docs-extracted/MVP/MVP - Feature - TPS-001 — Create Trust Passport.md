
Trust Platform MVP
Feature Specification
TPS-001 — Create Trust Passport

Document Information
Campo
Valor
Feature ID
TPS-001
Feature Name
Create Trust Passport
Module
Trust Passport
Priority
Critical
Sprint
Sprint 2
Status
Ready for Development
Depends On
IDN-001 a IDN-009
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TPS-002 – Get Trust Passport

1. Business Objective
Criar automaticamente o Trust Passport de uma Identity elegível.
O Trust Passport representa a identidade confiável do usuário dentro da plataforma e centraliza todas as informações verificáveis que contribuirão para o cálculo do Trust Score.
Cada Identity poderá possuir exatamente um Trust Passport.

2. Scope
Esta Feature Inclui
Criação do Trust Passport
Associação à Identity
Inicialização dos atributos de confiança
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Verificação documental
Trust Score
Badges
Histórico de reputação
Configurações de privacidade

3. User Story
Como um usuário com Identity ativa
Quero possuir um Trust Passport
Para que eu possa construir minha reputação e utilizar os serviços da Trust Platform.

4. Business Rules
BR-001
Somente Identities com status ACTIVE poderão possuir um Trust Passport.

BR-002
Cada Identity poderá possuir apenas um Trust Passport.

BR-003
A criação deverá ocorrer automaticamente após a conclusão do onboarding definido pelo negócio ou mediante chamada explícita da API, conforme configuração da plataforma.

BR-004
O Trust Passport deverá iniciar com todos os atributos verificáveis marcados como NOT_VERIFIED.

BR-005
O status inicial do Trust Passport deverá ser:
ACTIVE

BR-006
O Trust Passport deverá possuir um identificador único independente da Identity.

5. Functional Flow
Identity ACTIVE
↓
Solicitação de criação
↓
Verificar existência
↓
Criar Trust Passport
↓
Persistir
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 201

6. Backend Implementation
6.1 Aggregate Root
Criar
TrustPassport

Atributos
id

identityId

status

profileCompletion

emailVerified

phoneVerified
documentVerified
addressVerified
createdAt
updatedAt

6.2 Repository
Criar
TrustPassportRepository
Métodos
save()
findById()
findByIdentityId()
existsByIdentityId()
update()
delete()

6.3 Use Case
Criar
CreateTrustPassportUseCase
Fluxo
Validar Identity.
Validar ACTIVE.
Verificar existência.
Criar Aggregate.
Inicializar atributos.
Persistir.
Registrar auditoria.
Publicar evento.
Retornar resultado.

6.4 Domain Services
Criar
TrustPassportFactory
Responsável por inicializar corretamente um novo Trust Passport.

6.5 DTOs
Criar
CreateTrustPassportRequest
CreateTrustPassportResponse

6.6 Exceptions
Criar
TrustPassportAlreadyExistsException
IdentityNotActiveException

7. Database
Criar tabela
trust_passports

Campos
Campo
Tipo
id
UUID
identity_id
UUID
status
VARCHAR
profile_completion
DECIMAL(5,2)
email_verified
BOOLEAN
phone_verified
BOOLEAN
document_verified
BOOLEAN
address_verified
BOOLEAN
created_at
TIMESTAMP
updated_at
TIMESTAMP

Constraints
PK(id)
FK(identity_id)
UNIQUE(identity_id)

Índices
Criar índices para
identity_id
status

8. API
Endpoint
POST /api/v1/trust-passports

Request
{
  "identityId":"UUID"
}

Response
HTTP 201
{
  "success": true,
  "data": {
    "trustPassportId":"UUID",
    "status":"ACTIVE"
  }
}

Possíveis Erros
400 Validation Error
404 Identity Not Found
409 Trust Passport Already Exists
500 Internal Server Error

9. Frontend
Nenhuma página dedicada é necessária.
A criação poderá ocorrer:
automaticamente durante o onboarding;
após o primeiro login;
ou mediante fluxo definido pelo produto.
O frontend deverá tratar a criação como uma etapa transparente para o usuário.

10. Logging
Registrar
Identity ID
Trust Passport ID
Resultado
Tempo de processamento
Correlation ID

11. Eventos
Publicar
TrustPassport.Created
Payload
{
  "trustPassportId":"UUID",
  "identityId":"UUID",
  "status":"ACTIVE",
  "createdAt":"2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para
Identity ativa
Identity inexistente
Identity inativa
Passport já existente
Inicialização correta dos atributos
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Persistência
Constraint UNIQUE
Evento publicado
Auditoria

14. Acceptance Criteria
A Feature será considerada pronta quando
Um Trust Passport for criado corretamente para uma Identity elegível.
Apenas um Trust Passport puder existir por Identity.
Todos os atributos forem inicializados corretamente.
O evento TrustPassport.Created for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
Migration
Aggregate TrustPassport
Repository
Factory
CreateTrustPassportUseCase
DTOs
Endpoint POST /api/v1/trust-passports
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
O Trust Passport for criado corretamente.
A integridade entre Identity e Trust Passport estiver garantida.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
