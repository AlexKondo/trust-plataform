---
name: trust-feature-workflow
description: Workflow para implementar uma feature da Trust Platform a partir da spec (IDN/TPS/VRF/TRS/MRK-XXX) - leitura da spec, ordem de implementação, Definition of Done. Use SEMPRE que for implementar, planejar ou revisar uma feature do backlog.
---

# Feature Workflow — Trust Platform

## Antes de codar

1. **Ler a spec** em `docs-extracted/MVP/` (16 seções: Objective, Scope, User Story, Business Rules BR-XXX, Functional Flow, Backend, Database, API, Frontend, Logging, Eventos, Testes Unit/Integração, Acceptance Criteria, Deliverables, DoD).
2. **Conferir [INCONSISTENCIAS.md](../../../INCONSISTENCIAS.md)** — se a feature aparece lá, a resolução canônica vence a spec. Os campos "Depends On/Blocks" das specs têm erros de renumeração: a ordem oficial é a do [PLANO-DE-MODULOS.md](../../../PLANO-DE-MODULOS.md).
3. Verificar se as dependências reais (módulos/eventos consumidos) já existem. Nenhuma feature usa módulo ainda não implementado.

## Ordem de implementação (por feature)

1. Migration (skill trust-database)
2. Domain: Entity/Aggregate + invariantes + Exceptions + Repository interface
3. Application: Use Case + DTOs + Mapper + Validators
4. Infrastructure: Repository impl + Controller + publisher/consumer de eventos (skill trust-events, via outbox)
5. Logging + auditoria (skill trust-logging)
6. Testes unit + integração (skill trust-testing)
7. OpenAPI + catálogo de eventos atualizados
8. Frontend (páginas/rotas da seção 9 da spec), com validação, loading e tratamento de erros

## Regras do processo (DOC-000)

- Features na **ordem do backlog**; não iniciar a próxima antes de concluir a atual
- Lifecycle: Specification → Development → Unit Tests → Integration Tests → Code Review → QA → Approval → Release — nenhuma etapa pulada
- Mudança de contrato (API/evento): atualizar documentação **antes** de implementar

## Definition of Done (checklist final)

- [ ] Todas as BR-XXX da spec implementadas e testadas
- [ ] Acceptance Criteria da spec verificados um a um
- [ ] Cobertura mínima atingida (Domain ≥ 90%, Application ≥ 85%, Infra ≥ 70%)
- [ ] Envelope de API e códigos de erro conforme skill trust-api
- [ ] Eventos publicados conforme skill trust-events + catálogo atualizado
- [ ] Auditoria e logs conforme skills trust-security/trust-logging
- [ ] Migration versionada; nenhuma tabela fora de migration
- [ ] OpenAPI atualizado
- [ ] Sem bugs críticos conhecidos; code review aprovado

## Criando uma spec nova

Replicar o template de 16 seções (usar IDN-008/VRF-001 como referência de formato), com cabeçalho Document Information (Feature ID, Module, Priority, Sprint, Depends On, Blocks, References DOC-001..007) e BRs numeradas curtas e testáveis.
