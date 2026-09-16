# Trust Platform

Infraestrutura digital de confiança para a economia de serviços locais. O marketplace é a primeira aplicação sobre a "Trust Layer" (Trust Passport, Score, Capital, Benefits). Este repositório contém a documentação completa do produto e (futuramente) o código do MVP.

## Estado atual

**Módulo 0 (fundação) concluído em 2026-08-08** — ver [docs/MODULO-0.md](docs/MODULO-0.md): monorepo pnpm, `apps/api` (NestJS 11 + Fastify), shared kernel (envelope de API, error handler, JWT ES256 guard global, Correlation/Request ID, logging Pino, Transactional Outbox via pg-boss, `audit_logs` append-only com trigger), migrations aplicadas no Supabase `trust-dev-sp`, CI GitHub Actions. Dev: `pnpm dev` → `http://localhost:3001/api/v1/health`; e2e: `TEST_DATABASE_URL=... pnpm test`.

**Módulo 1 em andamento**: IDN-001 Create Identity e IDN-002 Verify Email concluídos no backend em 2026-08-08 (tabelas `identities` + `email_verification_tokens`, Argon2id, token SHA-256, eventos `Identity.Created`/`Identity.EmailVerified` via outbox, auditoria, OpenAPI em [docs/openapi.yaml](docs/openapi.yaml), catálogo em [docs/event-catalog.md](docs/event-catalog.md)). E-mail via **Brevo** (P6b): sem chave REST `xkeysib-` no `.env`, a API loga o link de verificação em vez de enviar. Páginas de frontend ficam para quando o `apps/web` for iniciado. IDN-003 Login também concluído (tabela `sessions`, refresh opaco SHA-256, lockout configurável, rate limiting por IP, evento `Identity.Authenticated`). **MÓDULO 1 (IDN) COMPLETO — 9/9** (2026-08-08). **MÓDULO 2 (TPS) COMPLETO — TPS-001/002/003** (2026-08-09): infra de consumers no shared kernel (`EventConsumer` + dedupe em `processed_events` + descoberta automática no pg-boss), consumer `tps.create-trust-passport` cria o Passport ao consumir `Identity.Created`, `GET/PUT /trust-passports/me`, eventos `TrustPassport.Created/Updated`. Frontend `apps/web` (Next 15) no ar na Vercel; API no Render; ambos com deploy automático no push. **EM PRODUÇÃO**: site https://trust-plataform-api.vercel.app + API https://trust-api-5zlh.onrender.com. **MÓDULO 3 (VRF) COMPLETO — VRF-001..006** (2026-08-09): máquina de estados canônica, evidências via multipart → Supabase Storage (`verification-evidences`), flag `is_admin` + `AdminGuard` (primeiro mecanismo admin; conceder via UPDATE no banco), 6 eventos `Verification.*`, índice parcial garante 1 verificação ativa por Passport+tipo. **TPS-004 COMPLETO** (2026-08-09): consumers `tps.sync-verification-approved/-rejected` projetam decisões no Passport (mapeamento DOCUMENT→document, ADDRESS→address, PHONE→phone, EMAIL→email; demais tipos ficam só no VRF) e recalculam a completude. **MÓDULO 4 (TRS) COMPLETO** (2026-08-09; P4/P5 aprovados): TRS-001..011 — engine determinístico (escala 0–1000, níveis seed), event store imutável, consumers com **fan-out real** (fila própria por consumer + `boss.publish`/`subscribe` — pg-boss é job queue, não pub/sub por fila!), timeline explicável, admin de regras/níveis/benefícios, TRS-007 rebuild síncrono, TRS-010/011 benefícios com elegibilidade on-demand sobre `{score, level}`. **E2E local: `pnpm test:e2e`** (Postgres embutido descartável — nunca usar o Supabase compartilhado, que é produção). **MÓDULO 5 (TRS reputação) COMPLETO — TRS-012..020** (2026-08-09): catálogo de badges admin + premiação automática via consumer de `TrustScore.Calculated` (PERMANENT/DYNAMIC, seed 5 badges), visibility policies (4 toggles), perfil consolidado PRIVATE/PUBLIC (`/trust-profile/me` + `/public/trust-profile/{token}`), shares com token `<random>.<hmac>` (segredo derivado da chave JWT — sem env nova), verificação de autenticidade, revogação (410) e histórico de acessos. **MÓDULO 6 (MRK anúncios + conversas) COMPLETO — MRK-001..008** (2026-08-09): primeiro módulo que **consome** a Trust Layer. Anúncio nasce DRAFT (só `title` obrigatório — INCONSISTENCIAS #29), edita, e **publica só se a conta estiver ativa e o nível atender ao mínimo da categoria** (`marketplace_categories` com `minimum_trust_level`, seed de 12 categorias — #30); busca pública com filtros/ordenação por reputação do anunciante (LEFT JOIN read-only em `trust_scores`), detalhe com resumo do vendedor respeitando as Visibility Policies (TRS-016), contato que **reutiliza** conversa ativa (#9 → 200), mensagens imutáveis com controle de leitura e encerramento preservando o histórico. 8 eventos `MarketplaceListing.*`/`MarketplaceConversation.*`/`MarketplaceMessage.Sent`. **MÓDULO 7 (MRK negociação) COMPLETO — MRK-009..014** (2026-08-10): cadeia de propostas com `parentOfferId` e 7 estados (`PENDING/ACCEPTED/REJECTED/WITHDRAWN/COUNTERED/EXPIRED/CLOSED` — sem `CANCELLED`, INCONSISTENCIAS #10). **Duas autorizações distintas**: quem propôs atualiza/retira, quem recebeu aceita/rejeita/contrapõe — e a contraoferta inverte os papéis. O **aceite (MRK-013) é o pivô**: numa única transação a proposta vira ACCEPTED, as concorrentes viram CLOSED, o anúncio vira RESERVED e o `MarketplaceOrder` nasce em CREATED (tabela criada aqui por causa da atomicidade exigida pelo MRK-015 BR-007 — #32). Uma proposta viva por negociação (#34); expiração derivada de `expires_at`, sem job (#33). 8 eventos novos, incluindo o trio atômico `MarketplaceOffer.Accepted` + `MarketplaceListing.Reserved` + `MarketplaceOrder.Created`. **MÓDULO 8 (MRK ciclo do pedido) COMPLETO — MRK-015..022** (2026-08-10): máquina de **13 estados** com `OrderLifecycleService` como porta única (persistência + evento + auditoria atômicos; nenhum salto de estado). Agendar (com checagem de conflito na agenda do prestador) → check-in → check-out (calcula duração efetiva) → confirmação do cliente → conclusão automática. **Aqui o ciclo do produto fecha**: `MarketplaceOrder.CustomerConfirmed` vira Trust Event (+40 para o prestador) e `MarketplaceOrder.Cancelled` penaliza quem cancelou (−20) — INCONSISTENCIAS #13. Cancelamento devolve o anúncio à vitrine via consumer (#12). Novas decisões: uma só tabela de execução (#35), estados intermediários sem produtor no MVP (#36), pipeline de conclusão pós-confirmação (#37). **MÓDULO 9 (MRK disputas e avaliações) COMPLETO — MRK-023..025** (2026-08-10): abrir disputa (1 ativa por pedido, garantida por índice parcial), resolver (só ADMIN/mediador, decisão definitiva) e avaliar (1 por participante, nota 1–5 + critérios opcionais em tabela própria porque são configuráveis). **Fecha o gap #13 e o ciclo de reputação**: `MarketplaceReview.Created` pontua quem foi avaliado (+30/+5/−30 por faixa) e `MarketplaceDispute.Resolved` penaliza a parte culpada (−60/−30); abrir disputa não pontua, porque não é prova de culpa.

