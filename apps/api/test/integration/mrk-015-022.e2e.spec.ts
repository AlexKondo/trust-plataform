/**
 * E2E do Módulo 8 (ciclo de vida do pedido, MRK-015..022):
 * aceite → agendamento → check-in → check-out → confirmação do cliente →
 * conclusão automática → **pontos de confiança para o prestador**.
 * É o ciclo completo do produto: trabalho entregue vira reputação.
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
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
import { trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('MRK-015..022 — Ciclo do pedido e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ord-${uuidv7()}@e2e.trustplatform.test`;
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

  /** Espera o score do usuário atingir (pelo menos) o valor informado. */
  async function waitForScore(identityId: string, minimum: number): Promise<number> {
    const startedAt = Date.now();
    let last = -1;
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score) {
        last = score.score;
        if (score.score >= minimum) {
          return score.score;
        }
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Score não atingiu ${minimum} dentro do timeout (último: ${last})`);
  }

  /** Espera o score chegar exatamente ao valor esperado (penalidades incluídas). */
  async function waitForExactScore(identityId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    let last = -1;
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score) {
        last = score.score;
        if (score.score === expected) {
          return;
        }
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Score não chegou a ${expected} dentro do timeout (último: ${last})`);
  }

  /** Espera o pedido chegar ao status informado (efeito de consumer). */
  async function waitForOrderStatus(
    user: TestUser,
    orderId: string,
    expected: string,
  ): Promise<void> {
    const startedAt = Date.now();
    let last = '';
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/marketplace/orders/${orderId}`,
        headers: user.auth,
      });
      last = response.json<{ data: { status: string } }>().data.status;
      if (last === expected) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Pedido não chegou a ${expected} dentro do timeout (último: ${last})`);
  }

  /** Anúncio publicado → conversa → proposta → aceite. Devolve o pedido criado. */
  async function createOrder(
    seller: TestUser,
    buyer: TestUser,
  ): Promise<{ orderId: string; listingId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Pintura de apartamento com massa corrida',
        description: 'Pintura completa, com massa corrida e acabamento fino em até 3 dias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 1200,
        currency: 'BRL',
        location: 'São Paulo/SP',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Consegue pintar dois quartos?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;

    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 1100, quantity: 1, expiresAt: inHours(72) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    return {
      orderId: accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId,
      listingId,
    };
  }

  // Env de teste definida em test/setup-env.ts (roda antes dos imports).
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('ciclo completo: agenda → executa → confirma → conclui → vira reputação', async () => {
    const seller = await createActiveUser('Anderson Silva Machado');
    const scoreAfterSignup = await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Larissa Monteiro Cruz');
    const { orderId } = await createOrder(seller, buyer);

    // MRK-016 — pedido nasce CREATED, com a próxima ação declarada
    const initial = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}`,
      headers: buyer.auth,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json<{ data: { status: string; nextAction: string } }>().data).toMatchObject({
      status: 'CREATED',
      nextAction: 'AWAITING_SCHEDULING',
    });

    // MRK-017 BR-004 — nada de saltos: não dá para confirmar antes de executar
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: buyer.auth,
      payload: {},
    });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_INVALID_TRANSITION',
    );

    // MRK-019 — agendamento
    const scheduled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 240 },
    });
    expect(scheduled.statusCode).toBe(200);
    const withSchedule = scheduled.json<{
      data: { status: string; scheduling: { estimatedDuration: number; scheduledEnd: string } };
    }>().data;
    expect(withSchedule.status).toBe('SCHEDULED');
    expect(withSchedule.scheduling.estimatedDuration).toBe(240);

    // MRK-020 — só o prestador faz check-in
    const buyerTriesToStart = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: buyer.auth,
      payload: {},
    });
    expect(buyerTriesToStart.statusCode).toBe(403);

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: { latitude: -23.5505, longitude: -46.6333, notes: 'Cheguei ao local.' },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json<{ data: { status: string } }>().data.status).toBe('IN_PROGRESS');

    // MRK-018 BR-002 — serviço em andamento não cancela direto
    const cancelBlocked = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: buyer.auth,
      payload: { reason: 'Mudei de ideia.' },
    });
    expect(cancelBlocked.statusCode).toBe(409);
    expect(cancelBlocked.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_CANCELLATION_NOT_ALLOWED',
    );

    // MRK-021 — check-out do prestador
    const completed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/complete`,
      headers: seller.auth,
      payload: { notes: 'Serviço finalizado, ambiente limpo.' },
    });
    expect(completed.statusCode).toBe(200);
    const afterCheckout = completed.json<{
      data: { status: string; actualDuration: number; nextAction: string };
    }>().data;
    expect(afterCheckout.status).toBe('AWAITING_CUSTOMER_CONFIRMATION');
    expect(afterCheckout.actualDuration).toBeGreaterThanOrEqual(1);
    expect(afterCheckout.nextAction).toBe('AWAITING_CUSTOMER_CONFIRMATION');

    // MRK-022 BR-001 — só o cliente confirma
    const sellerTriesToConfirm = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: seller.auth,
      payload: {},
    });
    expect(sellerTriesToConfirm.statusCode).toBe(403);

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: buyer.auth,
      payload: { comments: 'Ficou impecável!' },
    });
    expect(confirmed.statusCode).toBe(200);
    const afterConfirmation = confirmed.json<{
      data: { status: string; timeline: Array<{ type: string }> };
    }>().data;
    // BR-006: confirmar NÃO encerra o pedido — dispara os processos
    expect(afterConfirmation.status).toBe('CUSTOMER_CONFIRMED');
    expect(afterConfirmation.timeline.map((entry) => entry.type)).toEqual([
      'ORDER_CREATED',
      'SCHEDULED',
      'CHECK_IN',
      'CHECK_OUT',
      'CUSTOMER_CONFIRMED',
    ]);

    // BR-007 — processos concluídos, o pedido evolui sozinho para COMPLETED
    await waitForOrderStatus(buyer, orderId, 'COMPLETED');

    // E o ciclo fecha: o serviço entregue virou pontos de confiança (#13)
    const scoreAfterService = await waitForScore(seller.identityId, scoreAfterSignup + 40);
    expect(scoreAfterService).toBe(scoreAfterSignup + 40);

    const timeline = await app.inject({
      method: 'GET',
      url: '/api/v1/trust-scores/me/timeline',
      headers: seller.auth,
    });
    const events = timeline.json<{ data: Array<{ eventName: string; points: number }> }>().data;
    expect(events.find((event) => event.eventName === 'MarketplaceOrder.CustomerConfirmed')).toMatchObject(
      { points: 40 },
    );
  });

  it('cancelamento devolve o anúncio à vitrine e penaliza quem cancelou', async () => {
    const seller = await createActiveUser('Gustavo Pereira Ramos');
    const scoreBefore = await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Beatriz Campos Farias');
    const { orderId, listingId } = await createOrder(seller, buyer);

    // Reservado pelo aceite: fora da vitrine
    const reserved = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
    });
    expect(reserved.statusCode).toBe(404);

    // MRK-018 BR-003 — motivo é obrigatório
    const noReason = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: buyer.auth,
      payload: {},
    });
    expect(noReason.statusCode).toBe(400);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: buyer.auth,
      payload: { reason: 'Consegui resolver por conta própria.' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<{ data: { status: string; cancellationReason: string } }>().data).toMatchObject(
      { status: 'CANCELLED', cancellationReason: 'Consegui resolver por conta própria.' },
    );

    // INCONSISTENCIAS #12 — o consumer devolve o anúncio para PUBLISHED
    const startedAt = Date.now();
    let listingStatus = '';
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const view = await app.inject({
        method: 'GET',
        url: `/api/v1/marketplace/listings/${listingId}`,
        headers: seller.auth,
      });
      listingStatus = view.json<{ data: { status: string } }>().data.status;
      if (listingStatus === 'PUBLISHED') {
        break;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    expect(listingStatus).toBe('PUBLISHED');

    // De volta à vitrine pública
    const backOnline = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
    });
    expect(backOnline.statusCode).toBe(200);

    // Quem cancelou paga a conta na reputação: 25 do cadastro - 20 do cancelamento
    await waitForExactScore(buyer.identityId, 5);

    // O prestador não é penalizado por um cancelamento do cliente
    const [sellerScore] = await db
      .select()
      .from(trustScores)
      .where(eq(trustScores.identityId, seller.identityId));
    expect(sellerScore!.score).toBe(scoreBefore);

    // Pedido cancelado é terminal
    const cancelAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: buyer.auth,
      payload: { reason: 'de novo' },
    });
    expect(cancelAgain.statusCode).toBe(409);
  });

  it('MRK-019 BR-004 — agenda do prestador não aceita dois serviços sobrepostos', async () => {
    const seller = await createActiveUser('Eduardo Tavares Lopes');
    await waitForScore(seller.identityId, 25);
    const firstBuyer = await createActiveUser('Renata Siqueira Melo');
    const secondBuyer = await createActiveUser('Otávio Freitas Barros');

    const first = await createOrder(seller, firstBuyer);
    const second = await createOrder(seller, secondBuyer);

    const start = inHours(48);
    const firstSchedule = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${first.orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: start, estimatedDuration: 180 },
    });
    expect(firstSchedule.statusCode).toBe(200);

    // mesma janela → conflito
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${second.orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: start, estimatedDuration: 60 },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_SCHEDULING_CONFLICT',
    );

    // depois do término do primeiro → sem conflito
    const later = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${second.orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(52), estimatedDuration: 60 },
    });
    expect(later.statusCode).toBe(200);
  });

  it('terceiro não acessa pedido alheio (MRK-016 BR-001)', async () => {
    const seller = await createActiveUser('Fábio Nunes Cardoso');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Sabrina Lopes Moura');
    const stranger = await createActiveUser('Vinicius Andrade Pinto');
    const { orderId } = await createOrder(seller, buyer);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}`,
      headers: stranger.auth,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_FORBIDDEN',
    );
  });
});
