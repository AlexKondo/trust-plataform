/**
 * E2E do IP-012 (Growth) — cobre o que ficou DEAD CODE no Quality Gate
 * (finding #1): o fio completo cadastro→atribuição de referral e
 * verificação(KYC) aprovada→confirmação, mais o failure path (código
 * desconhecido nunca bloqueia o cadastro). Self-referral e reuso de código
 * (one-time-use) já são cobertos e reasoned-through no nível de
 * domínio/repositório (`referral.spec.ts`, `referral.usecases.spec.ts`) —
 * este arquivo cobre apenas os dois caminhos que só existem de ponta a
 * ponta pela API real, que era exatamente a lacuna apontada.
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
import { identities, trustPassports } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function multipartBody(fields: Record<string, string>, fileName: string, fileContent: Buffer) {
  const boundary = `----trustboundary${Date.now()}${Math.random()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
  );
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe.runIf(Boolean(testDatabaseUrl))('IP-012 — Growth (Referral) e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  /** Signs up, verifies the email, and logs in — returns the real email + token. */
  async function createVerifiedUser(
    admin = false,
    referralCode?: string,
  ): Promise<{ identityId: string; accessToken: string; email: string }> {
    const email = `ip012-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName: 'Maria Silva',
        email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acceptTerms: true,
        ...(referralCode ? { referralCode } : {}),
      },
    });
    expect(created.statusCode).toBe(201);
    const { identityId } = created.json<{ data: { identityId: string } }>().data;

    const token = new URL(emailService.lastSent!.verificationUrl).searchParams.get('token')!;
    const verify = await app.inject({ method: 'GET', url: `/api/v1/identities/verify-email?token=${token}` });
    expect(verify.statusCode).toBe(200);

    if (admin) {
      await db.update(identities).set({ isAdmin: true }).where(eq(identities.id, identityId));
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    return {
      identityId,
      accessToken: login.json<{ data: { accessToken: string } }>().data.accessToken,
      email,
    };
  }

  function uploadEvidence(accessToken: string, verificationId: string, type: string) {
    const { payload, contentType } = multipartBody({ type }, 'doc.png', PNG);
    return app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/evidence`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': contentType },
      payload,
    });
  }

  /** Runs a real DOCUMENT verification through to APPROVED (VRF-001..004). */
  async function approveKyc(accessToken: string, adminToken: string): Promise<void> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: 'DOCUMENT' },
    });
    const { verificationId } = created.json<{ data: { verificationId: string } }>().data;
    await uploadEvidence(accessToken, verificationId, 'DOCUMENT_FRONT');
    await uploadEvidence(accessToken, verificationId, 'DOCUMENT_BACK');
    await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reviewType: 'MANUAL' },
    });
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { comments: 'ok' },
    });
    expect(approved.statusCode).toBe(200);
  }

  /** A verification needs a Trust Passport, which is created async off `Identity.Created` (TPS-001). */
  async function waitForPassport(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const [row] = await db
        .select({ id: trustPassports.id })
        .from(trustPassports)
        .where(eq(trustPassports.identityId, identityId));
      if (row) {
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Passport não criado a tempo');
  }

  async function myReferralStats(accessToken: string): Promise<number> {
    const stats = await app.inject({
      method: 'GET',
      url: '/api/v1/growth/referral/me/stats',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    return stats.json<{ data: { confirmedReferrals: number } }>().data.confirmedReferrals;
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

  it('happy path: signup with a real referral code attributes the referral, and KYC approval confirms it (Quality Gate finding #1)', async () => {
    const referrer = await createVerifiedUser();
    const admin = await createVerifiedUser(true);

    const codeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/growth/referral/me/code',
      headers: { authorization: `Bearer ${referrer.accessToken}` },
    });
    expect(codeRes.statusCode).toBe(201);
    const { code } = codeRes.json<{ data: { code: string } }>().data;
    expect(code).toMatch(/^[A-Z0-9]{6,12}$/);

    // Requesting again returns the SAME code — 1:1 per Identity.
    const codeAgain = await app.inject({
      method: 'POST',
      url: '/api/v1/growth/referral/me/code',
      headers: { authorization: `Bearer ${referrer.accessToken}` },
    });
    expect(codeAgain.json<{ data: { code: string } }>().data.code).toBe(code);

    // Signup wiring under test: the DTO carries `referralCode`, which
    // CreateIdentityUseCase now forwards to AttributeReferralUseCase for
    // real — this path was dead code before the fix.
    const referred = await createVerifiedUser(false, code);
    await waitForPassport(referred.identityId);

    // PENDING right after signup — not counted yet (KYC not done).
    expect(await myReferralStats(referrer.accessToken)).toBe(0);

    // Real KYC flow for the referred Identity → Verification.Approved is
    // published (pre-existing VRF event, untouched) → the new
    // VerificationApprovedReferralConfirmationConsumer (async, via outbox)
    // promotes the attribution PENDING → CONFIRMED.
    await approveKyc(referred.accessToken, admin.accessToken);

    const startedAt = Date.now();
    let confirmed = 0;
    while (Date.now() - startedAt < 40000 && confirmed === 0) {
      await relay.drainOnce();
      confirmed = await myReferralStats(referrer.accessToken);
      if (confirmed === 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    expect(confirmed).toBe(1);
  }, 60000);

  it('failure path: an unknown referral code never blocks signup (best-effort, non-blocking)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName: 'Joao Souza',
        email: `ip012-badcode-${uuidv7()}@e2e.trustplatform.test`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        acceptTerms: true,
        referralCode: 'ZZZZZZ99',
      },
    });
    expect(response.statusCode).toBe(201);
  });
});