## BACKEND DO MVP COMPLETO — 68/68 features (2026-08-10)

Todos os 9 módulos entregues, 46 suítes de teste verdes, 71 rotas no OpenAPI.

## FRONTEND — onda 1 entregue (2026-08-10)

`apps/web` saiu de 9 para **19 rotas**, todas consumindo a API real: dashboard com score/timeline/badges, Trust Passport, Verificações (com upload multipart), Trust Score explicável (níveis, timeline, selos, benefícios), Marketplace (busca com filtro de reputação, detalhe com cartão de confiança do anunciante, gestão de anúncios com publicação), Conversas com negociação embutida (propostas, contrapropostas, aceite), Pedidos com linha do tempo e todas as ações do ciclo (agendar/check-in/check-out/confirmar/cancelar/avaliar/disputar), perfil público `/p/[token]` e configurações de privacidade com links compartilháveis.

Infra do frontend: [lib/api.ts](apps/web/lib/api.ts) (envelope + paginação + refresh automático + multipart), [lib/types.ts](apps/web/lib/types.ts) (contratos espelhando o OpenAPI), [lib/labels.ts](apps/web/lib/labels.ts) (enums da API → português) e [components/layout.tsx](apps/web/components/layout.tsx) (Card, Pill, ScoreRing, TrustLevelBadge, StarRating, EmptyState).

