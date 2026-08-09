/**
 * E2E do Módulo 2 (TPS) — prova o motor de eventos de ponta a ponta:
 * verificação de e-mail → Identity.Created no outbox → relay publica no
 * pg-boss → consumer cria o Trust Passport automaticamente.
 * Requer TEST_DATABASE_URL.
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
import { outboxEvents, trustPassports } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

describe.runIf(Boolean(testDatabaseUrl))('TPS-001..003 — Trust Passport e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function registerVerifyLogin(): Promise<{ identityId: string; accessToken: string }> {
    const email = `tps-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName: 'Maria Silva',
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
    return {
      identityId,
      accessToken: login.json<{ data: { accessToken: string } }>().data.accessToken,
    };
  }

  /** Publica o outbox e espera o consumer criar o passport (pg-boss é assíncrono). */
  async function waitForPassport(identityId: string, timeoutMs = 20000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await relay.tick();
      const [row] = await db
        .select({ id: trustPassports.id })
        .from(trustPassports)
        .where(eq(trustPassports.identityId, identityId));
      if (row) {
        return;
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    throw new Error('Trust Passport não foi criado pelo consumer dentro do timeout');
  }

  // Env de teste definida em test/setup-env.ts (roda antes dos imports).
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

  it('consumer cria o Trust Passport automaticamente após a verificação de e-mail (TPS-001)', async () => {
    const { identityId, accessToken } = await registerVerifyLogin();

    await waitForPassport(identityId);

    // estado inicial correto no banco
    const [row] = await db
      .select()
      .from(trustPassports)
      .where(eq(trustPassports.identityId, identityId));
    expect(row?.status).toBe('ACTIVE');
    expect(row?.emailVerified).toBe(true);
    expect(Number(row?.profileCompletion)).toBe(25);

    // TrustPassport.Created publicado no outbox (encadeado ao Identity.Created)
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventName, 'TrustPassport.Created'))
      .then((rows) =>
        rows.filter((e) => (e.payload as { identityId?: string }).identityId === identityId),
      );
    expect(events).toHaveLength(1);
    expect(events[0]?.causationId).toBeTruthy();

    // TPS-002: GET /trust-passports/me
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/trust-passports/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    const body = me.json<{ data: { emailVerified: boolean; profileCompletion: number } }>();
    expect(body.data.emailVerified).toBe(true);
    expect(body.data.profileCompletion).toBe(25);
  });

  it('TPS-003: atualiza phone/address, recalcula completude e publica TrustPassport.Updated', async () => {
    const { identityId, accessToken } = await registerVerifyLogin();
    await waitForPassport(identityId);

    const update = await app.inject({
      method: 'PUT',
      url: '/api/v1/trust-passports/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        phone: '+55 11 99999-9999',
        address: { country: 'br', state: 'SP', city: 'Valinhos' },
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json<{ data: { profileCompletion: number } }>().data.profileCompletion).toBe(25);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/trust-passports/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const data = me.json<{
      data: { phone: string; address: { country: string }; phoneVerified: boolean };
    }>().data;
    expect(data.phone).toBe('+55 11 99999-9999');
    expect(data.address.country).toBe('BR'); // normalizado para maiúsculas
    expect(data.phoneVerified).toBe(false);

    const updatedEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventName, 'TrustPassport.Updated'))
      .then((rows) =>
        rows.filter((e) => (e.payload as { identityId?: string }).identityId === identityId),
      );
    expect(updatedEvents).toHaveLength(1);
    expect(
      (updatedEvents[0]?.payload as { updatedFields: string[] }).updatedFields.sort(),
    ).toEqual(['address', 'phone']);
  });

  it('POST /trust-passports duplicado → 409; sem token → 401', async () => {
    const { accessToken, identityId } = await registerVerifyLogin();
    await waitForPassport(identityId);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/trust-passports',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<{ error: { code: string } }>().error.code).toBe(
      'TRUST_PASSPORT_ALREADY_EXISTS',
    );

    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/trust-passports/me' });
    expect(noAuth.statusCode).toBe(401);
  });
});
