/**
 * E2E do IDN-001 — Create Identity. Requer TEST_DATABASE_URL (ver module0.e2e).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { auditLogs, identities } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function uniqueEmail(): string {
  return `idn001-${uuidv7()}@e2e.trustplatform.test`;
}

function validBody(email: string) {
  return {
    fullName: 'Maria Silva',
    email,
    password: 'Correct#Horse7Battery',
    confirmPassword: 'Correct#Horse7Battery',
    acceptTerms: true,
  };
}

describe.runIf(Boolean(testDatabaseUrl))('IDN-001 — Create Identity e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;

  beforeAll(async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.JWT_PRIVATE_KEY = Buffer.from(
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
    ).toString('base64');
    process.env.JWT_PUBLIC_KEY = Buffer.from(
      publicKey.export({ type: 'spki', format: 'pem' }),
    ).toString('base64');
    process.env.OUTBOX_POLL_INTERVAL_MS = '60000';

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
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /api/v1/identities cria Identity (201) com envelope e status PENDING_EMAIL_VERIFICATION', async () => {
    const email = uniqueEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: validBody(email),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      success: boolean;
      data: { identityId: string; status: string };
    }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('PENDING_EMAIL_VERIFICATION');

    // Senha só como hash Argon2id no banco (BR-002/003)
    const [row] = await db.select().from(identities).where(eq(identities.email, email));
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toContain('Correct#Horse7Battery');

    // Auditoria gravada (trust-security: criação de Identity é auditada)
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.identityId, body.data.identityId));
    expect(audit?.operation).toBe('CreateIdentity');
    expect(audit?.result).toBe('SUCCESS');
  });

  it('e-mail duplicado responde 409 EMAIL_ALREADY_EXISTS sem criar segunda Identity (BR-001/006)', async () => {
    const email = uniqueEmail();
    await app.inject({ method: 'POST', url: '/api/v1/identities', payload: validBody(email) });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: validBody(email),
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('EMAIL_ALREADY_EXISTS');

    const rows = await db.select().from(identities).where(eq(identities.email, email));
    expect(rows).toHaveLength(1);
  });

  it('senha fraca responde 400 VALIDATION_ERROR com details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { ...validBody(uniqueEmail()), password: 'weak', confirmPassword: 'weak' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      success: boolean;
      error: { code: string; details: Array<{ path: string }> };
    }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.some((d) => d.path === 'password')).toBe(true);
  });

  it('termos não aceitos respondem 400 (BR-005)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { ...validBody(uniqueEmail()), acceptTerms: false },
    });
    expect(response.statusCode).toBe(400);
  });
});