## FRONTEND — onda 2: painel de moderação (2026-08-10)

`/admin` com fila de **verificações** (iniciar análise → aprovar/rejeitar com motivo do catálogo) e de **disputas** (julgar com fundamentação, avisando na tela quanto cada desfecho custa em pontos). O item "Moderação" só aparece no menu para quem é admin — a autorização real continua no `AdminGuard` da API.

**Adicionado ao backend para as telas**: `GET /verifications` (minhas verificações), `GET /verifications/queue/pending` (fila de análise, ADMIN) e o campo `isAdmin` em `/identities/me`.

**Como virar admin**: `UPDATE identities SET is_admin = true WHERE email = '...'` no banco (PLANO §4 — primeiro mecanismo admin do MVP).

## NOTIFICAÇÕES (NTF-001) + admin de regras (2026-08-10)

**Módulo `notification`** — 10º módulo, puramente reativo: não expõe criação, tudo nasce de evento consumido do outbox. 17 consumers `ntf.*` declarados na tabela `NOTIFICATION_RULES` (em vez de 17 classes idênticas), construídos como providers via factory — o `OutboxRelayService` descobre por `instanceof EventConsumer`. Regras: quem age nunca é avisado do próprio ato; queda de nível não notifica; disputa aberta avisa só a parte reclamada. Frontend: sininho com contador no header + `/notifications`.

Dois payloads ganharam campo (adição retrocompatível) para o consumidor não precisar resolver agregados alheios: `Verification.Approved/Rejected` + `identityId` e `MarketplaceMessage.Sent` + `recipientId`.

**`/admin/trust-rules`** — pontuação por evento (editar pontos, limite por pessoa, ativar/desativar), faixas de nível, selos e benefícios, com as condições JSON renderizadas em linguagem legível. A tela avisa que mudar regra não reescreve o passado.

**MVP COMPLETO**: 10 módulos, 47 suítes verdes, 76 rotas no OpenAPI, 24 telas. Pendências de produto (P4 escala do score, P5 DSL de regras) em [INCONSISTENCIAS.md](INCONSISTENCIAS.md).

## Stack oficial (decidido em 2026-08-08 — detalhes em INCONSISTENCIAS.md P1–P7)

- **Backend**: NestJS + Fastify (Node 22, TypeScript), monolito modular, Drizzle ORM, Zod, Pino + OpenTelemetry
- **Frontend**: Next.js 15 + Tailwind + shadcn/ui + TanStack Query
- **Banco**: Supabase (PostgreSQL gerenciado) + Supabase Storage; **não usar Supabase Auth** (Identity é módulo próprio, IDN-001..009)
- **Mensageria/jobs**: pg-boss (outbox transacional no próprio Postgres)
- **Cripto**: Argon2id (senhas), JWT ES256 15 min, refresh 256-bit hashed + rotação, UUIDv7, HMAC-SHA256 nos share tokens
- **Testes**: Vitest + Testcontainers + Supertest + Playwright
- **Interfaces sem prefixo "I"** (convenção TypeScript, conforme DOC-001 "escolher um padrão")

## PACK-00 v1.1 — baseline canônico (2026-08-24)

