/**
 * E2E do IP-006 — Field Execution & Trust Evidence Hardening.
 *
 * Prova o essencial do acceptance criteria: evidência de execução é OPCIONAL
 * (nada trava sem ela), privada (só participantes do pedido veem, um terceiro
 * recebe 403), e a nota de serviço é um canal de texto separado de
 * disputa/avaliação. Reaproveita a mesma abstração de storage do VRF/PACK-03
 * (bucket próprio `service-execution-evidences`, em memória em teste).
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
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
import { eq } from 'drizzle-orm';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

function multipartBody(fields: Record<string, string>, fileName: string, fileContent: Buffer) {
  const boundary = `----trustboundary${Date.now()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
  );
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-006 — Field Execution & Trust Evidence', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip006-${uuidv7()}@e2e.trustplatform.test`;
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

  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) return;
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  async function fixedPriceOrderInProgress(): Promise<{
    orderId: string;
    seller: TestUser;
    buyer: TestUser;
  }> {
    const seller = await createActiveUser('Prestador IP-006');
    const buyer = await createActiveUser('Cliente IP-006');
    await waitForBronze(seller.identityId);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Pintura residencial',
        description: 'Pintura de sala e quarto.',
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
      payload: { message: 'Quero contratar.' },
    });
    const conversationId = contact.json<{ data: { conversation: { conversationId: string } } }>()
      .data.conversation.conversationId;

    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { quantity: 1, expiresAt: inHours(48), pricingModel: 'FIXED_PRICE', amount: 300 },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(1), estimatedDuration: 60 },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    expect(started.statusCode).toBe(200);

    return { orderId, seller, buyer };
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

  it('evidência opcional: check-in/check-out funcionam sem nenhuma foto anexada', async () => {
    const { orderId, seller } = await fixedPriceOrderInProgress();

    const evidences = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: seller.auth,
    });
    expect(evidences.statusCode).toBe(200);
    expect(evidences.json<{ data: unknown[] }>().data).toEqual([]);

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/complete`,
      headers: seller.auth,
      payload: {},
    });
    expect(complete.statusCode).toBe(200);
  });

  it('Partner anexa foto de antes/depois; evidência é privada aos participantes, não pública', async () => {
    const { orderId, seller, buyer } = await fixedPriceOrderInProgress();
    const stranger = await createActiveUser('Estranho IP-006');

    const { payload, contentType } = multipartBody({ type: 'BEFORE' }, 'antes.png', PNG);
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: { authorization: seller.auth.authorization, 'content-type': contentType },
      payload,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json<{ data: { type: string } }>().data.type).toBe('BEFORE');

    // Só o Partner (seller) sobe evidência — o Member (buyer) tentando recebe 403.
    const { payload: buyerPayload, contentType: buyerContentType } = multipartBody(
      { type: 'AFTER' },
      'depois.png',
      PNG,
    );
    const buyerAttempt = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: { authorization: buyer.auth.authorization, 'content-type': buyerContentType },
      payload: buyerPayload,
    });
    expect(buyerAttempt.statusCode).toBe(403);

    // Member vê a evidência (participante).
    const buyerList = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: buyer.auth,
    });
    expect(buyerList.statusCode).toBe(200);
    expect(buyerList.json<{ data: unknown[] }>().data).toHaveLength(1);

    // Terceiro sem relação com o pedido não vê nada — evidência nunca é pública.
    const strangerList = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: stranger.auth,
    });
    expect(strangerList.statusCode).toBe(403);

    // Service Summary carrega a evidência para o completion handoff.
    const summary = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/service-summary`,
      headers: seller.auth,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json<{ data: { evidences: unknown[] } }>().data.evidences).toHaveLength(1);
  });

  it('tipo de arquivo não suportado é rejeitado com 415', async () => {
    const { orderId, seller } = await fixedPriceOrderInProgress();
    const boundary = '----trustboundary-bad';
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nBEFORE\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.exe"\r\nContent-Type: application/x-msdownload\r\n\r\nMZ\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/execution-evidences`,
      headers: {
        authorization: seller.auth.authorization,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(415);
  });

  it('nota de serviço do Partner é visível ao Member e não muda status do pedido', async () => {
    const { orderId, seller, buyer } = await fixedPriceOrderInProgress();

    const note = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/service-notes`,
      headers: seller.auth,
      payload: { body: 'Troquei o disjuntor e testei a instalação.' },
    });
    expect(note.statusCode).toBe(201);
    expect(note.json<{ data: { body: string } }>().data.body).toContain('disjuntor');

    // Member não escreve nota (só o Partner documenta o serviço) — 403.
    const buyerAttempt = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/service-notes`,
      headers: buyer.auth,
      payload: { body: 'Tentativa indevida.' },
    });
    expect(buyerAttempt.statusCode).toBe(403);

    const buyerList = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/service-notes`,
      headers: buyer.auth,
    });
    expect(buyerList.statusCode).toBe(200);
    expect(buyerList.json<{ data: unknown[] }>().data).toHaveLength(1);

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/complete`,
      headers: seller.auth,
      payload: {},
    });
    expect(complete.statusCode).toBe(200);
  });
});
