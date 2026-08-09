# Trust Platform — Inconsistências entre documentos e decisões canônicas

> Conflitos encontrados na análise completa da documentação, com a **resolução canônica** adotada para o desenvolvimento. Quando uma spec contradisser este arquivo, este arquivo vence — e a spec deve ser corrigida.
> Status: `DECIDIDO` = resolução segura derivada dos próprios docs · `PENDENTE` = precisa de decisão do founder.

## Decisões canônicas (DECIDIDO)

| # | Conflito | Resolução canônica |
|---|---|---|
| 1 | Política de senha: 8 caracteres (IDN-001 antigo, ID-006) vs **12** (DOC-002) | **Mínimo 12** + maiúscula/minúscula/número/especial (DOC-002 é o standard oficial). |
| 2 | Dois arquivos IDN-001 ("Registro de Identity" vs "Create Identity") | **"Create Identity" é o canônico** (formato novo, com envelope DOC-003). Aproveitar do antigo apenas: nome mínimo 3 caracteres e `ConfirmPasswordValidator` no frontend. |
| 3 | TRS-005 e TRS-015 ambos "Get Trust Profile", ambos criam `GetTrustProfileUseCase` | São features distintas. Renomear artefatos: TRS-005 → **`GetMyTrustProfileUseCase`** (`GET /trust-profile`); TRS-015 → **`GetConsolidatedTrustProfileUseCase`** (`GET /trust-profiles/{identityId}`). |
| 4 | Casing de enums: `Approved` (ID-001/003) vs `APPROVED` (ID-004/005, specs MVP) | **UPPER_SNAKE_CASE** em API, eventos e banco (`ACTIVE`, `PENDING_REVIEW`, `WAITING_FOR_EVIDENCE`). |
| 5 | Papéis de membership: "Administrator" (ID-001) vs `"ADMIN"` (exemplos ID-004) | Enum canônico: `OWNER, ADMIN, MANAGER, FINANCE, LEGAL, BUYER, SALES, VIEWER`. |
| 6 | Colunas de `trust_passports`: `email_verified` + `profile_completion DECIMAL(5,2)` (TPS-001) vs `verified_email` + `INTEGER` (TPS-004) | **TPS-001 vence** (é quem cria a tabela): `email_verified`, `phone_verified`, `document_verified`, `address_verified`, `profile_completion DECIMAL(5,2)`. |
| 7 | TPS-004 depende de VRF-005 (Reject) mas só especifica consumer de `Verification.Approved` | Implementar também **`VerificationRejectedConsumer`**: rejeição reverte atributo `PENDING_VERIFICATION` → `NOT_VERIFIED` e recalcula completude. |
| 8 | Máquina de estados do pedido: 12 estados (MRK-016), transição direta (MRK-017) vs `CUSTOMER_CONFIRMED` (MRK-022) | **13 estados, incluindo `CUSTOMER_CONFIRMED`** (MRK-022 vence — a confirmação do cliente é marco de negócio que dispara liberação de pagamento). |
| 9 | MRK-006: BR-005 manda reutilizar conversa existente, mas define exception + 409 | **Reutilizar**: retornar `200` com a conversa existente (nova mensagem anexada). Sem 409. |
| 10 | Estado de oferta `CANCELLED` citado (MRK-010/011) mas nunca criado; MRK-013 usa `CLOSED` | **Não existe `CANCELLED` de oferta.** Estados: `PENDING, ACCEPTED, REJECTED, WITHDRAWN, COUNTERED, EXPIRED, CLOSED`. |
| 11 | `Identity.Created` publicado só na verificação de e-mail (IDN-002), não na criação | Manter conforme spec (decisão deliberada): o evento marca a identidade **ativada e válida** para os demais módulos. Documentado no catálogo de eventos. |
| 12 | Listing fica `RESERVED` para sempre se o pedido for cancelado (gap MRK-018) | `MarketplaceOrder.Cancelled` deve ter consumer no próprio MRK que **retorna o listing para `PUBLISHED`**. |
| 13 | TRS-015 exibe transações/reviews do MRK, mas nenhum evento MRK está mapeado como Trust Event | Ao chegar no Módulo 6+, registrar como Trust Events (TRS-002): `MarketplaceOrder.CustomerConfirmed`, `MarketplaceOrder.Cancelled`, `MarketplaceDispute.Opened/Resolved`, `MarketplaceReview.Created` — e criar as regras de pontuação correspondentes (TRS-009). |
| 14 | Auditoria imutável exigida (DOC-002/006) mas sem tabela/feature em nenhuma spec | Criar no Módulo 0 tabela **`audit_logs`** (id, timestamp, identity_id, organization_id, operation, resource, resource_id, result, ip_address, user_agent, correlation_id) — append-only. |
| 15 | Rótulos "Depends On/Blocks" errados em série (TRS-003→"TRS-004 Get Trust Score", MRK-008→"MRK-009 Archive Conversation", TPS-004→"TRS-001 Calculate", IDN-004→"IDN-005 Logout" etc.) | Ignorar os rótulos; a ordem oficial é a do [PLANO-DE-MODULOS.md](PLANO-DE-MODULOS.md). |
| 16 | TRS-017 já especifica revogação completa; TRS-019 re-especifica os mesmos artefatos | TRS-019 é **extensão** do TRS-017 (campos `revoked_at/revoked_by/revoke_reason`, 409, irreversibilidade). Não implementar duas vezes. |
| 17 | TRS-020 lê logs de acesso que ninguém escreve | A tabela `trust_profile_access_logs` nasce **junto com o TRS-017** (todo acesso via share token grava log). |
| 18 | TRS-016 (Visibility Policies) vem depois do TRS-015 que a consome | Implementar **TRS-016 antes de TRS-015**. |
| 19 | TRS-008/009 (regras) no Sprint 4, mas TRS-003/004 (motor, Sprint 3) precisam delas | Implementar administração de regras + **seed inicial** antes de ligar o motor (ver PLANO, Módulo 4). |
| 20 | KYC com 6 status (ID-001, inclui `NOT_STARTED`) vs 5 (ID-003) | `NOT_STARTED` = **ausência de registro** na tabela; status persistidos: `PENDING, PROCESSING, APPROVED, REJECTED, EXPIRED`. |
| 21 | FR-009 (multi-role por organização) vs `UNIQUE(identity_id, organization_id)` + coluna `role` única | MVP: **um papel por membership** (schema vence). Multi-role fica pós-MVP (exigiria `membership_roles`). |
| 22 | Reset de senha revoga todas as sessões (obrigatório, IDN-008) vs change password "conforme configuração" (ID-004) | **Reset (IDN-008): revoga todas.** Change (IDN-009): revoga todas exceto a atual. Sem configurabilidade no MVP. |
| 23 | Erros de token: 400 (IDN-002) vs 401 (IDN-008) | Padrão: **401** para token de segurança inválido/expirado (login, reset, verify-email); **422** para violação de regra de negócio; **400** para request malformado. |
| 24 | Evento `MarketplaceOrder.Completed` (MRK-021) resulta em estado `AWAITING_CUSTOMER_CONFIRMATION`, não `COMPLETED` | Renomear o evento para **`MarketplaceOrder.ExecutionCompleted`** no catálogo (check-out ≠ pedido concluído). |
| 25 | MRK-014 diz que "qualquer participante" reabre negociação, mas só comprador cria oferta (MRK-009) | MVP: **apenas comprador cria oferta**; vendedor sinaliza pela conversa. (Relaxar pós-MVP se necessário.) |
| 26 | `UNIQUE(order_id)` em `scheduling` vs "histórico de reagendamentos" (MRK-019 BR-006) | MVP sem reagendamento ⇒ manter `UNIQUE(order_id)`. Se reagendamento entrar, trocar por `UNIQUE(order_id) WHERE status = 'ACTIVE'`. |
| 27 | Founder Book: Trust Engine com 5 pilares vs 8 componentes vs 10 capacidades; "Trust Points" só na V2 | Para o MVP vale o que as specs implementam: **Score, Level, Badges, Benefits, Passport, Shares**. Trust Points/Capital/Coin/Shield ficam pós-MVP (não há spec). |
| 28 | Domínio "Compliance" citado (TP-004) mas ausente da lista de domínios | Antifraude/compliance = responsabilidade futura do módulo **Administration**. Nenhuma feature MVP depende disso. |