O PACK-00 v1.1 substitui integralmente a v1.0 e é a **especificação vigente** da fundação.
Implementado por inteiro: envelope canônico de evento (`eventType` + agregado obrigatório
nos 55 pontos de publicação e 14 consumers), migration 0024 não destrutiva do outbox,
caminho de leitura tolerante isolado para eventos históricos, e corpo de erro com
`requestId`/`correlationId`. **52 suítes / 320 testes verdes.** Detalhes e decisões em
[docs/PACK-00-IMPLEMENTACAO.md](docs/PACK-00-IMPLEMENTACAO.md); a revisão que originou a
v1.1 está em [docs/REVISAO-PACK-00.md](docs/REVISAO-PACK-00.md).

**Precedência de documentação (PACK-00 §9)**: Pack vigente > Packs já implementados >
código + testes > documentos ARCH/TP históricos (referência, nunca requisito). Contradição
entre fontes autoritativas **não se resolve por suposição** — parar o item e reportar.

## PACK-01 — Custodia e liberacao (2026-08-31)

PAY-003 + PAY-004 implementados. O dinheiro entra em custódia na CONTRATAÇÃO
(`Payment.Authorized` → `TrustCustody` IN_CUSTODY) e só sai quando o cliente
confirma o serviço concluído **e** a política aprova. Liberação em DUAS FASES: a
decisão é persistida (`READY_FOR_RELEASE`) antes de qualquer efeito externo, e
só depois de o gateway CONFIRMAR é que vira `RELEASED` + `FUNDS_RELEASED`.
Disputa ativa bloqueia. 4 eventos novos no agregado `TrustCustody`.
**54 suítes / 342 testes verdes.** Detalhes, desvios e critérios de aceite em
[docs/PACK-01-COMPLETION-REPORT.md](docs/PACK-01-COMPLETION-REPORT.md).

O shared kernel ganhou `EventConsumer.managesOwnTransaction`: consumers que
chamam dependência externa rodam FORA da transação do relay (PACK-01 §17).
Use **apenas** com handler comprovadamente idempotente.

Provedor real definido pelo founder: **Asaas** (pagamento e split dentro dele).
Não entra no PACK-01 — será um adapter novo do port `PaymentGateway`.

## PACK-02 — Fundacao comercial: modelo de preco e Trust Fee (2026-09-01)

Proposta e pedido ganharam `pricingModel` (`FIXED_PRICE` | `HOURLY`, com taxa/hora,
duração mínima e incremento de faturamento). No aceite nasce o
**snapshot econômico imutável** do Trust Contract
(`marketplace_order_commercial_snapshots`, 1 por pedido): valor bruto, serviço,
material (custo e markup separados), **Trust Fee congelada em basis points** e
líquido do prestador. Mudar a `commercial_policies` depois NÃO retroage sobre
contrato já fechado. Detalhes em
[docs/2026090101/PACK-02-COMPLETION-REPORT.md](docs/2026090101/PACK-02-COMPLETION-REPORT.md).

## PACK-03 — Trust Change Order e cobranca por tempo (2026-09-02)

A regra do Pack: **o Trust Partner nunca aumenta sozinho a conta do Trust Member.**
Todo acréscimo (tempo, escopo, material) vira um **Trust Change Order** que o
prestador propõe e só o cliente aprova — e apenas `APPROVED` mexe no valor
autorizado. O total corrente é **derivado** (snapshot imutável do PACK-02 + soma
dos aprovados), sem campo acumulador: é assim que "aplicar o delta exatamente uma
vez" fica garantido por construção. A Trust Fee do delta usa a **taxa congelada no
contrato**, nunca a política global vigente; `MATERIAL_COST` é pass-through com 0%
de fee e `MATERIAL_MARKUP` é fee-eligible, sempre separados.

O tempo passou a ter três leituras distintas: **decorrido**, **pausado** e
**faturável** — `presença ≠ tempo faturável`. O check-in/check-out do MRK-020/021
**não foi reimplementado**: a `service_execution_sessions` é uma camada aditiva por
cima dele (com Trust Pause/Resume), e a máquina de 13 estados do pedido não mudou
nem ganhou `PAUSED`. O faturável tem teto no autorizado e piso no mínimo
contratado. 5 eventos novos, 10 rotas, migration 0027 aditiva.
**61 suítes / 441 testes verdes.**

