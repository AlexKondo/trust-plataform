/**
 * E2E do IP-005 (Scheduling, Availability, Location & ETA): disponibilidade
 * declarada do Partner, reagendamento (INCONSISTENCIAS #26's own migration
 * path) e o status de deslocamento/ETA declarado (sem GPS contínuo).
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
import { localInstant } from '../../src/modules/marketplace/domain/services/availability.service';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import { marketplaceOrderSchedulings, trustScores } from '../../src/shared/database/schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';
const TZ = 'America/Sao_Paulo';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

/** 10:00 BRT (UTC-3, sem horário de verão desde 2019) `daysAhead` dias no futuro
 * — deliberadamente longe de meia-noite local para nunca cruzar dia por acaso. */
function brtMorning(daysAhead: number): Date {
  const base = new Date(Date.now() + daysAhead * 24 * 3600000);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 13, 0, 0));
}

describe.runIf(Boolean(testDatabaseUrl))('IP-005 — Scheduling, Availability, Location & ETA', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip005-${uuidv7()}@e2e.trustplatform.test`;
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

  /** MRK-003 BR-005: publicar HOME_REPAIRS exige reputação BRONZE mínima — uma
   * identidade recém-criada só chega lá depois que o consumer assíncrono do
   * Trust Score processa o evento de cadastro (`relay.drainOnce()` é o "worker" em
   * teste, não roda sozinho como em produção). */
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

  /** Anúncio publicado → conversa → proposta → aceite. Devolve o pedido criado. */
  async function createOrder(seller: TestUser, buyer: TestUser): Promise<{ orderId: string; listingId: string }> {
    await waitForBronze(seller.identityId);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Instalação de ar-condicionado split',
        description: 'Instalação completa com dreno e suporte, até 2 unidades.',
        listingType: 'SERVICE',
        category: 'HOME_REPAIRS',
        price: 900,
        currency: 'BRL',
        location: 'Curitiba/PR',
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
      payload: { message: 'Precisa instalar essa semana?' },
    });
    const conversationId = contact.json<{ data: { conversation: { conversationId: string } } }>().data
      .conversation.conversationId;

    const offer = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/conversations/${conversationId}/offers`,
      headers: buyer.auth,
      payload: { amount: 850, quantity: 1, expiresAt: new Date(Date.now() + 72 * 3600000).toISOString() },
    });
    const offerId = offer.json<{ data: { offerId: string } }>().data.offerId;

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/offers/${offerId}/accept`,
      headers: seller.auth,
    });
    expect(accepted.statusCode).toBe(200);
    return {
      orderId: accepted.json<{ data: { order: { orderId: string } } }>().data.order.orderId,
      listingId,
    };
  }

  async function setAvailability(
    user: TestUser,
    windows: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; timezone?: string }>,
  ) {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/marketplace/partner-availability',
      headers: user.auth,
      payload: { windows },
    });
    expect(response.statusCode).toBe(200);
    return response;
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

  it('Partner declara disponibilidade e a consulta de volta (replace-all)', async () => {
    const partner = await createActiveUser('Marcia Helena Ferraz');
    await setAvailability(partner, [
      { dayOfWeek: 2, startMinute: 480, endMinute: 1080, timezone: TZ },
      { dayOfWeek: 4, startMinute: 480, endMinute: 1080, timezone: TZ },
    ]);

    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/marketplace/partner-availability/mine',
      headers: partner.auth,
    });
    expect(mine.statusCode).toBe(200);
    const windows = mine.json<{ data: Array<{ dayOfWeek: number }> }>().data;
    expect(windows).toHaveLength(2);
    expect(windows.map((w) => w.dayOfWeek).sort()).toEqual([2, 4]);

    // Sobreposição no mesmo dia é recusada (422)
    const overlapping = await app.inject({
      method: 'PUT',
      url: '/api/v1/marketplace/partner-availability',
      headers: partner.auth,
      payload: {
        windows: [
          { dayOfWeek: 1, startMinute: 480, endMinute: 720, timezone: TZ },
          { dayOfWeek: 1, startMinute: 600, endMinute: 800, timezone: TZ },
        ],
      },
    });
    expect(overlapping.statusCode).toBe(422);
    expect(overlapping.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_PARTNER_AVAILABILITY_INVALID',
    );
  });

  it('agendamento respeita a disponibilidade declarada do Partner (fora recusa, dentro aceita)', async () => {
    const seller = await createActiveUser('Ricardo Bastos Teixeira');
    const buyer = await createActiveUser('Camila Duarte Rocha');
    const { orderId } = await createOrder(seller, buyer);

    const scheduledStart = brtMorning(5);
    const local = localInstant(scheduledStart, TZ);
    const outsideDay = (local.dayOfWeek + 1) % 7;

    // Só declara disponibilidade num dia diferente do pedido → fora da janela
    await setAvailability(seller, [{ dayOfWeek: outsideDay, startMinute: 0, endMinute: 1439, timezone: TZ }]);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: scheduledStart.toISOString(), estimatedDuration: 60, timezone: TZ },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_SCHEDULING_OUTSIDE_AVAILABILITY',
    );

    // Agora declara o dia certo, cobrindo o dia inteiro → aceita
    await setAvailability(seller, [{ dayOfWeek: local.dayOfWeek, startMinute: 0, endMinute: 1439, timezone: TZ }]);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: scheduledStart.toISOString(), estimatedDuration: 60, timezone: TZ },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<{ data: { status: string } }>().data.status).toBe('SCHEDULED');

    // Sem NENHUMA disponibilidade declarada, não existe restrição (comportamento
    // pré-IP-005) — outra identidade, que nunca declarou nenhuma janela.
    const strangerSeller = await createActiveUser('Bruno Azevedo Farias');
    const anotherBuyer = await createActiveUser('Ingrid Salles Nogueira');
    const thirdOrder = await createOrder(strangerSeller, anotherBuyer);
    const noWindowsDeclared = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${thirdOrder.orderId}/schedule`,
      headers: strangerSeller.auth,
      payload: { scheduledStart: brtMorning(6).toISOString(), estimatedDuration: 60, timezone: TZ },
    });
    expect(noWindowsDeclared.statusCode).toBe(200);
  });

  it('reagendamento troca a janela, preserva histórico e recusa depois do check-in (INCONSISTENCIAS #26)', async () => {
    const seller = await createActiveUser('Patrícia Gouveia Matos');
    const buyer = await createActiveUser('Thiago Moreira Vidal');
    const { orderId } = await createOrder(seller, buyer);

    const firstStart = brtMorning(10);
    const scheduled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: firstStart.toISOString(), estimatedDuration: 60, timezone: TZ },
    });
    expect(scheduled.statusCode).toBe(200);
    const firstSchedulingId = scheduled.json<{ data: { scheduling: { schedulingId: string } } }>().data.scheduling
      .schedulingId;

    // Um terceiro (nem comprador nem vendedor) não reagenda
    const stranger = await createActiveUser('Vagner Prado Coutinho');
    const strangerAttempt = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reschedule`,
      headers: stranger.auth,
      payload: { scheduledStart: brtMorning(11).toISOString(), estimatedDuration: 60, reason: 'não deveria' },
    });
    expect(strangerAttempt.statusCode).toBe(403);

    // Reagenda de verdade — troca a janela, motivo obrigatório
    const secondStart = brtMorning(12);
    const rescheduled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reschedule`,
      headers: buyer.auth,
      payload: { scheduledStart: secondStart.toISOString(), estimatedDuration: 90, reason: 'Cliente pediu para adiar' },
    });
    expect(rescheduled.statusCode).toBe(200);
    const withNewSchedule = rescheduled.json<{
      data: { scheduling: { schedulingId: string; scheduledStart: string; estimatedDuration: number; status: string } };
    }>().data;
    expect(withNewSchedule.scheduling.status).toBe('ACTIVE');
    expect(withNewSchedule.scheduling.estimatedDuration).toBe(90);
    expect(new Date(withNewSchedule.scheduling.scheduledStart).toISOString()).toBe(secondStart.toISOString());
    expect(withNewSchedule.scheduling.schedulingId).not.toBe(firstSchedulingId);

    // Reagendar sem motivo é rejeitado na validação do payload (400)
    const noReason = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reschedule`,
      headers: buyer.auth,
      payload: { scheduledStart: brtMorning(13).toISOString(), estimatedDuration: 60, reason: '' },
    });
    expect(noReason.statusCode).toBe(400);

    // Histórico preservado: a linha antiga continua no banco, CANCELLED, com o
    // motivo do reagendamento — nunca apagada (INCONSISTENCIAS #26's own migration path)
    const rows = await db
      .select()
      .from(marketplaceOrderSchedulings)
      .where(eq(marketplaceOrderSchedulings.orderId, orderId));
    expect(rows).toHaveLength(2);
    const oldRow = rows.find((r) => r.id === firstSchedulingId)!;
    expect(oldRow.status).toBe('CANCELLED');
    expect(oldRow.cancelledReason).toBe('Cliente pediu para adiar');
    const activeRows = rows.filter((r) => r.status === 'ACTIVE');
    expect(activeRows).toHaveLength(1);

    // Depois do check-in, reagendar não é mais permitido
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    expect(started.statusCode).toBe(200);

    const tooLate = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/reschedule`,
      headers: seller.auth,
      payload: { scheduledStart: brtMorning(20).toISOString(), estimatedDuration: 60, reason: 'tarde demais' },
    });
    expect(tooLate.statusCode).toBe(409);
    expect(tooLate.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_NOT_RESCHEDULABLE',
    );
  });

  it('reagendamento recusa conflito na agenda do prestador', async () => {
    const seller = await createActiveUser('Cristiane Lacerda Viana');
    const firstBuyer = await createActiveUser('Douglas Peixoto Rangel');
    const secondBuyer = await createActiveUser('Elaine Cavalcante Sá');

    const first = await createOrder(seller, firstBuyer);
    const second = await createOrder(seller, secondBuyer);

    const occupiedStart = brtMorning(15);
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${first.orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: occupiedStart.toISOString(), estimatedDuration: 120, timezone: TZ },
    });

    const freeStart = brtMorning(16);
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${second.orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: freeStart.toISOString(), estimatedDuration: 60, timezone: TZ },
    });

    const conflicting = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${second.orderId}/reschedule`,
      headers: seller.auth,
      payload: { scheduledStart: occupiedStart.toISOString(), estimatedDuration: 60, reason: 'tentando colidir' },
    });
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json<{ error: { code: string } }>().error.code).toBe('MARKETPLACE_SCHEDULING_CONFLICT');
  });

  it('status de deslocamento/ETA: transição declarada, visível ao Member, sem GPS contínuo', async () => {
    const seller = await createActiveUser('Fernanda Rezende Campos');
    const buyer = await createActiveUser('Gustavo Almada Nery');
    const { orderId } = await createOrder(seller, buyer);

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: brtMorning(7).toISOString(), estimatedDuration: 60, timezone: TZ },
    });

    // Antes de qualquer declaração: NOT_STARTED, visível a ambos os participantes
    const initial = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status`,
      headers: buyer.auth,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json<{ data: { status: string } }>().data.status).toBe('NOT_STARTED');

    // "Cheguei" sem antes declarar "a caminho" é recusado
    const arrivedTooSoon = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status/arrived`,
      headers: seller.auth,
    });
    expect(arrivedTooSoon.statusCode).toBe(409);
    expect(arrivedTooSoon.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_TRAVEL_TRANSITION_INVALID',
    );

    // Só o Partner (vendedor) declara — o Member não pode
    const buyerTriesEnRoute = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status/en-route`,
      headers: buyer.auth,
      payload: { declaredEtaMinutes: 15 },
    });
    expect(buyerTriesEnRoute.statusCode).toBe(403);

    // Partner declara "a caminho" com um ETA MANUAL — nunca geo-computado (sem
    // fornecedor de mapas configurado nesta release; ver EtaEstimatorPort)
    const enRoute = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status/en-route`,
      headers: seller.auth,
      payload: { declaredEtaMinutes: 15 },
    });
    expect(enRoute.statusCode).toBe(200);
    const enRouteBody = enRoute.json<{
      data: { status: string; declaredEtaMinutes: number; etaSource: string; estimatedArrivalAt: string | null };
    }>().data;
    expect(enRouteBody.status).toBe('EN_ROUTE');
    expect(enRouteBody.declaredEtaMinutes).toBe(15);
    expect(enRouteBody.etaSource).toBe('PARTNER_DECLARED');
    expect(enRouteBody.estimatedArrivalAt).not.toBeNull();
    // Nenhuma coordenada é exposta em lugar nenhum desta resposta — a resposta
    // inteira já foi validada contra o schema `TravelStatusResponse`, que não
    // tem `latitude`/`longitude` (ver marketplace-order.dtos.ts).
    expect(enRouteBody).not.toHaveProperty('latitude');
    expect(enRouteBody).not.toHaveProperty('longitude');

    // O Member vê o progresso — visibilidade sem rastreamento contínuo
    const buyerSees = await app.inject({
      method: 'GET',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status`,
      headers: buyer.auth,
    });
    expect(buyerSees.json<{ data: { status: string } }>().data.status).toBe('EN_ROUTE');

    // Partner chega
    const arrived = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status/arrived`,
      headers: seller.auth,
    });
    expect(arrived.statusCode).toBe(200);
    expect(arrived.json<{ data: { status: string; arrivedAt: string | null } }>().data.status).toBe('ARRIVED');

    // Depois do check-in, o status de deslocamento deixa de se aplicar
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    const afterCheckIn = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/travel-status/en-route`,
      headers: seller.auth,
      payload: { declaredEtaMinutes: 5 },
    });
    expect(afterCheckIn.statusCode).toBe(409);
    expect(afterCheckIn.json<{ error: { code: string } }>().error.code).toBe(
      'MARKETPLACE_ORDER_TRAVEL_NOT_APPLICABLE',
    );
  });
});
