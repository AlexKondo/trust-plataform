/**
 * E2E do IP-021 (Privacy, LGPD & Data Lifecycle):
 * - POST /privacy/requests {type: DATA_EXPORT} devolve um retrato dos dados
 *   do próprio titular (não persiste o payload — só um resumo de contagens).
 * - POST /privacy/requests {type: DATA_DELETION} anonimiza `identities` +
 *   `trust_passports`, revoga sessões, e a conta some de login/consulta.
 * - Uma Identity com pedido NÃO-terminal (comprador OU vendedor) tem a
 *   exclusão REJEITADA (código estável, não texto livre) — nada é mutado.
 * - Autenticação é obrigatória (401 sem token).
 * - Regressão do TOCTOU (Diff Review §6, finding #1, BLOCKING): um pedido
 *   concorrente criado bem no instante em que a exclusão está prestes a
 *   checar elegibilidade não passa despercebido — a checagem autoritativa
 *   roda DENTRO da transação de anonimização, então vê o pedido novo e
 *   bloqueia a exclusão.
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/main';
import { EmailService } from '../../src/modules/identity/domain/services/email.service';
import { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';
import { TrustPassportRepository } from '../../src/modules/trust-passport/domain/repositories/trust-passport.repository';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { identities, sessions, trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  email: string;
  auth: { authorization: string };
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-021 — Privacidade, LGPD e ciclo de vida do dado e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip021-${uuidv7()}@e2e.trustplatform.test`;
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
    return { identityId, email, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function waitForScore(identityId: string, minimum: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score && score.score >= minimum) {
        return;
      }
      await new Promise((sleepDone) => setTimeout(sleepDone, 500));
    }
    throw new Error(`Score não atingiu ${minimum}`);
  }

  /** Anúncio publicado → conversa → proposta → aceite. Devolve o pedido criado, ainda em CREATED (não-terminal). */
  async function createNonTerminalOrder(seller: TestUser, buyer: TestUser): Promise<{ orderId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de ar-condicionado split',
        description: 'Instalação completa com teste de gás e dreno em até 2 dias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 900,
        currency: 'BRL',
        location: 'Campinas/SP',
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
      payload: { message: 'Consegue instalar neste fim de semana?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 850, quantity: 1, expiresAt: inHours(72) },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    return { orderId: accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId };
  }

  /**
   * Igual ao começo de `createNonTerminalOrder`, mas PARA antes de aceitar a
   * proposta — devolve o `offerId` pronto para ser aceito sob demanda pelo
   * teste de regressão do TOCTOU, que precisa controlar exatamente QUANDO o
   * pedido concorrente é criado.
   */
  async function createPendingOffer(seller: TestUser, buyer: TestUser): Promise<{ offerId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Manutenção de portão eletrônico',
        description: 'Diagnóstico e reparo do motor em até 2 dias.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 600,
        currency: 'BRL',
        location: 'Sorocaba/SP',
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
      payload: { message: 'Consegue vir amanhã?' },
    });
    const conversationId = contact.json<{
      data: { conversation: { conversationId: string } };
    }>().data.conversation.conversationId;
    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 550, quantity: 1, expiresAt: inHours(72) },
    });
    return { offerId: offer.json<{ data: { offerId: string } }>().data.offerId };
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

  it('DATA_EXPORT devolve um retrato dos próprios dados, sem persistir o payload', async () => {
    const user = await createActiveUser('Fernanda Ribeiro Alves');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      headers: user.auth,
      payload: { type: 'DATA_EXPORT' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      data: { status: string; exportedData: { identity: { email: string; fullName: string } } };
    }>().data;
    expect(body.status).toBe('COMPLETED');
    expect(body.exportedData.identity.email).toBe(user.email);
    expect(body.exportedData.identity.fullName).toBe('Fernanda Ribeiro Alves');

    // O resumo de contagens é persistido; o payload exportado, não — a
    // listagem confirma que a entrada existe, mas não devolve exportedData.
    const list = await app.inject({ method: 'GET', url: '/api/v1/privacy/requests', headers: user.auth });
    const items = list.json<{ data: Array<{ type: string; status: string; exportedData?: unknown }> }>()
      .data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'DATA_EXPORT', status: 'COMPLETED' });
    expect(items[0]?.exportedData).toBeUndefined();
  });

  it('DATA_DELETION anonimiza a Identity, revoga sessões, e a conta some de login/consulta', async () => {
    const user = await createActiveUser('Marcelo Andrade Pires');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      headers: user.auth,
      payload: { type: 'DATA_DELETION' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { status: string } }>().data.status).toBe('COMPLETED');

    const [row] = await db.select().from(identities).where(eq(identities.id, user.identityId));
    expect(row?.fullName).toBe('Usuário anonimizado');
    expect(row?.email).not.toBe(user.email);
    expect(row?.email).toContain(user.identityId);
    expect(row?.deletedAt).not.toBeNull();

    const activeSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.identityId, user.identityId));
    expect(activeSessions.every((session) => session.revokedAt !== null)).toBe(true);

    // A conta anonimizada não é mais encontrável por e-mail original.
    const loginAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(loginAttempt.statusCode).toBe(401);

    // O token de acesso emitido ANTES da exclusão continua sintaticamente
    // válido (JWT stateless, mesmo trade-off pré-existente de qualquer
    // revogação nesta plataforma) — mas o usecase não encontra mais a
    // Identity (deleted_at filtrado) e retorna 404, não 200 com dado antigo.
    const meAfterDeletion = await app.inject({
      method: 'GET',
      url: '/api/v1/identities/me',
      headers: user.auth,
    });
    expect(meAfterDeletion.statusCode).toBe(404);
  });

  it('exclusão é REJEITADA (não mutada) enquanto o COMPRADOR tem um pedido não-terminal', async () => {
    const seller = await createActiveUser('Rogério Nunes Barbosa');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Patrícia Lopes Vieira');
    await createNonTerminalOrder(seller, buyer);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      headers: buyer.auth,
      payload: { type: 'DATA_DELETION' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { status: string; rejectionReason: string } }>().data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'ACTIVE_ORDERS',
    });

    const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: buyer.auth });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ data: { fullName: string } }>().data.fullName).toBe('Patrícia Lopes Vieira');
  });

  it('exclusão é REJEITADA enquanto o VENDEDOR tem um pedido não-terminal', async () => {
    const seller = await createActiveUser('Igor Castro Mendonça');
    await waitForScore(seller.identityId, 25);
    const buyer = await createActiveUser('Tatiane Souza Ramos');
    await createNonTerminalOrder(seller, buyer);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      headers: seller.auth,
      payload: { type: 'DATA_DELETION' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { status: string; rejectionReason: string } }>().data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'ACTIVE_ORDERS',
    });
  });

  it('exige autenticação (401 sem token)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      payload: { type: 'DATA_EXPORT' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('type inválido é rejeitado na borda (400)', async () => {
    const user = await createActiveUser('Vinícius Carvalho Teixeira');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/privacy/requests',
      headers: user.auth,
      payload: { type: 'NOT_A_TYPE' },
    });
    expect(response.statusCode).toBe(400);
  });

  it(
    'regressão TOCTOU (Diff Review §6): um pedido criado bem no instante em que a exclusão ' +
      'está prestes a checar elegibilidade NÃO passa despercebido — a Identity não é anonimizada',
    async () => {
      const seller = await createActiveUser('Heitor Gonçalves Farias');
      await waitForScore(seller.identityId, 25);
      const buyer = await createActiveUser('Camila Duarte Moraes');
      const { offerId } = await createPendingOffer(seller, buyer);

      // `RequestDataDeletionUseCase` lê o Trust Passport ANTES de abrir a
      // transação de anonimização, e só DEPOIS disso — já dentro da
      // transação — roda a checagem autoritativa de elegibilidade (ver o
      // comentário no próprio use case). Interceptar exatamente esta leitura
      // do passport para criar+comitar um pedido concorrente reproduz, de
      // forma determinística, a janela que a versão anterior deste código
      // deixava aberta: um pedido criado DEPOIS de qualquer checagem
      // anterior mas ANTES da mutação. Com a checagem movida para dentro da
      // transação, ela roda DEPOIS desta leitura do passport — então o
      // pedido recém-criado abaixo é visto e a exclusão é corretamente
      // bloqueada.
      const trustPassportRepository = app.get(TrustPassportRepository);
      const original = trustPassportRepository.findByIdentityId.bind(trustPassportRepository);
      const spy = vi
        .spyOn(trustPassportRepository, 'findByIdentityId')
        .mockImplementationOnce(async (identityId: string) => {
          const accepted = await app.inject({
            method: 'POST',
            url: `/api/v1/marketplace/offers/${offerId}/accept`,
            headers: seller.auth,
          });
          expect(accepted.statusCode).toBe(200);
          return original(identityId);
        });

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/privacy/requests',
          headers: buyer.auth,
          payload: { type: 'DATA_DELETION' },
        });

        expect(response.json<{ data: { status: string; rejectionReason: string } }>().data).toMatchObject(
          {
            status: 'REJECTED',
            rejectionReason: 'ACTIVE_ORDERS',
          },
        );
      } finally {
        spy.mockRestore();
      }

      // A Identity NÃO foi tocada — nem nome/e-mail mudaram, nem deletedAt foi setado.
      const [row] = await db.select().from(identities).where(eq(identities.id, buyer.identityId));
      expect(row?.fullName).toBe('Camila Duarte Moraes');
      expect(row?.email).toBe(buyer.email);
      expect(row?.deletedAt).toBeNull();

      const me = await app.inject({ method: 'GET', url: '/api/v1/identities/me', headers: buyer.auth });
      expect(me.statusCode).toBe(200);
    },
  );
});