**Item PARADO e reportado (PACK-03 §9)**: o `Payment`/`TrustCustody` do PACK-01
congela o valor da contratação e não admite autorização incremental, então o delta
aprovado fica **autorizado e NÃO custodiado** — exposto explicitamente em
`amountAuthorizedNotInCustody`. Cobrar esse saldo depende do PACK-05 (Asaas).
Desvios, decisões e critérios de aceite em
[docs/2026090202/PACK-03-COMPLETION-REPORT.md](docs/2026090202/PACK-03-COMPLETION-REPORT.md).

O shared kernel ganhou `shared/storage/` (port `EvidenceStorageService` + adapters):
evidência com arquivo deixou de ser exclusividade do VRF. Cada domínio mantém a
própria tabela de metadados e o próprio bucket — o Change Order usa
`change-order-evidences`, **que precisa ser criado no Supabase Storage** (privado).


## IP-002 — Internacionalização e localização (fundação) (2026-09-15)

Fundação de i18n sobre o baseline do Multi-Agent Implementation Pack: `identities`
ganhou `preferred_locale` (migration 0028, default `pt-BR`, `CHECK` restrito ao
catálogo `SUPPORTED_LOCALES` em `apps/api/src/shared/i18n/locale.ts`), resolvido
no cadastro por `Accept-Language` (fallback PT-BR) e alterável via
`PATCH /identities/me/locale`. `notifications` ganhou `locale` (mesma migration):
o consumer resolve o locale do **destinatário** (nunca do remetente) antes de
persistir o aviso — o texto do catálogo NTF-001 continua só em PT-BR neste
release (conteúdo pré-existente, fora do escopo da fundação), mas o mecanismo de
resolução já está pronto para renderização localizada entrar sem nova migration.
Frontend: `apps/web/lib/i18n/` (catálogo de mensagens `pt-BR`/`en-US`,
`LocaleProvider`, `format.ts` com `Intl` locale-aware) + seletor de idioma em
`/settings/language`, provando a arquitetura com `en-US` como segundo locale de
teste sobre uma fatia representativa de telas — não é uma tradução completa do
produto (fora de escopo do IP-002). Detalhes, decisões e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-002-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-002-COMPLETION-REPORT.md).

## IP-007 — Autorização de pagamento incremental (2026-09-15)

Resolve o item PARADO do PACK-03 §9 (acima): um Trust Change Order aprovado
agora gera, em sandbox, uma **autorização financeira incremental**
(`PaymentIncrementalAuthorization`, tabela `payment_incremental_authorizations`,
`UNIQUE(change_order_id)`) pelo MESMO port `PaymentGateway` da autorização
original, disparada automaticamente por `TrustChangeOrder.Approved` — nunca por
`Rejected`/`Cancelled`/`EXPIRED`, que não publicam esse evento. Quando o
gateway aprova, o valor entra em custódia própria (`IncrementalTrustCustody`,
tabela `incremental_trust_custodies`) — uma tabela nova, não uma segunda linha
em `trust_custodies`, porque aquela tem `UNIQUE(payment_id)` (garantia do
PACK-01 que esta IP não altera). A confirmação do cliente
(`MarketplaceOrder.CustomerConfirmed`) continua sendo o único gatilho de
liberação, agora aplicado a TODAS as tranches do pedido (original +
incrementais), cada uma com sua própria máquina de duas fases e proteção CAS
(`UPDATE ... WHERE status = <esperado> RETURNING`, mesmo padrão da IP-001) —
uma tranche negada ou já liberada nunca bloqueia nem duplica outra.
`GET /payments/by-order/{orderId}` ganhou o campo aditivo `custodySummary`:
`amountAuthorizedNotInCustody` deixa de ser um número estático do Service
Summary e passa a ser **computado** a partir do que de fato está em custódia,
tranche por tranche. Migration 0029 aditiva (2 tabelas novas). Detalhes,
decisões e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-007-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-007-COMPLETION-REPORT.md).

## IP-003 — Service Request, Discovery & Matching (2026-09-15)

