/**
 * E2E do Bloco 1 de Payments (PAY-001): o pagamento nasce junto com o pedido,
 * com os valores congelados da proposta aceita — e apenas um por pedido.
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
import { payments, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('PAY-001 — Pagamento nasce com o pedido', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `pay-${uuidv7()}@e2e.trustplatform.test`;
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

  async function waitForScore(identityId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score?.score === expected) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Score não chegou a ${expected}`);
  }

  /** Do anúncio ao aceite; devolve o pedido criado. */
  async function createOrder(
    seller: TestUser,
    buyer: TestUser,
    amount: number,
  ): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de piso vinílico',
        description: 'Instalação de piso vinílico em ambientes residenciais, com nivelamento.',
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
      payload: { message: 'Preciso instalar piso em dois cômodos, você faz?' },
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
    return accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;
  }

  async function waitForPayment(orderId: string) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      if (row) {
        return row;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Payment não foi criado dentro do timeout');
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

  it('aceitar a proposta cria o pagamento em CREATED com o valor congelado', async () => {
    const seller = await createActiveUser('Antonio Carlos Bezerra');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Juliana Prado Meireles');

    // Valor com centavo "quebrado" para provar que a conversão não perde nada
    const orderId = await createOrder(seller, buyer, 1100.55);
    const payment = await waitForPayment(orderId);

    expect(payment.status).toBe('CREATED');
    expect(payment.amount).toBe('1100.55');
    expect(payment.refundedAmount).toBe('0.00');
    expect(payment.currency.trim()).toBe('BRL');
    expect(payment.buyerId).toBe(buyer.identityId);
    expect(payment.sellerId).toBe(seller.identityId);
    expect(payment.paymentProviderId).toBeNull();
  });

  it('um pagamento por pedido, mesmo com o evento reprocessado (BR-001)', async () => {
    const seller = await createActiveUser('Fernando Lima Andrade');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Vanessa Correia Pinto');
    const orderId = await createOrder(seller, buyer, 480);
    await waitForPayment(orderId);

    // Vários ticks do relay não podem gerar um segundo pagamento
    await relay.tick();
    await relay.tick();
    await relay.tick();

    const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
    expect(rows).toHaveLength(1);
  });
});
