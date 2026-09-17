/**
 * E2E do IP-018 — Admin, Support & Operations.
 *
 * Prova, contra Postgres real, os quatro gaps que esta IP fechou:
 * 1) `GET /admin/support/lookup` — cross-entity lookup por email/orderId/
 *    paymentId, admin-only, mascarando o que não é necessário para suporte;
 * 2) `GET /admin/audit-logs` — `audit_logs` (write-only até esta IP) agora
 *    tem uma superfície de busca, admin-only;
 * 3) `GET /admin/marketplace/orders/:orderId/evidence` — o gap disclosed no
 *    Completion Report do IP-006 ("no admin/mediator read route exists
 *    anywhere in marketplace/** for evidence"), fechado aqui;
 * 4) `POST /admin/payments/:paymentId/refund` — reembolso admin-iniciado
 *    reusando o MESMO `RefundPaymentUseCase` de IP-008 (nunca um side-channel).
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
import { identities, payments, trustCustodies, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  email: string;
  fullName: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-018 — Admin, Support & Operations e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip018-${uuidv7()}@e2e.trustplatform.test`;
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
    return { identityId, email, fullName, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function createAdmin(): Promise<TestUser> {
    const admin = await createActiveUser('Operador de Suporte Trust');
    await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, admin.identityId));
    return admin;
  }

  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) return;
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  async function waitFor<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const value = await check();
      if (value !== undefined) return value;
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Timeout esperando: ${what}`);
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

  it('401 sem token, 403 para identidade autenticada sem is_admin — nas 4 rotas novas', async () => {
    const nonAdmin = await createActiveUser('Pessoa Comum');
    const routes = [
      { method: 'GET' as const, url: '/api/v1/admin/support/lookup?email=x@x.com' },
      { method: 'GET' as const, url: '/api/v1/admin/audit-logs' },
      { method: 'GET' as const, url: `/api/v1/admin/marketplace/orders/${uuidv7()}/evidence` },
      { method: 'POST' as const, url: `/api/v1/admin/payments/${uuidv7()}/refund` },
    ];
    for (const route of routes) {
      const unauthenticated = await app.inject({ method: route.method, url: route.url });
      expect(unauthenticated.statusCode).toBe(401);

      const forbidden = await app.inject({
        method: route.method,
        url: route.url,
        headers: nonAdmin.auth,
        payload: route.method === 'POST' ? { amountCents: 100, reasonDetail: 'x' } : undefined,
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json<{ error: { code: string } }>().error.code).toBe('ADMIN_REQUIRED');
    }
  });

  it('support lookup por email encontra a identidade e mascara o resto', async () => {
    const admin = await createAdmin();
    const user = await createActiveUser('Cliente Rastreável');

    const notFound = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/support/lookup?email=nao-existe@e2e.trustplatform.test',
      headers: admin.auth,
    });
    expect(notFound.statusCode).toBe(404);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/support/lookup?email=${encodeURIComponent(user.email)}`,
      headers: admin.auth,
    });
    expect(found.statusCode).toBe(200);
    const body = found.json<{ data: { identity: { id: string; email: string }; orders: unknown[] } }>()
      .data;
    expect(body.identity.id).toBe(user.identityId);
    expect(body.identity.email).toBe(user.email);
    expect(Array.isArray(body.orders)).toBe(true);
    // nunca vaza passwordHash — a serialização nem carrega a chave.
    expect(JSON.stringify(body.identity)).not.toContain('passwordHash');

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/support/lookup',
      headers: admin.auth,
    });
    expect(invalidQuery.statusCode).toBe(400);
  });

  it('audit log search encontra a auditoria da própria consulta de suporte', async () => {
    const admin = await createAdmin();
    const user = await createActiveUser('Auditado Pelo Suporte');

    await app.inject({
      method: 'GET',
      url: `/api/v1/admin/support/lookup?email=${encodeURIComponent(user.email)}`,
      headers: admin.auth,
    });

    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/audit-logs?identityId=${admin.identityId}&operation=AdminSupportLookup`,
      headers: admin.auth,
    });
    expect(search.statusCode).toBe(200);
    const body = search.json<{ data: { items: Array<{ operation: string; resourceId: string }>; totalItems: number } }>()
      .data;
    expect(body.totalItems).toBeGreaterThanOrEqual(1);
    expect(body.items.some((item) => item.operation === 'AdminSupportLookup' && item.resourceId === user.identityId)).toBe(
      true,
    );
  });

  it('evidence review admin: 404 para pedido inexistente; consolida evidence de um pedido real', async () => {
    const admin = await createAdmin();

    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/marketplace/orders/${uuidv7()}/evidence`,
      headers: admin.auth,
    });
    expect(missing.statusCode).toBe(404);

    // Fluxo real mínimo até existir um pedido (sem evidência anexada — só
    // prova que a rota resolve o pedido e devolve listas vazias corretamente).
    const seller = await createActiveUser('Prestador Auditável');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Comprador Auditável');
    await waitForBronze(buyer.identityId);
    const listing = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: { title: 'Reparo hidráulico' },
    });
    const listingId = listing.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: seller.auth,
      payload: {
        description: 'Conserto de vazamento com garantia de 90 dias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 250,
        currency: 'BRL',
        location: 'Vila Mariana, São Paulo/SP',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const requestCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: buyer.auth,
      payload: {
        title: 'Vazamento na pia da cozinha',
        description: 'Água acumulando embaixo da pia.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Vila Mariana, São Paulo/SP',
        urgency: 'THIS_WEEK',
      },
    });
    const serviceRequestId = requestCreated.json<{ data: { serviceRequestId: string } }>().data
      .serviceRequestId;
    const engage = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: buyer.auth,
      payload: { listingId, message: 'Pode vir hoje?' },
    });
    const conversationId = engage.json<{ data: { conversation: { conversationId: string } } }>().data
      .conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 200, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    const reviewed = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/marketplace/orders/${orderId}/evidence`,
      headers: admin.auth,
    });
    expect(reviewed.statusCode).toBe(200);
    const body = reviewed.json<{
      data: { orderId: string; executionEvidences: unknown[]; serviceNotes: unknown[]; changeOrderEvidences: unknown[] };
    }>().data;
    expect(body.orderId).toBe(orderId);
    expect(body.executionEvidences).toEqual([]);
    expect(body.serviceNotes).toEqual([]);
    expect(body.changeOrderEvidences).toEqual([]);

    // Um participante comum não acessa esta rota (é admin-only).
    const asParticipant = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/marketplace/orders/${orderId}/evidence`,
      headers: seller.auth,
    });
    expect(asParticipant.statusCode).toBe(403);
  });

  it('reembolso admin reusa RefundPaymentUseCase: elegível reembolsa, inelegível recusa sem tocar o gateway', async () => {
    const admin = await createAdmin();
    const seller = await createActiveUser('Prestador Reembolsável');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Comprador Reembolsável');
    await waitForBronze(buyer.identityId);

    const listing = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: { title: 'Montagem de móveis' },
    });
    const listingId = listing.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: seller.auth,
      payload: {
        description: 'Montagem de armários e estantes.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 300,
        currency: 'BRL',
        location: 'Moema, São Paulo/SP',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const requestCreated = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: buyer.auth,
      payload: {
        title: 'Preciso montar dois armários',
        description: 'Armários já entregues, faltam montar.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Moema, São Paulo/SP',
        urgency: 'THIS_WEEK',
      },
    });
    const serviceRequestId = requestCreated.json<{ data: { serviceRequestId: string } }>().data
      .serviceRequestId;
    const engage = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: buyer.auth,
      payload: { listingId, message: 'Consegue essa semana?' },
    });
    const conversationId = engage.json<{ data: { conversation: { conversationId: string } } }>().data
      .conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 300, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    const paymentRow = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite');

    // Ainda não autorizado -> não elegível (status não está na lista de PAY-006 BR-001).
    const notEligible = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/payments/${paymentRow.id}/refund`,
      headers: admin.auth,
      payload: { amountCents: 5000, reasonDetail: 'Ajuste operacional de teste' },
    });
    expect(notEligible.statusCode).toBe(200);
    expect(notEligible.json<{ data: { result: string } }>().data.result).toBe('NOT_ELIGIBLE');

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);
    await waitFor(async () => {
      const [custody] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
      return custody?.status === 'IN_CUSTODY' ? custody : undefined;
    }, 'custódia criada');

    const idempotencyKey = `test-admin-refund-${uuidv7()}`;
    const refund = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/payments/${paymentRow.id}/refund`,
      headers: { ...admin.auth, 'idempotency-key': idempotencyKey },
      payload: { amountCents: 3000, reasonDetail: 'Ajuste operacional de teste' },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json<{ data: { result: string } }>().data.result).toBe('COMPLETED');

    // Idempotência: repetir a MESMA chave nunca reembolsa duas vezes.
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/payments/${paymentRow.id}/refund`,
      headers: { ...admin.auth, 'idempotency-key': idempotencyKey },
      payload: { amountCents: 3000, reasonDetail: 'Ajuste operacional de teste' },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json<{ data: { result: string } }>().data.result).toBe('ALREADY_PROCESSED');

    const [updatedPayment] = await db.select().from(payments).where(eq(payments.id, paymentRow.id));
    expect(Number(updatedPayment!.refundedAmount)).toBeCloseTo(30, 2);
  });
});