Até aqui o Marketplace era estritamente baseado em anúncio: o Partner posta,
o Member busca. Esta IP acrescenta o outro sentido — o Member descreve uma
necessidade (`ServiceRequest`: categoria, descrição, `locationLabel` livre,
`radiusKm` opcional, urgência ASAP/THIS_WEEK/FLEXIBLE, faixa de orçamento
opcional) e descobre Partners elegíveis de forma **determinística, sem IA**:
`GET /marketplace/service-requests/{id}/matches` reaproveita literalmente
`MarketplaceListingRepository.search()` (MRK-004) com critérios derivados do
pedido — mesma consulta, mesmos índices, mesmo `levelsAtOrAbove` para o nível
mínimo de confiança. Nenhuma coordenada geográfica precisa é armazenada: só
`locationLabel` texto livre (mesmo formato de `marketplace_listings.location`)
— decisão de privacidade deliberada, não um corte de escopo (ver §11 do
Completion Report). Não é por faltar QUALQUER coordenada de Partner no
repositório (`marketplace_order_execution_events`, migration 0017, já guarda
geotags reais de execução em campo); é que não existe um perfil de
localização do Partner PRÉ-engajamento que sustente matching prospectivo —
raio geométrico real fica para o IP-005.

Engajar um Partner (`POST /marketplace/service-requests/{id}/engage`)
reaproveita `ContactListingOwnerUseCase` (MRK-006) **verbatim, sem nenhuma
modificação** — a mesma conversa, o mesmo dedupe, a mesma máquina de proposta
já existente passam a valer também para quem chegou via ServiceRequest. Uma
tabela nova (`service_request_engagements`, `UNIQUE(service_request_id,
listing_id)`) só registra essa origem. O pedido transiciona OPEN -> MATCHED na
primeira vez que um contato é feito (CAS `UPDATE ... WHERE status = 'OPEN'`,
mesmo padrão do PACK-03/IP-001) — idempotente: engajar um segundo Partner
depois não é erro nem reserva exclusividade. Migration 0030 aditiva (2 tabelas
novas: `service_requests`, `service_request_engagements`). Detalhes, decisões
e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-003-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-003-COMPLETION-REPORT.md).

## IP-013 — Notification & Communication Completion (2026-09-15)

O catálogo `NOTIFICATION_RULES` (NTF-001) tinha 21 regras in-app e nenhuma
delas cobria os eventos que as IPs de Wave 2 acabaram de criar: os 5 eventos
`ServiceRequest.*`/`ServiceRequestEngagement.*` (IP-003) e os eventos de
pagamento — `Payment.AuthorizationFailed`, `PaymentIncrementalAuthorization.
Approved/.Failed` (IP-007), `Funds.Released` — estavam todos documentados no
catálogo de eventos como "nenhum consumidor hoje". Esta IP fecha esse gap com
**7 regras novas** na MESMA tabela (não 7 classes novas — o padrão table-driven
do NTF-001 é reaproveitado literalmente): `ServiceRequestEngagement.Created`
(avisa o Partner, com contexto de pedido de serviço, diferente do aviso
genérico de "nova mensagem" que o mesmo engajamento também dispara),
`Payment.AuthorizationFailed` e o par `PaymentIncrementalAuthorization.
Approved/.Failed` (avisam o comprador), `Funds.Released` (avisa o vendedor —
cobre a tranche original e as incrementais, mesmo `eventType` reaproveitado) e
o par de segurança de conta `Identity.PasswordChanged`/`.
PasswordRecoveryRequested` (avisa o titular). `ServiceRequest.Created/Matched/
Closed/Cancelled` continuam sem regra própria — o ator de toda transição é
sempre o Member dono do pedido (nunca se notifica o autor do próprio ato).

Migration 0031 (aditiva): `notifications` ganha `channel`
(`IN_APP`/`EMAIL`/`PUSH`, hoje só `IN_APP` é produzido) e `deliveryStatus`
(`PENDING`/`DELIVERED`/`FAILED`, hoje sempre `DELIVERED` — para um aviso
in-app, a linha nascer JÁ É a entrega) + `deliveredAt`/`failedReason`,
deixando o esquema pronto para um adapter de e-mail/push futuro sem outra
migration — **nenhum provedor de e-mail/push foi chamado por este módulo**
(Brevo já existe e funciona, mas só para os e-mails transacionais do próprio
módulo `identity` — verificação de e-mail e recuperação de senha — nunca foi
conectado ao `notification`; conectá-lo é decisão de produto fora do escopo
desta IP, não uma lacuna técnica). Retry/observabilidade de falha continuam
sendo o mecanismo genérico já existente do outbox (`outbox_events.status`/
`attempts`/`lastError` + pg-boss com backoff) — nenhum retry notification-
specific foi construído por cima (seria redundante). Toda regra do catálogo
(as 21 antigas e as 7 novas) é `category: TRANSACTIONAL` — não existe conteúdo
opcional/promocional no MVP, logo não há opt-out para construir. Detalhes,
decisões e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-013-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-013-COMPLETION-REPORT.md).

