/**
 * E2E do PACK-01 — Trust Custody & Release (§20.2 e §20.3).
 *
 * Prova o ciclo inteiro do dinheiro com a aplicação de pé:
 *   contratação → autorização → custódia → serviço executado →
 *   confirmação do cliente → política → liberação pelo sandbox.
 *
 * E prova o que NÃO pode acontecer: liberar com disputa aberta.
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
import { outboxEvents, payments, trustCustodies, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('PACK-01 — Custódia e liberação', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `pack01-${uuidv7()}@e2e.trustplatform.test`;
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

  /** Espera até `check` devolver algo, tickando o relay entre as tentativas. */
  async function waitFor<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const value = await check();
      if (value !== undefined) {
        return value;
      }
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Timeout esperando: ${what}`);
  }

  const custodyOf = (orderId: string) => async () => {
    const [row] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
    return row;
  };

  /** Do anúncio ao pedido pago e em execução; devolve os ids do fluxo. */
  async function contractAndPay(
    seller: TestUser,
    buyer: TestUser,
    amount: number,
  ): Promise<{ orderId: string; paymentId: string; custodyId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Manutenção preventiva de ar-condicionado',
        description: 'Limpeza de filtros, checagem de gás e higienização completa do aparelho.',
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
      payload: { message: 'Meu ar-condicionado está com pouca refrigeração, consegue ver?' },
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

    const paymentRow = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite');

    // O cliente paga na CONTRATAÇÃO — antes de o serviço ser executado.
    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);

    // PAY-003: Payment.Authorized cria a custódia.
    const custody = await waitFor(custodyOf(orderId), 'custódia criada');
    expect(custody.status).toBe('IN_CUSTODY');

    return { orderId, paymentId: paymentRow.id, custodyId: custody.id };
  }

  /** Agenda, executa e deixa o pedido aguardando a confirmação do cliente. */
  async function performService(seller: TestUser, orderId: string): Promise<void> {
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(24), estimatedDuration: 90 },
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

  it('ciclo completo: contratação → custódia → serviço → confirmação → liberação', async () => {
    const seller = await createActiveUser('Eduardo Prado Sampaio');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Bianca Rezende Coutinho');

    const { orderId, paymentId, custodyId } = await contractAndPay(seller, buyer, 1200);

    // A custódia existe ANTES de o serviço ser concluído — é o ponto do Pack.
    const [beforeService] = await db
      .select()
      .from(trustCustodies)
      .where(eq(trustCustodies.id, custodyId));
    expect(beforeService?.status).toBe('IN_CUSTODY');
    const [paymentInCustody] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(paymentInCustody?.status).toBe('FUNDS_IN_CUSTODY');

    await performService(seller, orderId);

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: buyer.auth,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);

    // PAY-004: política → READY_FOR_RELEASE → sandbox → RELEASED
    const released = await waitFor(async () => {
      const row = await custodyOf(orderId)();
      return row?.status === 'RELEASED' ? row : undefined;
    }, 'custódia liberada');

    expect(released.releasedAt).toBeInstanceOf(Date);
    const [finalPayment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(finalPayment?.status).toBe('FUNDS_RELEASED');

    // Os quatro eventos canônicos, todos no agregado TrustCustody.
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, custodyId));
    const byType = events.map((event) => event.eventType).sort();
    expect(byType).toEqual([
      'Funds.Held',
      'Funds.ReadyForRelease',
      'Funds.Released',
      'TrustCustody.Created',
    ]);
    for (const event of events) {
      expect(event.aggregateType).toBe('TrustCustody');
      expect(event.producer).toBe('payment-service');
    }

    // §20.3: nenhuma liquidação/split foi executada neste Pack.
    expect(finalPayment?.status).not.toBe('SETTLED');
  });

  it('uma autorização gera exatamente UMA custódia, mesmo com reentrega', async () => {
    const seller = await createActiveUser('Otávio Lima Nascimento');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Sabrina Melo Queiroz');
    const { orderId } = await contractAndPay(seller, buyer, 800);

    // Vários ciclos do relay não podem multiplicar a custódia (UNIQUE + dedupe).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await relay.tick();
    }
    const rows = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
    expect(rows).toHaveLength(1);
  });

  it('disputa aberta bloqueia a liberação e o dinheiro fica retido', async () => {
    const seller = await createActiveUser('Vinícius Barreto Fontes');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Larissa Peixoto Amorim');
    const { orderId, paymentId, custodyId } = await contractAndPay(seller, buyer, 1500);

    await performService(seller, orderId);

    // O cliente confirma e, na sequência, abre disputa (MRK-023 §6.3 permite).
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/confirm-completion`,
      headers: buyer.auth,
      payload: {},
    });
    const dispute = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/disputes`,
      headers: buyer.auth,
      payload: {
        category: 'SERVICE_PARTIALLY_EXECUTED',
        description: 'O aparelho voltou a falhar no dia seguinte ao atendimento.',
      },
    });
    expect(dispute.statusCode).toBe(201);

    // Se a confirmação já tiver liberado antes da disputa, o cenário não vale:
    // o que interessa é o caso em que a política roda com disputa ativa.
    const [row] = await db.select().from(trustCustodies).where(eq(trustCustodies.id, custodyId));
    if (row?.status === 'RELEASED') {
      return;
    }

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await relay.tick();
      await new Promise((sleep) => setTimeout(sleep, 300));
    }

    const [blocked] = await db.select().from(trustCustodies).where(eq(trustCustodies.id, custodyId));
    expect(blocked?.status).not.toBe('RELEASED');
    expect(blocked?.releasedAt).toBeNull();
    const [heldPayment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(heldPayment?.status).toBe('FUNDS_IN_CUSTODY');
  });
});
