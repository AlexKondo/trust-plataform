/**
 * E2E do IDN-002 — Verify Email: fluxo completo cadastro → link (capturado do
 * LoggingEmailService) → verificação → ACTIVE → eventos no outbox.
 * Requer TEST_DATABASE_URL. BREVO_API_KEY é removida para forçar o fallback de logging.
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray } from 'drizzle-orm';
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
import { emailVerificationTokens, identities, outboxEvents } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(testDatabaseUrl))('IDN-002 — Verify Email e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;

  async function register(): Promise<{ identityId: string; email: string; token: string }> {
    const email = `idn002-${uuidv7()}@e2e.trustplatform.test`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName: 'Maria Silva',
        email,
        password: 'Correct#Horse7Battery',
        confirmPassword: 'Correct#Horse7Battery',
        acceptTerms: true,
      },
    });
    expect(response.statusCode).toBe(201);
    const { identityId } = response.json<{ data: { identityId: string } }>().data;

    const url = new URL(emailService.lastSent!.verificationUrl);
    return { identityId, email, token: url.searchParams.get('token')! };
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
    expect(emailService).toBeInstanceOf(LoggingEmailService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('cadastro gera token (hash no banco) e "envia" o link de verificação', async () => {
    const { identityId, token } = await register();

    expect(token.length).toBeGreaterThanOrEqual(40);
    const rows = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.identityId, identityId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toHaveLength(64);
    expect(rows[0]?.tokenHash).not.toBe(token); // só o hash é persistido
  });

  it('GET verify-email ativa a conta, invalida o token e publica os 2 eventos', async () => {
    const { identityId, token } = await register();

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=${token}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: { status: string } }>().data.status).toBe('ACTIVE');

    const [identityRow] = await db.select().from(identities).where(eq(identities.id, identityId));
    expect(identityRow?.status).toBe('ACTIVE');

    const events = await db
      .select()
      .from(outboxEvents)
      .where(inArray(outboxEvents.eventName, ['Identity.Created', 'Identity.EmailVerified']));
    const mine = events.filter(
      (e) => (e.payload as { identityId?: string }).identityId === identityId,
    );
    expect(mine.map((e) => e.eventName).sort()).toEqual([
      'Identity.Created',
      'Identity.EmailVerified',
    ]);

    // BR-004: reuso do token → 409
    const reuse = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=${token}`,
    });
    expect(reuse.statusCode).toBe(409);
    expect(reuse.json<{ error: { code: string } }>().error.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('token desconhecido responde 400 INVALID_VERIFICATION_TOKEN (BR-006)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=um-token-que-nao-existe-mesmo`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe(
      'INVALID_VERIFICATION_TOKEN',
    );
  });

  it('reenvio (POST) invalida o token anterior e o novo funciona', async () => {
    const { identityId, token: firstToken } = await register();

    const resend = await app.inject({
      method: 'POST',
      url: `/api/v1/identities/${identityId}/verify-email`,
    });
    expect(resend.statusCode).toBe(202);

    // token antigo foi invalidado
    const oldAttempt = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=${firstToken}`,
    });
    expect(oldAttempt.statusCode).toBe(400);

    // o novo (capturado do "e-mail") ativa a conta
    const newToken = new URL(emailService.lastSent!.verificationUrl).searchParams.get('token')!;
    const verify = await app.inject({
      method: 'GET',
      url: `/api/v1/identities/verify-email?token=${newToken}`,
    });
    expect(verify.statusCode).toBe(200);
  });

  it('reenvio para conta já ativa responde 409', async () => {
    const { identityId, token } = await register();
    await app.inject({ method: 'GET', url: `/api/v1/identities/verify-email?token=${token}` });

    const resend = await app.inject({
      method: 'POST',
      url: `/api/v1/identities/${identityId}/verify-email`,
    });
    expect(resend.statusCode).toBe(409);
  });
});
