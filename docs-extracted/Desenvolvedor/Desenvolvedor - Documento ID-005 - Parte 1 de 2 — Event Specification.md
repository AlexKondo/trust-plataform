
ID-005 — Event Specification
Parte 1 de 2
Module: Identity
Document ID: ID-005
Version: 1.0
Status: Approved for Development
Depends on:
ID-001 – Product Specification
ID-002 – Domain Model
ID-003 – Database Schema
ID-004 – API Specification

1. Purpose
Este documento define os eventos de domínio publicados e consumidos pelo módulo Identity.
Os eventos permitem a integração desacoplada entre módulos da Trust Platform.

2. Event Naming Convention
Todos os eventos deverão utilizar o formato:
<Aggregate>.<Event>
Exemplos:
Identity.Created
Identity.Updated
Identity.Deleted
Organization.Created
Membership.Created
Os nomes dos eventos são imutáveis após publicação.

3. Standard Event Structure
Todos os eventos deverão possuir a seguinte estrutura:
{
  "eventId": "uuid",
  "eventType": "Identity.Created",
  "occurredAt": "2026-08-03T14:30:00Z",
  "version": "1.0",
  "data": {}
}
Campos
Campo
Descrição
eventId
Identificador único do evento
eventType
Nome do evento
occurredAt
Data e hora da ocorrência
version
Versão do contrato do evento
data
Payload específico do evento

4. Published Events
O módulo Identity publica os seguintes eventos:
Evento
Descrição
Identity.Created
Nova identidade criada
Identity.Updated
Dados da identidade alterados
Identity.PasswordChanged
Senha alterada
Identity.EmailVerified
E-mail confirmado
Identity.PhoneVerified
Telefone confirmado
Organization.Created
Organização criada
Membership.Created
Membro adicionado
Membership.Updated
Vínculo alterado
Membership.Removed
Vínculo removido

5. Event — Identity.Created
Descrição
Publicado após a criação bem-sucedida de uma nova Identity.

Payload
{
  "identityId": "uuid",
  "email": "john@example.com",
  "phone": "+5511999999999",
  "createdAt": "2026-08-03T14:30:00Z"
}

Consumers
Trust Passport
Authentication
Reputation
AI

6. Event — Identity.Updated
Descrição
Publicado quando informações cadastrais da Identity forem alteradas.

Payload
{
  "identityId": "uuid",
  "updatedFields": [
    "firstName",
    "city"
  ],
  "updatedAt": "2026-08-03T15:00:00Z"
}

Consumers
Trust Passport
AI

7. Event — Identity.PasswordChanged
Descrição
Publicado após alteração da senha.

Payload
{
  "identityId": "uuid",
  "changedAt": "2026-08-03T15:20:00Z"
}

Consumers
Authentication
Security
Audit

8. Event — Identity.EmailVerified
Descrição
Publicado quando o endereço de e-mail for confirmado.

Payload
{
  "identityId": "uuid",
  "email": "john@example.com",
  "verifiedAt": "2026-08-03T15:40:00Z"
}

Consumers
Trust Passport
Reputation

