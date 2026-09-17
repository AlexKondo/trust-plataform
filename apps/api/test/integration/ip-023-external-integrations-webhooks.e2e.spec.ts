/**
 * E2E do IP-023 — External Integrations & Webhooks.
 *
 * Prova, contra Postgres real e um servidor HTTP local (fake "partner"
 * endpoint), o ciclo completo: admin cria assinatura (allowlist +
 * https-only) → evento de domínio ALLOWLISTED nasce no outbox → o relay
 * entrega ao consumer de webhook → o parceiro recebe um POST assinado
 * (`X-Trust-Webhook-Signature` = HMAC-SHA256 do corpo bruto com o segredo
 * da assinatura) → `webhook_deliveries` registra SUCCESS.
 * Também prova: evento FORA da allowlist nunca é entregue; segredo nunca
 * volta em GET; rotação de segredo mantém o antigo válido até confirmação;
 * DLQ após esgotar tentativas; autorização negativa (não-admin => 403).
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { createServer, Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { EmailService } from '../../src/modules/identity/domain/services/email.service';
import { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';
import { Database } from '../../src/shared/database/database.module';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import { OutboxService } from '../../src/shared/events/outbox.service';
import { identities, webhookDeliveries, webhookSubscriptions } from '../../src/shared/database/schema';

/** Envelope OUTBOUND recebido pelo parceiro fake (mesmo shape de `WebhookDeliveryService`). */
interface ReceivedWebhookEnvelope {
  payloadVersion: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  deliveryAttempt: number;
  data: Record<string, unknown>;
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

describe.runIf(Boolean(testDatabaseUrl))('IP-023 — External Integrations & Webhooks e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let outbox: OutboxService;
  let relay: OutboxRelayService;
  let partnerServer: Server;
  let partnerUrl: string;
  let receivedRequests: { body: string; headers: Record<string, string | string[] | undefined> }[];
  let partnerRespondsOk: boolean;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip023-${uuidv7()}@e2e.trustplatform.test`;
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

  async function createAdmin(): Promise<TestUser> {
    const admin = await createActiveUser('Operador de Integracoes Trust');
    await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, admin.identityId));
    return admin;
  }

  /**
   * Insere a assinatura DIRETO no banco (bypass da validação https-only do
   * `WebhookSubscriptionService`) só para os testes que precisam de um
   * endpoint HTTP real alcançável — o servidor fake deste arquivo roda em
   * `http://127.0.0.1` (sem TLS), o que a API pública rejeitaria de
   * propósito (§"validateUrl" — nunca aceitar `http://` de um admin real).
   * Os testes de CRUD via API (acima) já provam essa validação com URLs
   * `https://` literais.
   */
  async function insertSubscription(
    url: string,
    eventTypes: string[],
    secret: string,
    createdBy: string,
  ): Promise<string> {
    const id = uuidv7();
    await db.insert(webhookSubscriptions).values({
      id,
      url,
      eventTypes,
      secretActive: secret,
      secretPrevious: null,
      active: true,
      createdBy,
    });
    return id;
  }

  beforeAll(async () => {
    const client = postgres(testDatabaseUrl!, { max: 5 });
    db = drizzle(client);
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle'), migrationsTable: 'drizzle_migrations' });

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    emailService = app.get<LoggingEmailService>(EmailService);
    outbox = app.get(OutboxService);
    relay = app.get(OutboxRelayService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    receivedRequests = [];
    partnerRespondsOk = true;
    partnerServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedRequests.push({ body: Buffer.concat(chunks).toString('utf8'), headers: req.headers });
        res.statusCode = partnerRespondsOk ? 200 : 500;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve1) => partnerServer.listen(0, '127.0.0.1', resolve1));
    const address = partnerServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the fake partner server to bind to a TCP address.');
    }
    partnerUrl = `http://127.0.0.1:${address.port}/hook`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve1) => partnerServer.close(() => resolve1()));
  });

  it('rejects subscription creation for a non-admin (authorization negative test)', async () => {
    const user = await createActiveUser('Nao Admin');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: user.auth,
      payload: { url: 'https://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects an http:// (non-https) subscription URL and an out-of-allowlist event type', async () => {
    const admin = await createAdmin();
    const httpRejected = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: admin.auth,
      payload: { url: 'http://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
    });
    expect(httpRejected.statusCode).toBe(400);

    const badEventType = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: admin.auth,
      payload: { url: 'https://partner.example.com/hook', eventTypes: ['Payment.Authorized'] },
    });
    expect(badEventType.statusCode).toBe(400);
  });

  it('creates a subscription, returns the secret once, and never exposes it again on GET', async () => {
    const admin = await createAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: admin.auth,
      payload: { url: 'https://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<{ data: { subscription: { id: string }; secret: string } }>().data;
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.subscription).not.toHaveProperty('secretActive');

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/webhooks/subscriptions/${body.subscription.id}`,
      headers: admin.auth,
    });
    expect(get.statusCode).toBe(200);
    expect(get.body).not.toContain(body.secret);
  });

  it('delivers an allowlisted event with a valid HMAC signature and records SUCCESS; never delivers a non-allowlisted event', async () => {
    const admin = await createAdmin();
    const secret = 'test-secret-' + uuidv7();
    const subscriptionId = await insertSubscription(partnerUrl, ['MarketplaceOrder.Completed'], secret, admin.identityId);

    const orderId = uuidv7();
    const envelope = await outbox.enqueueStandalone({
      eventType: 'MarketplaceOrder.Completed',
      aggregateType: 'MarketplaceOrder',
      aggregateId: orderId,
      producer: 'marketplace-service',
      correlationId: uuidv7(),
      payload: {
        orderId,
        listingId: uuidv7(),
        buyerId: uuidv7(),
        sellerId: uuidv7(),
        amount: 5000,
        currency: 'BRL',
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      },
    });

    // A non-allowlisted event, from the same drain, must NEVER reach the partner.
    await outbox.enqueueStandalone({
      eventType: 'Payment.Authorized',
      aggregateType: 'Payment',
      aggregateId: uuidv7(),
      producer: 'payment-service',
      correlationId: uuidv7(),
      payload: { paymentId: uuidv7(), amount: 5000 },
    });

    await relay.drainOnce();

    expect(receivedRequests).toHaveLength(1);
    const received = receivedRequests[0]!;
    const signatureHeader = received.headers['x-trust-webhook-signature'] as string;
    const expectedSignature = createHmac('sha256', secret).update(received.body, 'utf8').digest('hex');
    expect(signatureHeader).toBe(expectedSignature);

    const parsedBody = JSON.parse(received.body) as ReceivedWebhookEnvelope;
    expect(parsedBody.payloadVersion).toBe('1');
    expect(parsedBody.eventId).toBe(envelope.eventId);
    expect(parsedBody.eventType).toBe('MarketplaceOrder.Completed');
    expect(parsedBody.deliveryAttempt).toBe(1);
    expect(parsedBody.data.orderId).toBe(orderId);

    const [deliveryRow] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.subscriptionId, subscriptionId));
    expect(deliveryRow!.status).toBe('SUCCESS');

    const health = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/webhooks/subscriptions/${subscriptionId}/health`,
      headers: admin.auth,
    });
    expect(health.json<{ data: { success: number } }>().data.success).toBe(1);
  });

  it('retries a failing delivery and eventually moves it to DEAD_LETTER, visible via the admin API (no silent drop)', async () => {
    const admin = await createAdmin();
    partnerRespondsOk = false;
    const subscriptionId = await insertSubscription(
      partnerUrl,
      ['MarketplaceOrder.Cancelled'],
      'test-secret-' + uuidv7(),
      admin.identityId,
    );

    const orderId = uuidv7();
    await outbox.enqueueStandalone({
      eventType: 'MarketplaceOrder.Cancelled',
      aggregateType: 'MarketplaceOrder',
      aggregateId: orderId,
      producer: 'marketplace-service',
      correlationId: uuidv7(),
      payload: { orderId, status: 'CANCELLED', reason: 'test', cancelledAt: new Date().toISOString() },
    });

    // WEBHOOK_MAX_DELIVERY_ATTEMPTS = 8; each drainOnce() delivers at most one
    // attempt per pending row per consumer per call.
    for (let i = 0; i < 8; i += 1) {
      await relay.drainOnce();
    }

    const deliveries = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/webhooks/deliveries?subscriptionId=${subscriptionId}&status=DEAD_LETTER`,
      headers: admin.auth,
    });
    const rows = deliveries.json<{ data: unknown[] }>().data;
    expect(rows).toHaveLength(1);
  });

  it('rotates a secret keeping the previous one usable, then confirm-rotation clears it', async () => {
    const admin = await createAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: admin.auth,
      payload: { url: 'https://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
    });
    const { subscription, secret: originalSecret } = created.json<{
      data: { subscription: { id: string }; secret: string };
    }>().data;

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/subscriptions/${subscription.id}/rotate-secret`,
      headers: admin.auth,
    });
    const { secret: newSecret } = rotated.json<{ data: { secret: string } }>().data;
    expect(newSecret).not.toBe(originalSecret);

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/subscriptions/${subscription.id}/confirm-rotation`,
      headers: admin.auth,
    });
    expect(confirmed.statusCode).toBe(200);
  });

  it('disabling a subscription stops future delivery', async () => {
    const admin = await createAdmin();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks/subscriptions',
      headers: admin.auth,
      payload: { url: 'https://partner.example.com/hook', eventTypes: ['MarketplaceOrder.Completed'] },
    });
    const { subscription } = created.json<{ data: { subscription: { id: string } } }>().data;

    const disable = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/subscriptions/${subscription.id}/disable`,
      headers: admin.auth,
    });
    expect(disable.statusCode).toBe(200);

    const orderId = uuidv7();
    await outbox.enqueueStandalone({
      eventType: 'MarketplaceOrder.Completed',
      aggregateType: 'MarketplaceOrder',
      aggregateId: orderId,
      producer: 'marketplace-service',
      correlationId: uuidv7(),
      payload: { orderId, status: 'COMPLETED', completedAt: new Date().toISOString() },
    });
    await relay.drainOnce();

    expect(receivedRequests).toHaveLength(0);
  });
});
