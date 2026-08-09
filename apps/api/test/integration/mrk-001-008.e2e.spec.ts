/**
 * E2E do Módulo 6 (Marketplace, MRK-001..008):
 * rascunho → edição → publicação (com porteiro de reputação) → busca →
 * detalhe público → contato → mensagens → leitura → encerramento.
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
  accessToken: string;
  auth: { authorization: string };
}

describe.runIf(Boolean(testDatabaseUrl))('MRK-001..008 — Marketplace e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `mrk-${uuidv7()}@e2e.trustplatform.test`;
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
    return { identityId, accessToken, auth: { authorization: `Bearer ${accessToken}` } };
  }

  /** O porteiro do MRK-003 depende do score: espera o pipeline do TRS terminar. */
  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.tick();
      const [score] = await db
        .select()
        .from(trustScores)
        .where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  async function createDraft(user: TestUser, title: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: user.auth,
      payload: { title },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ data: { listingId: string } }>().data.listingId;
  }

  async function completeDraft(user: TestUser, listingId: string, category: string, price: number) {
    return app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: user.auth,
      payload: {
        description: 'Atendo toda a região central, com garantia de 90 dias no serviço prestado.',
        listingType: 'SERVICE',
        category,
        price,
        currency: 'BRL',
        location: 'São Paulo/SP',
        images: ['https://cdn.trustplatform.test/foto-1.jpg'],
      },
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

  it('catálogo de categorias é público e expõe o requisito de reputação', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/marketplace/listings/categories' });
    expect(response.statusCode).toBe(200);
    const categories = response.json<{
      data: Array<{ code: string; minimumTrustLevel: string | null }>;
    }>().data;
    expect(categories.find((c) => c.code === 'HOME_REPAIRS')?.minimumTrustLevel).toBe('BRONZE');
    expect(categories.find((c) => c.code === 'ELECTRICAL')?.minimumTrustLevel).toBe('SILVER');
  });

  it('fluxo do anúncio: rascunho → edição → publicação → busca → detalhe', async () => {
    const seller = await createActiveUser('João Carlos Ferreira');
    await waitForBronze(seller.identityId);

    // MRK-001 — nasce em DRAFT, incompleto e com a lista do que falta
    const listingId = await createDraft(seller, 'Montagem de móveis e pequenos reparos');
    const draft = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: seller.auth,
    });
    expect(draft.json<{ data: { status: string } }>().data.status).toBe('DRAFT');
    expect(
      draft.json<{ data: { publishing: { missingFields: string[] } } }>().data.publishing
        .missingFields,
    ).toContain('price');

    // MRK-003 — publicar incompleto é erro de negócio (422)
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(tooEarly.statusCode).toBe(422);
    expect(tooEarly.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_LISTING_INCOMPLETE',
    );

    // MRK-002 — completa o anúncio
    const updated = await completeDraft(seller, listingId, 'HOME_REPAIRS', 180);
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ data: { price: number; images: string[] } }>().data).toMatchObject({
      price: 180,
      images: ['https://cdn.trustplatform.test/foto-1.jpg'],
    });

    // MRK-002 BR-001 — terceiro não edita
    const intruder = await createActiveUser('Ana Paula Souza');
    const forbidden = await completeDraft(intruder, listingId, 'HOME_REPAIRS', 10);
    expect(forbidden.statusCode).toBe(403);

    // MRK-003 — publica (BRONZE atende HOME_REPAIRS)
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json<{ data: { status: string; publishedAt: string } }>().data.status).toBe(
      'PUBLISHED',
    );

    // MRK-003 BR-002 — publicar de novo é conflito
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(again.statusCode).toBe(409);

    // MRK-004 — busca pública encontra e mostra a reputação do anunciante
    const search = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/listings?q=Montagem&category=HOME_REPAIRS&listingType=SERVICE&sort=trust_score',
    });
    expect(search.statusCode).toBe(200);
    const results = search.json<{
      data: Array<{ listingId: string; seller: { trustLevel: string | null }; imageUrl: string | null }>;
      pagination: { totalItems: number };
    }>();
    const found = results.data.find((item) => item.listingId === listingId);
    expect(found).toBeDefined();
    expect(found!.seller.trustLevel).toBe('BRONZE');
    expect(found!.imageUrl).toBe('https://cdn.trustplatform.test/foto-1.jpg');

    // MRK-004 BR-006 — filtro por nível mínimo exclui o anunciante BRONZE
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/listings?q=Montagem&minimumTrustLevel=GOLD',
    });
    expect(filtered.json<{ pagination: { totalItems: number } }>().pagination.totalItems).toBe(0);

    // MRK-004 BR-002 — rascunho de outro anúncio não aparece
    const otherDraftId = await createDraft(seller, 'Rascunho que não deve aparecer na busca');
    const draftSearch = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/listings?q=Rascunho',
    });
    expect(draftSearch.json<{ pagination: { totalItems: number } }>().pagination.totalItems).toBe(0);

    // MRK-005 — visitante anônimo vê o anúncio e o resumo do anunciante
    const publicView = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
    });
    expect(publicView.statusCode).toBe(200);
    const detail = publicView.json<{
      data: {
        viewCount: number;
        seller: { displayName: string; trustLevel: string; verifications: unknown };
        publishing?: unknown;
      };
    }>().data;
    expect(detail.viewCount).toBe(1);
    expect(detail.seller.displayName).toBe('João F.'); // nome público abreviado
    expect(detail.seller.trustLevel).toBe('BRONZE');
    expect(detail.publishing).toBeUndefined(); // dica de publicação é só do dono

    // BR-004 — segunda visualização incrementa o contador
    const secondView = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
    });
    expect(secondView.json<{ data: { viewCount: number } }>().data.viewCount).toBe(2);

    // MRK-005 BR-002 — rascunho é 404 para quem não é o dono
    const hiddenDraft = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${otherDraftId}`,
    });
    expect(hiddenDraft.statusCode).toBe(404);

    // Vitrine do dono enxerga o rascunho
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/listings/mine',
      headers: seller.auth,
    });
    const ids = mine.json<{ data: Array<{ listingId: string }> }>().data.map((l) => l.listingId);
    expect(ids).toContain(otherDraftId);
    expect(ids).toContain(listingId);
  });

  it('MRK-003 BR-005 — categoria sensível barra quem não tem o nível exigido', async () => {
    const seller = await createActiveUser('Marcos Vinicius Lima');
    await waitForBronze(seller.identityId);

    const listingId = await createDraft(seller, 'Instalação elétrica residencial completa');
    await completeDraft(seller, listingId, 'ELECTRICAL', 350);

    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: 'MARKETPLACE_PUBLICATION_NOT_ALLOWED',
    });
    expect(denied.json<{ error: { message: string } }>().error.message).toContain('SILVER');

    // continua em DRAFT — nada foi publicado
    const still = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: seller.auth,
    });
    expect(still.json<{ data: { status: string } }>().data.status).toBe('DRAFT');
  });

  it('fluxo da conversa: contato → reuso → mensagens → leitura → encerramento', async () => {
    const seller = await createActiveUser('Roberto Almeida Costa');
    await waitForBronze(seller.identityId);
    const buyer = await createActiveUser('Fernanda Ribeiro Dias');
    const stranger = await createActiveUser('Carlos Eduardo Nunes');

    const listingId = await createDraft(seller, 'Diarista para apartamentos e casas');
    await completeDraft(seller, listingId, 'CLEANING', 220);
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: seller.auth,
    });

    // MRK-006 BR-003 — dono não fala com o próprio anúncio
    const ownListing = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: seller.auth,
      payload: { message: 'testando' },
    });
    expect(ownListing.statusCode).toBe(422);
    expect(ownListing.json<{ error: { code: string } }>().error.code).toBe(
      'CANNOT_CONTACT_OWN_LISTING',
    );

    // MRK-006 — comprador inicia a conversa
    const contact = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Olá! Você atende no sábado de manhã?' },
    });
    expect(contact.statusCode).toBe(201);
    const { conversation, created } = contact.json<{
      data: { conversation: { conversationId: string }; created: boolean };
    }>().data;
    expect(created).toBe(true);
    const conversationId = conversation.conversationId;

    // MRK-006 BR-005 (INCONSISTENCIAS #9) — segundo contato REUTILIZA (200)
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Complementando: seria uma faxina pesada.' },
    });
    expect(again.statusCode).toBe(200);
    const reused = again.json<{
      data: { conversation: { conversationId: string }; created: boolean };
    }>().data;
    expect(reused.created).toBe(false);
    expect(reused.conversation.conversationId).toBe(conversationId);

    // MRK-007 — vendedor vê a conversa com 2 mensagens não lidas
    const sellerInbox = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/conversations',
      headers: seller.auth,
    });
    const inbox = sellerInbox.json<{
      data: Array<{ conversationId: string; unreadCount: number; counterpartName: string }>;
    }>().data;
    const thread = inbox.find((item) => item.conversationId === conversationId);
    expect(thread).toBeDefined();
    expect(thread!.unreadCount).toBe(2);
    expect(thread!.counterpartName).toBe('Fernanda Ribeiro Dias');

    // MRK-007 BR-001 — terceiro não acessa
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}`,
      headers: stranger.auth,
    });
    expect(denied.statusCode).toBe(403);

    // MRK-007 — vendedor responde
    const reply = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/messages`,
      headers: seller.auth,
      payload: { message: 'Bom dia! Atendo sim, sábado às 8h.' },
    });
    expect(reply.statusCode).toBe(201);

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}`,
      headers: buyer.auth,
    });
    const messages = history.json<{ data: { messages: Array<{ message: string }> } }>().data
      .messages;
    expect(messages).toHaveLength(3);
    expect(messages[2]!.message).toBe('Bom dia! Atendo sim, sábado às 8h.');

    // MRK-007 BR-006 — marcar como lidas afeta só o que o leitor recebeu
    const read = await app.inject({
      method: 'PATCH',
      url: `/api/v1/marketplace/conversations/${conversationId}/read`,
      headers: seller.auth,
    });
    expect(read.json<{ data: { messagesRead: number } }>().data.messagesRead).toBe(2);

    const afterRead = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/conversations',
      headers: seller.auth,
    });
    expect(
      afterRead
        .json<{ data: Array<{ conversationId: string; unreadCount: number }> }>()
        .data.find((item) => item.conversationId === conversationId)!.unreadCount,
    ).toBe(0);

    // MRK-008 — encerramento pelo comprador
    const closed = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/close`,
      headers: buyer.auth,
      payload: { reason: 'Serviço combinado por aqui mesmo.' },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json<{ data: { status: string; closedBy: string } }>().data).toMatchObject({
      status: 'CLOSED',
      closedBy: buyer.identityId,
    });

    // BR-003 — nenhuma mensagem depois do encerramento
    const afterClose = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/messages`,
      headers: seller.auth,
      payload: { message: 'mais uma coisa...' },
    });
    expect(afterClose.statusCode).toBe(409);
    expect(afterClose.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_CONVERSATION_CLOSED',
    );

    // BR-002 — encerrar duas vezes é conflito
    const closeAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/close`,
      headers: seller.auth,
      payload: {},
    });
    expect(closeAgain.statusCode).toBe(409);

    // BR-004 — histórico permanece íntegro após o encerramento
    const preserved = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}`,
      headers: buyer.auth,
    });
    expect(preserved.json<{ data: { messages: unknown[] } }>().data.messages).toHaveLength(3);

    // Nova conversa é permitida depois do encerramento (índice parcial só trava OPEN)
    const reopened = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/contact`,
      headers: buyer.auth,
      payload: { message: 'Voltei para outro serviço.' },
    });
    expect(reopened.statusCode).toBe(201);
    expect(
      reopened.json<{ data: { conversation: { conversationId: string } } }>().data.conversation
        .conversationId,
    ).not.toBe(conversationId);
  });
});
