/**
 * E2E do Módulo 7 (negociação, MRK-009..014):
 * proposta → atualização → contraoferta → contraoferta de volta → rejeição →
 * nova rodada → aceite (que reserva o anúncio e cria o pedido) → retirada.
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

const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('MRK-009..014 — Negociação e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `neg-${uuidv7()}@e2e.trustplatform.test`;
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

  /** Vendedor publica um anúncio e o comprador abre a conversa. */
  async function openNegotiation(
    seller: TestUser,
    buyer: TestUser,
  ): Promise<{ listingId: string; conversationId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de ar-condicionado split',
        description: 'Instalação completa com suporte, vácuo e teste de estanqueidade.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 600,
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
      payload: { message: 'Bom dia! Quanto fica para dois aparelhos?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    return { listingId, conversationId };
  }

  async function createOffer(buyer: TestUser, conversationId: string, amount: number) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount, quantity: 1, expiresAt: inDays(7), notes: 'Posso pagar à vista.' },
    });
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

  it('rodadas de negociação: proposta → contraoferta → contraoferta de volta → rejeição', async () => {
    const seller = await createActiveUser('Paulo Henrique Moreira');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Juliana Alves Pereira');
    const stranger = await createActiveUser('Tiago Nascimento Rocha');
    const { conversationId } = await openNegotiation(seller, buyer);

    // MRK-009 — só o comprador abre a negociação
    const sellerTries = await createOffer(seller, conversationId, 500);
    expect(sellerTries.statusCode).toBe(403);

    const created = await createOffer(buyer, conversationId, 500);
    expect(created.statusCode).toBe(201);
    const offer = created.json<{
      data: { offerId: string; status: string; currency: string; recipientId: string };
    }>().data;
    expect(offer.status).toBe('PENDING');
    expect(offer.currency).toBe('BRL'); // herdada do anúncio
    expect(offer.recipientId).toBe(seller.identityId);

    // Uma proposta viva por vez (MRK-009 §6.3)
    const duplicate = await createOffer(buyer, conversationId, 480);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_OFFER_ALREADY_EXISTS',
    );

    // MRK-010 — o comprador ajusta a própria proposta
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/offers/${offer.offerId}`,
      headers: buyer.auth,
      payload: { amount: 520 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ data: { amount: number } }>().data.amount).toBe(520);

    // MRK-010 BR-001 — o vendedor não edita a proposta do comprador
    const sellerEdits = await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/offers/${offer.offerId}`,
      headers: seller.auth,
      payload: { amount: 900 },
    });
    expect(sellerEdits.statusCode).toBe(403);

    // MRK-012 — vendedor contrapõe: a original vira COUNTERED
    const countered = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offer.offerId}/counter`,
      headers: seller.auth,
      payload: { amount: 580, expiresAt: inDays(5), notes: 'Consigo fechar nesse valor.' },
    });
    expect(countered.statusCode).toBe(201);
    const counterOffer = countered.json<{
      data: { offerId: string; parentOfferId: string; recipientId: string; amount: number };
    }>().data;
    expect(counterOffer.parentOfferId).toBe(offer.offerId);
    expect(counterOffer.recipientId).toBe(buyer.identityId); // agora quem decide é o comprador

    const original = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/offers/${offer.offerId}`,
      headers: buyer.auth,
    });
    expect(original.json<{ data: { status: string } }>().data.status).toBe('COUNTERED');

    // MRK-012 BR-006/BR-007 — o comprador contrapõe de volta, sem limite de rodadas
    const counterBack = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${counterOffer.offerId}/counter`,
      headers: buyer.auth,
      payload: { amount: 545, expiresAt: inDays(5) },
    });
    expect(counterBack.statusCode).toBe(201);
    const thirdRound = counterBack.json<{ data: { offerId: string; recipientId: string } }>().data;
    expect(thirdRound.recipientId).toBe(seller.identityId);

    // MRK-014 — o vendedor rejeita; a conversa segue aberta (BR-004)
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${thirdRound.offerId}/reject`,
      headers: seller.auth,
      payload: { reason: 'Abaixo do meu custo.' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<{ data: { status: string; rejectReason: string } }>().data).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Abaixo do meu custo.',
    });

    // O próprio autor nunca rejeita a própria proposta — autorização antes do estado
    const selfReject = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${thirdRound.offerId}/reject`,
      headers: buyer.auth,
      payload: {},
    });
    expect(selfReject.statusCode).toBe(403);
    expect(selfReject.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_OFFER_NOT_RECIPIENT',
    );

    // Terceiro não enxerga a negociação
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: stranger.auth,
    });
    expect(denied.statusCode).toBe(403);

    // MRK-012 §6.2 — histórico completo e encadeado
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: seller.auth,
    });
    const rounds = history.json<{
      data: Array<{ offerId: string; status: string; parentOfferId: string | null; amount: number }>;
    }>().data;
    expect(rounds).toHaveLength(3);
    expect(rounds.map((round) => round.status)).toEqual(['COUNTERED', 'COUNTERED', 'REJECTED']);
    expect(rounds[1]!.parentOfferId).toBe(rounds[0]!.offerId);
    expect(rounds[2]!.parentOfferId).toBe(rounds[1]!.offerId);

    // MRK-014 BR-005 — depois da rejeição, nova rodada é permitida
    const newRound = await createOffer(buyer, conversationId, 560);
    expect(newRound.statusCode).toBe(201);

    // MRK-011 — o comprador retira a proposta
    const newOfferId = newRound.json<{ data: { offerId: string } }>().data.offerId;
    const withdrawn = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${newOfferId}/withdraw`,
      headers: buyer.auth,
      payload: { reason: 'Vou reavaliar o orçamento.' },
    });
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json<{ data: { status: string } }>().data.status).toBe('WITHDRAWN');

    // Retirada libera a negociação para uma nova proposta
    const afterWithdraw = await createOffer(buyer, conversationId, 570);
    expect(afterWithdraw.statusCode).toBe(201);
  });

  it('MRK-013 — aceite reserva o anúncio, cria o pedido e encerra a negociação', async () => {
    const seller = await createActiveUser('Ricardo Barbosa Teixeira');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Camila Duarte Nogueira');
    const { listingId, conversationId } = await openNegotiation(seller, buyer);

    const created = await createOffer(buyer, conversationId, 540);
    const offerId = created.json<{ data: { offerId: string } }>().data.offerId;

    // BR-001 — o autor não aceita a própria proposta
    const selfAccept = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: buyer.auth,
    });
    expect(selfAccept.statusCode).toBe(403);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    const result = accepted.json<{
      data: {
        offer: { status: string };
        order: { orderId: string; amount: number; status: string; offerId: string };
        listingStatus: string;
      };
    }>().data;

    expect(result.offer.status).toBe('ACCEPTED');
    expect(result.listingStatus).toBe('RESERVED'); // BR-005
    expect(result.order).toMatchObject({ amount: 540, status: 'CREATED', offerId }); // BR-006

    // O anúncio reservado sai da vitrine pública
    const publicView = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
    });
    expect(publicView.statusCode).toBe(404);
    const ownerView = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: seller.auth,
    });
    expect(ownerView.json<{ data: { status: string } }>().data.status).toBe('RESERVED');

    // BR-007 — negociação encerrada: nenhuma proposta nova para este anúncio
    const afterAccept = await createOffer(buyer, conversationId, 500);
    expect(afterAccept.statusCode).toBe(404); // anúncio não está mais disponível

    // Aceitar de novo é conflito
    const acceptAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(acceptAgain.statusCode).toBe(404);

    // O pedido aparece para as duas partes (e só para elas)
    const buyerOrders = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/orders',
      headers: buyer.auth,
    });
    expect(
      buyerOrders.json<{ data: Array<{ orderId: string }> }>().data.map((o) => o.orderId),
    ).toContain(result.order.orderId);

    const sellerOrder = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${result.order.orderId}`,
      headers: seller.auth,
    });
    expect(sellerOrder.statusCode).toBe(200);
    expect(sellerOrder.json<{ data: { buyerId: string } }>().data.buyerId).toBe(buyer.identityId);

    const outsider = await createActiveUser('Bruno Cardoso Vieira');
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${result.order.orderId}`,
      headers: outsider.auth,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('conversa encerrada não aceita novas propostas (MRK-009 BR-002)', async () => {
    const seller = await createActiveUser('Marcelo Antunes Prado');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Patricia Gomes Lima');
    const { conversationId } = await openNegotiation(seller, buyer);

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/close`,
      headers: buyer.auth,
      payload: { reason: 'Desisti da contratação.' },
    });

    const blocked = await createOffer(buyer, conversationId, 400);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_CONVERSATION_CLOSED',
    );
  });
});
