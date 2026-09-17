/**
 * E2E do IP-008 — Cancellation, Dispute & Refund.
 *
 * Prova, com a aplicação de pé, os dois fluxos que ganharam consequência
 * financeira REAL nesta IP:
 *   1. cancelamento ANTES da execução → devolve o que estava em custódia;
 *   2. resolução de disputa com valor de reembolso decidido pelo admin →
 *      devolve exatamente aquele valor, nunca um percentual inventado.
 *
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
import {
  identities,
  marketplaceListings,
  payments,
  trustCustodies,
  trustScores,
} from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-008 — Cancelamento, disputa e reembolso', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip008-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { fullName, email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true },
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

  /** Publicar exige reputação mínima da categoria (MRK-003 BR-005) — espera o
   *  score inicial do cadastro ser processado antes de tentar publicar. */
  async function waitForScore(identityId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score?.score === expected) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Score não chegou a ${expected}`);
  }

  async function createAdmin(): Promise<TestUser> {
    const admin = await createActiveUser('Mediador IP-008');
    await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, admin.identityId));
    return admin;
  }

  /** Espera até `check` devolver algo, tickando o relay entre as tentativas. */
  async function waitFor<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const value = await check();
      if (value !== undefined) {
        return value;
      }
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Timeout esperando: ${what}`);
  }

  const paymentOf = (orderId: string) => async () => {
    const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    return row;
  };

  /** Publica um anúncio, cria a conversa/proposta e aceita — devolve listing + pedido. */
  async function createOrder(
    seller: TestUser,
    buyer: TestUser,
    amount: number,
  ): Promise<{ listingId: string; orderId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de ar-condicionado split',
        description: 'Instalação completa com dreno e suporte, garantia de 6 meses.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: amount,
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
      payload: { message: 'Preciso instalar um split de 12000 BTUs.' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;
    return { listingId, orderId };
  }

  /** Autoriza o pagamento e espera a custódia — pedido continua CANCELÁVEL (CREATED). */
  async function payIntoCustody(buyer: TestUser, orderId: string): Promise<string> {
    const paymentRow = await waitFor(paymentOf(orderId), 'Payment criado pelo aceite');
    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);
    await waitFor(async () => {
      const [row] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
      return row?.status === 'IN_CUSTODY' ? row : undefined;
    }, 'custódia criada');
    return paymentRow.id;
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('cancelamento ANTES da execução, com dinheiro em custódia: reembolso TOTAL automático', async () => {
    const seller = await createActiveUser('Bruno Salvador Nunes');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Camila Duarte Vasques');
    const { listingId, orderId } = await createOrder(seller, buyer, 480);
    const paymentId = await payIntoCustody(buyer, orderId);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: buyer.auth,
      payload: { reason: 'Encontrei outro prestador com disponibilidade mais cedo.' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<{ data: { status: string } }>().data.status).toBe('CANCELLED');

    // O Payment volta para REFUNDED — automático, sem endpoint de reembolso.
    const refundedPayment = await waitFor(async () => {
      const row = await paymentOf(orderId)();
      return row?.status === 'REFUNDED' ? row : undefined;
    }, 'Payment REFUNDED após cancelamento');
    expect(refundedPayment.id).toBe(paymentId);
    expect(Number(refundedPayment.refundedAmount)).toBe(480);

    // A custódia original também reflete o reembolso (nunca é "liberada" para o prestador).
    const [custody] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
    expect(custody?.status).toBe('REFUNDED');

    // GET /payments/by-order expõe o histórico de reembolsos (PAY-006 auditabilidade).
    const paymentDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${orderId}`,
      headers: buyer.auth,
    });
    const refunds = paymentDetails.json<{
      data: { refunds: Array<{ amount: number; reason: string; status: string; requestedBy: string }> };
    }>().data.refunds;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      amount: 480,
      reason: 'ORDER_CANCELLED_BEFORE_EXECUTION',
      status: 'COMPLETED',
      requestedBy: buyer.identityId,
    });

    // INCONSISTENCIAS #12 continua valendo: o anúncio volta para PUBLISHED.
    const [listing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, listingId));
    expect(listing?.status).toBe('PUBLISHED');
  });

  it('cancelamento ANTES de qualquer autorização: Payment vira CANCELLED, nenhum reembolso é criado', async () => {
    const seller = await createActiveUser('Diego Fontoura Nascimento');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Elisa Cavalcante Prado');
    const { orderId } = await createOrder(seller, buyer, 220);
    // Espera o Payment nascer (CreatePaymentOnOrderConsumer), mas NUNCA autoriza.
    await waitFor(paymentOf(orderId), 'Payment criado pelo aceite');

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/cancel`,
      headers: seller.auth,
      payload: { reason: 'Cliente desistiu antes de pagar.' },
    });
    expect(cancelled.statusCode).toBe(200);

    const cancelledPayment = await waitFor(async () => {
      const row = await paymentOf(orderId)();
      return row?.status === 'CANCELLED' ? row : undefined;
    }, 'Payment CANCELLED após cancelamento do pedido');
    expect(Number(cancelledPayment.refundedAmount)).toBe(0);

    const paymentDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${orderId}`,
      headers: buyer.auth,
    });
    expect(paymentDetails.json<{ data: { refunds: unknown[] } }>().data.refunds).toHaveLength(0);
  });

  it('disputa com reembolso decidido pelo mediador: reembolso PARCIAL do valor exato digitado', async () => {
    const seller = await createActiveUser('Fabio Fagundes Serpa');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Gabriela Monteiro Assis');
    const admin = await createAdmin();
    const { orderId } = await createOrder(seller, buyer, 500);
    await payIntoCustody(buyer, orderId);

    // Execução começa — dinheiro segue em custódia (confirmação ainda não aconteceu).
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 90 },
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
        description: 'O prestador instalou o split mas não testou o dreno, vazou água.',
      },
    });
    expect(opened.statusCode).toBe(201);
    const disputeId = opened.json<{ data: { disputeId: string } }>().data.disputeId;

    // O admin decide: procedência parcial, com um valor de reembolso EXPLÍCITO.
    const resolved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${disputeId}/resolve`,
      headers: admin.auth,
      payload: {
        decisionType: 'PARTIALLY_UPHELD',
        justification: 'O vazamento exigiu retorno de outro profissional; reembolso parcial arbitrado.',
        refundAmount: 150,
      },
    });
    expect(resolved.statusCode).toBe(200);
    expect(
      resolved.json<{ data: { decision: { refundAmount: number } } }>().data.decision.refundAmount,
    ).toBe(150);

    const partiallyRefunded = await waitFor(async () => {
      const row = await paymentOf(orderId)();
      return row?.status === 'PARTIALLY_REFUNDED' ? row : undefined;
    }, 'Payment PARTIALLY_REFUNDED após decisão de disputa');
    expect(Number(partiallyRefunded.refundedAmount)).toBe(150);

    const paymentDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${orderId}`,
      headers: buyer.auth,
    });
    const refunds = paymentDetails.json<{
      data: { refunds: Array<{ amount: number; reason: string; disputeId: string | null }> };
    }>().data.refunds;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amount: 150, reason: 'DISPUTE_UPHELD', disputeId });

    // A custódia continua "IN_CUSTODY" — o reembolso pré-liberação não a
    // marca liberada nem some com o registro histórico.
    const [custody] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
    expect(custody?.status).toBe('IN_CUSTODY');
  });

  it('refundAmount não pode exceder o valor contratado do pedido (limite de sanidade)', async () => {
    const seller = await createActiveUser('Henrique Bezerra Toledo');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Isadora Franco Mesquita');
    const admin = await createAdmin();
    const { orderId } = await createOrder(seller, buyer, 100);
    await payIntoCustody(buyer, orderId);
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: buyer.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 60 },
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
      payload: { category: 'OTHER', description: 'Serviço não executado conforme combinado inicialmente.' },
    });
    const disputeId = opened.json<{ data: { disputeId: string } }>().data.disputeId;

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/disputes/${disputeId}/resolve`,
      headers: admin.auth,
      payload: {
        decisionType: 'UPHELD',
        justification: 'Erro de digitação proposital para testar o limite de sanidade do valor.',
        refundAmount: 999,
      },
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe('MARKETPLACE_DISPUTE_INVALID');
  });
});
