/**
 * E2E do IDN-004 — Refresh Session. Fluxo real: cadastro → verificação → login →
 * refresh (rotação) → reuso do token antigo rejeitado. Requer TEST_DATABASE_URL.
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
import { sessions } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

describe.runIf(Boolean(testDatabaseUrl))('IDN-004 — Refresh Session e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;

  async function loginFreshAccount(): Promise<{ refreshToken: string; identityId: string }> {
    const email = `idn004-${uuidv7()}@e2e.trustplatform.test`;
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
    expect(login.statusCode).toBe(200);
    return {
      refreshToken: login.json<{ data: { refreshToken: string } }>().data.refreshToken,
      identityId,
    };
  }

  function refresh(refreshToken: string) {
    return app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
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

  it('refresh válido rotaciona tokens e mantém a MESMA sessão; token antigo morre', async () => {
    const { refreshToken, identityId } = await loginFreshAccount();

    const first = await refresh(refreshToken);
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<{
      data: { accessToken: string; refreshToken: string; expiresIn: number };
    }>();
    expect(firstBody.data.expiresIn).toBe(900);
    expect(firstBody.data.refreshToken).not.toBe(refreshToken);

    // mesma sessão (não cria outra linha)
    const rows = await db.select().from(sessions).where(eq(sessions.identityId, identityId));
    expect(rows).toHaveLength(1);

    // reuso do token antigo → 401
    const reuse = await refresh(refreshToken);
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json<{ error: { code: string } }>().error.code).toBe('INVALID_REFRESH_TOKEN');

    // o novo continua funcionando (cadeia de rotação)
    const second = await refresh(firstBody.data.refreshToken);
    expect(second.statusCode).toBe(200);
  });

  it('sessão expirada → 401 EXPIRED_REFRESH_TOKEN', async () => {
    const { refreshToken, identityId } = await loginFreshAccount();
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.identityId, identityId));

    const response = await refresh(refreshToken);
    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('EXPIRED_REFRESH_TOKEN');
  });

  it('sessão revogada → 401 SESSION_REVOKED (BR-007)', async () => {
    const { refreshToken, identityId } = await loginFreshAccount();
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.identityId, identityId));

    const response = await refresh(refreshToken);
    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('SESSION_REVOKED');
  });
});
