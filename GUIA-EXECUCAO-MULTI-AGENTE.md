# Trust Platform — Guia de Execução Multi-Agente

> Como conduzimos o desenvolvimento a partir de agora: todo trabalho passa por um **agente de execução** e um **agente de checagem independente** antes de ser considerado pronto. Este arquivo é o ponto de entrada; os detalhes completos (papéis, prompts, templates) estão em [docs/Multi-Agent Implementation Doc/](docs/Multi-Agent%20Implementation%20Doc/).

## 1. Por que este arquivo existe

A pasta `docs/` foi reavaliada por completo (2026-09-15) após o founder indicar que havia sido atualizada. Resultado da comparação entre os `.docx` locais e o que já está extraído em `docs-extracted/`:

- **199 de 200 documentos têm o mesmo conteúdo** que a versão já processada em `docs-extracted/` (diferenças de contagem de palavras entre -6 e 0, ruído de extração — não há mudança de especificação).
- **Um documento é novo**: `docs/Multi-Agent Implementation Doc/Prompt General Instruction for Multi-Agents.docx`. Não é uma spec de produto — é uma **instrução operacional do founder** para o orquestrador (Claude Code) sobre como iniciar a execução do Multi-Agent Implementation Pack v1.0. Ela é o motivo deste guia existir.

Tradução da instrução:

> Extrair integralmente o pacote multi-agente no repositório (**já feito** — está em `docs/Multi-Agent Implementation Doc/`). **Não iniciar todos os IPs.** Todo agente deve começar lendo `00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md`. O Orchestrator deve executar **exclusivamente o IP-000**. Depois que o IP-000 gerar Completion Report, Diff Review e Quality Gate, **parar** e devolver os três documentos para aprovação do founder. Só depois desse gate o Orchestrator pode iniciar as Waves definidas no Master IP Manifest.

Essa é a regra operacional vigente. **Nenhum outro IP (001–024) deve ser iniciado antes do founder aprovar o resultado do IP-000.**

## 2. Onde estamos

- MVP (10 módulos: IDN/TPS/VRF/TRS/MRK + notificações) e PACK-00 → PACK-03 (fundação de eventos, custódia/liberação, modelo de preço/Trust Fee, Trust Change Order) estão **fechados** — ver [CLAUDE.md](CLAUDE.md).
- O Multi-Agent Implementation Pack v1.0 é a continuação formal do roadmap: substitui a autoria sequencial de PACK-04/05 e organiza o restante do Release 1.0 em **24 Implementation Packages (IP-000..024)**, com ondas de paralelismo controlado — ver [`01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md`](docs/Multi-Agent%20Implementation%20Doc/01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md).
- **Nenhum IP foi executado ainda.** Não existe `IP-000-COMPLETION-REPORT.md`, `IP-000-DIFF-REVIEW.md` nem `IP-000-QUALITY-GATE.md` no repositório.

## 3. Documentos-guia do pacote multi-agente (ler nesta ordem)

Todo agente — de execução ou de checagem — lê estes documentos antes de tocar em código:

1. [`00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md`](docs/Multi-Agent%20Implementation%20Doc/00_READ_FIRST_MULTI_AGENT_CONTROLLED_EXECUTION.md) — missão, precedência de fontes, baseline fechado, regras anti-erro, condições de parada.
2. [`01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md`](docs/Multi-Agent%20Implementation%20Doc/01_MASTER_IP_MANIFEST_AND_DEPENDENCY_MAP.md) — grafo de dependências dos 24 IPs e plano de ondas (Wave 0 = só IP-000).
3. [`02_SHARED_ENGINEERING_STANDARDS.md`](docs/Multi-Agent%20Implementation%20Doc/02_SHARED_ENGINEERING_STANDARDS.md) — padrões de arquitetura, API, eventos, dinheiro, segurança, LGPD, i18n, frontend, testes.
4. [`03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md`](docs/Multi-Agent%20Implementation%20Doc/03_MULTI_AGENT_EXECUTION_INSTRUCTIONS.md) — papéis (Orchestrator, Architecture/Integrator, Domain agent, Quality/Diff agent, Release agent), prompts de bootstrap, gate de integração, protocolo de conflito.
5. [`04_APPROVED_PRODUCT_DECISIONS.md`](docs/Multi-Agent%20Implementation%20Doc/04_APPROVED_PRODUCT_DECISIONS.md) — vocabulário canônico e decisões de produto já aprovadas (não reabrir).
6. [`05_RELEASE_1_SCOPE_MATRIX.md`](docs/Multi-Agent%20Implementation%20Doc/05_RELEASE_1_SCOPE_MATRIX.md) — classificação de cada capacidade (Core/Value/Safety/Advanced/pós-release).
7. O IP designado, em [`IPS/`](docs/Multi-Agent%20Implementation%20Doc/IPS/).

