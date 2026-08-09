/**
 * E2E do Módulo 3 (VRF) — fluxo completo de verificação documental:
 * criar → evidências (multipart) → review (admin) → aprovar → consultar.
 * Requer TEST_DATABASE_URL. Storage em memória (setup-env limpa SUPABASE_URL).
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
import { identities, outboxEvents, trustPassports } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function multipartBody(fields: Record<string, string>, fileName: string, fileContent: Buffer) {
  const boundary = `----trustboundary${Date.now()}`;
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

describe.runIf(Boolean(testDatabaseUrl))('VRF-001..006 — Verification e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createUser(admin = false): Promise<{ identityId: string; accessToken: string }> {
    const email = `vrf-${uuidv7()}@e2e.trustplatform.test`;
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
    };
  }

  async function waitForPassport(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 20000) {
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
    throw new Error('Passport não criado a tempo');
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

  it('fluxo completo: criar → 2 evidências → review admin → aprovar → consultar', async () => {
    const user = await createUser();
    const admin = await createUser(true);
    await waitForPassport(user.identityId);

    // VRF-001
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { type: 'DOCUMENT' },
    });
    expect(created.statusCode).toBe(201);
    const { verificationId } = created.json<{ data: { verificationId: string } }>().data;

    // duplicada → 409 (BR-003)
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { type: 'DOCUMENT' },
    });
    expect(duplicate.statusCode).toBe(409);

    // VRF-002: primeira evidência mantém WAITING; segunda completa → PENDING_REVIEW
    const first = await uploadEvidence(user.accessToken, verificationId, 'DOCUMENT_FRONT');
    expect(first.statusCode).toBe(201);
    expect(first.json<{ data: { status: string } }>().data.status).toBe('WAITING_FOR_EVIDENCE');

    const second = await uploadEvidence(user.accessToken, verificationId, 'DOCUMENT_BACK');
    expect(second.statusCode).toBe(201);
    expect(second.json<{ data: { status: string } }>().data.status).toBe('PENDING_REVIEW');

    // VRF-003: usuário comum → 403; admin → 201 IN_REVIEW
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/review`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { reviewType: 'MANUAL' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json<{ error: { code: string } }>().error.code).toBe('ADMIN_REQUIRED');

    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/review`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { reviewType: 'MANUAL' },
    });
    expect(review.statusCode).toBe(201);
    expect(review.json<{ data: { status: string } }>().data.status).toBe('IN_REVIEW');

    // VRF-004: aprovar
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/approve`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { comments: 'Documento válido.' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json<{ data: { status: string } }>().data.status).toBe('APPROVED');

    // decisão irreversível → segunda decisão 409
    const rejectAfter = await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/reject`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { reasonCode: 'OTHER' },
    });
    expect(rejectAfter.statusCode).toBe(409);

    // eventos publicados
    const eventNames = await db
      .select()
      .from(outboxEvents)
      .then((rows) =>
        rows
          .filter(
            (event) =>
              (event.payload as { verificationId?: string }).verificationId === verificationId,
          )
          .map((event) => event.eventName)
          .sort(),
      );
    expect(eventNames).toEqual([
      'Verification.Approved',
      'Verification.Created',
      'Verification.EvidenceSubmitted',
      'Verification.ReviewCompleted',
      'Verification.ReviewStarted',
    ]);

    // TPS-004: aprovação propaga para o Passport (documentVerified + completude 50)
    {
      const startedAt = Date.now();
      let synced = false;
      while (Date.now() - startedAt < 20000 && !synced) {
        await relay.tick();
        const [passport] = await db
          .select()
          .from(trustPassports)
          .where(eq(trustPassports.identityId, user.identityId));
        if (passport?.documentVerified) {
          expect(Number(passport.profileCompletion)).toBe(50);
          synced = true;
        } else {
          await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
        }
      }
      expect(synced).toBe(true);
    }

    // TRS: pontuação automática — Passport.Created (+25) + DOCUMENT aprovado (+150) = 175 BRONZE
    {
      const startedAt = Date.now();
      let scored = false;
      while (Date.now() - startedAt < 20000 && !scored) {
        await relay.tick();
        const me = await app.inject({
          method: 'GET',
          url: '/api/v1/trust-scores/me',
          headers: { authorization: `Bearer ${user.accessToken}` },
        });
        if (me.statusCode === 200) {
          const data = me.json<{ data: { score: number; level: string } }>().data;
          if (data.score === 175) {
            expect(data.level).toBe('BRONZE');
            scored = true;
          }
        }
        if (!scored) {
          await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
        }
      }
      expect(scored).toBe(true);

      // timeline explicável (TRS-006)
      const timeline = await app.inject({
        method: 'GET',
        url: '/api/v1/trust-scores/me/timeline',
        headers: { authorization: `Bearer ${user.accessToken}` },
      });
      expect(timeline.statusCode).toBe(200);
      const body = timeline.json<{
        data: Array<{ eventName: string; points: number }>;
        pagination: { totalItems: number };
      }>();
      expect(body.pagination.totalItems).toBe(2);
      expect(body.data.map((e) => e.points).sort((a, b) => a - b)).toEqual([25, 150]);
    }

    // VRF-006: dono consulta com review/decisão/evidências (só metadados)
    const details = await app.inject({
      method: 'GET',
      url: `/api/v1/verifications/${verificationId}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(details.statusCode).toBe(200);
    const data = details.json<{
      data: {
        status: string;
        review: { status: string };
        decision: { decision: string };
        evidences: Array<{ type: string }>;
      };
    }>().data;
    expect(data.status).toBe('APPROVED');
    expect(data.review.status).toBe('COMPLETED');
    expect(data.decision.decision).toBe('APPROVED');
    expect(data.evidences.map((e) => e.type).sort()).toEqual([
      'DOCUMENT_BACK',
      'DOCUMENT_FRONT',
    ]);
  });

  it('regras de acesso e validação: terceiro não vê (403), tipo de evidência errado (422)', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await waitForPassport(owner.identityId);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { type: 'ADDRESS' },
    });
    const { verificationId } = created.json<{ data: { verificationId: string } }>().data;

    // evidência de tipo não requerido → 422
    const wrongType = await uploadEvidence(owner.accessToken, verificationId, 'SELFIE');
    expect(wrongType.statusCode).toBe(422);
    expect(wrongType.json<{ error: { code: string } }>().error.code).toBe(
      'EVIDENCE_TYPE_NOT_REQUIRED',
    );

    // terceiro não consulta (403) nem envia evidência
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/verifications/${verificationId}`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });
    expect(denied.statusCode).toBe(403);

    const deniedUpload = await uploadEvidence(stranger.accessToken, verificationId, 'PROOF_OF_ADDRESS');
    expect(deniedUpload.statusCode).toBe(403);

    // tipo de verificação não suportado → 400 (enum do request)
    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { type: 'PHONE' },
    });
    expect(unsupported.statusCode).toBe(400);
  });
});
