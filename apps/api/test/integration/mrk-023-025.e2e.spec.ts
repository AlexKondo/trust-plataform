/**
 * E2E do Módulo 9 (disputas e avaliações, MRK-023..025):
 * o fecho do ciclo de reputação — a nota de quem contratou vira pontos de
 * confiança, e a disputa julgada procedente vira penalidade.
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
import { identities, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('MRK-023..025 — Disputas e avaliações e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `rev-${uuidv7()}@e2e.trustplatform.test`;
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

  /** Admin/mediador: a flag é concedida no banco (mesmo mecanismo do VRF). */
  async function createAdmin(): Promise<TestUser> {
    const admin = await createActiveUser('Mediadora Trust Platform');
    await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, admin.identityId));
    return admin;
  }

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
    throw new Error(`Pedido não chegou a ${expected} (último: ${last})`);
  }

  /** Do anúncio ao pedido criado pelo aceite. */
  async function createOrder(seller: TestUser, buyer: TestUser): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Montagem de guarda-roupa e cômoda',
        description: 'Montagem de móveis planejados e de linha, com ferramentas próprias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 300,
        currency: 'BRL',
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
      payload: { message: 'Monta dois móveis?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 280, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    return accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;
  }

  /** Leva o pedido até COMPLETED pelo caminho feliz. */
  async function completeOrder(
    seller: TestUser,
    buyer: TestUser,
    orderId: string,
  ): Promise<void> {
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 120 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/complete`,
      headers: seller.auth,
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: buyer.auth,
      payload: {},
    });
    await waitForOrderStatus(buyer, orderId, 'COMPLETED');
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

  it('MRK-025 — a avaliação do cliente vira pontos de confiança do prestador', async () => {
    const seller = await createActiveUser('Rodrigo Matos Fontes');
    await waitForExactScore(seller.identityId, 25);
    const buyer = await createActiveUser('Helena Duarte Prado');
    const stranger = await createActiveUser('Marcelo Rezende Alves');
    const orderId = await createOrder(seller, buyer);

    // BR-003 — antes de concluir não se avalia
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
      payload: { overallScore: 5 },
    });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_REVIEW_NOT_ALLOWED',
    );

    await completeOrder(seller, buyer, orderId);
    // 25 (cadastro) + 40 (serviço confirmado)
    await waitForExactScore(seller.identityId, 65);

    // BR-001 — terceiro não avalia
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: stranger.auth,
      payload: { overallScore: 1 },
    });
    expect(denied.statusCode).toBe(403);

    // O cliente avalia o prestador
    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
      payload: {
        overallScore: 5,
        recommended: true,
        comment: 'Montou tudo em duas horas e deixou o quarto limpo.',
        scores: { quality: 5, punctuality: 5, communication: 4 },
      },
    });
    expect(review.statusCode).toBe(201);
    const created = review.json<{
      data: { reviewedUserId: string; overallScore: number; scores: Record<string, number> };
    }>().data;
    expect(created.reviewedUserId).toBe(seller.identityId);
    expect(created.scores).toEqual({ quality: 5, punctuality: 5, communication: 4 });

    // BR-002 — uma avaliação por participante
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
      payload: { overallScore: 3 },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_REVIEW_ALREADY_EXISTS',
    );

    // O CICLO FECHA: nota 5 vale +30 no Trust Score do prestador
    await waitForExactScore(seller.identityId, 95);

    const timeline = await app.inject({
      method: 'GET',
      url: '/api/v1/trust-scores/me/timeline',
      headers: seller.auth,
    });
    const events = timeline.json<{ data: Array<{ eventName: string; points: number }> }>().data;
    expect(events.find((e) => e.eventName === 'MarketplaceReview.Created')).toMatchObject({
      points: 30,
    });

    // O prestador também avalia o cliente — reputação dos dois lados
    const sellerReview = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: seller.auth,
      payload: { overallScore: 5, recommended: true },
    });
    expect(sellerReview.statusCode).toBe(201);
    expect(sellerReview.json<{ data: { reviewedUserId: string } }>().data.reviewedUserId).toBe(
      buyer.identityId,
    );
    await waitForExactScore(buyer.identityId, 55); // 25 + 30

    // Consolidado do prestador
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/reviews/summary',
      headers: seller.auth,
    });
    expect(summary.json<{ data: { totalReviews: number; averageScore: number; recommendationRate: number } }>().data).toMatchObject(
      { totalReviews: 1, averageScore: 5, recommendationRate: 100 },
    );

    // As duas avaliações ficam visíveis no pedido
    const orderReviews = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
    });
    expect(orderReviews.json<{ data: unknown[] }>().data).toHaveLength(2);
  });

  it('avaliação negativa reduz a reputação de quem prestou o serviço', async () => {
    const seller = await createActiveUser('Cláudio Bastos Neves');
    await waitForExactScore(seller.identityId, 25);
    const buyer = await createActiveUser('Marina Teixeira Bueno');
    const orderId = await createOrder(seller, buyer);
    await completeOrder(seller, buyer, orderId);
    await waitForExactScore(seller.identityId, 65);

    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
      payload: { overallScore: 2, recommended: false, comment: 'Atrasou e deixou sujeira.' },
    });
    expect(review.statusCode).toBe(201);

    // 65 - 30 = 35
    await waitForExactScore(seller.identityId, 35);
  });

  it('MRK-023/024 — disputa procedente penaliza a parte reclamada', async () => {
    const seller = await createActiveUser('Wagner Pinho Estrela');
    await waitForExactScore(seller.identityId, 25);
    const buyer = await createActiveUser('Isabela Moraes Quintas');
    await waitForExactScore(buyer.identityId, 25);
    const admin = await createAdmin();
    const orderId = await createOrder(seller, buyer);

    // Coloca o pedido em execução para a disputa fazer sentido
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 120 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });

    const opened = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/disputes`,
      headers: buyer.auth,
      payload: {
        category: 'SERVICE_PARTIALLY_EXECUTED',
        description: 'O prestador montou apenas o guarda-roupa e foi embora.',
      },
    });
    expect(opened.statusCode).toBe(201);
    const dispute = opened.json<{ data: { disputeId: string; status: string } }>().data;
    expect(dispute.status).toBe('OPEN');

    // BR-005 — o pedido entra em disputa
    const order = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}`,
      headers: buyer.auth,
    });
    expect(order.json<{ data: { status: string } }>().data.status).toBe('DISPUTE_OPEN');

    // BR-002 — uma disputa ativa por pedido
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/disputes`,
      headers: seller.auth,
      payload: { category: 'OTHER', description: 'Discordo do relato apresentado pelo cliente.' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_DISPUTE_ALREADY_OPEN',
    );

    // MRK-024 BR-001 — participante não julga o próprio caso
    const selfJudge = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${dispute.disputeId}/resolve`,
      headers: buyer.auth,
      payload: { decisionType: 'UPHELD', justification: 'Tenho razão neste caso.' },
    });
    expect(selfJudge.statusCode).toBe(403);

    // A disputa aparece na fila de mediação
    const queue = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/marketplace/disputes',
      headers: admin.auth,
    });
    expect(
      queue.json<{ data: Array<{ disputeId: string }> }>().data.map((d) => d.disputeId),
    ).toContain(dispute.disputeId);

    // Decisão da mediação: procedente contra o prestador
    const resolved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${dispute.disputeId}/resolve`,
      headers: admin.auth,
      payload: {
        decisionType: 'UPHELD',
        justification: 'As fotos enviadas confirmam que apenas um móvel foi montado.',
      },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json<{ data: { status: string; decision: { decisionType: string } } }>().data).toMatchObject(
      { status: 'RESOLVED', decision: { decisionType: 'UPHELD' } },
    );

    // BR-005 — o pedido acompanha o desfecho
    const afterDecision = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}`,
      headers: buyer.auth,
    });
    expect(afterDecision.json<{ data: { status: string } }>().data.status).toBe('DISPUTE_RESOLVED');

    // BR-006 — decisão é definitiva
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${dispute.disputeId}/resolve`,
      headers: admin.auth,
      payload: { decisionType: 'REJECTED', justification: 'Mudei de ideia sobre o caso.' },
    });
    expect(again.statusCode).toBe(409);

    // A culpa reconhecida custa 60 pontos ao prestador (25 - 60, piso em 0)
    await waitForExactScore(seller.identityId, 0);

    // Quem abriu a disputa não é penalizado
    const [buyerScore] = await db
      .select()
      .from(trustScores)
      .where(eq(trustScores.identityId, buyer.identityId));
    expect(buyerScore!.score).toBe(25);

    // MRK-025 BR-003 — DISPUTE_RESOLVED já permite avaliar
    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reviews`,
      headers: buyer.auth,
      payload: { overallScore: 1, recommended: false },
    });
    expect(review.statusCode).toBe(201);
  });

  it('disputa com acordo não penaliza ninguém', async () => {
    const seller = await createActiveUser('Leandro Guimarães Sales');
    await waitForExactScore(seller.identityId, 25);
    const buyer = await createActiveUser('Priscila Fonseca Ramos');
    await waitForExactScore(buyer.identityId, 25);
    const admin = await createAdmin();
    const orderId = await createOrder(seller, buyer);
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 120 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });

    const opened = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/disputes`,
      headers: seller.auth,
      payload: {
        category: 'INAPPROPRIATE_CONDUCT',
        description: 'Houve um desentendimento sobre o horário combinado para o serviço.',
      },
    });
    expect(opened.statusCode).toBe(201);
    const disputeId = opened.json<{ data: { disputeId: string } }>().data.disputeId;

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${disputeId}/resolve`,
      headers: admin.auth,
      payload: {
        decisionType: 'SETTLED',
        justification: 'As partes chegaram a um acordo e reagendaram o atendimento.',
      },
    });
    expect(resolved.statusCode).toBe(200);

    // Nenhum dos dois perde pontos
    await relay.tick();
    await new Promise((sleep) => setTimeout(sleep, 1500));
    await relay.tick();
    const [sellerScore] = await db
      .select()
      .from(trustScores)
      .where(eq(trustScores.identityId, seller.identityId));
    const [buyerScore] = await db
      .select()
      .from(trustScores)
      .where(eq(trustScores.identityId, buyer.identityId));
    expect(sellerScore!.score).toBe(25);
    expect(buyerScore!.score).toBe(25);
  });
});