Continuam valendo, para o que já está implementado: [PLANO-DE-MODULOS.md](PLANO-DE-MODULOS.md), [INCONSISTENCIAS.md](INCONSISTENCIAS.md), [PLANO-DE-PAGAMENTOS.md](PLANO-DE-PAGAMENTOS.md) e `docs-extracted/`.

## 4. O ciclo execução → checagem (como evitamos erros)

Todo IP segue o mesmo ciclo de vida obrigatório antes de poder ser mesclado:

```
PREFLIGHT → IMPLEMENT → SELF-TEST → COMPLETION REPORT → DIFF REVIEW → QUALITY GATE → APPROVED/MERGED
```

- **Agente de execução** (Architecture/Integrator para o IP-000; Domain Implementation Agent para os demais): lê os 6 documentos acima, faz preflight, implementa **só** o escopo do IP, roda os testes exigidos e gera `IP-XXX-COMPLETION-REPORT.md` (template: [`TEMPLATES/COMPLETION_REPORT_TEMPLATE.md`](docs/Multi-Agent%20Implementation%20Doc/TEMPLATES/COMPLETION_REPORT_TEMPLATE.md)). **Nunca se auto-aprova nem faz merge.**
- **Agente de checagem** (Quality/Diff Agent): é independente — não confia no Completion Report, lê todo o diff de produção e os testes relevantes, roda a suíte de testes de novo, classifica achados (`CRITICAL/BLOCKING/MAJOR/MINOR/OBSERVATION`) e gera `IP-XXX-DIFF-REVIEW.md` ([template](docs/Multi-Agent%20Implementation%20Doc/TEMPLATES/DIFF_REVIEW_TEMPLATE.md)) e `IP-XXX-QUALITY-GATE.md` ([template](docs/Multi-Agent%20Implementation%20Doc/TEMPLATES/QUALITY_GATE_TEMPLATE.md)) com veredito `PASS/FAIL/BLOCKED`.
- Um IP só é considerado pronto quando: Completion Report existe, Diff Review é `APPROVED` (ou `APPROVED WITH CORRECTIONS` já aplicadas), Quality Gate é `PASS`, e a suíte de regressão está verde.
- Se algo bloquear (decisão de produto envolvendo dinheiro/segurança/privacidade/Trust Score, migração destrutiva, comportamento de provedor externo desconhecido, conflito de posse entre IPs): o agente **para o item afetado** e registra um Conflict Escalation ([template](docs/Multi-Agent%20Implementation%20Doc/TEMPLATES/CONFLICT_ESCALATION_TEMPLATE.md)) em vez de assumir.

## 5. Próximo passo imediato

Rodar **exclusivamente o IP-000 — Current State Baseline & Reconciliation** ([spec completa](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-000_Current_State_Baseline_Reconciliation.md)):

1. Congelar o SHA atual de `origin/main` como `TRUST MULTI-AGENT BASELINE`.
2. Inventariar módulos/rotas/telas/migrations/eventos/testes reais do repositório.
3. Verificar em código o fechamento de PACK-00..03 (incluindo status da migration 0027 e do bucket `change-order-evidences`).
4. Classificar cada um dos IPs 001–024 como `IMPLEMENT / PARTIAL / VERIFY_ONLY / DEFERRED / BLOCKED_EXTERNAL`.
5. Mapear hotspots de colisão de arquivos compartilhados entre IPs futuros.
6. Registrar o resultado de teste/lint/typecheck do baseline.

Depois disso: **parar**, entregar os três artefatos (`IP-000-COMPLETION-REPORT.md`, `IP-000-DIFF-REVIEW.md`, `IP-000-QUALITY-GATE.md`) e aguardar aprovação antes de iniciar a Wave 1 (IP-001 e IP-002).