## IP-020 — Analytics & Operational Intelligence (2026-09-16)

Nenhuma tabela nova, nenhuma migration. `apps/api/src/modules/analytics/`
é um módulo READ-ONLY: `AnalyticsRepository` lê diretamente as tabelas já
exportadas por Marketplace/Payment/Trust/Identity (via schema Drizzle, não
via injeção dos repositórios de domínio daqueles módulos — zero arquivo de
`marketplace/**`/`payment/**` tocado) e calcula, sob demanda, o funil
Request→Offer→Contract→Execution→Confirmation→Payment, conversão entre
estágios, tempo até a 1ª proposta e de resposta do Partner, taxas de
conclusão/cancelamento/disputa/sucesso de pagamento, adoção de Trust
(Passport/nível/verificação) e retenção básica por coorte mensal — 3 rotas
`admin/analytics/*`, `AdminGuard` (mesma flag `is_admin`, DOC-002), sem
frontend fora de `/admin/analytics` (link novo em `/admin`).

Toda métrica é recalculada a cada chamada direto da tabela real — não
existe contador paralelo que possa divergir da fonte ("reconcilia com a
transação de origem" por construção). Definição exata de cada fórmula em
`apps/api/src/modules/analytics/domain/metrics-definitions.ts` (catálogo
machine-readable) e `docs/analytics-metrics.md` (versão para leitura
humana, derivada dele). Toda resposta é agregada — nenhum endpoint devolve
uma linha identificável por pessoa; verificado por teste e2e dedicado que
confirma nome/e-mail/id de identidades de teste nunca aparecem na resposta
serializada. Dinheiro sempre em centavos inteiros
(`grossOrderValueCents`/`releasedCustodyValueCents`), nunca ponto
flutuante. Detalhes, decisões e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-020-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-020-COMPLETION-REPORT.md).

## IP-004 — Competitive Quotes & Comparison Map (2026-09-16)

Confirmado em código (não assumido) que um `ServiceRequest` (IP-003) já
suportava N Partners engajados antes desta IP: `OPEN -> MATCHED` é
idempotente por design ("pelo menos um contato já foi feito", não
exclusividade) e `ServiceRequestEngagement` tem `UNIQUE(service_request_id,
listing_id)` — um engajamento por Partner, cada um com sua PRÓPRIA
`MarketplaceConversation`/cadeia de `MarketplaceOffer` (MRK-006..014). Não foi
preciso reabrir `EngageServiceRequestUseCase`: a cardinalidade 1:N já existia;
faltava só a camada de LEITURA que junta as negociações paralelas lado a lado.

`GET /marketplace/service-requests/{id}/offers` (novo, só-leitura, dono do
pedido apenas — 404 para qualquer outro `identityId`, mesma postura do resto
do agregado) devolve uma linha por Partner engajado com a rodada viva da sua
negociação (`Trust Score`/nível do Partner, `hasOffer: false` quando o Partner
foi contatado mas ainda não existe proposta — MRK-009 BR-001: quem abre é
sempre o Member). FIXED_PRICE e HOURLY nunca são convertidos um no outro:
`amount` é sempre o valor literal da proposta (para HOURLY, o mínimo
contratado já derivado por `calculateInitialHourlyAmount`, PACK-02 §4.2), e
`estimatedTotalBasis` (`FIXED_TOTAL` | `HOURLY_MINIMUM_COMMITMENT`) rotula
explicitamente o que esse número significa — tempo além do mínimo só vira
dinheiro através de um Trust Change Order aprovado (PACK-03), nunca
automaticamente aqui. Sem ranking oculto/paid placement e sem vencedor
automático: os itens vêm ordenados por `engagedAt` (ordem de contato).

