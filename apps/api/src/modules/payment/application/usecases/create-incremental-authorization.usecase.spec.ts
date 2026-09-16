import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { Payment } from '../../domain/entities/payment';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { ApprovedChangeOrderSnapshot, ChangeOrderCommercialQuery } from '../../domain/services/change-order-commercial.query';
import { AuthorizationResult, PaymentGateway } from '../../domain/services/payment-gateway';
import { PaymentProviderResolver } from '../../infrastructure/gateway/payment-provider.resolver';
import {
  CreateIncrementalAuthorizationUseCase,
  incrementalAuthorizationIdempotencyKey,
} from './create-incremental-authorization.usecase';

const CORRELATION = '0198c7e0-0000-7000-8000-0000000000bb';
const CHANGE_ORDER_ID = 'change-order-1';

function authorizedPayment(): Payment {
  const payment = Payment.create({
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountCents: 15000,
    currency: 'BRL',
  });
  payment.markAuthorized('sandbox');
  return payment;
}

function snapshot(overrides: Partial<ApprovedChangeOrderSnapshot> = {}): ApprovedChangeOrderSnapshot {
  return {
    changeOrderId: CHANGE_ORDER_ID,
    orderId: 'order-1',
    currency: 'BRL',
    changeGrossAmountCents: 5000,
    ...overrides,
  };
}

function gatewayResult(overrides: Partial<AuthorizationResult> = {}): AuthorizationResult {
  return {
    outcome: 'APPROVED',
    providerTransactionId: 'sbx_1',
    providerCode: 'approved',
    message: null,
    authorizationCode: 'ABC',
    authorizedAmountCents: 5000,
    expiresAt: null,
    rawResponse: {},
    ...overrides,
  };
}

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

