/**
 * E2E do IP-014 — Safety, Abuse & Fraud Controls.
 *
 * Cobre a fatia que só se prova com a aplicação de pé e o banco real:
 * 1. Um Change Order que ultrapassa o limiar de contagem determinístico
 *    (`CHANGE_ORDER_SUSPICIOUS_COUNT_THRESHOLD`) levanta um risk flag
 *    explicável em `risk_flags`, SEM bloquear a criação (§4 out-of-scope:
 *    "no black-box blocking without reason/audit").
 * 2. A fila de admin (`GET /admin/risk-flags`) é 403 para quem não é admin e
 *    200 para quem é (mesmo padrão de `AdminGuard` já provado em VRF/IP-008).
 * 3. Revisar (`POST /admin/risk-flags/:id/review`) fecha o flag com uma
 *    decisão humana e é idempotente contra revisão dupla (409 na segunda vez)
 *    — nunca há fechamento automático.
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
import { identities, riskFlags, trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-014 — Safety, Abuse & Fraud Controls e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip014-${uuidv7()}@e2e.trustplatform.test`;
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
      await relay.drainOnce();
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

  async function hourlyContractInProgress(): Promise<{
    orderId: string;
    seller: TestUser;
    buyer: TestUser;
  }> {
    const seller = await createActiveUser('Prestador IP-014');
    const buyer = await createActiveUser('Cliente IP-014');
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
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });

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
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(1), estimatedDuration: 60 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });

    return { orderId, seller, buyer };
  }

  async function draftChangeOrder(
    contract: { orderId: string; seller: TestUser },
  ): Promise<{ changeOrderId: string; status: number }> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/change-orders`,
      headers: contract.seller.auth,
      payload: {
        type: 'ADDITIONAL_TIME',
        additionalMinutes: 30,
        reason: 'OTHER',
        description: 'Trabalho extra identificado no local.',
      },
    });
    return {
      status: response.statusCode,
      changeOrderId: response.json<{ data: { changeOrderId: string } }>().data?.changeOrderId,
    };
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

  it('Change Order suspeito: excesso de contagem levanta risk flag explicável, sem bloquear a criação', async () => {
    const contract = await hourlyContractInProgress();

    // CHANGE_ORDER_SUSPICIOUS_COUNT_THRESHOLD default = 5: o 5º Change Order
    // no mesmo pedido deve levantar o flag.
    let lastChangeOrderId = '';
    for (let i = 0; i < 5; i += 1) {
      const result = await draftChangeOrder(contract);
      expect(result.status).toBe(201); // NUNCA bloqueado — só sinalizado.
      lastChangeOrderId = result.changeOrderId;
    }

    const flags = await db
      .select()
      .from(riskFlags)
      .where(eq(riskFlags.entityId, lastChangeOrderId));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.signal).toBe('HIGH_CHANGE_ORDER_COUNT');
    expect(flags[0]!.status).toBe('OPEN');
    expect(flags[0]!.reason).toContain('change orders');
    expect(flags[0]!.subjectIdentityId).toBe(contract.seller.identityId);

    // Fila de admin: 403 para o próprio prestador (não é admin).
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/risk-flags',
      headers: contract.seller.auth,
    });
    expect(forbidden.statusCode).toBe(403);

    // Promove um admin e confirma a fila + revisão humana.
    const admin = await createActiveUser('Admin IP-014');
    await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, admin.identityId));

    const queue = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/risk-flags',
      headers: admin.auth,
    });
    expect(queue.statusCode).toBe(200);
    const queued = queue.json<{ data: Array<{ id: string; entityId: string }> }>().data;
    const flagId = queued.find((item) => item.entityId === lastChangeOrderId)!.id;
    expect(flagId).toBeTruthy();

    const reviewed = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/risk-flags/${flagId}/review`,
      headers: admin.auth,
      payload: { decision: 'DISMISSED', note: 'Renegociação legítima, cliente confirmou por telefone.' },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json<{ data: { status: string } }>().data.status).toBe('DISMISSED');

    // Revisar de novo o mesmo flag é rejeitado — nunca duas decisões no mesmo item.
    const reviewedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/risk-flags/${flagId}/review`,
      headers: admin.auth,
      payload: { decision: 'CONFIRMED' },
    });
    expect(reviewedAgain.statusCode).toBe(409);
  }, 60000);
});
