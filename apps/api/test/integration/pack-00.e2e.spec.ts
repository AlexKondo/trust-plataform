/**
 * E2E do PACK-00 v1.1 — §12 Required Tests.
 *
 * Cobre o que só se prova com a aplicação de pé e o banco migrado:
 *  - identidade de agregado real em eventos Marketplace e Payment;
 *  - leitura tolerante de evento histórico (sem agregado) pelo relay;
 *  - corpo canônico de erro com requestId + correlationId batendo com os headers;
 *  - regressão de propriedade/autorização (nada de tenancy — §7).
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
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
import { outboxEvents, payments, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_HEADER = 'x-request-id';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('PACK-00 v1.1 — baseline canônico', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `pack00-${uuidv7()}@e2e.trustplatform.test`;
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

  async function eventRow(eventType: string, aggregateId: string) {
    const [row] = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventType, eventType), eq(outboxEvents.aggregateId, aggregateId)));
    return row;
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

  it('eventos Marketplace e Payment gravam eventType + agregado correto (§5.2)', async () => {
    const seller = await createActiveUser('Rafael Nogueira Pinto');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Helena Duarte Vasques');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação elétrica residencial',
        description: 'Quadro de distribuição, tomadas e revisão geral com laudo.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 1800,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;

    // MarketplaceListing.Created — agregado é o próprio anúncio
    const listingCreated = await eventRow('MarketplaceListing.Created', listingId);
    expect(listingCreated).toBeDefined();
    expect(listingCreated!.aggregateType).toBe('MarketplaceListing');
    expect(listingCreated!.aggregateId).toBe(listingId);
    expect(listingCreated!.eventVersion).toMatch(/^\d+\.\d+$/);

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Preciso revisar a elétrica inteira do apartamento.' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 1800, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    // O aceite grava três eventos na MESMA transação, cada um no SEU agregado.
    expect((await eventRow('MarketplaceOffer.Accepted', offerId))?.aggregateType).toBe(
      'MarketplaceOffer',
    );
    expect((await eventRow('MarketplaceListing.Reserved', listingId))?.aggregateType).toBe(
      'MarketplaceListing',
    );
    expect((await eventRow('MarketplaceOrder.Created', orderId))?.aggregateType).toBe(
      'MarketplaceOrder',
    );

    // Payment.Created nasce num consumer — o agregado é o Payment, não o pedido.
    const startedAt = Date.now();
    let paymentId: string | undefined;
    while (Date.now() - startedAt < 40000 && !paymentId) {
      await relay.tick();
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      paymentId = row?.id;
      if (!paymentId) {
        await new Promise((sleep) => setTimeout(sleep, 500));
      }
    }
    expect(paymentId).toBeDefined();
    const paymentCreated = await eventRow('Payment.Created', paymentId!);
    expect(paymentCreated).toBeDefined();
    expect(paymentCreated!.aggregateType).toBe('Payment');
    expect(paymentCreated!.aggregateId).toBe(paymentId);
    expect(paymentCreated!.producer).toBe('payment-service');
  });

  it('nenhum evento novo é gravado sem identidade de agregado', async () => {
    const rows = await db.select().from(outboxEvents);
    expect(rows.length).toBeGreaterThan(0);
    const semAgregado = rows.filter((row) => !row.aggregateType || !row.aggregateId);
    expect(semAgregado).toEqual([]);
  });

  it('evento histórico sem agregado continua publicável (§11 leitura tolerante)', async () => {
    // Simula uma linha gravada ANTES da migration 0024: sem aggregate_type/id.
    const eventId = uuidv7();
    await db.insert(outboxEvents).values({
      id: uuidv7(),
      eventId,
      // Tipo sem consumer inscrito: o que se testa aqui é a LEITURA da linha
      // legada pelo relay, não o efeito de um consumer específico.
      eventType: 'Legacy.Recorded',
      eventVersion: '1.0',
      producer: 'identity-service',
      aggregateType: null,
      aggregateId: null,
      correlationId: uuidv7(),
      payload: { identityId: uuidv7(), legacy: true },
      occurredAt: new Date(),
    });

    let row: typeof outboxEvents.$inferSelect | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await relay.tick();
      [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.eventId, eventId));
      if (row?.status === 'PUBLISHED') {
        break;
      }
    }
    // Publicado sem erro e SEM agregado inventado (§11: não fabricar).
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.aggregateType).toBeNull();
    expect(row?.aggregateId).toBeNull();
  });

  it('corpo de erro traz code, message, requestId e correlationId (§6)', async () => {
    const correlationId = uuidv7();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/listings/00000000-0000-7000-8000-000000000000',
      headers: { [CORRELATION_HEADER]: correlationId },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{
      success: false;
      error: { code: string; message: string; requestId: string; correlationId: string };
    }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('MARKETPLACE_LISTING_NOT_FOUND');
    expect(body.error.message).toBeTruthy();

    // §12: o corpo bate com o RequestContext e com os headers da resposta.
    expect(body.error.correlationId).toBe(correlationId);
    expect(response.headers[CORRELATION_HEADER]).toBe(correlationId);
    expect(body.error.requestId).toBe(response.headers[REQUEST_HEADER]);
    expect(body.error.requestId).toBeTruthy();
  });

  it('erro de validação mantém `details` como ARRAY de { path, message }', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { fullName: 'X', email: 'nao-e-email', password: 'curta', acceptTerms: false },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: {
        code: string;
        details: Array<{ path: string; message: string }>;
        requestId: string;
        correlationId: string;
      };
    }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(body.error.details[0]).toHaveProperty('path');
    expect(body.error.details[0]).toHaveProperty('message');
    expect(body.error.requestId).toBeTruthy();
    expect(body.error.correlationId).toBeTruthy();
  });

  it('autorização segue por identidade e propriedade do recurso (§7)', async () => {
    const owner = await createActiveUser('Marcelo Tavares Bastos');
    const stranger = await createActiveUser('Priscila Neves Andrade');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: owner.auth,
      payload: { title: 'Pintura de fachada com andaime' },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;

    // Sem token: 401. Com token de terceiro: negado (não é dono do recurso).
    const anonymous = await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      payload: { title: 'Sequestro do anúncio' },
    });
    expect(anonymous.statusCode).toBe(401);

    const thirdParty = await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: stranger.auth,
      payload: { title: 'Sequestro do anúncio' },
    });
    expect([403, 404]).toContain(thirdParty.statusCode);
    expect(thirdParty.json<{ success: boolean }>().success).toBe(false);

    // O dono continua conseguindo — a negação é de propriedade, não de rota.
    const byOwner = await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: owner.auth,
      payload: { title: 'Pintura de fachada com andaime e massa corrida' },
    });
    expect(byOwner.statusCode).toBe(200);
  });
});
