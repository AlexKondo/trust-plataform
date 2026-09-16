/**
 * E2E do IP-014 — prova end-to-end de que `RateLimitService` efetivamente
 * bloqueia com HTTP 429 quando o limite de tentativas é atingido.
 *
 * Por que este arquivo existe separado de `ip-014-safety-abuse-fraud-controls.e2e.spec.ts`:
 * aquele spec (e todos os demais e2e) roda com
 * `SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS=100000` (ver `test/setup-env.ts`)
 * para não interferir em fluxos que repetem a mesma operação sensível várias
 * vezes na mesma suíte. Isso deixava o guard coberto só por teste unitário
 * (`rate-limit.service.spec.ts`) — nenhum teste provava, com a aplicação de
 * pé e o banco real, que uma resposta HTTP 429 de fato acontece. Este
 * arquivo fecha essa lacuna: ele sobrescreve o limite para um valor baixo
 * ANTES de importar `createApp` (Vitest isola o module graph por arquivo,
 * então isto não vaza para outras suítes) e prova o 429 fim-a-fim no
 * endpoint de criação de Change Order — cuja exceção de rate limit
 * propaga como 429 real (diferente de `ForgotPassword`, que mascara a
 * resposta por anti-enumeração, BR-003).
 *
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';
import type { Database } from '../../src/shared/database/database.module';
import type { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const RATE_LIMIT_MAX_ATTEMPTS = 2;

// Precisa ser setado ANTES do import dinâmico de `createApp` — o
// ConfigModule é avaliado no momento em que `app.module.ts` é importado.
if (testDatabaseUrl) {
  process.env.SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS = String(RATE_LIMIT_MAX_ATTEMPTS);
  process.env.SENSITIVE_ACTION_RATE_LIMIT_WINDOW_MINUTES = '60';
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-014 — rate limiter retorna 429 real (e2e)', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let relay: OutboxRelayService;
  let emailService: { lastSent: { verificationUrl: string } | null };

  async function createActiveUser(fullName: string): Promise<{
    identityId: string;
    auth: { authorization: string };
  }> {
    const email = `ip014-rl-${uuidv7()}@e2e.trustplatform.test`;
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

  // Publicar/vender um Listing exige um Trust Score mínimo (Bronze) — o mesmo
  // padrão de `ip-014-safety-abuse-fraud-controls.e2e.spec.ts`.
  async function waitForBronze(identityId: string): Promise<void> {
    const { trustScores } = await import('../../src/shared/database/schema/index.js');
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
      await new Promise((sleepDone) => setTimeout(sleepDone, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const client = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
      migrationsTable: 'drizzle_migrations',
    });
    await client.end({ timeout: 5 });

    const { createApp } = await import('../../src/main.js');
    const { EmailService } = await import(
      '../../src/modules/identity/domain/services/email.service.js'
    );
    const { DRIZZLE } = await import('../../src/shared/database/database.module.js');
    const { OutboxRelayService: RelayCtor } = await import(
      '../../src/shared/events/outbox-relay.service.js'
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    emailService = app.get<LoggingEmailService>(EmailService);
    db = app.get<Database>(DRIZZLE);
    relay = app.get(RelayCtor);
  }, 120000);

  afterAll(async () => {
    await app?.close();
  });

  it('bloqueia com 429 depois de exceder SENSITIVE_ACTION_RATE_LIMIT_MAX_ATTEMPTS tentativas de criar Change Order, sem afetar outra Identity', async () => {
    const seller = await createActiveUser('Prestador Rate Limit');
    const buyer = await createActiveUser('Cliente Rate Limit');
    await waitForBronze(seller.identityId);

    const listing = await app.inject({
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
    const listingId = listing.json<{ data: { listingId: string } }>().data.listingId;
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

    const draftChangeOrder = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/orders/${orderId}/change-orders`,
        headers: seller.auth,
        payload: {
          type: 'ADDITIONAL_TIME',
          additionalMinutes: 30,
          reason: 'OTHER',
          description: 'Trabalho extra identificado no local.',
        },
      });

    // As primeiras RATE_LIMIT_MAX_ATTEMPTS tentativas passam normalmente.
    for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i += 1) {
      const ok = await draftChangeOrder();
      expect(ok.statusCode).toBe(201);
    }

    // A próxima tentativa da MESMA Identity excede o limite → 429 real.
    const blocked = await draftChangeOrder();
    expect(blocked.statusCode).toBe(429);
    const body = blocked.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('SENSITIVE_ACTION_RATE_LIMIT_EXCEEDED');

    // Outra Identity (o buyer, criando seu próprio pedido) não é afetada —
    // o limite é por Identity+operação, não global.
    const otherSeller = await createActiveUser('Outro Prestador Rate Limit');
    await waitForBronze(otherSeller.identityId);
    const listing2 = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: otherSeller.auth,
      payload: {
        title: 'Instalação hidráulica',
        description: 'Reparo de encanamento residencial.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 120,
        currency: 'BRL',
      },
    });
    expect(listing2.statusCode).toBe(201);
  }, 120000);
});
