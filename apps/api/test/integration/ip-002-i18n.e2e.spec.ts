/**
 * E2E do IP-002 (Internationalization & Localization Foundation):
 * - Accept-Language resolve o locale inicial no cadastro (PT-BR default).
 * - PATCH /identities/me/locale troca e PERSISTE a preferência (GET confirma).
 * - Locale não suportado é rejeitado na borda (400).
 * - O mecanismo de notificação resolve o locale do DESTINATÁRIO (não do
 *   remetente) antes de persistir o aviso — prova de que a arquitetura
 *   funciona ponta a ponta com um segundo locale (en-US), mesmo o texto
 *   das notificações ainda sendo só PT-BR neste release (IP-002 §4).
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
import { notifications, trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface Account {
  identityId: string;
  auth: { authorization: string };
}

describe.runIf(Boolean(testDatabaseUrl))('IP-002 — Internacionalização e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function registerAndActivate(
    fullName: string,
    acceptLanguage?: string,
  ): Promise<Account & { identityId: string }> {
    const email = `ip002-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      headers: acceptLanguage ? { 'accept-language': acceptLanguage } : undefined,
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

  /** Publicar exige nível mínimo BRONZE — a ativação da conta já rende 25 pontos. */
  async function waitForScore(identityId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score?.score === expected) {
        return;
      }
      await new Promise((sleepDone) => setTimeout(sleepDone, 500));
    }
    throw new Error(`Score não chegou a ${expected}`);
  }

  it('cadastro sem Accept-Language assume PT-BR (default do produto)', async () => {
    const account = await registerAndActivate('Ana Beatriz Souza');
    const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: account.auth });
    expect(me.json<{ data: { preferredLocale: string } }>().data.preferredLocale).toBe('pt-BR');
  });

  it('cadastro resolve o locale inicial pelo Accept-Language (secundário: en-US)', async () => {
    const account = await registerAndActivate('Bruno Costa Lima', 'en-US,pt;q=0.5');
    const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: account.auth });
    expect(me.json<{ data: { preferredLocale: string } }>().data.preferredLocale).toBe('en-US');
  });

  it('Accept-Language não suportado cai para PT-BR default', async () => {
    const account = await registerAndActivate('Carla Nogueira', 'fr-FR,de-DE');
    const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: account.auth });
    expect(me.json<{ data: { preferredLocale: string } }>().data.preferredLocale).toBe('pt-BR');
  });

  it('PATCH /identities/me/locale troca a preferência e ela PERSISTE (novo GET confirma)', async () => {
    const account = await registerAndActivate('Diego Fernandes');

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/identities/me/locale',
      headers: account.auth,
      payload: { preferredLocale: 'en-US' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ data: { preferredLocale: string } }>().data.preferredLocale).toBe('en-US');

    const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: account.auth });
    expect(me.json<{ data: { preferredLocale: string } }>().data.preferredLocale).toBe('en-US');
  });

  it('locale não suportado é rejeitado na borda (400)', async () => {
    const account = await registerAndActivate('Elisa Martins');

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/identities/me/locale',
      headers: account.auth,
      payload: { preferredLocale: 'fr-FR' },
    });
    expect(patch.statusCode).toBe(400);
  });

  it('sem token → 401 (ownership vem sempre do token, nunca de parâmetro)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/identities/me/locale',
      payload: { preferredLocale: 'en-US' },
    });
    expect(patch.statusCode).toBe(401);
  });

  it('notificação resolve o locale do DESTINATÁRIO, não do remetente (mecanismo pronto para 2º idioma)', async () => {
    const seller = await registerAndActivate('Fabio Ramos Teixeira');
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/identities/me/locale',
      headers: seller.auth,
      payload: { preferredLocale: 'en-US' },
    });
    const buyer = await registerAndActivate('Gisele Andrade'); // fica no default PT-BR
    await waitForScore(seller.identityId, 25);

    const listing = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Aula particular de matemática',
        description: 'Reforço escolar para ensino médio, presencial ou online.',
        listingType: 'SERVICE',
        category: 'TUTORING',
        price: 80,
        currency: 'BRL',
      },
    });
    const listingId = listing.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Você tem horário disponível essa semana?' },
    });

    // Drena o outbox até a notificação do vendedor (en-US) existir no banco.
    const startedAt = Date.now();
    let sellerNotificationLocale: string | undefined;
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [row] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.identityId, seller.identityId));
      if (row) {
        sellerNotificationLocale = row.locale;
        break;
      }
      await new Promise((sleepDone) => setTimeout(sleepDone, 500));
    }

    expect(sellerNotificationLocale).toBe('en-US');
  });
});
