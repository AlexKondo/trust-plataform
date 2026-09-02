/**
 * E2E do PACK-02 — Commercial Amount & Fee Foundation (§18.2).
 *
 * Prova o "Contract Formation" (§10) de ponta a ponta com a aplicação de pé:
 *   proposta (FIXED_PRICE e HOURLY) → aceite → snapshot econômico congelado →
 *   Payment criado pelo outbox relay com o grossAmount correto.
 *
 * E prova a regressão do PACK-01: custódia continua segurando o grossAmount
 * cheio, sem recalcular fee em nenhum ponto do ciclo.
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
  commercialPolicies,
  marketplaceOrderCommercialSnapshots,
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

describe.runIf(Boolean(testDatabaseUrl))('PACK-02 — Commercial Amount & Fee Foundation', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `pack02-${uuidv7()}@e2e.trustplatform.test`;
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

  /**
   * HOME_REPAIRS exige nível mínimo BRONZE para publicar (MRK-003 BR-002).
   * Uma identidade recém-criada começa em score 0 — espera o pipeline
   * assíncrono do Trust Score (Identity.Created → TrustPassport.Created →
   * cálculo do score) alcançar BRONZE (>=25), mesmo padrão de
   * mrk-001-008.e2e.spec.ts.
   */
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

  async function publishListing(seller: TestUser, price: number): Promise<string> {
    await waitForBronze(seller.identityId);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação elétrica residencial completa',
        description: 'Instalação de quadro de disjuntores, tomadas e pontos de luz certificados.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price,
        currency: 'BRL',
      },
    });
    expect(created.statusCode).toBe(201);
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    // Falha silenciosa aqui deixaria o anúncio em DRAFT e só quebraria mais
    // tarde, de forma opaca, no /contact — falhar explícito e cedo em vez disso.
    expect(published.statusCode).toBe(200);
    expect(published.json<{ data: { status: string } }>().data.status).toBe('PUBLISHED');
    return listingId;
  }

  async function openConversation(seller: TestUser, buyer: TestUser, listingId: string): Promise<string> {
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Preciso de um orçamento para a instalação completa.' },
    });
    return contact.json<{ data: { conversation: { conversationId: string } } }>().data.conversation
      .conversationId;
  }

  /** Fluxo completo: oferta (FIXED_PRICE ou HOURLY) → aceite → devolve orderId/amount. */
  async function offerAndAccept(
    seller: TestUser,
    buyer: TestUser,
    conversationId: string,
    payload: Record<string, unknown>,
  ): Promise<{ orderId: string; offerId: string; amount: number }> {
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { quantity: 1, expiresAt: inHours(48), ...payload },
    });
    expect(offer.statusCode).toBe(201);
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    const { order } = accepted.json<{ data: { order: { orderId: string; amount: number } } }>().data;
    return { orderId: order.orderId, offerId, amount: order.amount };
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

  it('a migration semeou a política comercial (seed técnico 1000 bps / 30min)', async () => {
    const [policy] = await db
      .select()
      .from(commercialPolicies)
      .orderBy(commercialPolicies.createdAt);
    expect(policy).toBeDefined();
    expect(policy!.trustFeeRateBps).toBe(1000);
    expect(policy!.defaultBillingIncrementMinutes).toBe(30);
  });

  it('FIXED_PRICE: aceite congela o snapshot e o Payment nasce com o grossAmount correto', async () => {
    const seller = await createActiveUser('Marcelo Andrade Vasconcelos');
    const buyer = await createActiveUser('Renata Silveira Câmara');
    const listingId = await publishListing(seller, 1000);
    const conversationId = await openConversation(seller, buyer, listingId);

    const { orderId } = await offerAndAccept(seller, buyer, conversationId, {
      pricingModel: 'FIXED_PRICE',
      amount: 1000,
    });

    const snapshot = await waitFor(async () => {
      const [row] = await db
        .select()
        .from(marketplaceOrderCommercialSnapshots)
        .where(eq(marketplaceOrderCommercialSnapshots.orderId, orderId));
      return row;
    }, 'snapshot comercial criado no aceite');

    expect(snapshot.pricingModel).toBe('FIXED_PRICE');
    expect(Number(snapshot.grossAmount)).toBe(1000);
    expect(Number(snapshot.serviceAmount)).toBe(1000);
    expect(snapshot.trustFeeRateBps).toBe(1000); // seed técnico: 10%
    expect(Number(snapshot.trustFeeAmount)).toBe(100); // 10% de 1000
    expect(Number(snapshot.providerNetBeforePspFees)).toBe(900);

    const payment = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite');
    // §11: Payment gross amount == frozen contract gross amount.
    expect(Number(payment.amount)).toBe(Number(snapshot.grossAmount));
  });

  it('HOURLY: valor inicial derivado (R$150/h × 60min = R$150) e snapshot consistente', async () => {
    const seller = await createActiveUser('Felipe Nogueira Barros');
    const buyer = await createActiveUser('Camila Duarte Peixoto');
    // O preço do anúncio é só a vitrine; a proposta HOURLY é quem define o valor real.
    const listingId = await publishListing(seller, 150);
    const conversationId = await openConversation(seller, buyer, listingId);

    const { orderId, amount } = await offerAndAccept(seller, buyer, conversationId, {
      pricingModel: 'HOURLY',
      hourlyRateAmount: 150,
      minimumMinutes: 60,
    });
    expect(amount).toBe(150); // R$150,00/h × 60min = R$150,00 (§4.2)

    const snapshot = await waitFor(async () => {
      const [row] = await db
        .select()
        .from(marketplaceOrderCommercialSnapshots)
        .where(eq(marketplaceOrderCommercialSnapshots.orderId, orderId));
      return row;
    }, 'snapshot comercial HOURLY criado no aceite');

    expect(snapshot.pricingModel).toBe('HOURLY');
    expect(Number(snapshot.grossAmount)).toBe(150);
    expect(Number(snapshot.serviceAmount)).toBe(150);
    expect(Number(snapshot.hourlyRateAmount)).toBe(150);
    expect(snapshot.minimumMinutes).toBe(60);
    expect(snapshot.billingIncrementMinutes).toBe(30); // default da política
    expect(Number(snapshot.trustFeeAmount)).toBe(15); // 10% de 150

    const payment = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite (HOURLY)');
    expect(Number(payment.amount)).toBe(150);
  });

  it('PACK-01 continua verde: custódia segura o grossAmount cheio, sem recalcular fee', async () => {
    const seller = await createActiveUser('Diego Fonseca Ribeiro');
    const buyer = await createActiveUser('Aline Moraes Tavares');
    const listingId = await publishListing(seller, 800);
    const conversationId = await openConversation(seller, buyer, listingId);

    const { orderId } = await offerAndAccept(seller, buyer, conversationId, {
      pricingModel: 'FIXED_PRICE',
      amount: 800,
    });

    const paymentRow = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite');

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);

    // PAY-003: Payment.Authorized cria a custódia — com o valor CHEIO (800),
    // não o líquido pós-fee (720). PACK-02 não recalcula fee neste caminho.
    const custody = await waitFor(async () => {
      const [row] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, orderId));
      return row;
    }, 'custódia criada');
    expect(custody.status).toBe('IN_CUSTODY');
    expect(Number(custody.amount)).toBe(800); // grossAmount cheio, não o net
  });
});
