/**
 * E2E do IDN-005 (Get Current Identity) + IDN-006 (Logout).
 * Fluxo real: cadastro → verificação → login → /identities/me → logout →
 * refresh rejeitado. Requer TEST_DATABASE_URL.
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
import { outboxEvents, sessions } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

describe.runIf(Boolean(testDatabaseUrl))('IDN-005/006 — Me + Logout e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;

  async function loginFreshAccount(): Promise<{
    accessToken: string;
    refreshToken: string;
    identityId: string;
    email: string;
    fullName: string;
  }> {
    const email = `idn005-${uuidv7()}@e2e.trustplatform.test`;
    const fullName = 'Maria Silva';
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
    const data = login.json<{ data: { accessToken: string; refreshToken: string } }>().data;
    return { ...data, identityId, email, fullName };
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

  it('GET /identities/me retorna dados públicos com Bearer válido (IDN-005)', async () => {
    const { accessToken, identityId, email, fullName } = await loginFreshAccount();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/identities/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: Record<string, unknown> }>();
    expect(body.data).toMatchObject({ identityId, email, fullName, status: 'ACTIVE' });
    expect(body.data.lastLoginAt).toBeTruthy();
    // BR-004..007: nada sensível
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('argon2');
  });

  it('sem token ou com token inválido → 401 (BR-001/002)', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/identities/me' });
    expect(noToken.statusCode).toBe(401);
    expect(noToken.json<{ error: { code: string } }>().error.code).toBe('INVALID_TOKEN');

    const badToken = await app.inject({
      method: 'GET',
      url: '/api/v1/identities/me',
      headers: { authorization: 'Bearer nao-e-um-jwt' },
    });
    expect(badToken.statusCode).toBe(401);
  });

  it('logout revoga a sessão atual: 204, refresh morre, outras sessões seguem vivas (IDN-006)', async () => {
    const account = await loginFreshAccount();

    // segunda sessão do mesmo usuário (outro "dispositivo")
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: account.email, password: PASSWORD },
    });
    const secondTokens = secondLogin.json<{ data: { refreshToken: string } }>().data;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${account.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe('');

    // sessão atual revogada no banco
    const rows = await db.select().from(sessions).where(eq(sessions.identityId, account.identityId));
    const revoked = rows.filter((r) => r.revokedAt !== null);
    expect(rows).toHaveLength(2);
    expect(revoked).toHaveLength(1);

    // refresh da sessão deslogada → 401 (BR-004)
    const refreshDead = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: account.refreshToken },
    });
    expect(refreshDead.statusCode).toBe(401);
    expect(refreshDead.json<{ error: { code: string } }>().error.code).toBe('SESSION_REVOKED');

    // a outra sessão continua funcionando (BR-006)
    const refreshAlive = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: secondTokens.refreshToken },
    });
    expect(refreshAlive.statusCode).toBe(200);

    // evento publicado
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventName, 'Session.LoggedOut'))
      .then((r) =>
        r.filter((e) => (e.payload as { identityId?: string }).identityId === account.identityId),
      );
    expect(events).toHaveLength(1);

    // segundo logout com o mesmo access token → 401 SESSION_ALREADY_REVOKED
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${account.accessToken}` },
    });
    expect(again.statusCode).toBe(401);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('SESSION_ALREADY_REVOKED');
  });

  it('access token continua aceito até expirar (P7: sem blocklist no MVP) — decisão documentada', async () => {
    const { accessToken } = await loginFreshAccount();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/identities/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
  });
});
