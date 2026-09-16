/**
 * E2E do IP-004 (Competitive Quotes & Comparison Map):
 * um ServiceRequest (IP-003) recebe engajamentos de múltiplos Partners — cada
 * um com sua PRÓPRIA conversa/cadeia de MarketplaceOffer (MRK-006..014,
 * intocada) — e o Member compara as propostas vivas lado a lado, normalizadas
 * (FIXED_PRICE x HOURLY nunca convertidos entre si), sem ranking oculto.
 * O aceite (MRK-013) continua fechando só as propostas concorrentes da MESMA
 * negociação (BR-004) — este teste confirma explicitamente que a proposta de
 * um Partner diferente NÃO é afetada, provando que esta IP não reescreveu a
 * máquina de estados de aceite.
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
import { trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  accessToken: string;
  auth: { authorization: string };
}

interface ComparisonItem {
  engagementId: string;
  listingId: string;
  listingTitle: string | null;
  partner: { identityId: string; trustScore: number | null; trustLevel: string | null };
  conversationId: string;
  conversationStatus: string | null;
  hasOffer: boolean;
  offer: {
    offerId: string;
    status: string;
    pricingModel: string;
    amount: number;
    estimatedTotalBasis: string;
    hourlyRateAmount: number | null;
    minimumMinutes: number | null;
    billingIncrementMinutes: number | null;
    roundCount: number;
  } | null;
}

describe.runIf(Boolean(testDatabaseUrl))('IP-004 — Competitive Quotes & Comparison Map e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip004-${uuidv7()}@e2e.trustplatform.test`;
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
    return { identityId, accessToken, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  async function publishListing(partner: TestUser, title: string): Promise<string> {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: partner.auth,
      payload: { title },
    });
    const listingId = draft.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: partner.auth,
      payload: {
        description: 'Atendimento profissional com garantia de 90 dias em toda a região.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 150,
        currency: 'BRL',
        location: 'Tatuapé, São Paulo/SP',
      },
    });
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: partner.auth,
    });
    expect(published.statusCode).toBe(200);
    return listingId;
  }

  async function engage(member: TestUser, serviceRequestId: string, listingId: string, message: string) {
    const result = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: member.auth,
      payload: { listingId, message },
    });
    expect([200, 201]).toContain(result.statusCode);
    return result.json<{ data: { conversation: { conversationId: string } } }>().data.conversation
      .conversationId;
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

  it('um pedido recebe propostas de múltiplos Partners e o Member compara lado a lado, normalizadas', async () => {
    const member = await createActiveUser('Fernanda Lopes Andrade');
    await waitForBronze(member.identityId);
    const partnerFixed = await createActiveUser('Ricardo Nunes Cavalcante');
    await waitForBronze(partnerFixed.identityId);
    const partnerHourly = await createActiveUser('Simone Batista Rezende');
    await waitForBronze(partnerHourly.identityId);
    const partnerNoQuote = await createActiveUser('Alexandre Vieira Moraes');
    await waitForBronze(partnerNoQuote.identityId);
    const stranger = await createActiveUser('Bruna Castro Ferreira');

    const listingFixed = await publishListing(partnerFixed, 'Reforma de banheiro (orçamento fechado)');
    const listingHourly = await publishListing(partnerHourly, 'Reforma de banheiro (por hora)');
    const listingNoQuote = await publishListing(partnerNoQuote, 'Reforma de banheiro (ainda sem orçamento)');

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Preciso reformar o banheiro da suíte',
        description: 'Troca de piso, box e instalação hidráulica completa, incluindo acabamento.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Tatuapé, São Paulo/SP',
        urgency: 'THIS_WEEK',
        budgetMinAmount: 1500,
        budgetMaxAmount: 3000,
      },
    });
    expect(create.statusCode).toBe(201);
    const serviceRequestId = create.json<{ data: { serviceRequestId: string } }>().data.serviceRequestId;

    // Engaja os três Partners — cada um recebe sua PRÓPRIA conversa (IP-003 §3.1:
    // OPEN -> MATCHED é idempotente e não impede novos engajamentos).
    const conversationFixed = await engage(member, serviceRequestId, listingFixed, 'Pode me passar um orçamento fechado?');
    const conversationHourly = await engage(member, serviceRequestId, listingHourly, 'Você cobra por hora?');
    await engage(member, serviceRequestId, listingNoQuote, 'Ainda estou buscando orçamentos.');

    // Não-dono nunca vê a comparação — 404, mesma postura de privacidade do resto do agregado (IP-003 §8/§11)
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/offers`,
      headers: stranger.auth,
    });
    expect(forbidden.statusCode).toBe(404);

    // Antes de qualquer proposta: 3 itens, todos hasOffer=false
    const beforeOffers = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/offers`,
      headers: member.auth,
    });
    expect(beforeOffers.statusCode).toBe(200);
    const beforeData = beforeOffers.json<{ data: { items: ComparisonItem[] } }>().data;
    expect(beforeData.items).toHaveLength(3);
    expect(beforeData.items.every((item) => item.hasOffer === false)).toBe(true);

    // Member abre a negociação (MRK-009 BR-001: quem abre é sempre o comprador)
    // com um valor de partida; cada Partner então contrapõe com o quote real.
    const openFixed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationFixed}/offers`,
      headers: member.auth,
      payload: { amount: 2000, pricingModel: 'FIXED_PRICE', quantity: 1, expiresAt: inDays(10) },
    });
    expect(openFixed.statusCode).toBe(201);
    const openFixedOfferId = openFixed.json<{ data: { offerId: string } }>().data.offerId;

    const counterFixed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${openFixedOfferId}/counter`,
      headers: partnerFixed.auth,
      payload: { amount: 2400, expiresAt: inDays(10) },
    });
    expect(counterFixed.statusCode).toBe(201);
    const fixedOfferId = counterFixed.json<{ data: { offerId: string } }>().data.offerId;

    const openHourly = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationHourly}/offers`,
      headers: member.auth,
      payload: {
        pricingModel: 'HOURLY',
        hourlyRateAmount: 120,
        minimumMinutes: 240,
        quantity: 1,
        expiresAt: inDays(10),
      },
    });
    expect(openHourly.statusCode).toBe(201);
    const hourlyOfferId = openHourly.json<{ data: { offerId: string } }>().data.offerId;

    // Depois das propostas: comparação normaliza os dois modelos sem converter um no outro
    const afterOffers = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/offers`,
      headers: member.auth,
    });
    expect(afterOffers.statusCode).toBe(200);
    const afterData = afterOffers.json<{ data: { items: ComparisonItem[] } }>().data;
    expect(afterData.items).toHaveLength(3);

    const fixedItem = afterData.items.find((item) => item.listingId === listingFixed)!;
    expect(fixedItem.hasOffer).toBe(true);
    expect(fixedItem.partner.trustLevel).toBe('BRONZE');
    expect(fixedItem.offer).toMatchObject({
      offerId: fixedOfferId,
      status: 'PENDING',
      pricingModel: 'FIXED_PRICE',
      amount: 2400,
      estimatedTotalBasis: 'FIXED_TOTAL',
      hourlyRateAmount: null,
      roundCount: 2, // proposta inicial do Member + contraoferta do Partner
    });

    const hourlyItem = afterData.items.find((item) => item.listingId === listingHourly)!;
    expect(hourlyItem.hasOffer).toBe(true);
    expect(hourlyItem.offer).toMatchObject({
      offerId: hourlyOfferId,
      status: 'PENDING',
      pricingModel: 'HOURLY',
      amount: 480, // 120.00/h * 240min = mínimo contratado — NUNCA um "total equivalente" inventado
      estimatedTotalBasis: 'HOURLY_MINIMUM_COMMITMENT',
      hourlyRateAmount: 120,
      minimumMinutes: 240,
      roundCount: 1,
    });
    // Os dois `amount`s são valores literais de modelos diferentes — nunca convertidos um no outro.
    expect(fixedItem.offer!.amount).not.toBe(hourlyItem.offer!.amount);

    const noQuoteItem = afterData.items.find((item) => item.listingId === listingNoQuote)!;
    expect(noQuoteItem.hasOffer).toBe(false);
    expect(noQuoteItem.offer).toBeNull();

    // Sem ranking oculto: ordem é por engagedAt (ordem de contato), nunca por preço/reputação.
    expect(afterData.items.map((item) => item.listingId)).toEqual([listingFixed, listingHourly, listingNoQuote]);

    // Member aceita a proposta FIXED_PRICE (MRK-013, intocada por esta IP)
    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${fixedOfferId}/accept`,
      headers: member.auth,
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json<{ data: { order: { amount: number; status: string } } }>().data.order).toMatchObject({
      amount: 2400,
      status: 'CREATED',
    });

    // A comparação reflete o aceite — mas SÓ na negociação aceita. A proposta
    // HOURLY do outro Partner continua PENDING: esta IP não fecha propostas de
    // OUTRAS conversas (isso seria reescrever MRK-013 BR-004, que só fecha
    // concorrentes da MESMA negociação — fora do escopo desta IP).
    const finalOffers = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/offers`,
      headers: member.auth,
    });
    const finalData = finalOffers.json<{ data: { items: ComparisonItem[] } }>().data;
    const finalFixed = finalData.items.find((item) => item.listingId === listingFixed)!;
    const finalHourly = finalData.items.find((item) => item.listingId === listingHourly)!;
    expect(finalFixed.offer!.status).toBe('ACCEPTED');
    expect(finalHourly.offer!.status).toBe('PENDING');
  });
});

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
