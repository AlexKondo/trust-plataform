/**
 * E2E das notificações (NTF-001): eventos de domínio viram avisos in-app para
 * a pessoa certa — e nunca para quem já sabia do fato.
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
import { trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

interface NotificationItem {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  read: boolean;
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('NTF-001 — Notificações e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ntf-${uuidv7()}@e2e.trustplatform.test`;
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
    const accessToken = login.json<{ data: { accessToken: string } }>().data.accessToken;
    return { identityId, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function waitForScore(identityId: string, expected: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score?.score === expected) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Score não chegou a ${expected}`);
  }

  /** Espera até que exista um aviso do tipo informado para o usuário. */
  async function waitForNotification(user: TestUser, type: string): Promise<NotificationItem> {
    const startedAt = Date.now();
    let seen: string[] = [];
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: user.auth,
      });
      const items = response.json<{ data: NotificationItem[] }>().data;
      seen = items.map((item) => item.type);
      const found = items.find((item) => item.type === type);
      if (found) {
        return found;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Notificação ${type} não chegou (recebidas: ${seen.join(', ') || 'nenhuma'})`);
  }

  async function listNotifications(user: TestUser): Promise<NotificationItem[]> {
    await relay.tick();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: user.auth,
    });
    return response.json<{ data: NotificationItem[] }>().data;
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

  it('mensagem e proposta avisam o destinatário — e não quem enviou', async () => {
    const seller = await createActiveUser('Sergio Almeida Prado');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Tatiana Ribeiro Cunha');

    // Anúncio publicado
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Conserto de eletrodomésticos a domicílio',
        description: 'Conserto de máquina de lavar, geladeira e micro-ondas com garantia.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 250,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });

    // O comprador manda a primeira mensagem → o vendedor é avisado
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Minha geladeira parou de gelar, você atende hoje?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;

    const messageNotice = await waitForNotification(seller, 'MESSAGE_RECEIVED');
    expect(messageNotice.resourceType).toBe('MarketplaceConversation');
    expect(messageNotice.resourceId).toBe(conversationId);
    expect(messageNotice.read).toBe(false);

    // Quem enviou não recebe aviso da própria mensagem
    expect((await listNotifications(buyer)).map((item) => item.type)).not.toContain(
      'MESSAGE_RECEIVED',
    );

    // Proposta do comprador → vendedor avisado, com o valor no texto
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 220, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;

    const offerNotice = await waitForNotification(seller, 'OFFER_RECEIVED');
    expect(offerNotice.body).toContain('220');

    // Aceite → quem é avisado é o comprador (o vendedor decidiu, já sabe)
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const acceptNotice = await waitForNotification(buyer, 'OFFER_ACCEPTED');
    expect(acceptNotice.resourceType).toBe('MarketplaceOrder');
    expect((await listNotifications(seller)).map((item) => item.type)).not.toContain(
      'OFFER_ACCEPTED',
    );
  });

  it('contador de não lidas, marcar uma e marcar todas', async () => {
    const seller = await createActiveUser('Marcos Vieira Duarte');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Aline Souza Batista');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Jardinagem e poda de árvores',
        description: 'Poda, corte de grama e manutenção de jardim residencial.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 180,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Quanto fica para podar duas árvores grandes?' },
    });

    const notice = await waitForNotification(seller, 'MESSAGE_RECEIVED');

    const beforeCount = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: seller.auth,
    });
    expect(beforeCount.json<{ data: { unread: number } }>().data.unread).toBeGreaterThan(0);

    // Marcar como lida some do filtro de não lidas
    const read = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${notice.notificationId}/read`,
      headers: seller.auth,
    });
    expect(read.statusCode).toBe(200);

    const unreadOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?onlyUnread=true',
      headers: seller.auth,
    });
    expect(
      unreadOnly.json<{ data: NotificationItem[] }>().data.map((item) => item.notificationId),
    ).not.toContain(notice.notificationId);

    // Marcar a mesma de novo é 404 (já lida)
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${notice.notificationId}/read`,
      headers: seller.auth,
    });
    expect(again.statusCode).toBe(404);

    // Ninguém marca notificação de outra pessoa
    const foreign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${notice.notificationId}/read`,
      headers: buyer.auth,
    });
    expect(foreign.statusCode).toBe(404);

    await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/read-all',
      headers: seller.auth,
    });
    const afterCount = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unread-count',
      headers: seller.auth,
    });
    expect(afterCount.json<{ data: { unread: number } }>().data.unread).toBe(0);
  });

  it('verificação aprovada avisa o titular', async () => {
    const user = await createActiveUser('Rafael Nogueira Pires');
    await waitForScore(user.identityId, 25);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/verifications',
      headers: user.auth,
      payload: { type: 'BANK_ACCOUNT' },
    });
    const verificationId = created.json<{ data: { verificationId: string } }>().data.verificationId;

    await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/evidence`,
      headers: user.auth,
      payload: (() => {
        const form = new FormData();
        form.append('type', 'BANK_STATEMENT');
        form.append('file', new Blob([Buffer.from('comprovante')], { type: 'image/png' }), 'x.png');
        return form;
      })(),
    });

    // Concede admin ao próprio usuário para fechar o ciclo dentro do teste
    await db.execute(
      `update identities set is_admin = true where id = '${user.identityId}'` as never,
    );
    await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/review`,
      headers: user.auth,
      payload: { reviewType: 'MANUAL' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/verifications/${verificationId}/approve`,
      headers: user.auth,
      payload: {},
    });

    const notice = await waitForNotification(user, 'VERIFICATION_APPROVED');
    expect(notice.body).toContain('conta bancária');
    expect(notice.resourceId).toBe(verificationId);
  });
});
