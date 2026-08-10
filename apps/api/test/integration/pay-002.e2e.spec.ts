/**
 * E2E do Bloco 2 (PAY-002): o cliente paga.
 * O teste central é o da idempotência — repetir a requisição com a mesma chave
 * NÃO pode gerar segunda cobrança (PAY-ARCH-001 §9).
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
import { paymentAuthorizations, payments, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('PAY-002 — Autorização de pagamento', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `auth-${uuidv7()}@e2e.trustplatform.test`;
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

  /** Do anúncio ao pagamento criado pelo aceite; devolve o paymentId. */
  async function createPayment(
    seller: TestUser,
    buyer: TestUser,
    amount: number,
  ): Promise<{ paymentId: string; orderId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Reforma de banheiro completa',
        description: 'Troca de louças, metais e revestimento com garantia de 12 meses.',
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
      payload: { message: 'Quero reformar meu banheiro, você consegue?' },
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

    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      if (row) {
        return { paymentId: row.id, orderId };
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Payment não foi criado');
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

  it('comprador autoriza; o pagamento fica AUTHORIZED com o provedor registrado', async () => {
    const seller = await createActiveUser('Douglas Barros Farias');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Cristina Amaral Lopes');
    const { paymentId, orderId } = await createPayment(seller, buyer, 2400);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json<{
      data: {
        authorized: boolean;
        replayed: boolean;
        payment: { status: string; paymentProviderId: string };
        authorization: { status: string; authorizedAmount: number };
      };
    }>().data;

    expect(result.authorized).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.payment.status).toBe('AUTHORIZED');
    expect(result.payment.paymentProviderId).toBe('sandbox');
    expect(result.authorization.authorizedAmount).toBe(2400);

    // O pagamento aparece na consulta do pedido, com a tentativa registrada
    const byOrder = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${orderId}`,
      headers: buyer.auth,
    });
    expect(byOrder.json<{ data: { authorizations: unknown[] } }>().data.authorizations).toHaveLength(
      1,
    );
  });

  it('MESMA chave de idempotência não cobra duas vezes', async () => {
    const seller = await createActiveUser('Ricardo Menezes Aguiar');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Silvia Rocha Teixeira');
    const { paymentId } = await createPayment(seller, buyer, 890);

    const idempotencyKey = uuidv7();
    const pay = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/payments/${paymentId}/authorize`,
        headers: { ...buyer.auth, 'idempotency-key': idempotencyKey },
        payload: {},
      });

    const first = await pay();
    const second = await pay();
    const third = await pay();

    expect(first.json<{ data: { replayed: boolean } }>().data.replayed).toBe(false);
    expect(second.json<{ data: { replayed: boolean } }>().data.replayed).toBe(true);
    expect(third.json<{ data: { replayed: boolean } }>().data.replayed).toBe(true);

    // Todas devolvem a MESMA autorização — e existe uma só no banco
    const ids = [first, second, third].map(
      (response) =>
        response.json<{ data: { authorization: { authorizationId: string } } }>().data.authorization
          .authorizationId,
    );
    expect(new Set(ids).size).toBe(1);

    const rows = await db
      .select()
      .from(paymentAuthorizations)
      .where(eq(paymentAuthorizations.paymentId, paymentId));
    expect(rows).toHaveLength(1);
  });

  it('chave NOVA em pagamento já autorizado também não cobra de novo', async () => {
    const seller = await createActiveUser('Paulo Cesar Nobrega');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Luciana Ferraz Coelho');
    const { paymentId } = await createPayment(seller, buyer, 640);

    await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: {},
    });
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: {},
    });

    expect(again.statusCode).toBe(200);
    expect(again.json<{ data: { replayed: boolean; authorized: boolean } }>().data).toMatchObject({
      replayed: true,
      authorized: true,
    });

    const rows = await db
      .select()
      .from(paymentAuthorizations)
      .where(eq(paymentAuthorizations.paymentId, paymentId));
    expect(rows).toHaveLength(1);
  });

  it('recusa do emissor deixa o pagamento apto a nova tentativa (BR-005)', async () => {
    const seller = await createActiveUser('Eduardo Salgado Pinheiro');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Natalia Bittencourt Serra');
    // O sandbox recusa determinado final de centavo — permite testar o caminho
    // de recusa sem mockar o adapter.
    const { paymentId } = await createPayment(seller, buyer, 750.13);

    const declined = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: {},
    });

    const result = declined.json<{
      data: { authorized: boolean; payment: { status: string }; authorization: { status: string } };
    }>().data;
    expect(result.authorized).toBe(false);
    expect(result.authorization.status).toBe('DECLINED');
    expect(result.payment.status).toBe('AUTHORIZATION_FAILED');

    // Nenhum dado de cartão foi persistido na resposta do provedor
    const [row] = await db
      .select()
      .from(paymentAuthorizations)
      .where(eq(paymentAuthorizations.paymentId, paymentId));
    expect(JSON.stringify(row!.gatewayResponse)).not.toMatch(/cvv|pan|cardNumber/i);
  });

  it('só o comprador paga; terceiro nem enxerga o pagamento', async () => {
    const seller = await createActiveUser('Marcelo Tavares Brito');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Adriana Peixoto Lemos');
    const stranger = await createActiveUser('Gabriel Moura Assis');
    const { paymentId } = await createPayment(seller, buyer, 1200);

    const sellerTries = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...seller.auth, 'idempotency-key': uuidv7() },
      payload: {},
    });
    expect(sellerTries.statusCode).toBe(403);

    const strangerReads = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/${paymentId}`,
      headers: stranger.auth,
    });
    expect(strangerReads.statusCode).toBe(403);

    // O vendedor não paga, mas acompanha o pagamento do próprio serviço
    const sellerReads = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/${paymentId}`,
      headers: seller.auth,
    });
    expect(sellerReads.statusCode).toBe(200);
  });
});
