
ID-002 — Identity Domain Model
Module: Identity
Document ID: ID-002
Version: 1.0
Status: Approved
Owner: Platform Architecture Team
Depends on: ID-001 – Product Specification

1. Purpose
O Domain Model define toda a estrutura lógica do módulo Identity.
Este documento estabelece:
Entidades
Value Objects
Aggregate Roots
Relacionamentos
Invariantes
Regras de negócio
Limites de contexto
Ele serve como a principal referência para:
Backend
Banco de Dados
APIs
Eventos
Frontend
Testes
Nenhuma implementação poderá violar as regras definidas neste documento.

2. Bounded Context
O módulo Identity possui responsabilidade exclusiva sobre a identidade digital dos usuários.
Ele é responsável por:
Cadastro
Login
Perfil
Sessões
Credenciais
Organizações
Vínculos
Verificações (KYC/KYB)
Ele NÃO é responsável por:
Marketplace
Contratos
Pagamentos
Trust Score
Trust Passport
Reputação
Wallet
Trust Coins
Esses módulos apenas referenciam o IdentityId.

3. Ubiquitous Language
Todos os times deverão utilizar exatamente os seguintes termos.
Termo
Definição
Identity
Identidade única da plataforma
Organization
Empresa cadastrada
Membership
Vínculo entre usuário e empresa
Session
Sessão autenticada
Role
Papel desempenhado pelo usuário
Permission
Permissão concedida
Verification
Processo de validação
Identity Verification
Verificação KYC
Organization Verification
Verificação KYB
Profile
Dados públicos da identidade
Não utilizar sinônimos como User, Company User, Client User, Corporate User etc.
A nomenclatura oficial do domínio é obrigatória.

4. Aggregate Roots
O domínio possui cinco Aggregate Roots.
Identity
Responsável por toda identidade digital.
Controla:
credenciais
perfil
status
autenticação
idioma
configurações

Organization
Representa uma empresa.
Controla:
dados legais
representantes
status
verificação

Membership
Representa o relacionamento entre uma Identity e uma Organization.
Controla:
papéis
permissões
data de entrada
status

Session
Representa uma autenticação ativa.
Controla:
refresh token
dispositivo
localização
expiração

Verification
Responsável por:
Email
Telefone
KYC
KYB

5. Entity — Identity
Representa uma identidade única na Trust Platform.
Responsabilidades
autenticar
alterar senha
alterar e-mail
alterar telefone
alterar perfil
alterar preferências
manter histórico
publicar eventos
Atributos
Campo
Tipo
IdentityId
UUID
Email
Email
Phone
Phone
PasswordHash
String
FirstName
String
LastName
String
ProfilePhoto
URL
Language
String
Timezone
String
Country
String
City
String
Status
IdentityStatus
CreatedAt
DateTime
UpdatedAt
DateTime
DeletedAt
DateTime?

6. Invariantes da Identity
As seguintes regras nunca poderão ser violadas.
IdentityId
É imutável.
Nunca muda durante toda a vida da conta.

Email
É único.
Não pode existir duplicidade.

Phone
É único.
Não pode existir duplicidade.

Password
Nunca poderá ser armazenada em texto puro.
Somente PasswordHash.

DeletedAt
Soft Delete.
Nunca remover fisicamente.

7. Entity — Organization
Representa uma empresa.
Campos
Campo
Tipo
OrganizationId
UUID
LegalName
String
TradeName
String
TaxId
String
Country
String
Website
URL
Logo
URL
VerificationStatus
VerificationStatus
CreatedAt
DateTime
UpdatedAt
DateTime

8. Responsabilidades da Organization
A Organization controla:
dados legais
representantes
membros
verificação
branding
Uma Organization nunca realiza login.
Quem realiza login é sempre uma Identity.

9. Entity — Membership
Membership representa o relacionamento entre uma Identity e uma Organization.
Uma Identity pode participar de várias empresas.
Uma empresa pode possuir milhares de usuários.
Campos
Campo
Tipo
MembershipId
UUID
IdentityId
UUID
OrganizationId
UUID
Role
Role
Status
MembershipStatus
JoinedAt
DateTime
InvitedBy
IdentityId

10. Regras do Membership
Uma Membership sempre pertence exatamente a:
uma Identity
uma Organization
Não existe Membership sem ambos.
Uma Membership removida nunca é reutilizada.
