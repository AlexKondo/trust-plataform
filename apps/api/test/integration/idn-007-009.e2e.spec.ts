/**
 * E2E do trio de senha (IDN-007/008/009). Fluxos reais contra o banco.
 * Requer TEST_DATABASE_URL.
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, isNull, and } from 'drizzle-orm';
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
import { passwordResetTokens, sessions } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const NEW_PASSWORD = 'Fresh#Stallion8Cell';

describe.runIf(Boolean(testDatabaseUrl))('IDN-007/008/009 — Senhas e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;

  async function createVerifiedAccount(): Promise<{ email: string; identityId: string }> {
    const email = `idn007-${uuidv7()}@e2e.trustplatform.test`;
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
    return { email, identityId };
  }

  async function login(email: string, password = PASSWORD) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return response;
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

  it('forgot: resposta 202 IDÊNTICA para conta existente e inexistente (anti-enumeração)', async () => {
    const { email } = await createVerifiedAccount();

    const existing = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: `nunca-existiu-${uuidv7()}@e2e.trustplatform.test` },
    });

    expect(existing.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(existing.body).toBe(unknown.body);
  });

  it('fluxo completo de reset: e-mail → nova senha → sessões todas revogadas → login novo', async () => {
    const { email, identityId } = await createVerifiedAccount();
    const session = await login(email);
    expect(session.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const resetToken = new URL(emailService.lastReset!.resetUrl).searchParams.get('token')!;

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, newPassword: NEW_PASSWORD },
    });
    expect(reset.statusCode).toBe(204);

    // token de reset é de uso único
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, newPassword: 'Other#Password99x' },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json<{ error: { code: string } }>().error.code).toBe('INVALID_RESET_TOKEN');

    // todas as sessões revogadas (BR-006)
    const alive = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.identityId, identityId), isNull(sessions.revokedAt)));
    expect(alive).toHaveLength(0);

    // senha antiga não loga mais; a nova sim
    expect((await login(email, PASSWORD)).statusCode).toBe(401);
    expect((await login(email, NEW_PASSWORD)).statusCode).toBe(200);

    // no banco: apenas hash do token
    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.identityId, identityId));
    expect(tokenRow?.tokenHash).toHaveLength(64);
    expect(tokenRow?.tokenHash).not.toBe(resetToken);
  });

  it('reset com senha fraca → 400 VALIDATION_ERROR (política DOC-002 na borda)', async () => {
    const { email } = await createVerifiedAccount();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    const resetToken = new URL(emailService.lastReset!.resetUrl).searchParams.get('token')!;

    const weak = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: resetToken, newPassword: 'fraca' },
    });
    expect(weak.statusCode).toBe(400);
  });

  it('change: troca autenticada revoga as outras sessões e preserva a atual (BR-007)', async () => {
    const { email, identityId } = await createVerifiedAccount();
    const first = await login(email);
    const second = await login(email);
    const firstTokens = first.json<{ data: { accessToken: string; refreshToken: string } }>().data;
    const secondTokens = second.json<{ data: { refreshToken: string } }>().data;

    const change = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${firstTokens.accessToken}` },
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(change.statusCode).toBe(204);

    // a sessão usada continua viva; a outra morreu
    const refreshCurrent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: firstTokens.refreshToken },
    });
    expect(refreshCurrent.statusCode).toBe(200);

    const refreshOther = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: secondTokens.refreshToken },
    });
    expect(refreshOther.statusCode).toBe(401);

    const alive = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.identityId, identityId), isNull(sessions.revokedAt)));
    expect(alive).toHaveLength(1);

    // nova senha vale para novo login
    expect((await login(email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('change: senha atual errada → 401; nova igual à atual → 422; sem token → 401', async () => {
    const { email } = await createVerifiedAccount();
    const tokens = (await login(email)).json<{ data: { accessToken: string } }>().data;

    const wrongCurrent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { currentPassword: 'Errada#Senha123x', newPassword: NEW_PASSWORD },
    });
    expect(wrongCurrent.statusCode).toBe(401);
    expect(wrongCurrent.json<{ error: { code: string } }>().error.code).toBe(
      'CURRENT_PASSWORD_INVALID',
    );

    const same = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { currentPassword: PASSWORD, newPassword: PASSWORD },
    });
    expect(same.statusCode).toBe(422);
    expect(same.json<{ error: { code: string } }>().error.code).toBe('SAME_PASSWORD');

    const noAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(noAuth.statusCode).toBe(401);
  });
});
