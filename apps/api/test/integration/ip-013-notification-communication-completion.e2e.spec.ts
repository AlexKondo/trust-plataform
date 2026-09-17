/**
 * E2E da IP-013 — Notification & Communication Completion.
 *
 * Fecha os gaps de notificação autorreportados pelas IPs anteriores:
 * - IP-003 §7: "nenhum consumer novo foi adicionado (notificação ao Member/
 *   Partner é escopo do IP-013)" — `ServiceRequestEngagement.Created`.
 * - docs/event-catalog.md (antes desta IP): `Payment.AuthorizationFailed`,
 *   `PaymentIncrementalAuthorization.Approved/.Failed` e `Funds.Released`
 *   listavam "nenhum consumidor hoje"/"nenhum externo hoje".
 * - Segurança de conta: `Identity.PasswordChanged` também não tinha consumer.
 *
 * Cada teste prova, de ponta a ponta (outbox → relay → consumer → tabela
 * `notifications`), que o destinatário CERTO recebe o aviso — nunca o autor
 * do próprio ato — e que o novo par channel/deliveryStatus (IN_APP/DELIVERED)
 * aparece na resposta da API.
 *
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
import { payments, trustCustodies, trustScores } from '../../src/shared/database/schema';

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
  channel: string;
  deliveryStatus: string;
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-013 — Notification & Communication Completion e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip013-${uuidv7()}@e2e.trustplatform.test`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/identities',
      payload: { fullName, email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true },
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
      await relay.drainOnce();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score?.score === expected) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Score não chegou a ${expected}`);
  }

  async function listNotifications(user: TestUser): Promise<NotificationItem[]> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: user.auth,
    });
    return response.json<{ data: NotificationItem[] }>().data;
  }

  /** Espera até que exista um aviso do tipo informado para o usuário. */
  async function waitForNotification(user: TestUser, type: string): Promise<NotificationItem> {
    const startedAt = Date.now();
    let seen: string[] = [];
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const items = await listNotifications(user);
      seen = items.map((item) => item.type);
      const found = items.find((item) => item.type === type);
      if (found) {
        return found;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error(`Notificação ${type} não chegou (recebidas: ${seen.join(', ') || 'nenhuma'})`);
  }

  /** Anúncio publicado + oferta FIXED_PRICE aceita → Payment criado. */
  async function acceptedFixedPriceContract(
    names: [string, string],
    amount: number,
  ): Promise<{ orderId: string; paymentId: string; seller: TestUser; buyer: TestUser }> {
    const seller = await createActiveUser(names[0]);
    const buyer = await createActiveUser(names[1]);
    await waitForScore(seller.identityId, 25);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de ar-condicionado split',
        description: 'Instalação completa com garantia de 12 meses.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: amount,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Preciso instalar um ar-condicionado, você atende?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount, quantity: 1, expiresAt: inHours(48) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      if (row) {
        return { orderId, paymentId: row.id, seller, buyer };
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Payment não foi criado');
  }

  /** Contrato HOURLY, autorizado e em execução (IN_PROGRESS) — baseline do IP-007. */
  async function hourlyContractInProgress(
    names: [string, string],
    hourlyRate = 150,
  ): Promise<{ orderId: string; paymentId: string; seller: TestUser; buyer: TestUser }> {
    const seller = await createActiveUser(names[0]);
    const buyer = await createActiveUser(names[1]);
    await waitForScore(seller.identityId, 25);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Manutenção elétrica residencial',
        description: 'Diagnóstico e reparo de instalações elétricas.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: hourlyRate,
        currency: 'BRL',
      },
    });
    const listingId = created.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Preciso de um eletricista.' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: {
        quantity: 1,
        expiresAt: inHours(48),
        pricingModel: 'HOURLY',
        hourlyRateAmount: hourlyRate,
        minimumMinutes: 60,
      },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    const orderId = accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId;

    const paymentRow = await (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 40000) {
        await relay.drainOnce();
        const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
        if (row) {
          return row;
        }
        await new Promise((sleep) => setTimeout(sleep, 500));
      }
      throw new Error('Payment não foi criado');
    })();

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);

    // A custódia nasce de forma assíncrona (Payment.Authorized → pay.hold-funds);
    // agendar/iniciar sem esperar por ela faz a liberação, no fim, não achar
    // fundos para soltar (mesmo cuidado do helper equivalente em IP-007).
    await (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 40000) {
        await relay.drainOnce();
        const [custody] = await db
          .select()
          .from(trustCustodies)
          .where(eq(trustCustodies.orderId, orderId));
        if (custody?.status === 'IN_CUSTODY') {
          return;
        }
        await new Promise((sleep) => setTimeout(sleep, 500));
      }
      throw new Error('Custódia não chegou a IN_CUSTODY');
    })();

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(1), estimatedDuration: 60 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });

    return { orderId, paymentId: paymentRow.id, seller, buyer };
  }

  async function proposeAndApproveScopeChange(
    contract: { orderId: string; seller: TestUser; buyer: TestUser },
    serviceDeltaAmount: number,
  ): Promise<void> {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/change-orders`,
      headers: contract.seller.auth,
      payload: {
        type: 'SCOPE_CHANGE',
        serviceDeltaAmount,
        reason: 'Cliente pediu escopo adicional durante o atendimento.',
      },
    });
    expect(created.statusCode).toBe(201);
    const changeOrderId = created.json<{ data: { changeOrderId: string } }>().data.changeOrderId;
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/submit`,
      headers: contract.seller.auth,
    });
    expect(submitted.statusCode).toBe(200);
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
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

  it('engajar um pedido de serviço avisa o Partner com contexto do pedido — nunca o Member que engajou', async () => {
    const member = await createActiveUser('Camila Ferreira Lopes');
    await waitForScore(member.identityId, 25);
    const partner = await createActiveUser('Diego Ramalho Costa');
    await waitForScore(partner.identityId, 25);

    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: partner.auth,
      payload: { title: 'Encanador residencial' },
    });
    const listingId = draft.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: partner.auth,
      payload: {
        description: 'Reparos hidráulicos com garantia de 90 dias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 120,
        currency: 'BRL',
        location: 'Pinheiros, São Paulo/SP',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: partner.auth,
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Vazamento no banheiro',
        description: 'Torneira do banheiro vazando há dois dias.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Pinheiros, São Paulo/SP',
        urgency: 'ASAP',
      },
    });
    expect(created.statusCode).toBe(201);
    const serviceRequestId = created.json<{ data: { serviceRequestId: string } }>().data.serviceRequestId;

    const engage = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: member.auth,
      payload: { listingId, message: 'Olá! Você consegue vir hoje?' },
    });
    expect(engage.statusCode).toBe(201);

    const notice = await waitForNotification(partner, 'SERVICE_REQUEST_ENGAGEMENT_RECEIVED');
    expect(notice.resourceType).toBe('ServiceRequestEngagement');
    expect(notice.resourceId).toBe(serviceRequestId);
    expect(notice.read).toBe(false);
    // provider-ready: canal/status de entrega aparecem na resposta.
    expect(notice.channel).toBe('IN_APP');
    expect(notice.deliveryStatus).toBe('DELIVERED');

    // O Member (autor do engajamento) não recebe este aviso sobre si mesmo.
    expect((await listNotifications(member)).map((item) => item.type)).not.toContain(
      'SERVICE_REQUEST_ENGAGEMENT_RECEIVED',
    );
  });

  it('pagamento recusado pelo sandbox avisa o comprador para tentar de novo', async () => {
    const { paymentId, buyer } = await acceptedFixedPriceContract(
      ['Otávio Lemos Barreto', 'Juliana Prado Martins'],
      440.13, // sandbox: centavos terminados em 13 → DECLINED
    );

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json<{ data: { authorized: boolean } }>().data.authorized).toBe(false);

    const notice = await waitForNotification(buyer, 'PAYMENT_AUTHORIZATION_FAILED');
    expect(notice.resourceType).toBe('MarketplaceOrder');
  });

  it('mudança comercial aprovada: cobrança adicional autorizada avisa o comprador; recusada também avisa', async () => {
    const contract = await hourlyContractInProgress(['Fernanda Duarte Rocha', 'Henrique Salles Teixeira']);

    await proposeAndApproveScopeChange(contract, 60); // valor comum → APPROVED
    const approvedNotice = await waitForNotification(contract.buyer, 'INCREMENTAL_PAYMENT_APPROVED');
    expect(approvedNotice.resourceType).toBe('MarketplaceOrder');
    expect(approvedNotice.resourceId).toBe(contract.orderId);

    await proposeAndApproveScopeChange(contract, 40.13); // sandbox: termina em 13 → DECLINED
    const failedNotice = await waitForNotification(contract.buyer, 'INCREMENTAL_PAYMENT_FAILED');
    expect(failedNotice.resourceType).toBe('MarketplaceOrder');

    // O vendedor (que propôs a mudança) não recebe este aviso de PAGAMENTO —
    // ele já é avisado separadamente por CHANGE_ORDER_APPROVED (NTF-001 pré-existente).
    expect((await listNotifications(contract.seller)).map((item) => item.type)).not.toContain(
      'INCREMENTAL_PAYMENT_APPROVED',
    );
  });

  it('liberação de fundos após confirmação do cliente avisa o prestador', async () => {
    const contract = await hourlyContractInProgress(['Roberta Andrade Galvão', 'Vinicius Moraes Cunha']);

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/complete`,
      headers: contract.seller.auth,
      payload: {},
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${contract.orderId}/confirm-completion`,
      headers: contract.buyer.auth,
      payload: {},
    });
    expect(confirmed.statusCode).toBe(200);

    const notice = await waitForNotification(contract.seller, 'FUNDS_RELEASED');
    expect(notice.resourceType).toBe('MarketplaceOrder');

    // O comprador não recebe aviso de "pagamento liberado" (é o vendedor que recebe o dinheiro).
    expect((await listNotifications(contract.buyer)).map((item) => item.type)).not.toContain(
      'FUNDS_RELEASED',
    );
  });

  it('troca de senha avisa o titular da conta, por segurança', async () => {
    const user = await createActiveUser('Simone Barbosa Freitas');
    await waitForScore(user.identityId, 25);

    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: user.auth,
      payload: { currentPassword: PASSWORD, newPassword: 'NewCorrect#Horse9Battery' },
    });
    expect(changed.statusCode).toBe(204);

    const notice = await waitForNotification(user, 'PASSWORD_CHANGED');
    expect(notice.resourceType).toBe('Identity');
    expect(notice.channel).toBe('IN_APP');
    expect(notice.deliveryStatus).toBe('DELIVERED');
  });
});
