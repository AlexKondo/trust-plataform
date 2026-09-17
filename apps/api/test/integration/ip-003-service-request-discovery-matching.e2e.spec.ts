/**
 * E2E do IP-003 (Service Request, Discovery & Matching):
 * Member descreve a necessidade -> descoberta determinística de Partners
 * elegíveis (categoria + localização + nível mínimo) -> engajamento cria/liga
 * a conversa já existente (MRK-006) -> pedido MATCHED -> encerramento.
 * Requer TEST_DATABASE_URL (use `pnpm test:e2e`).
 */
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/main';
import { EmailService } from '../../src/modules/identity/domain/services/email.service';
import { LoggingEmailService } from '../../src/modules/identity/infrastructure/email/logging-email.service';
import {
  serviceRequestEngagements,
  serviceRequests,
} from '../../src/modules/marketplace/infrastructure/persistence/service-request.schema';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { outboxEvents, trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  accessToken: string;
  auth: { authorization: string };
}

describe.runIf(Boolean(testDatabaseUrl))('IP-003 — Service Request, Discovery & Matching e2e', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip003-${uuidv7()}@e2e.trustplatform.test`;
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
    return { identityId, accessToken, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function waitForBronze(identityId: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const [score] = await db.select().from(trustScores).where(eq(trustScores.identityId, identityId));
      if (score && score.score >= 25) {
        return;
      }
      await new Promise((sleep) => setTimeout(sleep, 500));
    }
    throw new Error('Trust Score inicial não calculado dentro do timeout');
  }

  async function publishListing(
    partner: TestUser,
    title: string,
    category: string,
    location: string,
  ): Promise<string> {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: partner.auth,
      payload: { title },
    });
    const listingId = draft.json<{ data: { listingId: string } }>().data.listingId;
    await app.inject({
      method: 'PUT',
      url: `/api/v1/marketplace/listings/${listingId}`,
      headers: partner.auth,
      payload: {
        description: 'Atendimento profissional com garantia de 90 dias em toda a região.',
        listingType: 'SERVICE',
        category,
        price: 150,
        currency: 'BRL',
        location,
      },
    });
    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/listings/${listingId}/publish`,
      headers: partner.auth,
    });
    expect(published.statusCode).toBe(200);
    return listingId;
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

  it('fluxo completo: cria pedido -> descobre matches -> engaja Partner -> MATCHED -> fecha', async () => {
    const member = await createActiveUser('Renata Costa Almeida');
    await waitForBronze(member.identityId);
    const partner = await createActiveUser('Eduardo Martins Pereira');
    await waitForBronze(partner.identityId);
    const stranger = await createActiveUser('Bruno Silva Nogueira');

    const listingId = await publishListing(
      partner,
      'Reparos residenciais em geral',
      'HOME_REPAIRS',
      'Vila Mariana, São Paulo/SP',
    );

    // 1) Member descreve a necessidade
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Preciso trocar uma torneira e consertar uma dobradiça',
        description: 'A torneira da cozinha está vazando e a porta do quarto não fecha direito.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Vila Mariana, São Paulo/SP',
        urgency: 'THIS_WEEK',
        budgetMinAmount: 50,
        budgetMaxAmount: 300,
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json<{ data: { serviceRequestId: string; status: string } }>().data;
    expect(created.status).toBe('OPEN');
    const serviceRequestId = created.serviceRequestId;

    // Não-dono nunca vê o pedido — 404, nunca 403 (privacidade §11)
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}`,
      headers: stranger.auth,
    });
    expect(forbidden.statusCode).toBe(404);

    // 2) Descoberta determinística: categoria + localização batem
    const matches = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/matches`,
      headers: member.auth,
    });
    expect(matches.statusCode).toBe(200);
    const matchList = matches.json<{
      data: Array<{ listingId: string; alreadyEngaged: boolean; partner: { trustLevel: string | null } }>;
    }>().data;
    const match = matchList.find((item) => item.listingId === listingId);
    expect(match).toBeDefined();
    expect(match!.alreadyEngaged).toBe(false);
    expect(match!.partner.trustLevel).toBe('BRONZE');

    // 3) Engajamento cria a conversa (mesmo mecanismo do MRK-006)
    const engage = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: member.auth,
      payload: { listingId, message: 'Olá! Vi que você atende na minha região, pode me ajudar?' },
    });
    expect(engage.statusCode).toBe(201);
    const engaged = engage.json<{
      data: { created: boolean; conversation: { conversationId: string }; engagement: { listingId: string } };
    }>().data;
    expect(engaged.created).toBe(true);
    expect(engaged.engagement.listingId).toBe(listingId);
    const conversationId = engaged.conversation.conversationId;

    // O pedido virou MATCHED
    const afterEngage = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}`,
      headers: member.auth,
    });
    expect(afterEngage.json<{ data: { status: string; matchedAt: string | null } }>().data.status).toBe(
      'MATCHED',
    );
    expect(
      afterEngage.json<{ data: { matchedAt: string | null } }>().data.matchedAt,
    ).not.toBeNull();

    // A conversa criada é a mesma máquina de MRK-006/007: mensagem chega, vendedor responde
    const conversationView = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/conversations/${conversationId}`,
      headers: partner.auth,
    });
    expect(conversationView.statusCode).toBe(200);
    expect(
      conversationView.json<{ data: { messages: Array<{ message: string }> } }>().data.messages,
    ).toHaveLength(1);

    // Reengajar o MESMO anúncio reaproveita a conversa (200, created:false)
    const reengage = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: member.auth,
      payload: { listingId, message: 'Só complementando: seria amanhã de manhã.' },
    });
    expect(reengage.statusCode).toBe(200);
    expect(reengage.json<{ data: { created: boolean; conversation: { conversationId: string } } }>().data)
      .toMatchObject({ created: false, conversation: { conversationId } });

    // matches agora mostra alreadyEngaged: true
    const matchesAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/matches`,
      headers: member.auth,
    });
    const matchAfter = matchesAfter
      .json<{ data: Array<{ listingId: string; alreadyEngaged: boolean }> }>()
      .data.find((item) => item.listingId === listingId);
    expect(matchAfter!.alreadyEngaged).toBe(true);

    // 4) Member fecha o pedido
    const close = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/close`,
      headers: member.auth,
      payload: { reason: 'Combinei com o profissional pela conversa.' },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json<{ data: { status: string } }>().data.status).toBe('CLOSED');

    // Pedido CLOSED não aceita mais engajamento
    const anotherListing = await publishListing(
      partner,
      'Outro serviço qualquer',
      'HOME_REPAIRS',
      'Vila Mariana, São Paulo/SP',
    );
    const engageAfterClose = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
      headers: member.auth,
      payload: { listingId: anotherListing, message: 'oi' },
    });
    expect(engageAfterClose.statusCode).toBe(409);
    expect(engageAfterClose.json<{ error: { code: string } }>().error.code).toBe(
      'SERVICE_REQUEST_NOT_ENGAGEABLE',
    );

    // 'mine' lista o pedido
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/service-requests/mine',
      headers: member.auth,
    });
    expect(
      mine.json<{ data: Array<{ serviceRequestId: string }> }>().data.map((r) => r.serviceRequestId),
    ).toContain(serviceRequestId);
  });

  it('nível mínimo de confiança exclui Partners abaixo do requisito', async () => {
    const member = await createActiveUser('Camila Ferreira Rocha');
    await waitForBronze(member.identityId);
    const partner = await createActiveUser('José Henrique Barbosa');
    await waitForBronze(partner.identityId);

    const listingId = await publishListing(
      partner,
      'Faxina completa para apartamentos',
      'CLEANING',
      'Moema, São Paulo/SP',
    );

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Preciso de uma diarista de confiança',
        description: 'Apartamento de 2 quartos, limpeza completa incluindo os vidros externos.',
        category: 'CLEANING',
        locationLabel: 'Moema, São Paulo/SP',
        urgency: 'FLEXIBLE',
        minimumTrustLevel: 'GOLD',
      },
    });
    const serviceRequestId = create.json<{ data: { serviceRequestId: string } }>().data.serviceRequestId;

    const matches = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/matches`,
      headers: member.auth,
    });
    expect(matches.json<{ pagination: { totalItems: number } }>().pagination.totalItems).toBe(0);
    expect(
      matches.json<{ data: Array<{ listingId: string }> }>().data.find((item) => item.listingId === listingId),
    ).toBeUndefined();
  });

  it('cancelamento exige motivo e é definitivo', async () => {
    const member = await createActiveUser('Patrícia Souza Lima');
    await waitForBronze(member.identityId);

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Preciso de um jardineiro',
        description: 'Poda de árvores e manutenção do jardim de uma casa pequena.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Pinheiros, São Paulo/SP',
        urgency: 'FLEXIBLE',
      },
    });
    const serviceRequestId = create.json<{ data: { serviceRequestId: string } }>().data.serviceRequestId;

    const missingReason = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/cancel`,
      headers: member.auth,
      payload: {},
    });
    expect(missingReason.statusCode).toBe(400);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/cancel`,
      headers: member.auth,
      payload: { reason: 'Resolvi contratar um conhecido.' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json<{ data: { status: string } }>().data.status).toBe('CANCELLED');

    // CANCELLED é terminal — uma segunda decisão é conflito
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/service-requests/${serviceRequestId}/close`,
      headers: member.auth,
      payload: {},
    });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('SERVICE_REQUEST_INVALID_TRANSITION');
  });

  it('corrida: dois engajamentos concorrentes (Partners diferentes) só transicionam OPEN -> MATCHED uma vez', async () => {
    const member = await createActiveUser('Vinícius Alves Teixeira');
    await waitForBronze(member.identityId);
    const partnerA = await createActiveUser('Larissa Gomes Cardoso');
    await waitForBronze(partnerA.identityId);
    const partnerB = await createActiveUser('Thiago Ramos Correia');
    await waitForBronze(partnerB.identityId);

    const listingA = await publishListing(partnerA, 'Montagem de móveis planejados', 'HOME_REPAIRS', 'Tatuapé, São Paulo/SP');
    const listingB = await publishListing(partnerB, 'Pequenos reparos residenciais', 'HOME_REPAIRS', 'Tatuapé, São Paulo/SP');

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/service-requests',
      headers: member.auth,
      payload: {
        title: 'Preciso montar um guarda-roupa novo',
        description: 'Comprei um guarda-roupa modulado e preciso de alguém para montar.',
        category: 'HOME_REPAIRS',
        locationLabel: 'Tatuapé, São Paulo/SP',
        urgency: 'ASAP',
      },
    });
    const serviceRequestId = create.json<{ data: { serviceRequestId: string } }>().data.serviceRequestId;

    const [resultA, resultB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
        headers: member.auth,
        payload: { listingId: listingA, message: 'Consegue hoje ainda?' },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/service-requests/${serviceRequestId}/engage`,
        headers: member.auth,
        payload: { listingId: listingB, message: 'Consegue hoje ainda?' },
      }),
    ]);
    expect(resultA.statusCode).toBe(201);
    expect(resultB.statusCode).toBe(201);

    const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, serviceRequestId));
    expect(row!.status).toBe('MATCHED');
    expect(row!.matchedAt).not.toBeNull();

    const engagementsA = await db
      .select()
      .from(serviceRequestEngagements)
      .where(
        and(
          eq(serviceRequestEngagements.serviceRequestId, serviceRequestId),
          eq(serviceRequestEngagements.listingId, listingA),
        ),
      );
    const engagementsB = await db
      .select()
      .from(serviceRequestEngagements)
      .where(
        and(
          eq(serviceRequestEngagements.serviceRequestId, serviceRequestId),
          eq(serviceRequestEngagements.listingId, listingB),
        ),
      );
    expect(engagementsA).toHaveLength(1);
    expect(engagementsB).toHaveLength(1);

    // Diff Review §F/§J.1: a garantia de "estado persistido transiciona uma
    // única vez" NÃO é suficiente por si só — é preciso confirmar que o EVENTO
    // também foi publicado uma única vez, não uma vez por chamada concorrente
    // que leu OPEN antes da corrida (o bug real estava exatamente aqui: o
    // gate de publicação usava a leitura pré-transação, não o retorno da CAS).
    const matchedEvents = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.eventType, 'ServiceRequest.Matched'), eq(outboxEvents.aggregateId, serviceRequestId)));
    expect(matchedEvents).toHaveLength(1);

    const engagementCreatedEvents = await db
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.eventType, 'ServiceRequestEngagement.Created'), eq(outboxEvents.aggregateType, 'ServiceRequestEngagement')),
      );
    // Uma linha de evento por engajamento (listingA + listingB) — nunca deduplicado, nunca duplicado.
    expect(
      engagementCreatedEvents.filter(
        (event) => (event.payload as { serviceRequestId?: string }).serviceRequestId === serviceRequestId,
      ),
    ).toHaveLength(2);
  });
});
