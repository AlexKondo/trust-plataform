/**
 * E2E da IP-007 — Incremental Payment Authorization.
 *
 * Resolve o gap `amountAuthorizedNotInCustody` autorreportado pelo PACK-03
 * (§9.1 do relatório daquele Pack): prova, com a aplicação de pé, que um Trust
 * Change Order APROVADO gera uma autorização financeira incremental idempotente
 * em sandbox, que ela entra em custódia própria, que um Change Order
 * REJECTED/CANCELLED nunca gera nada, que a liberação solta TODAS as tranches
 * (original + incrementais) sem jamais liberar duas vezes a mesma, e que o
 * resumo de custódia (`GET /payments/by-order/:orderId`) deixa o descasamento
 * explícito e consultável.
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
import { CreateIncrementalAuthorizationUseCase } from '../../src/modules/payment/application/usecases/create-incremental-authorization.usecase';
import { ReleaseFundsUseCase } from '../../src/modules/payment/application/usecases/release-funds.usecase';
import { DRIZZLE, Database } from '../../src/shared/database/database.module';
import {
  incrementalTrustCustodies,
  paymentIncrementalAuthorizations,
} from '../../src/modules/payment/infrastructure/persistence/payment-incremental.schema';
import { OutboxRelayService } from '../../src/shared/events/outbox-relay.service';
import { outboxEvents, payments, trustCustodies, trustScores } from '../../src/shared/database/schema';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const PASSWORD = 'Correct#Horse7Battery';

interface TestUser {
  identityId: string;
  auth: { authorization: string };
}

interface Contract {
  orderId: string;
  paymentId: string;
  seller: TestUser;
  buyer: TestUser;
}

const inHours = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

describe.runIf(Boolean(testDatabaseUrl))('IP-007 — Incremental Payment Authorization', () => {
  let app: NestFastifyApplication;
  let db: Database;
  let emailService: LoggingEmailService;
  let relay: OutboxRelayService;

  async function createActiveUser(fullName: string): Promise<TestUser> {
    const email = `ip007-${uuidv7()}@e2e.trustplatform.test`;
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

  async function waitFor<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 40000) {
      await relay.drainOnce();
      const value = await check();
      if (value !== undefined) {
        return value;
      }
      await new Promise((sleep) => setTimeout(sleep, 400));
    }
    throw new Error(`Timeout esperando: ${what}`);
  }

  /** Contrato HOURLY, pago e em execução — o mesmo baseline do PACK-01/03. */
  async function contractInProgress(names: [string, string], amount = 150): Promise<Contract> {
    const seller = await createActiveUser(names[0]);
    const buyer = await createActiveUser(names[1]);
    await waitForScore(seller.identityId, 25);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/marketplace/listings',
      headers: seller.auth,
      payload: {
        title: 'Manutenção elétrica com Change Order',
        description: 'Diagnóstico e reparo de instalações elétricas residenciais.',
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
        hourlyRateAmount: amount,
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

    const paymentRow = await waitFor(async () => {
      const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId));
      return row;
    }, 'Payment criado pelo aceite');

    const authorized = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentRow.id}/authorize`,
      headers: { ...buyer.auth, 'idempotency-key': uuidv7() },
      payload: { paymentMethodToken: 'tok_sandbox_visa' },
    });
    expect(authorized.statusCode).toBe(200);

    await waitFor(async () => {
      const [custody] = await db
        .select()
        .from(trustCustodies)
        .where(eq(trustCustodies.orderId, orderId));
      return custody?.status === 'IN_CUSTODY' ? custody : undefined;
    }, 'custódia original em IN_CUSTODY');

    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/schedule`,
      headers: seller.auth,
      payload: { scheduledStart: inHours(1), estimatedDuration: 60 },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/orders/${orderId}/start`,
      headers: seller.auth,
      payload: {},
    });
    expect(started.statusCode).toBe(200);

    return { orderId, paymentId: paymentRow.id, seller, buyer };
  }

  /**
   * Cria + submete um Change Order SCOPE_CHANGE com valor EXATO (para poder
   * mirar as convenções determinísticas do sandbox: final `.13` = DECLINED,
   * final `.99` = ERROR, qualquer outro = APPROVED).
   */
  async function proposeScopeChange(contract: Contract, serviceDeltaAmount: number): Promise<string> {
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
    return changeOrderId;
  }

  async function approveChangeOrder(contract: Contract, changeOrderId: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    return response;
  }

  async function incrementalAuthorizationOf(changeOrderId: string) {
    const [row] = await db
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.changeOrderId, changeOrderId));
    return row;
  }

  async function incrementalCustodyOf(changeOrderId: string) {
    const [row] = await db
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.changeOrderId, changeOrderId));
    return row;
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

  it('Change Order aprovado gera autorização incremental idempotente e a coloca em custódia própria', async () => {
    const contract = await contractInProgress(['Marcelo Vieira Gontijo', 'Patricia Souza Amaral']);
    const changeOrderId = await proposeScopeChange(contract, 220.5);

    await approveChangeOrder(contract, changeOrderId);

    const authorization = await waitFor(() => incrementalAuthorizationOf(changeOrderId), 'autorização incremental criada');
    expect(authorization.status).toBe('APPROVED');
    expect(Number(authorization.amount)).toBe(220.5);
    expect(authorization.providerId).toBe('sandbox');

    const tranche = await waitFor(() => incrementalCustodyOf(changeOrderId), 'tranche incremental em custódia');
    expect(tranche.status).toBe('IN_CUSTODY');
    expect(Number(tranche.amount)).toBe(220.5);
    expect(tranche.paymentId).toBe(contract.paymentId);
    expect(tranche.orderId).toBe(contract.orderId);

    // Reaproveita TrustCustody.Created/Funds.Held, mas no agregado da tranche.
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, tranche.id));
    expect(events.map((event) => event.eventType).sort()).toEqual(['Funds.Held', 'TrustCustody.Created']);
    for (const event of events) {
      expect(event.aggregateType).toBe('IncrementalTrustCustody');
    }

    // O resumo de custódia expõe o descasamento de forma explícita e consultável.
    const byOrder = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${contract.orderId}`,
      headers: contract.buyer.auth,
    });
    expect(byOrder.statusCode).toBe(200);
    const summary = byOrder.json<{
      data: {
        custodySummary: {
          totalCommerciallyAuthorized: number;
          totalHeld: number;
          amountAuthorizedNotInCustody: number;
          incrementalTranches: Array<{ changeOrderId: string; custodyStatus: string | null }>;
        };
      };
    }>().data.custodySummary;
    expect(summary.totalCommerciallyAuthorized).toBe(150 + 220.5);
    expect(summary.totalHeld).toBe(150 + 220.5);
    expect(summary.amountAuthorizedNotInCustody).toBe(0);
    expect(summary.incrementalTranches).toEqual([
      expect.objectContaining({ changeOrderId, custodyStatus: 'IN_CUSTODY' }),
    ]);

    // Idempotência: reentregar o mesmo evento não autoriza nem custodia de novo.
    const useCase = app.get(CreateIncrementalAuthorizationUseCase);
    const replay = await useCase.execute({ changeOrderId, correlationId: uuidv7() });
    expect(replay).toEqual({ result: 'ALREADY_PROCESSED', authorizationId: authorization.id });
    const authorizationsAfterReplay = await db
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.changeOrderId, changeOrderId));
    expect(authorizationsAfterReplay).toHaveLength(1);
    const custodiesAfterReplay = await db
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.changeOrderId, changeOrderId));
    expect(custodiesAfterReplay).toHaveLength(1);
  });

  it('Change Order REJECTED/CANCELLED nunca cria autorização incremental nenhuma', async () => {
    const contract = await contractInProgress(['Renata Xavier Bittencourt', 'Fabio Andrade Tavares']);

    // REJECTED
    const rejectedId = await proposeScopeChange(contract, 90);
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${rejectedId}/reject`,
      headers: contract.buyer.auth,
      payload: { reason: 'Não preciso deste serviço adicional.' },
    });
    expect(rejected.statusCode).toBe(200);

    // CANCELLED (o próprio proponente retira antes da decisão)
    const cancelledId = await proposeScopeChange(contract, 91);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${cancelledId}/cancel`,
      headers: contract.seller.auth,
    });
    expect(cancelled.statusCode).toBe(200);

    // Dá tempo real ao relay processar qualquer coisa que porventura existisse.
    for (let i = 0; i < 5; i += 1) {
      await relay.drainOnce();
      await new Promise((sleep) => setTimeout(sleep, 200));
    }

    expect(await incrementalAuthorizationOf(rejectedId)).toBeUndefined();
    expect(await incrementalCustodyOf(rejectedId)).toBeUndefined();
    expect(await incrementalAuthorizationOf(cancelledId)).toBeUndefined();
    expect(await incrementalCustodyOf(cancelledId)).toBeUndefined();

    // Nenhum evento TrustChangeOrder.Approved foi publicado para nenhum dos dois.
    const approvedEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, 'TrustChangeOrder.Approved'));
    expect(approvedEvents.some((event) => event.aggregateId === rejectedId)).toBe(false);
    expect(approvedEvents.some((event) => event.aggregateId === cancelledId)).toBe(false);
  });

  it('autorização incremental recusada pelo gateway não cria custódia — o descasamento fica explícito', async () => {
    const contract = await contractInProgress(['Diego Nogueira Farias', 'Camila Reis Pereira']);
    // final .13 → DECLINED pela convenção determinística do sandbox.
    const changeOrderId = await proposeScopeChange(contract, 50.13);

    await approveChangeOrder(contract, changeOrderId);

    const authorization = await waitFor(
      () => incrementalAuthorizationOf(changeOrderId),
      'tentativa de autorização (recusada) registrada',
    );
    expect(authorization.status).toBe('DECLINED');
    expect(await incrementalCustodyOf(changeOrderId)).toBeUndefined();

    const byOrder = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/by-order/${contract.orderId}`,
      headers: contract.buyer.auth,
    });
    const summary = byOrder.json<{
      data: { custodySummary: { totalCommerciallyAuthorized: number; totalHeld: number; amountAuthorizedNotInCustody: number } };
    }>().data.custodySummary;
    // Comercialmente autorizado inclui o delta (o Member aprovou); custodiado não.
    expect(summary.totalCommerciallyAuthorized).toBe(150 + 50.13);
    expect(summary.totalHeld).toBe(150);
    expect(summary.amountAuthorizedNotInCustody).toBe(50.13);
  });

  it('confirmação do cliente libera TODAS as tranches (original + incremental), sem exceder o custodiado', async () => {
    const contract = await contractInProgress(['Tatiane Moura Cardoso', 'Bruno Salgado Nunes']);
    const changeOrderId = await proposeScopeChange(contract, 75);
    await approveChangeOrder(contract, changeOrderId);
    const tranche = await waitFor(() => incrementalCustodyOf(changeOrderId), 'tranche incremental em custódia');

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

    const releasedOriginal = await waitFor(async () => {
      const [row] = await db.select().from(trustCustodies).where(eq(trustCustodies.orderId, contract.orderId));
      return row?.status === 'RELEASED' ? row : undefined;
    }, 'custódia original liberada');
    const releasedTranche = await waitFor(async () => {
      const [row] = await db
        .select()
        .from(incrementalTrustCustodies)
        .where(eq(incrementalTrustCustodies.id, tranche.id));
      return row?.status === 'RELEASED' ? row : undefined;
    }, 'tranche incremental liberada');

    expect(releasedOriginal.releasedAt).toBeInstanceOf(Date);
    expect(releasedTranche.releasedAt).toBeInstanceOf(Date);

    const [finalPayment] = await db.select().from(payments).where(eq(payments.id, contract.paymentId));
    expect(finalPayment?.status).toBe('FUNDS_RELEASED');

    // Nunca libera mais do que o que estava efetivamente em custódia.
    const totalHeld = Number(releasedOriginal.amount) + Number(releasedTranche.amount);
    expect(totalHeld).toBe(150 + 75);

    // Exatamente um Funds.Released por tranche — nunca dois para a mesma.
    const trancheReleaseEvents = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, tranche.id));
    expect(trancheReleaseEvents.filter((event) => event.eventType === 'Funds.Released')).toHaveLength(1);
  });

  it('corrida: duas entregas concorrentes do MESMO TrustChangeOrder.Approved autorizam o delta só uma vez', async () => {
    const contract = await contractInProgress(['Leandro Costa Ribeiro', 'Juliana Freire Castro']);
    const changeOrderId = await proposeScopeChange(contract, 310);
    // Aprova, mas SEM deixar o consumer do outbox processar ainda — chamamos o
    // use case diretamente, duas vezes em paralelo, para forçar a MESMA corrida
    // que uma reentrega real do evento produziria.
    await app.inject({
      method: 'POST',
      url: `/api/v1/marketplace/change-orders/${changeOrderId}/approve`,
      headers: contract.buyer.auth,
      payload: {},
    });

    const useCase = app.get(CreateIncrementalAuthorizationUseCase);
    const [first, second] = await Promise.all([
      useCase.execute({ changeOrderId, correlationId: uuidv7() }),
      useCase.execute({ changeOrderId, correlationId: uuidv7() }),
    ]);

    const outcomes = [first, second];
    // Um dos dois efetivamente autoriza e custodia; o outro perde a corrida —
    // `SKIPPED`/`CONCURRENT_WINNER` se colidiu no INSERT (`create()` devolveu
    // `false`), ou `ALREADY_PROCESSED` se encontrou o resultado do primeiro já
    // persistido na checagem de idempotência — NUNCA os dois "ganham".
    expect(outcomes.filter((outcome) => outcome.result === 'AUTHORIZED_AND_HELD')).toHaveLength(1);
    const loser = outcomes.find((outcome) => outcome.result !== 'AUTHORIZED_AND_HELD')!;
    if (loser.result === 'SKIPPED') {
      expect(loser.reason).toBe('CONCURRENT_WINNER');
    } else {
      expect(loser.result).toBe('ALREADY_PROCESSED');
    }

    const authorizations = await db
      .select()
      .from(paymentIncrementalAuthorizations)
      .where(eq(paymentIncrementalAuthorizations.changeOrderId, changeOrderId));
    expect(authorizations).toHaveLength(1);
    const custodies = await db
      .select()
      .from(incrementalTrustCustodies)
      .where(eq(incrementalTrustCustodies.changeOrderId, changeOrderId));
    expect(custodies).toHaveLength(1);
  });

  it('corrida: duas liberações concorrentes da MESMA tranche incremental liberam só uma vez', async () => {
    const contract = await contractInProgress(['Vanessa Lima Oliveira', 'Thiago Barbosa Melo']);
    const changeOrderId = await proposeScopeChange(contract, 88);
    await approveChangeOrder(contract, changeOrderId);
    const tranche = await waitFor(() => incrementalCustodyOf(changeOrderId), 'tranche incremental em custódia');

    const releaseUseCase = app.get(ReleaseFundsUseCase);
    // Fase 1 primeiro (fora da corrida): leva a tranche a READY_FOR_RELEASE.
    // `db` serve de executor direto aqui — `DatabaseExecutor` aceita tanto o
    // pool quanto uma transação (ver shared/database/database.module.ts).
    await releaseUseCase.prepare({ orderId: contract.orderId, correlationId: uuidv7() }, db);
    const ready = await incrementalCustodyOf(changeOrderId);
    expect(ready!.status).toBe('READY_FOR_RELEASE');

    // Fase 2, DUAS vezes em paralelo, para a MESMA tranche — a corrida real.
    const [first, second] = await Promise.all([
      releaseUseCase.finalize(tranche.id, uuidv7()),
      releaseUseCase.finalize(tranche.id, uuidv7()),
    ]);

    const results = [first.result, second.result].sort();
    expect(results).toEqual(['ALREADY_RELEASED', 'RELEASED']);

    const finalTranche = await incrementalCustodyOf(changeOrderId);
    expect(finalTranche!.status).toBe('RELEASED');

    // Exatamente UM Funds.Released, nunca dois, para a mesma tranche.
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, tranche.id));
    expect(events.filter((event) => event.eventType === 'Funds.Released')).toHaveLength(1);
  });
});
