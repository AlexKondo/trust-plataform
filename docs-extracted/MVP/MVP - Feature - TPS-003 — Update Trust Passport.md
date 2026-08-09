
Trust Platform MVP
Feature Specification
TPS-003 — Update Trust Passport

Document Information
Campo
Valor
Feature ID
TPS-003
Feature Name
Update Trust Passport
Module
Trust Passport
Priority
High
Sprint
Sprint 2
Status
Ready for Development
Depends On
TPS-002 – Get Trust Passport
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TPS-004 – Verify Identity Documents

1. Business Objective
Permitir que um usuário autenticado atualize os atributos editáveis do seu Trust Passport, preservando a integridade das informações verificadas e garantindo que alterações relevantes iniciem novos processos de verificação quando necessário.

2. Scope
Esta Feature Inclui
Atualização de atributos permitidos
Validação das regras de edição
Recalcular o percentual de completude do perfil
Reiniciar verificações quando aplicável
Registro de auditoria
Publicação de evento

Esta Feature NÃO Inclui
Alteração de identidade (Identity)
Alteração de documentos oficiais
Alteração do Trust Score
Alteração de Badges
Alteração do histórico
Configurações de privacidade

3. User Story
Como um usuário autenticado
Quero atualizar as informações editáveis do meu Trust Passport
Para que meu perfil de confiança permaneça atualizado.

4. Business Rules
BR-001
Somente o proprietário do Trust Passport poderá atualizá-lo, salvo perfis administrativos autorizados.

BR-002
Somente atributos classificados como EDITABLE poderão ser alterados.

BR-003
Atributos classificados como IMMUTABLE não poderão ser alterados por APIs públicas.
Exemplos:
CPF
Identificador do Passaporte
Data de criação
Trust Score
Badges
Histórico de reputação

BR-004
Alterações em atributos sujeitos à verificação deverão alterar seu status para PENDING_VERIFICATION, quando aplicável.
Exemplos:
Nome completo
Número de telefone
Endereço
Documento de identidade

BR-005
O percentual de completude (profileCompletion) deverá ser recalculado após cada atualização.

BR-006
A operação deverá ser registrada na trilha de auditoria.

5. Functional Flow
Usuário autenticado

↓

PUT /api/v1/trust-passports/me

↓

Validar Access Token

↓

Buscar Trust Passport

↓
Validar campos editáveis
↓
Atualizar atributos
↓
Recalcular profileCompletion
↓
Atualizar verificações necessárias
↓
Persistir
↓
Registrar Auditoria
↓
Publicar Evento
↓
HTTP 200

6. Backend Implementation
6.1 Use Case
Criar
UpdateTrustPassportUseCase
Fluxo obrigatório
Validar autenticação.
Buscar Trust Passport.
Validar permissões.
Validar campos editáveis.
Aplicar alterações.
Recalcular profileCompletion.
Atualizar status das verificações afetadas.
Persistir alterações.
Registrar auditoria.
Publicar evento.
Retornar resultado.

6.2 Repository
Atualizar
TrustPassportRepository
Adicionar
update()
save()

6.3 Domain Services
Criar
ProfileCompletionCalculator
Responsável por recalcular o percentual de completude conforme as regras vigentes do domínio.

6.4 DTOs
Criar
UpdateTrustPassportRequest
UpdateTrustPassportResponse

6.5 Exceptions
Criar
ImmutableFieldException
TrustPassportNotFoundException
ValidationException

7. Database
Nenhuma alteração estrutural.
Atualizar registros da tabela:
trust_passports
A operação deverá ser executada em transação.

8. API
Endpoint
PUT /api/v1/trust-passports/me

Header
Authorization: Bearer {accessToken}

Request
Exemplo simplificado:
{
  "fullName": "John Smith",
  "phone": "+55 11 99999-9999",
  "address": {
    "country": "BR",
    "state": "SP",
    "city": "Valinhos"
  }
}
Observação: Os campos efetivamente aceitos deverão ser definidos pelo modelo de domínio do Trust Passport. Campos classificados como imutáveis deverão ser rejeitados.

Response
{
  "success": true,
  "data": {
    "trustPassportId": "UUID",
    "profileCompletion": 68.5,
    "updatedAt": "2026-08-03T18:30:00Z"
  }
}

Possíveis Erros
400 Validation Error
401 Unauthorized
403 Immutable Field
404 Trust Passport Not Found
500 Internal Server Error

9. Frontend
Atualizar a tela:
/trust-passport
Funcionalidades:
Editar apenas campos permitidos.
Exibir claramente campos bloqueados.
Informar quando uma alteração exigirá nova verificação.
Atualizar o percentual de completude após a operação.

10. Logging
Registrar
Identity ID
Trust Passport ID
Campos alterados
Resultado
Tempo de processamento
Correlation ID
Os valores antigos e novos de dados pessoais deverão seguir as políticas de mascaramento definidas no DOC-006.

11. Eventos
Publicar
TrustPassport.Updated
Payload mínimo:
{
  "trustPassportId": "UUID",
  "identityId": "UUID",
  "updatedFields": [
    "phone",
    "address"
  ],
  "updatedAt": "2026-08-03T18:30:00Z"
}

12. Testes Unitários
Implementar testes para
Atualização válida
Tentativa de alteração de campo imutável
Recalcular profileCompletion
Reinício de verificações quando aplicável
Publicação do evento

13. Testes de Integração
Validar
Endpoint
Persistência
Auditoria
Publicação do evento
Rejeição de campos imutáveis

14. Acceptance Criteria
A Feature será considerada pronta quando
Apenas campos editáveis puderem ser alterados.
Campos imutáveis forem rejeitados.
O percentual de completude for recalculado corretamente.
Verificações impactadas forem marcadas conforme as regras de negócio.
O evento TrustPassport.Updated for publicado.
Todos os testes forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar
UpdateTrustPassportUseCase
Atualização do TrustPassportRepository
ProfileCompletionCalculator
DTOs
Endpoint PUT /api/v1/trust-passports/me
Atualização da interface /trust-passport
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI

16. Definition of Done
A Feature somente poderá ser encerrada quando
Todos os entregáveis estiverem implementados.
As regras de edição forem respeitadas.
A integridade do Trust Passport estiver preservada.
O percentual de completude for recalculado corretamente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