## Decisões de stack e infraestrutura (DECIDIDO em 2026-08-08)

| # | Decisão | Resolução |
|---|---|---|
| P1 | **Stack tecnológico** | **TypeScript full-stack.** Backend: **NestJS + Fastify** (Node 22). Frontend: **Next.js 15 + Tailwind + shadcn/ui + TanStack Query**. ORM: **Drizzle** (migrations versionadas). Validação: **Zod**. Logs: **Pino** + OpenTelemetry. Testes: Vitest + Testcontainers + Supertest + Playwright. Mobile (fase 2): React Native/Expo. Convenção de interfaces (DOC-001): **sem prefixo "I"** (padrão TypeScript). |
| P2 | **Deployment** | **Monolito modular** com fronteiras estritas por módulo (IDN/TPS/VRF/TRS/MRK) + Transactional Outbox; extração de serviços pós-MVP. Docker; backend em Railway/Fly.io, frontend em Vercel. |
| P3 | **Mensageria** | **pg-boss** sobre o próprio Postgres (Supabase): outbox transacional + jobs (rebuild TRS-007, expirações). Broker real (RabbitMQ/Kafka) só quando extrair serviços. |
| P6a | **Banco e storage** | **Supabase** (Postgres gerenciado + Storage para evidências VRF/mídias MRK). **Não usar Supabase Auth** — o módulo Identity (IDN-001..009) implementa autenticação própria conforme specs. Atenção ao pooler (Supavisor) em modo transaction com prepared statements. |
| P7 | **Invalidação de access token** | Access JWT **ES256, 15 min**, sem blocklist no MVP; sessão validada no refresh. Refresh: 256 bits aleatórios, armazenado só como SHA-256, rotação a cada uso. Hash de senha: **Argon2id** (memoryCost ~64 MB, timeCost 3). Share tokens (TRS-017/018): aleatórios + HMAC-SHA256 para prova de integridade. IDs: **UUIDv7**. |

## Pendências que exigem decisão do founder (PENDENTE)

| # | Decisão | Contexto | Recomendação |
|---|---|---|---|
| P4 | **Escala do Trust Score e níveis iniciais** | Nunca definida (exemplos: 742, GOLD, Diamond). TP-005 diz que a fórmula é IP da empresa. Sem seed, TRS-004 não classifica ninguém. | Definir escala 0–1000 e seed inicial de níveis (ex.: UNVERIFIED 0, BRONZE 1–249, SILVER 250–499, GOLD 500–749, PLATINUM 750–1000) como **dados** (trust_level_rules), ajustável sem código. |
| P5 | **Formato da `conditionExpression`/`eligibilityExpression`** | TRS-009/010/012 exigem uma DSL de regras "evolutiva" sem definir sintaxe. | MVP: JSON estruturado simples (campo, operador, valor + AND/OR), avaliado por um interpretador próprio. Evitar DSL textual agora. |
| P6b | **Provedores de e-mail/SMS/KYC** | Exigidos pelas specs mas nunca nomeados. | E-mail transacional: Resend ou Postmark (necessário no Sprint 1 — IDN-002/007). SMS/OTP (fase 2): Twilio. KYC: manual no MVP. |
