
ID-003 — Database Schema
Parte 3 de 3
Module: Identity
Document ID: ID-003
Version: 1.0
Status: Approved for Development

22. Index Strategy
Os índices deverão ser criados considerando consultas frequentes, autenticação e escalabilidade.
Índices obrigatórios
identities
email
phone
status
deleted_at

organizations
tax_id

verification_status

deleted_at

memberships
identity_id

organization_id

role

status

sessions
identity_id

expires_at

last_activity

revoked_at

identity_verifications
identity_id
status

organization_verifications
organization_id
status

23. Performance Guidelines
O banco deverá suportar crescimento para dezenas de milhões de usuários sem alterações estruturais significativas.
Requisitos mínimos
Consultas de login inferiores a 100 ms (P95).
Busca por e-mail inferior a 50 ms.
Busca por telefone inferior a 50 ms.
Recuperação de sessões inferiores a 100 ms.
Consultas utilizando índices sempre que possível.
Evitar SELECT * em produção.

24. Scalability Strategy
O modelo deverá permitir evolução gradual.
Fase 1
PostgreSQL único.
Replicação de leitura opcional.
Fase 2
Read Replicas.
Pool de conexões.
Cache distribuído.
Fase 3
Particionamento lógico.
Sharding por IdentityId (quando necessário).
Serviços independentes.

25. Data Security
Passwords
Nunca armazenar senha em texto puro.
Utilizar algoritmo moderno de hash resistente a ataques de força bruta (por exemplo, Argon2id ou bcrypt com fator de custo adequado).

Tokens
Nunca armazenar Refresh Tokens em texto puro.
Persistir apenas o hash do token.

OTP
Nunca armazenar códigos OTP em texto puro.
Persistir apenas o hash.

Dados sensíveis
Todos os dados sensíveis deverão ser protegidos conforme a política de segurança da plataforma, incluindo criptografia em repouso quando aplicável.

26. Migration Strategy
Todas as alterações deverão ocorrer através de migrations versionadas.
Regras:
Nunca editar migrations executadas.
Toda migration deverá possuir rollback quando tecnicamente viável.
Uma migration deve realizar apenas uma alteração lógica.
Toda migration deverá ser validada em ambiente de homologação antes da produção.

27. Backup Strategy
Requisitos mínimos:
Backup diário completo.
Backups incrementais conforme política operacional.
Testes periódicos de restauração.
Armazenamento em local distinto do banco principal.
Criptografia dos backups.

28. Audit Requirements
Todas as alterações deverão registrar:
Data.
Hora.
Usuário responsável (quando aplicável).
Operação executada.
Entidade afetada.
As tabelas de auditoria poderão ser implementadas em módulo específico, mantendo rastreabilidade completa.

29. Versioning
Toda alteração estrutural deverá incrementar a versão do schema.
Exemplo:
v1.0.0
v1.1.0
v2.0.0
A documentação deverá acompanhar as versões do banco de dados.

30. Acceptance Criteria
O schema será considerado aprovado quando:
Todas as tabelas forem criadas.
Todas as chaves primárias utilizarem UUID.
Todas as Foreign Keys estiverem válidas.
Todos os índices obrigatórios forem criados.
Todas as constraints forem implementadas.
As regras de Soft Delete estiverem funcionando.
Os testes de integridade referencial forem aprovados.
O processo de migração puder ser executado sem erros.
Os testes de autenticação, cadastro e gerenciamento de sessões utilizarem corretamente o schema definido.

31. Future Extensions
O modelo foi projetado para permitir a adição futura de:
Passkeys (WebAuthn).
Autenticação multifator (MFA).
Login social (Google, Apple, Microsoft, LinkedIn).
Múltiplos telefones por identidade.
Múltiplos e-mails por identidade.
Histórico de alterações de perfil.
Delegação avançada de permissões.
Organizações hierárquicas.
Suporte a múltiplas jurisdições de identificação.
Essas extensões deverão preservar compatibilidade com o modelo atual sempre que possível.

32. Conclusion
Este documento estabelece o modelo físico oficial do módulo Identity da Trust Platform.
Qualquer implementação de persistência deverá estar em conformidade com este schema. Alterações futuras deverão ser avaliadas pelo time de arquitetura e refletidas em nova versão desta especificação.
