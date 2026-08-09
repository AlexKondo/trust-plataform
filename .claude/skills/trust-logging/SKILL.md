---
name: trust-logging
description: Padrões de logging e auditoria da Trust Platform (logs estruturados JSON, correlation ID, mascaramento, níveis). Use ao adicionar logs, instrumentação, tratamento de erros ou trilha de auditoria em qualquer feature. Fonte - DOC-006.
---

# Logging & Audit Standards — Trust Platform

## Logging ≠ Auditoria

- **Logging**: operacional, diagnóstico, retenção curta.
- **Auditoria**: negócio/compliance, registros **imutáveis** em `audit_logs` (ver skill trust-security para a lista de operações auditadas).

## Log estruturado (JSON) — formato padrão

```json
{
  "timestamp": "2026-08-03T18:30:25Z",
  "level": "INFO",
  "service": "identity-service",
  "environment": "production",
  "correlationId": "uuid",
  "requestId": "uuid",
  "identityId": "uuid",
  "operation": "AuthenticateIdentity",
  "durationMs": 42,
  "result": "SUCCESS",
  "message": "Identity authenticated successfully."
}
```
Níveis permitidos (apenas): TRACE, DEBUG, INFO, WARN, ERROR, FATAL. Logs textuais livres devem ser evitados.

## Correlação (rastreio ponta a ponta)

- Toda requisição recebe **Request ID + Correlation ID**
- Propagar por APIs, eventos (campo `correlationId` do envelope), jobs e processamentos assíncronos

## Proibido registrar

Senhas, hashes, tokens completos, chaves, credenciais, OTPs, dados bancários/pagamento, conteúdo de arquivos de evidência, PII além do necessário. Quando precisar referenciar: **mascarar/truncar** (ex.: `s***@gmail.com`, token só os 4 últimos chars).

## Erros

- Log interno: tipo da exceção, código interno, contexto, correlationId, stack trace
- Resposta ao cliente: **nunca** stack trace (ver trust-api)
- Toda correção de bug ganha log que permita detectar recorrência

## Performance

Registrar duração de: requisição, queries relevantes, chamadas externas. Alertas para: aumento de erros, falhas repetidas de auth, latência anormal, falhas de integração.

## Centralização

Logs sempre para a plataforma centralizada de observabilidade (stdout estruturado no MVP); nunca arquivos isolados.

## Testes de logging por feature

Geração dos logs esperados, gravação da auditoria, mascaramento de dados sensíveis, propagação do Correlation ID.
