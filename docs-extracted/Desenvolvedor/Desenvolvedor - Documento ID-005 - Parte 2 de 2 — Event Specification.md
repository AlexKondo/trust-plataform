
ID-005 — Event Specification
Parte 2 de 2
Module: Identity
Document ID: ID-005
Version: 1.0
Status: Approved for Development

9. Event — Identity.PhoneVerified
Description
Publicado após a confirmação bem-sucedida do telefone da Identity.

Payload
{
  "identityId": "uuid",
  "phone": "+5511999999999",
  "verifiedAt": "2026-08-03T15:50:00Z"
}

10. Event — Organization.Created
Description
Publicado após a criação de uma nova organização.

Payload
{
  "organizationId": "uuid",
  "legalName": "Trust Tecnologia Ltda.",
  "tradeName": "Trust",
  "taxId": "12.345.678/0001-90",
  "createdAt": "2026-08-03T16:00:00Z"
}

11. Event — Membership.Created
Description
Publicado quando uma Identity é vinculada a uma Organization.

Payload
{
  "membershipId": "uuid",
  "identityId": "uuid",
  "organizationId": "uuid",
  "role": "BUYER",
  "status": "PENDING",
  "createdAt": "2026-08-03T16:10:00Z"
}

12. Event — Membership.Updated
Description
Publicado quando o papel (role) ou o status de um vínculo é alterado.

Payload
{
  "membershipId": "uuid",
  "identityId": "uuid",
  "organizationId": "uuid",
  "role": "ADMIN",
  "status": "ACTIVE",
  "updatedAt": "2026-08-03T16:20:00Z"
}

13. Event — Membership.Removed
Description
Publicado quando um vínculo entre uma Identity e uma Organization é removido.

Payload
{
  "membershipId": "uuid",
  "identityId": "uuid",
  "organizationId": "uuid",
  "removedAt": "2026-08-03T16:30:00Z"
}

14. Consumed Events
O módulo Identity não consome eventos de outros módulos nesta versão da especificação.
Caso futuramente sejam adicionadas integrações orientadas a eventos, este documento deverá ser atualizado.

15. Event Versioning
Todo evento deverá possuir um campo version.
Exemplo:
{
  "eventType": "Identity.Created",
  "version": "1.0"
}
Alterações incompatíveis com versões anteriores deverão resultar em uma nova versão do contrato do evento.

16. Delivery Requirements
Os eventos publicados deverão atender aos seguintes requisitos:
Cada evento deve possuir um identificador único (eventId).
O horário da ocorrência deve ser registrado em UTC (occurredAt).
O payload deve conter apenas os dados necessários para representar o fato ocorrido.
Eventos publicados não devem ser alterados após sua emissão.

17. Idempotency
Consumidores de eventos devem tratar eventos duplicados de forma segura.
A unicidade do evento deverá ser garantida pelo campo eventId.

18. Error Handling
Falhas na publicação de eventos deverão ser registradas para possibilitar reprocessamento.
O mecanismo de publicação e recuperação de falhas será definido na arquitetura de backend.

19. Acceptance Criteria
A especificação será considerada implementada quando:
Todos os eventos definidos neste documento puderem ser publicados.
O payload de cada evento seguir exatamente o contrato especificado.
Todos os eventos possuírem eventId, eventType, occurredAt e version.
Os eventos forem versionados de forma controlada.
O mecanismo de publicação garantir rastreabilidade dos eventos.

20. Conclusion
Este documento define os contratos dos eventos publicados pelo módulo Identity.
Detalhes sobre infraestrutura de mensageria, tecnologia utilizada, mecanismos de entrega, filas, tópicos, brokers e consumidores específicos fazem parte da documentação de arquitetura e não desta especificação.
