---
name: trust-security
description: Padrões de segurança da Trust Platform (senhas, tokens, sessões, rate limiting, auditoria, secure coding). Use ao implementar autenticação, autorização, qualquer endpoint sensível, upload, ou ao revisar segurança. Fonte - DOC-002, ID-006.
---

# Security Standards — Trust Platform

## Princípios

Security by Design · Zero Trust · Least Privilege · Fail Secure · Privacy by Design (LGPD).

## Senhas

- Política oficial (DOC-002 — vence qualquer spec que diga 8): **mínimo 12 caracteres**, 1 maiúscula, 1 minúscula, 1 número, 1 especial; não conter nome/e-mail do usuário
- Hash: Argon2id ou bcrypt com salt individual; `PasswordHashService` é o único componente que gera/verifica hash
- Nunca em texto puro, logs, eventos ou mensagens de erro

## Tokens e sessões

- **Access Token JWT**: 15 min, assinado, contém IdentityId, sem dados sensíveis
- **Refresh Token**: 30 dias, criptograficamente seguro, persistido **só como hash**, vinculado a 1 sessão, **rotação obrigatória** (invalidado após uso), revogável
- Sessão registra: dispositivo, user agent, IP, criação, expiração, última atividade, status
- Reset de senha (IDN-008): revoga **todas** as sessões. Change password (IDN-009): revoga todas **exceto a atual**
- Validação de token: assinatura + expiração + (no refresh) existência e status da sessão → falha = 401
- Proteção IDOR: toda query filtra pelo dono do recurso; nunca confiar em ID vindo do cliente sem checar ownership

## Autorização

- **Sempre no backend** (frontend é só UX), considerando Identity, organização, roles, ownership e contexto
- Endpoints `/admin/*` exigem papel administrativo — nunca só autenticação

## Rate limiting e lockout

- Obrigatório em: login, forgot/reset password, verify email, OTP, APIs públicas
- Lockout de conta após N tentativas inválidas — limites **configuráveis**, nunca hardcoded
- Respostas anti-enumeração (mesma resposta exista ou não o usuário)

## Auditoria (trilha imutável em `audit_logs`)

Obrigatória para: login, logout, criação de Identity, verificação de e-mail, alteração/recuperação de senha, alterações cadastrais, mudanças de permissão, revogação de sessões, operações administrativas, exclusões lógicas, aprovações críticas (verifications, disputas), operações financeiras, acessos a Trust Profile de terceiros.
Registro mínimo: timestamp, identity_id, operation, resource + id, result, ip, user_agent, correlation_id. Append-only.

## Output e erros

Nunca retornar: senha/hash, refresh token (fora dos endpoints de auth), segredos, stack trace, SQL, infra. Erro genérico para o cliente ("Invalid credentials"), detalhe só em log interno.

## Secrets

Nunca no código ou no Git; sempre via mecanismo de configuração/secret manager. Chaves com rotação periódica.

## Upload de arquivos (VRF evidences, mídias)

Validar extensão, MIME real, tamanho máximo e conteúdo; nome interno único; nunca servir para execução direta; nunca logar conteúdo.

## Secure coding

Prevenir: SQL/NoSQL Injection (queries parametrizadas), XSS, CSRF, Command Injection, Path Traversal, SSRF, deserialização insegura, Open Redirect. HTTPS obrigatório em tudo.

## Checklist antes de concluir feature sensível

- [ ] Senhas/tokens/OTP só como hash
- [ ] Autorização por ownership verificada no backend
- [ ] Rate limiting configurado (quando aplicável)
- [ ] Auditoria gravada
- [ ] Nenhum dado sensível em log/evento/resposta
- [ ] Erros opacos ao cliente
- [ ] Testes de segurança (401/403/enumeração) presentes
