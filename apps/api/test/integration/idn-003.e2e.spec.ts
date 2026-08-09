/**
 * E2E do IDN-003 — Login. Fluxo real: cadastro → verificação → login → sessão/eventos.
 * Requer TEST_DATABASE_URL.
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
import { identities, outboxEvents, sessions } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

describe.runIf(Boolean(testDatabaseUrl))('IDN-003 — Login e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;

  async function registerAndVerify(): Promise<{ identityId: string; email: string }> {
    const email = `idn003-${uuidv7()}@e2e.trustplatform.test`;
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
    expect(created.statusCode).toBe(201);
    const { identityId } = created.json<{ data: { identityId: string } }>().data;

    const token = new URL(emailService.lastSent!.verificationUrl).searchParams.get('token')!;
    const verified = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=${token}`,
    });
    expect(verified.statusCode).toBe(200);
    return { identityId, email };
  }

  function login(email: string, password = PASSWORD) {
    return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('login válido retorna tokens no envelope, cria sessão (hash) e publica Identity.Authenticated', async () => {
    const { identityId, email } = await registerAndVerify();

    const response = await login(email);
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      success: boolean;
      data: { accessToken: string; refreshToken: string; expiresIn: number };
    }>();
    expect(body.success).toBe(true);
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.accessToken.split('.')).toHaveLength(3);

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.identityId, identityId));
    expect(sessionRow).toBeDefined();
    expect(sessionRow?.refreshTokenHash).toHaveLength(64);
    expect(sessionRow?.refreshTokenHash).not.toBe(body.data.refreshToken);

    const [identityRow] = await db.select().from(identities).where(eq(identities.id, identityId));
    expect(identityRow?.lastLoginAt).toBeInstanceOf(Date);

    const [event] = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventName, 'Identity.Authenticated')))
      .then((rows) =>
        rows.filter((r) => (r.payload as { identityId?: string }).identityId === identityId),
      );
    expect(event).toBeDefined();
    expect((event?.payload as { sessionId?: string }).sessionId).toBe(sessionRow?.id);
  });

  it('senha errada e e-mail inexistente respondem o MESMO 401 INVALID_CREDENTIALS', async () => {
    const { email } = await registerAndVerify();

    const wrongPassword = await login(email, 'Wrong#Pass12345');
    const unknownEmail = await login(`nao-existe-${uuidv7()}@e2e.trustplatform.test`);

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.json<{ error: { code: string; message: string } }>().error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials.',
      });
    }
  });

  it('conta sem e-mail verificado → 403 IDENTITY_NOT_ACTIVE (BR-001)', async () => {
    const email = `idn003-unverified-${uuidv7()}@e2e.trustplatform.test`;
    await app.inject({
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

    const response = await login(email);
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('IDENTITY_NOT_ACTIVE');
  });

  it('lockout: após 3 senhas erradas a conta trava com 429 mesmo com senha correta', async () => {
    const { email } = await registerAndVerify();

    for (let i = 0; i < 3; i += 1) {
      await login(email, 'Wrong#Pass12345');
    }

    const locked = await login(email);
    expect(locked.statusCode).toBe(429);
    expect(locked.json<{ error: { code: string } }>().error.code).toBe('ACCOUNT_LOCKED');
  });
});
