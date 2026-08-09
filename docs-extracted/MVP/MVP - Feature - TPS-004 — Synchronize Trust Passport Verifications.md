
Trust Platform MVP
Feature Specification
TPS-004 — Synchronize Trust Passport Verifications

Document Information
Campo
Valor
Feature ID
TPS-004
Feature Name
Synchronize Trust Passport Verifications
Module
Trust Passport
Priority
Critical
Sprint
Sprint 3
Status
Ready for Development
Depends On
VRF-004 – Approve VerificationVRF-005 – Reject Verification
References
DOC-001, DOC-002, DOC-003, DOC-004, DOC-005, DOC-006, DOC-007
Blocks
TRS-001 – Calculate Trust Score

1. Business Objective
Manter o Trust Passport sincronizado com o resultado oficial das Verifications aprovadas ou rejeitadas, disponibilizando uma visão consolidada do nível de verificação do usuário.
O Trust Passport não executa verificações. Ele apenas reflete o estado atual proveniente do módulo Verification.

2. Scope
Esta Feature Inclui
Consumo de eventos de Verification
Atualização da visão consolidada do Passport
Recalcular percentual de completude
Registro de auditoria

Esta Feature NÃO Inclui
Criar Verification
Aprovar Verification
Rejeitar Verification
Calcular Trust Score

3. User Story
Como Trust Passport
Quero refletir automaticamente os resultados das verificações
Para que o perfil do usuário represente seu estado atual de confiança.

4. Business Rules
BR-001
O Trust Passport deverá consumir o evento:
Verification.Approved

BR-002
Ao receber uma aprovação, o atributo correspondente deverá ser marcado como verificado na visão consolidada do Passport.
Exemplo:
DOCUMENT → Documento Verificado
EMAIL → E-mail Verificado
PHONE → Telefone Verificado
ADDRESS → Endereço Verificado

BR-003
Caso exista uma Verification rejeitada, o Passport não deverá marcar o atributo como verificado.

BR-004
O histórico completo permanecerá exclusivamente no módulo Verification.
O Trust Passport armazenará apenas a visão consolidada necessária para consultas rápidas.

BR-005
Toda atualização deverá recalcular o campo:
profileCompletion

BR-006
O processamento deverá ser idempotente.
Eventos duplicados não poderão gerar inconsistências.

5. Functional Flow
Verification.Approved

↓

Consumir Evento

↓
Localizar Trust Passport
↓
Atualizar atributo consolidado
↓
Recalcular Profile Completion
↓
Persistir
↓
Registrar Auditoria

6. Backend Implementation
6.1 Event Consumer
Criar
VerificationApprovedConsumer
Consumir:
Verification.Approved

6.2 Use Case
Criar
SynchronizeTrustPassportVerificationUseCase
Fluxo obrigatório
Receber evento.
Validar idempotência.
Localizar Trust Passport.
Atualizar visão consolidada.
Recalcular Profile Completion.
Persistir alterações.
Registrar auditoria.

6.3 DTOs
Criar
VerificationApprovedEvent

6.4 Exceptions
Criar
TrustPassportNotFoundException
DuplicateEventException

7. Database
Nenhuma nova tabela.
Atualizar a tabela:
trust_passports
Campos consolidados sugeridos:
Campo
Tipo
verified_email
BOOLEAN
verified_phone
BOOLEAN
verified_document
BOOLEAN
verified_address
BOOLEAN
profile_completion
INTEGER
updated_at
TIMESTAMP
Esses campos representam uma projeção otimizada para leitura, derivada do módulo Verification, e não a fonte oficial da verdade.

8. Integração
Consumir o evento:
Verification.Approved
Payload esperado
{
  "verificationId": "UUID",
  "trustPassportId": "UUID",
  "type": "DOCUMENT",
  "approvedAt": "2026-08-03T18:30:00Z"
}

9. Frontend
Ao consultar o Trust Passport:
Exibir indicadores de atributos verificados.
Atualizar automaticamente após sincronização.
Exibir o percentual de completude.

10. Logging
Registrar:
Event ID
Verification ID
Trust Passport ID
Tipo da verificação
Resultado da sincronização
Correlation ID

11. Eventos
Publicar:
TrustPassport.Updated
Payload mínimo
{
  "trustPassportId": "UUID",
  "profileCompletion": 80,
  "updatedAt": "2026-08-03T18:35:00Z"
}

12. Testes Unitários
Implementar testes para:
Consumo do evento
Atualização correta do atributo
Recalcular Profile Completion
Idempotência
Passport inexistente

13. Testes de Integração
Validar:
Consumo do evento
Persistência
Atualização da projeção
Auditoria
Publicação do evento

14. Acceptance Criteria
A Feature será considerada pronta quando:
O Passport refletir corretamente as Verifications aprovadas.
O processamento for idempotente.
O Profile Completion for recalculado.
O evento TrustPassport.Updated for publicado.
Todos os testes automatizados forem aprovados.

15. Deliverables
O desenvolvedor deverá entregar:
Consumer VerificationApprovedConsumer
SynchronizeTrustPassportVerificationUseCase
DTO do evento
Atualização da projeção trust_passports
Testes Unitários
Testes de Integração
Atualização da documentação OpenAPI (quando aplicável)

16. Definition of Done
A Feature somente poderá ser encerrada quando:
A sincronização ocorrer corretamente após eventos de aprovação.
A projeção do Trust Passport estiver consistente.
O processamento for idempotente.
Todos os testes automatizados estiverem aprovados.
O Code Review estiver aprovado.
Todos os Acceptance Criteria forem atendidos.