describe('CreateIncrementalAuthorizationUseCase (IP-007)', () => {
  let paymentRepository: PaymentRepository;
  let incrementalAuthorizationRepository: PaymentIncrementalAuthorizationRepository;
  let incrementalCustodyRepository: IncrementalTrustCustodyRepository;
  let changeOrderQuery: ChangeOrderCommercialQuery;
  let providerResolver: PaymentProviderResolver;
  let gateway: PaymentGateway;
  let outbox: OutboxService;
  let audit: AuditLogService;
  let db: Database;
  let useCase: CreateIncrementalAuthorizationUseCase;

  beforeEach(() => {
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(authorizedPayment()),
    } as unknown as PaymentRepository;
    incrementalAuthorizationRepository = {
      findByChangeOrderId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(true),
    } as unknown as PaymentIncrementalAuthorizationRepository;
    incrementalCustodyRepository = {
      create: vi.fn().mockResolvedValue(true),
    } as unknown as IncrementalTrustCustodyRepository;
    changeOrderQuery = {
      findApprovedById: vi.fn().mockResolvedValue(snapshot()),
      sumApprovedGrossCentsByOrder: vi.fn().mockResolvedValue(5000),
    };
    gateway = {
      providerId: 'sandbox',
      authorize: vi.fn().mockResolvedValue(gatewayResult()),
    } as unknown as PaymentGateway;
    providerResolver = { resolve: vi.fn().mockReturnValue(gateway) } as unknown as PaymentProviderResolver;
    outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }) } as unknown as OutboxService;
    audit = { record: vi.fn() } as unknown as AuditLogService;
    db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn('tx')),
    } as unknown as Database;

    useCase = new CreateIncrementalAuthorizationUseCase(
      paymentRepository,
      incrementalAuthorizationRepository,
      incrementalCustodyRepository,
      changeOrderQuery,
      providerResolver,
      outbox,
      audit,
      db,
      logger(),
    );
  });

  it('aprova e custodia — usa SEMPRE o valor congelado do Change Order, nunca redigitado', async () => {
    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome.result).toBe('AUTHORIZED_AND_HELD');
    const authorizeCall = vi.mocked(gateway.authorize).mock.calls[0]![0];
    expect(authorizeCall.amountCents).toBe(5000);
    expect(authorizeCall.idempotencyKey).toBe(incrementalAuthorizationIdempotencyKey(CHANGE_ORDER_ID));

    const savedAuthorization = vi.mocked(incrementalAuthorizationRepository.create).mock.calls[0]![0];
    expect(savedAuthorization.amountCents).toBe(5000);

    const savedCustody = vi.mocked(incrementalCustodyRepository.create).mock.calls[0]![0];
    expect(savedCustody.amountCents).toBe(5000);
    expect(savedCustody.changeOrderId).toBe(CHANGE_ORDER_ID);

    const eventTypes = vi
      .mocked(outbox.enqueue)
      .mock.calls.map((call) => (call[1] as { eventType: string }).eventType);
    expect(eventTypes).toEqual([
      'PaymentIncrementalAuthorization.Approved',
      'TrustCustody.Created',
      'Funds.Held',
    ]);
  });

  it('reentrega do mesmo Change Order NÃO chama o gateway de novo (idempotência)', async () => {
    const existing = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });
    expect(existing.result).toBe('AUTHORIZED_AND_HELD');
    const authorizationId = existing.result === 'AUTHORIZED_AND_HELD' ? existing.authorizationId : '';

    vi.mocked(incrementalAuthorizationRepository.findByChangeOrderId).mockResolvedValue({
      id: authorizationId,
    } as never);

    const replay = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(replay).toEqual({ result: 'ALREADY_PROCESSED', authorizationId });
    expect(gateway.authorize).toHaveBeenCalledTimes(1);
  });

  it('Change Order não aprovado (ou inexistente) não chama o gateway', async () => {
    vi.mocked(changeOrderQuery.findApprovedById).mockResolvedValue(null);

    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'CHANGE_ORDER_NOT_APPROVED' });
    expect(gateway.authorize).not.toHaveBeenCalled();
  });

  it('Payment inexistente não chama o gateway nem cria autorização órfã', async () => {
    vi.mocked(paymentRepository.findByOrderId).mockResolvedValue(null);

    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'PAYMENT_NOT_FOUND' });
    expect(gateway.authorize).not.toHaveBeenCalled();
  });

  it('Payment ainda CREATED (nunca autorizado) é inelegível — nenhuma autorização incremental sobre um pagamento que nunca funcionou', async () => {
    const notYetAuthorized = Payment.create({
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amountCents: 15000,
      currency: 'BRL',
    });
    vi.mocked(paymentRepository.findByOrderId).mockResolvedValue(notYetAuthorized);

    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'PAYMENT_NOT_ELIGIBLE' });
    expect(gateway.authorize).not.toHaveBeenCalled();
  });

  it('gateway recusa (DECLINED): nenhuma custódia é criada, nenhum evento de custódia é publicado', async () => {
    vi.mocked(gateway.authorize).mockResolvedValue(
      gatewayResult({ outcome: 'DECLINED', authorizedAmountCents: 0, providerCode: 'insufficient_funds' }),
    );

    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome.result).toBe('AUTHORIZATION_DECLINED');
    expect(incrementalCustodyRepository.create).not.toHaveBeenCalled();
    const eventTypes = vi
      .mocked(outbox.enqueue)
      .mock.calls.map((call) => (call[1] as { eventType: string }).eventType);
    expect(eventTypes).toEqual(['PaymentIncrementalAuthorization.Failed']);
  });

  it('corrida: o índice único (create() retorna false) nunca duplica evento/custódia — devolve SKIPPED', async () => {
    vi.mocked(incrementalAuthorizationRepository.create).mockResolvedValue(false);

    const outcome = await useCase.execute({ changeOrderId: CHANGE_ORDER_ID, correlationId: CORRELATION });

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'CONCURRENT_WINNER' });
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(incrementalCustodyRepository.create).not.toHaveBeenCalled();
  });

  it('marca FUNDS_IN_CUSTODY/FUNDS_RELEASED/SETTLED como elegíveis', async () => {
    for (const status of [
      PAYMENT_STATUS.FUNDS_IN_CUSTODY,
      PAYMENT_STATUS.FUNDS_RELEASED,
      PAYMENT_STATUS.SETTLED,
    ]) {
      const payment = authorizedPayment();
      // Caminha a máquina de estados até `status` — nenhum salto direto existe.
      payment.markInCustody();
      if (status !== PAYMENT_STATUS.FUNDS_IN_CUSTODY) {
        payment.markReleased();
      }
      if (status === PAYMENT_STATUS.SETTLED) {
        payment.markSettled();
      }
      vi.mocked(paymentRepository.findByOrderId).mockResolvedValue(payment);
      vi.mocked(incrementalAuthorizationRepository.findByChangeOrderId).mockResolvedValue(null);

      const outcome = await useCase.execute({
        changeOrderId: `${CHANGE_ORDER_ID}-${status}`,
        correlationId: CORRELATION,
      });
      expect(outcome.result).toBe('AUTHORIZED_AND_HELD');
    }
  });
});
