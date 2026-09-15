/**
 * E2E do PACK-03 — Trust Change Order & Time Billing (§25.2).
 *
 * Prova, com a aplicação de pé, a promessa central do Pack: **o prestador não
 * aumenta sozinho a conta do cliente**, e presença não é automaticamente tempo
 * faturável. Cobre os 9 cenários exigidos pela spec, incluindo as regressões de
 * PACK-00, PACK-01 e PACK-02.
 *
 * Sobre o tempo: o teste roda em milissegundos, então a passagem de tempo real é
 * simulada empurrando `check_in_at`/`paused_at` para trás no banco. É a única
 * forma honesta de exercitar "executou além do autorizado" sem esperar 95 min.
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { EmailService } from '../../src/modules/identity/domain/services/email.service';
import { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import {
  marketplaceOrderCommercialSnapshots,
  marketplaceOrders,
  outboxEvents,
  payments,
  serviceExecutionPauses,
  serviceExecutionSessions,
  trustCustodies,
  trustScores,
} from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

interface Contract {
  orderId: string;
  seller: TestUser;
  buyer: TestUser;
}

/** Recorte do Service Summary que este teste inspeciona (§15). */
interface SummaryShape {
  initialAuthorizedAmount: number;
  approvedChangesAmount: number;
  currentAuthorizedGrossAmount: number;
  currentMaterialCostAmount: number;
  currentMaterialMarkupAmount: number;
  amountInCustody: number;
  amountAuthorizedNotInCustody: number;
  currentTrustFeeAmount?: number;
  currentProviderNetBeforePspFees?: number;
  approvedChangeOrders: unknown[];
  pendingChangeOrders: unknown[];
  rejectedChangeOrders: unknown[];
  execution: {
    status: string;
    elapsedMinutes: number;
    pausedMinutes: number;
    rawActiveMinutes: number;
    billableMinutes: number;
    authorizedMinutes: number;
    pauses: { reasonCode: string; durationMinutes: number }[];
  } | null;
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('PACK-03 — Trust Change Order & Time Billing', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `pack03-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName,
        email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acceptTerms: true,
      },
    });
    const { identityId } = created.json<{ data: { identityId: string } }>().data;
    const token = new URL(emailService.lastSent!.verificationUrl).searchParams.get('token')!;
    await app.inject({ method: 'GET', url: `/api/v1/identities/verify-email?token=${token}` });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const accessToken = login.json<{ data: { accessToken: string } }>().data.accessToken;
    return { identityId, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function waitFor<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const value = await check();
      if (value !== undefined) {
        return value;
      }
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Timeout esperando: ${what}`);
  }

  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  /**
   * Contrato HOURLY do exemplo da spec: R$150/h com mínimo de 60 min → R$150,
   * incremento congelado de 30 min. Devolve o pedido já agendado e com check-in
   * feito, que é o estado em que uma mudança comercial faz sentido.
   */
  async function hourlyContractInProgress(names: [string, string]): Promise<Contract> {
    const seller = await createActiveUser(names[0]);
    const buyer = await createActiveUser(names[1]);
    await waitForBronze(seller.identityId);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Manutenção elétrica com cobrança por hora',
        description: 'Diagnóstico e reparo de instalações elétricas residenciais.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 150,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(published.statusCode).toBe(200);

    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Preciso de um eletricista para um diagnóstico.' },
    });
    const conversationId = contact.json<{ data: { conversation: { conversationId: string } } }>()
      .data.conversation.conversationId;

    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: {
        quantity: 1,
        expiresAt: inHours(48),
        pricingModel: 'HOURLY',
        hourlyRateAmount: 150,
        minimumMinutes: 60,
      },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    const scheduled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(1), estimatedDuration: 60 },
    });
    expect(scheduled.statusCode).toBe(200);

    const startedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    expect(startedResponse.statusCode).toBe(200);

    return { orderId, seller, buyer };
  }

  /**
   * Empurra o check-in para trás, simulando uma execução que já dura X minutos.
   * Move os DOIS marcos, porque eles são de agregados diferentes e medem coisas
   * diferentes: `marketplace_orders.started_at` alimenta o `actualDuration` do
   * MRK-021 e `service_execution_sessions.check_in_at` alimenta o tempo do
   * PACK-03. Retroagir só um deixaria o cenário incoerente.
   */
  async function backdateCheckIn(orderId: string, minutes: number): Promise<void> {
    const startedAt = new Date(Date.now() - minutes * 60000);
    const [session] = await db
      .select()
      .from(serviceExecutionSessions)
      .where(eq(serviceExecutionSessions.orderId, orderId));
    expect(session).toBeDefined();
    await db
      .update(serviceExecutionSessions)
      .set({ checkInAt: startedAt })
      .where(eq(serviceExecutionSessions.id, session!.id));
    await db
      .update(marketplaceOrders)
      .set({ startedAt })
      .where(eq(marketplaceOrders.id, orderId));
  }

  async function checkOut(contract: Contract) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/complete`,
      headers: contract.seller.auth,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    return response;
  }

  async function serviceSummary(
    contract: Contract,
    as: TestUser = contract.seller,
  ): Promise<SummaryShape> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${contract.orderId}/service-summary`,
      headers: as.auth,
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ data: SummaryShape }>().data;
  }

  /** Cria + submete um Change Order pelo prestador; devolve o id. */
  async function proposeChange(
    contract: Contract,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/change-orders`,
      headers: contract.seller.auth,
      payload,
    });
    expect(created.statusCode).toBe(201);
    const changeOrderId = created.json<{ data: { changeOrderId: string } }>().data.changeOrderId;

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/submit`,
      headers: contract.seller.auth,
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json<{ data: { status: string } }>().data.status).toBe(
      'PENDING_MEMBER_APPROVAL',
    );
    return changeOrderId;
  }

  beforeAll(async () => {
    const client = postgres(testDatabaseUrl!, { max: 1, prepare: false });
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    await client.end({ timeout: 5 });

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<Database>(DRIZZLE);
    emailService = app.get<LoggingEmailService>(EmailService);
    relay = app.get(OutboxRelayService);
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  // ── §25.2.1 ────────────────────────────────────────────────────────────────
  it('HOURLY: executar além do autorizado NÃO gera cobrança sem aprovação', async () => {
    const contract = await hourlyContractInProgress([
      'Rogério Bastos Almeida',
      'Helena Prado Machado',
    ]);
    // 95 minutos de execução sobre um contrato de 60 minutos autorizados.
    await backdateCheckIn(contract.orderId, 95);
    const response = await checkOut(contract);

    const summary = await serviceSummary(contract);
    expect(summary.initialAuthorizedAmount).toBe(150);
    expect(summary.approvedChangesAmount).toBe(0);
    // O valor autorizado continua o da contratação — presença não vira dinheiro.
    expect(summary.currentAuthorizedGrossAmount).toBe(150);

    const execution = summary.execution!;
    expect(execution.status).toBe('COMPLETED');
    expect(execution.elapsedMinutes).toBeGreaterThanOrEqual(94);
    expect(execution.rawActiveMinutes).toBeGreaterThanOrEqual(94);
    // O teto é o autorizado: 60 minutos, não os 95 de presença (§11).
    expect(execution.authorizedMinutes).toBe(60);
    expect(execution.billableMinutes).toBe(60);
    expect(response.json<{ data: { actualDuration: number } }>().data.actualDuration).toBeGreaterThan(
      90,
    );
  }, 120000);

  // ── §25.2.2 ────────────────────────────────────────────────────────────────
  it('HOURLY: +30 min aprovados viram 90 min faturáveis e R$75 de delta', async () => {
    const contract = await hourlyContractInProgress([
      'Vinícius Tavares Rocha',
      'Beatriz Andrade Lima',
    ]);
    const changeOrderId = await proposeChange(contract, {
      type: 'ADDITIONAL_TIME',
      additionalMinutes: 30,
      reason: 'A fiação estava mais danificada do que o previsto no diagnóstico.',
    });

    // §18: o prestador NÃO aprova a própria proposta.
    const selfApproval = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.seller.auth,
    });
    expect(selfApproval.statusCode).toBe(403);

    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });
    expect(approved.statusCode).toBe(200);
    const changeOrder = approved.json<{
      data: { status: string; serviceDeltaAmount: number; changeGrossAmount: number };
    }>().data;
    expect(changeOrder.status).toBe('APPROVED');
    // R$150/h × 30min = R$75 (§7.1).
    expect(changeOrder.serviceDeltaAmount).toBe(75);
    expect(changeOrder.changeGrossAmount).toBe(75);

    await backdateCheckIn(contract.orderId, 95);
    await checkOut(contract);

    const summary = await serviceSummary(contract);
    expect(summary.initialAuthorizedAmount).toBe(150);
    expect(summary.approvedChangesAmount).toBe(75);
    expect(summary.currentAuthorizedGrossAmount).toBe(225);
    // Trust Fee do delta com a taxa CONGELADA: 10% de R$75 = R$7,50 (§8).
    expect(summary.currentTrustFeeAmount).toBe(22.5);
    expect(summary.approvedChangeOrders.length).toBe(1);

    const execution = summary.execution!;
    expect(execution.authorizedMinutes).toBe(90);
    expect(execution.billableMinutes).toBe(90);
  }, 120000);

  // ── §25.2.3 ────────────────────────────────────────────────────────────────
  it('Trust Pause: o tempo pausado sai do tempo ativo', async () => {
    const contract = await hourlyContractInProgress([
      'Otávio Meireles Franco',
      'Larissa Coutinho Vieira',
    ]);
    await backdateCheckIn(contract.orderId, 100);

    const paused = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/pause`,
      headers: contract.seller.auth,
      payload: { reasonCode: 'MEAL', note: 'Parada para almoço' },
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json<{ data: { status: string } }>().data.status).toBe('PAUSED');

    // Segunda pausa sem retomar é recusada (§19/§24).
    const doublePause = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/pause`,
      headers: contract.seller.auth,
      payload: { reasonCode: 'PERSONAL_CALL' },
    });
    expect(doublePause.statusCode).toBe(409);

    // Empurra o início da pausa para 40 minutos atrás.
    const [session] = await db
      .select()
      .from(serviceExecutionSessions)
      .where(eq(serviceExecutionSessions.orderId, contract.orderId));
    await db
      .update(serviceExecutionPauses)
      .set({ pausedAt: new Date(Date.now() - 40 * 60000) })
      .where(eq(serviceExecutionPauses.sessionId, session!.id));

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/resume`,
      headers: contract.seller.auth,
    });
    expect(resumed.statusCode).toBe(200);
    const resumedSession = resumed.json<{ data: { status: string; pausedMinutes: number } }>().data;
    expect(resumedSession.status).toBe('ACTIVE');
    expect(resumedSession.pausedMinutes).toBeGreaterThanOrEqual(39);

    // Retomar de novo, sem pausa aberta, é transição inválida (§10.3).
    const doubleResume = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/resume`,
      headers: contract.seller.auth,
    });
    expect(doubleResume.statusCode).toBe(409);

    await checkOut(contract);
    const summary = await serviceSummary(contract);
    const execution = summary.execution!;
    expect(execution.elapsedMinutes).toBeGreaterThanOrEqual(99);
    expect(execution.pausedMinutes).toBeGreaterThanOrEqual(39);
    // 100 decorridos − 40 pausados = ~60 ativos.
    expect(execution.rawActiveMinutes).toBeLessThanOrEqual(61);
    expect(execution.rawActiveMinutes).toBeGreaterThanOrEqual(59);
    expect(execution.billableMinutes).toBe(60);
    expect(execution.pauses[0]!.reasonCode).toBe('MEAL');
  }, 120000);

  // ── IP-001 ────────────────────────────────────────────────────────────────
  it('Trust Resume concorrente: duas chamadas simultâneas não podem ambas retomar a mesma pausa', async () => {
    const contract = await hourlyContractInProgress([
      'Renato Bittencourt Salgado',
      'Ivone Cardoso Prestes',
    ]);
    await backdateCheckIn(contract.orderId, 100);

    const paused = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/pause`,
      headers: contract.seller.auth,
      payload: { reasonCode: 'MEAL', note: 'Parada para almoço' },
    });
    expect(paused.statusCode).toBe(200);

    const [session] = await db
      .select()
      .from(serviceExecutionSessions)
      .where(eq(serviceExecutionSessions.orderId, contract.orderId));
    await db
      .update(serviceExecutionPauses)
      .set({ pausedAt: new Date(Date.now() - 40 * 60000) })
      .where(eq(serviceExecutionPauses.sessionId, session!.id));

    // PACK-03 §25.2.3 já prova o double-Resume SEQUENCIAL (a segunda chamada
    // encontra `findOpenPause() === null` e recebe 409). O que este teste
    // prova é a corrida real de IP-001: duas chamadas CONCORRENTES podem ler
    // a MESMA pausa aberta antes de qualquer uma escrever — sem
    // compare-and-set no fechamento da pausa, ambas fechariam/retomariam com
    // sucesso, duplicando `pausedMinutes` e publicando dois
    // `ServiceExecution.Resumed`. `closePauseIfOpen` (repositório) faz o
    // UPDATE condicional a `resumed_at IS NULL`: só uma das duas vence.
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/orders/${contract.orderId}/resume`,
        headers: contract.seller.auth,
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/orders/${contract.orderId}/resume`,
        headers: contract.seller.auth,
      }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort();
    // Exatamente uma das duas vence (200); a outra perde a corrida (409) —
    // nunca as duas com sucesso, e nunca as duas em erro.
    expect(statusCodes).toEqual([200, 409]);

    const winner = first.statusCode === 200 ? first : second;
    const winnerBody = winner.json<{ data: { pausedMinutes: number } }>().data;
    // ~40 minutos pausados uma única vez — não 80 (o que aconteceria se as
    // duas chamadas tivessem retomado com sucesso e somado a pausa 2x).
    expect(winnerBody.pausedMinutes).toBeGreaterThanOrEqual(39);
    expect(winnerBody.pausedMinutes).toBeLessThan(79);

    // Nenhuma pausa aberta sobra pendurada: a que existia foi fechada
    // exatamente uma vez.
    const stillOpen = await db
      .select()
      .from(serviceExecutionPauses)
      .where(
        and(eq(serviceExecutionPauses.sessionId, session!.id), isNull(serviceExecutionPauses.resumedAt)),
      );
    expect(stillOpen.length).toBe(0);

    await checkOut(contract);
    const summary = await serviceSummary(contract);
    // O acumulado final também reflete uma única pausa fechada, não duas.
    expect(summary.execution!.pausedMinutes).toBeGreaterThanOrEqual(39);
    expect(summary.execution!.pausedMinutes).toBeLessThan(79);
  }, 120000);

  // ── IP-001 ────────────────────────────────────────────────────────────────
  it('Trust Pause concorrente: duas chamadas simultâneas colidem no índice parcial e a perdedora recebe 409, não 500', async () => {
    const contract = await hourlyContractInProgress([
      'Fabiano Lustosa Cerqueira',
      'Adélia Gouveia Marchetti',
    ]);
    await backdateCheckIn(contract.orderId, 100);

    // Duas chamadas concorrentes de Pause partem da MESMA sessão ACTIVE: a
    // checagem de transição em memória (session.pause()) passa nas duas, e
    // quem realmente impede duas pausas abertas simultâneas é o índice
    // parcial `UNIQUE(session_id) WHERE resumed_at IS NULL` (migration 0027,
    // §19). Antes do IP-001, a violação de UNIQUE não capturada por nenhum
    // módulo caía no branch genérico do GlobalExceptionFilter → 500. Este
    // teste prova que a generalização do mapeamento 23505→409 fecha essa
    // lacuna também aqui, não só no módulo identity.
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/orders/${contract.orderId}/pause`,
        headers: contract.seller.auth,
        payload: { reasonCode: 'MEAL' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/orders/${contract.orderId}/pause`,
        headers: contract.seller.auth,
        payload: { reasonCode: 'PERSONAL_CALL' },
      }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort();
    // Exatamente uma vence (200); a outra é um CONFLICT determinístico (409),
    // nunca um INTERNAL_ERROR (500) vazando a constraint do Postgres.
    expect(statusCodes).toEqual([200, 409]);

    const loser = first.statusCode === 409 ? first : second;
    const loserBody = loser.json<{ error: { code: string } }>();
    // 'CONFLICT' = a corrida bateu no índice parcial do banco (via
    // GlobalExceptionFilter); 'SERVICE_EXECUTION_INVALID_TRANSITION' = o
    // agendamento das duas chamadas não colidiu no banco (a primeira já
    // tinha terminado quando a segunda leu a sessão), pego pela checagem de
    // domínio antes de chegar lá. Ambos são 409 determinísticos; nunca 500.
    expect(['CONFLICT', 'SERVICE_EXECUTION_INVALID_TRANSITION']).toContain(loserBody.error.code);

    // Só uma pausa aberta existe — a colisão não deixou duplicata nenhuma.
    const [session] = await db
      .select()
      .from(serviceExecutionSessions)
      .where(eq(serviceExecutionSessions.orderId, contract.orderId));
    const openPauses = await db
      .select()
      .from(serviceExecutionPauses)
      .where(
        and(eq(serviceExecutionPauses.sessionId, session!.id), isNull(serviceExecutionPauses.resumedAt)),
      );
    expect(openPauses.length).toBe(1);
  }, 120000);

  // ── §25.2.4 ────────────────────────────────────────────────────────────────
  it('Material: custo é pass-through (0% fee) e markup é fee-eligible, separados', async () => {
    const contract = await hourlyContractInProgress([
      'Gustavo Pereira Antunes',
      'Marina Salgado Ferraz',
    ]);
    const changeOrderId = await proposeChange(contract, {
      type: 'MATERIAL',
      materialCostDeltaAmount: 200,
      materialMarkupDeltaAmount: 50,
      reason: 'Disjuntor geral queimado precisou ser substituído.',
    });
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });
    expect(approved.statusCode).toBe(200);

    const summary = await serviceSummary(contract);
    expect(summary.currentAuthorizedGrossAmount).toBe(400); // 150 + 250
    expect(summary.currentMaterialCostAmount).toBe(200);
    expect(summary.currentMaterialMarkupAmount).toBe(50);
    // Base da fee: 150 (serviço) + 50 (markup). Os 200 de custo ficam de fora.
    expect(summary.currentTrustFeeAmount).toBe(20);

    // O cliente vê custo e markup separados, mas não a economia interna (§15).
    const memberView = await serviceSummary(contract, contract.buyer);
    expect(memberView.currentMaterialCostAmount).toBe(200);
    expect(memberView.currentMaterialMarkupAmount).toBe(50);
    expect(memberView.currentTrustFeeAmount).toBeUndefined();
    expect(memberView.currentProviderNetBeforePspFees).toBeUndefined();
  }, 120000);

  // ── §25.2.5 ────────────────────────────────────────────────────────────────
  it('Rejeição: nada muda no valor nem no tempo autorizado', async () => {
    const contract = await hourlyContractInProgress([
      'Anderson Quintela Braga',
      'Cecília Monteiro Duarte',
    ]);
    const changeOrderId = await proposeChange(contract, {
      type: 'ADDITIONAL_TIME',
      additionalMinutes: 60,
      reason: 'Preciso de mais uma hora para concluir.',
    });
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/reject`,
      headers: contract.buyer.auth,
      payload: { reason: 'Não autorizo mais horas hoje.' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<{ data: { status: string } }>().data.status).toBe('REJECTED');

    const summary = await serviceSummary(contract);
    expect(summary.currentAuthorizedGrossAmount).toBe(150);
    expect(summary.approvedChangesAmount).toBe(0);
    expect(summary.rejectedChangeOrders.length).toBe(1);

    const execution = summary.execution!;
    expect(execution.authorizedMinutes).toBe(60);
  }, 120000);

  // ── §25.2.6 ────────────────────────────────────────────────────────────────
  it('Concorrência: aprovar duas vezes não aplica o delta duas vezes', async () => {
    const contract = await hourlyContractInProgress([
      'Eduardo Sampaio Nunes',
      'Priscila Ramos Teixeira',
    ]);
    const changeOrderId = await proposeChange(contract, {
      type: 'ADDITIONAL_TIME',
      additionalMinutes: 30,
      reason: 'Meia hora a mais para finalizar o quadro.',
    });

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });
    expect(second.statusCode).toBe(409);

    // E rejeitar depois de aprovado também não passa (§6.1: terminal).
    const rejectAfterApproval = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/reject`,
      headers: contract.buyer.auth,
      payload: { reason: 'Mudei de ideia.' },
    });
    expect(rejectAfterApproval.statusCode).toBe(409);

    const summary = await serviceSummary(contract);
    expect(summary.approvedChangesAmount).toBe(75); // uma vez, não duas
    expect(summary.currentAuthorizedGrossAmount).toBe(225);
  }, 120000);

  // ── §25.2.7 — regressão PACK-02 ────────────────────────────────────────────
  it('PACK-02 continua verde: o snapshot inicial é imutável', async () => {
    const contract = await hourlyContractInProgress([
      'Fernando Aguiar Pontes',
      'Tatiana Bezerra Nogueira',
    ]);
    const [before] = await db
      .select()
      .from(marketplaceOrderCommercialSnapshots)
      .where(eq(marketplaceOrderCommercialSnapshots.orderId, contract.orderId));
    expect(before).toBeDefined();

    const changeOrderId = await proposeChange(contract, {
      type: 'ADDITIONAL_TIME',
      additionalMinutes: 30,
      reason: 'Mais meia hora.',
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });

    const [after] = await db
      .select()
      .from(marketplaceOrderCommercialSnapshots)
      .where(eq(marketplaceOrderCommercialSnapshots.orderId, contract.orderId));
    // Nenhum campo do snapshot muda: os deltas vivem em tabela própria (§5).
    expect(after).toEqual(before);
  }, 120000);

  // ── §25.2.8 — regressão PACK-01 ────────────────────────────────────────────
  it('PACK-01 continua verde: a custódia segura o valor da contratação (§9)', async () => {
    const contract = await hourlyContractInProgress([
      'Rafael Siqueira Mendes',
      'Juliana Barcelos Pinto',
    ]);
    const paymentRow = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, contract.orderId));
      return row;
    }, 'Payment criado pelo aceite');

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...contract.buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);

    const custody = await waitFor(async () => {
      const [row] = await db
        .select()
        .from(trustCustodies)
        .where(eq(trustCustodies.orderId, contract.orderId));
      return row;
    }, 'custódia criada');
    expect(custody.status).toBe('IN_CUSTODY');
    expect(Number(custody.amount)).toBe(150);

    const changeOrderId = await proposeChange(contract, {
      type: 'ADDITIONAL_TIME',
      additionalMinutes: 30,
      reason: 'Mais meia hora de serviço.',
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });
    await relay.tick();

    // §9 (item PARADO e reportado): o Change Order aprovado NÃO altera Payment
    // nem custódia. O delta fica autorizado e explicitamente fora da custódia.
    const [custodyAfter] = await db
      .select()
      .from(trustCustodies)
      .where(eq(trustCustodies.orderId, contract.orderId));
    const [paymentAfter] = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, contract.orderId));
    expect(Number(custodyAfter!.amount)).toBe(150);
    expect(Number(paymentAfter!.amount)).toBe(150);

    const summary = await serviceSummary(contract);
    expect(summary.amountInCustody).toBe(150);
    expect(summary.amountAuthorizedNotInCustody).toBe(75);
    expect(summary.currentAuthorizedGrossAmount).toBe(225);
  }, 120000);

  // ── §25.2.9 — regressão PACK-00 ────────────────────────────────────────────
  it('PACK-00 continua verde: os eventos novos usam o envelope canônico', async () => {
    const contract = await hourlyContractInProgress([
      'Leonardo Cavalcanti Reis',
      'Patrícia Estevão Moura',
    ]);
    const changeOrderId = await proposeChange(contract, {
      type: 'SCOPE_CHANGE',
      serviceDeltaAmount: 120,
      reason: 'Cliente pediu dois pontos de luz adicionais.',
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
    });

    const submitted = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, 'TrustChangeOrder.Submitted'),
          eq(outboxEvents.aggregateId, changeOrderId),
        ),
      );
    expect(submitted.length).toBe(1);
    expect(submitted[0]!.aggregateType).toBe('TrustChangeOrder');
    expect(submitted[0]!.producer).toBe('marketplace-service');

    const approvedEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, 'TrustChangeOrder.Approved'),
          eq(outboxEvents.aggregateId, changeOrderId),
        ),
      );
    expect(approvedEvents.length).toBe(1);
    const payload = approvedEvents[0]!.payload as Record<string, unknown>;
    expect(payload.orderId).toBe(contract.orderId);
    expect(payload.buyerId).toBe(contract.buyer.identityId);
    expect(payload.sellerId).toBe(contract.seller.identityId);
    expect(payload.currentAuthorizedGrossAmount).toBe(270); // 150 + 120
    expect(payload.amountAuthorizedNotInCustody).toBe(120);
  }, 120000);

  // ── §24 — validações que precisam falhar ───────────────────────────────────
  it('recusa tempo fora do incremento congelado e mudança pedida pelo cliente', async () => {
    const contract = await hourlyContractInProgress([
      'Márcio Delgado Ferreira',
      'Isabela Fontoura Rezende',
    ]);

    // 45 min não é múltiplo do incremento de 30 congelado no contrato (§7.1).
    const misaligned = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/change-orders`,
      headers: contract.seller.auth,
      payload: {
        type: 'ADDITIONAL_TIME',
        additionalMinutes: 45,
        reason: 'Preciso de 45 minutos a mais.',
      },
    });
    expect(misaligned.statusCode).toBe(422);

    // §6.1/§18: quem propõe aumento é o prestador, não o cliente.
    const byMember = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/change-orders`,
      headers: contract.buyer.auth,
      payload: {
        type: 'ADDITIONAL_TIME',
        additionalMinutes: 30,
        reason: 'Quero pagar mais.',
      },
    });
    expect(byMember.statusCode).toBe(403);
  }, 120000);
});
