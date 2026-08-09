
ID-003 — Database Schema
Parte 1 de 3
Module: Identity
Document ID: ID-003
Version: 1.0
Status: Approved for Development
Depends on:
ID-001 – Product Specification
ID-002 – Domain Model

1. Purpose
Este documento define o modelo físico do banco de dados do módulo Identity.
O objetivo é garantir:
Integridade dos dados.
Alto desempenho.
Escalabilidade.
Consistência transacional.
Facilidade de manutenção.
Compatibilidade com futuras expansões da Trust Platform.
Todas as implementações de persistência deverão seguir rigorosamente este documento.

2. Database Engine
Banco recomendado:
PostgreSQL 16+
Motivos:
Excelente suporte a JSON.
Índices avançados.
Performance.
Escalabilidade.
Excelente suporte para UUID.
Alta maturidade.
A arquitetura deverá permitir futura migração para soluções distribuídas sem alteração do domínio.

3. Naming Convention
Tabelas
Sempre plural.
Exemplos:
identities
organizations
memberships
sessions
Nunca:
identity
tbl_identity
tb_identity

Primary Keys
Sempre:
id UUID PRIMARY KEY
Nunca utilizar:
bigint
auto increment
integer

Foreign Keys
Sempre:
identity_id

organization_id

membership_id

Datas
Sempre:
created_at

updated_at

deleted_at
Nunca:
createDate

lastUpdate

modified

4. UUID Strategy
Todos os registros utilizarão UUID v7 (ou UUID v4 caso v7 não esteja disponível).
Benefícios:
Escalabilidade.
Segurança.
Evita colisões.
Facilita sincronização distribuída.
Nenhuma tabela utilizará chave sequencial.

5. Audit Fields
Todas as entidades principais possuirão:
Campo
Tipo
created_at
TIMESTAMP WITH TIME ZONE
updated_at
TIMESTAMP WITH TIME ZONE
deleted_at
TIMESTAMP WITH TIME ZONE NULL
Opcionalmente poderão existir:
created_by
updated_by
para auditoria administrativa.

6. Soft Delete Policy
Nenhuma entidade crítica será removida fisicamente.
Exclusões utilizarão:
deleted_at = CURRENT_TIMESTAMP
Consultas padrão deverão sempre considerar:
WHERE deleted_at IS NULL

7. Table — identities
Representa uma identidade única da plataforma.
Columns
Column
Type
Null
Description
id
UUID
No
Primary Key
email
VARCHAR(255)
No
Unique e-mail
phone
VARCHAR(30)
No
Unique phone
password_hash
TEXT
No
Password hash
first_name
VARCHAR(120)
No
First name
last_name
VARCHAR(120)
No
Last name
profile_photo_url
TEXT
Yes
Avatar
language
VARCHAR(10)
No
ISO Language
timezone
VARCHAR(60)
No
Timezone
country
VARCHAR(100)
Yes
Country
city
VARCHAR(100)
Yes
City
status
VARCHAR(30)
No
Account status
created_at
TIMESTAMP WITH TIME ZONE
No
Creation
updated_at
TIMESTAMP WITH TIME ZONE
No
Last update
deleted_at
TIMESTAMP WITH TIME ZONE
Yes
Soft delete

Constraints
PRIMARY KEY (id)

UNIQUE(email)

UNIQUE(phone)

Indexes
idx_identity_email

idx_identity_phone

idx_identity_status

8. Business Rules
Uma Identity:
possui apenas um e-mail principal;
possui apenas um telefone principal;
nunca poderá possuir senha em texto puro;
nunca será removida fisicamente.

9. Table — organizations
Representa empresas cadastradas.
Columns
Column
Type
id
UUID
legal_name
VARCHAR(255)
trade_name
VARCHAR(255)
tax_id
VARCHAR(60)
country
VARCHAR(100)
website
TEXT
logo_url
TEXT
verification_status
VARCHAR(30)
created_at
TIMESTAMP WITH TIME ZONE
updated_at
TIMESTAMP WITH TIME ZONE
deleted_at
TIMESTAMP WITH TIME ZONE NULL

Constraints
PRIMARY KEY(id)

UNIQUE(tax_id)

Indexes
idx_org_taxid
idx_org_status

10. Business Rules
Uma Organization:
possui apenas um TaxId;
pode possuir milhares de membros;
nunca realiza login;
nunca possui senha.

11. Relationship
Identity
1
↓
Membership
↓
N
Organization
O relacionamento entre usuários e empresas é realizado exclusivamente pela tabela memberships.
Nenhuma coluna organization_id deverá existir diretamente na tabela identities.

12. Data Retention
Os seguintes registros nunca poderão ser excluídos fisicamente:
identities
organizations
Motivo:
Auditoria.
Compliance.
LGPD (preservação controlada).
Histórico de transações.