A máquina de estados de aceite (MRK-013, `AcceptOfferUseCase`) não foi tocada:
aceitar uma proposta continua fechando só as concorrentes da MESMA negociação
(BR-004); a proposta de outro Partner (outra conversa) permanece PENDING até
o Member decidir por ela também — provado por e2e dedicado. Nenhuma
migration/evento novo: é pura leitura sobre entidades já persistidas
(`ServiceRequestEngagement`, `MarketplaceOffer`, `MarketplaceConversation`,
`TrustScore`). Detalhes, decisões e critérios de aceite em
[docs/Multi-Agent Implementation Doc/IPS/IP-004-COMPLETION-REPORT.md](docs/Multi-Agent%20Implementation%20Doc/IPS/IP-004-COMPLETION-REPORT.md).

## Documentos-guia (ler nesta ordem)

1. [PLANO-DE-MODULOS.md](PLANO-DE-MODULOS.md) — quebra em módulos, ordem de desenvolvimento, grafo de dependências
2. [INCONSISTENCIAS.md](INCONSISTENCIAS.md) — conflitos entre docs e **decisões canônicas** (vencem as specs quando divergem)
3. `docs-extracted/` — toda a documentação original convertida para markdown:
   - `docs-extracted/MVP/` — 64 feature specs (IDN, TPS, VRF, TRS, MRK) + standards DOC-000..007
   - `docs-extracted/Arquitetura/` — TP-001..006 (blueprint, domain model, Trust Engine, scoring)
   - `docs-extracted/Desenvolvedor/` — processo, roadmap, série Identity ID-001..006
   - `docs-extracted/Founder Book/` — visão, personas, jornadas, design system
   - Os `.docx` originais em `Trust Platform-20260805T205238Z-1-001/` são a fonte; a pasta `docs-extracted/` é a versão de trabalho

## Regras principais (detalhes nas skills)

- **Ordem de desenvolvimento**: IDN → TPS → VRF → TRS núcleo → TRS reputação → MRK. Nenhuma feature usa módulo ainda não implementado. Os campos "Depends On/Blocks" das specs contêm erros de renumeração — a ordem oficial é a do PLANO-DE-MODULOS.
- **Só o Trust Engine (TRS) altera Score/Level/Badges**; módulos de negócio apenas publicam eventos.
- Clean Architecture em 4 camadas; entidades em inglês; enums em UPPER_SNAKE_CASE.
- API: envelope `{success, data}` / `{success: false, error: {code, message, details?, requestId, correlationId}}`, rotas `/api/v1/<recurso-plural-kebab>`. `details` é ARRAY de `{path, message}`; não existe `traceId`.
- Banco: PostgreSQL 16+, tabelas snake_case plural, `id UUID` (v7), soft delete, tudo via migration.
- Eventos: `<Entity>.<Action>` no passado (dois segmentos), envelope canônico do **PACK-00 v1.1** — `eventType` + `aggregateType`/`aggregateId` obrigatórios, Transactional Outbox, consumers idempotentes. Ver [docs/PACK-00-IMPLEMENTACAO.md](docs/PACK-00-IMPLEMENTACAO.md).
- Senha: mínimo 12 caracteres (DOC-002 vence specs antigas que dizem 8).

## Skills do projeto (`.claude/skills/`)

| Skill | Quando usar |
|---|---|
| `trust-feature-workflow` | **Sempre** ao implementar/planejar uma feature do backlog |
| `trust-domain` | Regras de negócio, integrações entre módulos, máquinas de estado |
| `trust-architecture` | Criar componentes backend, estrutura de pastas, naming |
| `trust-api` | Qualquer endpoint HTTP |
| `trust-database` | Tabelas, migrations, queries |
| `trust-events` | Eventos, publishers, consumers |
| `trust-security` | Auth, endpoints sensíveis, auditoria |
| `trust-logging` | Logs e instrumentação |
| `trust-testing` | Escrever/revisar testes |
| `trust-payments` | **Qualquer feature PAY-XXX**, valor monetário, gateway, custódia, liquidação, reembolso |
