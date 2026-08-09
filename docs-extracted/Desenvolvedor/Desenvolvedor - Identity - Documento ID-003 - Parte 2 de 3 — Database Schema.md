
ID-003 — Database Schema
Parte 2 de 3
Module: Identity
Document ID: ID-003
Version: 1.0
Status: Approved for Development

13. Table — memberships
A tabela memberships representa o relacionamento entre uma Identity e uma Organization.
Um usuário pode participar de várias organizações.
Uma organização pode possuir milhares de usuários.

Columns
Column
Type
Null
Description
id
UUID
No
Primary Key
identity_id
UUID
No
FK → identities.id
organization_id
UUID
No
FK → organizations.id
role
VARCHAR(50)
No
Role assigned
status
VARCHAR(30)
No
Membership status
joined_at
TIMESTAMP WITH TIME ZONE
No
Join date
invited_by
UUID
Yes
FK → identities.id
created_at
TIMESTAMP WITH TIME ZONE
No
Creation timestamp
updated_at
TIMESTAMP WITH TIME ZONE
No
Last update
deleted_at
TIMESTAMP WITH TIME ZONE
Yes
Soft delete

Foreign Keys
identity_id
    → identities.id

organization_id
    → organizations.id

invited_by
    → identities.id

Constraints
PRIMARY KEY(id)

UNIQUE(identity_id, organization_id)
Um usuário não poderá possuir dois vínculos ativos com a mesma organização.

Indexes
idx_membership_identity

idx_membership_organization

idx_membership_role

idx_membership_status

14. Table — sessions
Representa uma sessão autenticada.
Cada login gera uma nova sessão.

Columns
Column
Type
id
UUID
identity_id
UUID
refresh_token_hash
TEXT
ip_address
VARCHAR(50)
device_name
VARCHAR(255)
browser
VARCHAR(120)
operating_system
VARCHAR(120)
device_type
VARCHAR(50)
country
VARCHAR(100)
city
VARCHAR(100)
last_activity
TIMESTAMP WITH TIME ZONE
expires_at
TIMESTAMP WITH TIME ZONE
revoked_at
TIMESTAMP WITH TIME ZONE NULL
created_at
TIMESTAMP WITH TIME ZONE

Foreign Key
identity_id

↓

identities.id

Indexes
idx_session_identity

idx_session_expiration

idx_session_activity

Business Rules
Uma sessão:
pertence a apenas uma Identity;
pode ser revogada independentemente;
possui apenas um Refresh Token válido;
expira automaticamente.

15. Table — email_verifications
Controla a confirmação de e-mail.

Columns
Column
Type
id
UUID
identity_id
UUID
token_hash
TEXT
expires_at
TIMESTAMP WITH TIME ZONE
verified_at
TIMESTAMP WITH TIME ZONE NULL
created_at
TIMESTAMP WITH TIME ZONE

Foreign Key
identity_id

↓

identities.id

Indexes
idx_email_verification_identity

idx_email_verification_expiration

16. Table — phone_verifications
Controla códigos OTP.

Columns
Column
Type
id
UUID
identity_id
UUID
otp_hash
TEXT
expires_at
TIMESTAMP WITH TIME ZONE
verified_at
TIMESTAMP WITH TIME ZONE NULL
created_at
TIMESTAMP WITH TIME ZONE

Indexes
idx_phone_verification_identity

idx_phone_verification_expiration

17. Table — identity_verifications
Processo de KYC.

Columns
Column
Type
id
UUID
identity_id
UUID
provider
VARCHAR(120)
status
VARCHAR(30)
started_at
TIMESTAMP WITH TIME ZONE
completed_at
TIMESTAMP WITH TIME ZONE NULL
rejected_reason
TEXT NULL
created_at
TIMESTAMP WITH TIME ZONE
updated_at
TIMESTAMP WITH TIME ZONE

Status
Pending

Processing

Approved

Rejected

Expired

Indexes
idx_identity_verification_identity

idx_identity_verification_status

18. Table — organization_verifications
Processo de KYB.

Columns
Column
Type
id
UUID
organization_id
UUID
provider
VARCHAR(120)
status
VARCHAR(30)
started_at
TIMESTAMP WITH TIME ZONE
completed_at
TIMESTAMP WITH TIME ZONE NULL
rejected_reason
TEXT NULL
created_at
TIMESTAMP WITH TIME ZONE
updated_at
TIMESTAMP WITH TIME ZONE

Foreign Key
organization_id

↓

organizations.id

Indexes
idx_org_verification_org

idx_org_verification_status

19. Entity Relationship Overview
identities
    │
    ├──────────────┐
    │              │
    │              │
memberships     sessions
    │
    │
organizations
    │
organization_verifications

identities
    │
    ├──────────────┐
    │              │
email_verifications
phone_verifications
identity_verifications

20. Referential Integrity Rules
Todas as Foreign Keys deverão utilizar:
ON UPDATE RESTRICT
Para exclusão lógica:
ON DELETE RESTRICT
Nenhuma exclusão física poderá quebrar a integridade referencial.

21. Transaction Rules
As seguintes operações deverão ocorrer em transações ACID:
criação de Identity;
criação de Organization;
criação de Membership;
alteração de senha;
alteração de e-mail;
alteração de telefone;
revogação de sessões;
conclusão de KYC;
conclusão de KYB.
Caso qualquer etapa falhe, toda a transação deverá ser revertida (rollback).
