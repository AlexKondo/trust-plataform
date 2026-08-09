/**
 * E2E do Módulo 5 (TRS reputação pública, TRS-012..020):
 * badge automático → perfil consolidado → visibilidade → share HMAC →
 * acesso público → verificação de autenticidade → histórico → revogação.
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
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import { awardedBadges, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

describe.runIf(Boolean(testDatabaseUrl))('TRS-012..020 — Reputação pública e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(): Promise<{ identityId: string; accessToken: string }> {
    const email = `rep-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: {
        fullName: 'Maria Silva Santos',
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

  /** Espera o pipeline: score 25 registrado E badge TRUSTED_MEMBER concedido. */
  async function waitForBadge(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score) {
        const awards = await db
          .select()
          .from(awardedBadges)
          .where(eq(awardedBadges.trustPassportId, score.trustPassportId));
        if (awards.length > 0) {
          return;
        }
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    throw new Error('Badge não concedido dentro do timeout');
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

  it('fluxo completo: badge automático → perfil → visibilidade → share → público → verify → histórico → revogar', async () => {
    const user = await createActiveUser();
    await waitForBadge(user.identityId);
    const auth = { authorization: `Bearer ${user.accessToken}` };

    // TRS-014: badge TRUSTED_MEMBER concedido automaticamente (score 25)
    const myBadges = await app.inject({ method: 'GET', url: '/api/v1/trust-badges/me', headers: auth });
    expect(myBadges.statusCode).toBe(200);
    const badgeCodes = myBadges.json<{ data: Array<{ code: string }> }>().data.map((b) => b.code);
    expect(badgeCodes).toContain('TRUSTED_MEMBER');
    expect(badgeCodes).not.toContain('GOLD_TIER');

    // TRS-015 (privado): perfil completo com nome inteiro e score
    const privateProfile = await app.inject({ method: 'GET', url: '/api/v1/trust-profile/me', headers: auth });
    expect(privateProfile.statusCode).toBe(200);
    const priv = privateProfile.json<{ data: { displayName: string; score: number; level: string } }>().data;
    expect(priv.displayName).toBe('Maria Silva Santos');
    expect(priv.score).toBe(25);
    expect(priv.level).toBe('BRONZE');

    // TRS-016: esconder o score público
    const vis = await app.inject({
      method: 'PUT',
      url: '/api/v1/trust-profile/visibility',
      headers: auth,
      payload: { showScore: false, showLevel: true, showBadges: true, showVerifications: true },
    });
    expect(vis.statusCode).toBe(200);

    // TRS-017: criar link compartilhável
    const share = await app.inject({
      method: 'POST',
      url: '/api/v1/trust-profile/shares',
      headers: auth,
      payload: { expiresInDays: 7 },
    });
    expect(share.statusCode).toBe(201);
    const { shareId, shareUrl } = share.json<{ data: { shareId: string; shareUrl: string } }>().data;
    const token = shareUrl.split('/p/')[1]!;

    // Visão pública: nome abreviado, SEM score (política), com nível e badges
    const publicProfile = await app.inject({ method: 'GET', url: `/api/v1/public/trust-profile/${token}` });
    expect(publicProfile.statusCode).toBe(200);
    const pub = publicProfile.json<{
      data: { displayName: string; score: number | null; level: string; badges: Array<{ code: string }> };
    }>().data;
    expect(pub.displayName).toBe('Maria S.');
    expect(pub.score).toBeNull();
    expect(pub.level).toBe('BRONZE');
    expect(pub.badges.map((b) => b.code)).toContain('TRUSTED_MEMBER');

    // TRS-018: verificação de autenticidade (HMAC)
    const verify = await app.inject({ method: 'GET', url: `/api/v1/public/trust-profile/${token}/verify` });
    expect(verify.json<{ data: { authentic: boolean } }>().data.authentic).toBe(true);

    // token forjado: assinatura inválida
    const forged = await app.inject({
      method: 'GET',
      url: `/api/v1/public/trust-profile/${token.slice(0, -4)}XXXX/verify`,
    });
    expect(forged.json<{ data: { authentic: boolean; reason: string } }>().data).toMatchObject({
      authentic: false,
    });

    // TRS-020: o acesso público ficou registrado
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/trust-profile/shares/${shareId}/access-history`,
      headers: auth,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json<{ pagination: { totalItems: number } }>().pagination.totalItems).toBe(1);

    // TRS-019: revogar → público passa a responder 410 GONE
    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trust-profile/shares/${shareId}`,
      headers: auth,
    });
    expect(revoke.statusCode).toBe(204);

    const afterRevoke = await app.inject({ method: 'GET', url: `/api/v1/public/trust-profile/${token}` });
    expect(afterRevoke.statusCode).toBe(410);
    expect(afterRevoke.json<{ error: { code: string } }>().error.code).toBe('SHARE_LINK_GONE');

    const verifyRevoked = await app.inject({ method: 'GET', url: `/api/v1/public/trust-profile/${token}/verify` });
    expect(verifyRevoked.json<{ data: { authentic: boolean; reason: string } }>().data).toEqual({
      authentic: false,
      reason: 'REVOKED',
    });

    // lista de shares mostra o status
    const shares = await app.inject({ method: 'GET', url: '/api/v1/trust-profile/shares', headers: auth });
    expect(shares.json<{ data: Array<{ status: string }> }>().data[0]?.status).toBe('REVOKED');
  });
});
