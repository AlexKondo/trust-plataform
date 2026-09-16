import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { Payment } from '../../domain/entities/payment';
import { AUTHORIZATION_STATUS } from '../../domain/entities/payment-types';
import { TrustCustody } from '../../domain/entities/trust-custody';
import { IncrementalTrustCustody } from '../../domain/entities/incremental-trust-custody';
import { PaymentIncrementalAuthorization } from '../../domain/entities/payment-incremental-authorization';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import { RefundPaymentUseCase } from '../../application/usecases/refund-payment.usecase';
import {
  RefundPaymentOnOrderCancelledConsumer,
  cancelRefundIdempotencyKey,
  cancelVoidIdempotencyKey,
} from './refund-payment-on-order-cancelled.consumer';

const ORDER_ID = 'order-1';
const CHANGE_ORDER_ID = 'change-order-1';

function envelope(payload: Record<string, unknown>): ConsumedEvent {
  return {
    eventId: '0198c7e0-0000-7000-8000-0000000000aa',
    eventType: 'MarketplaceOrder.Cancelled',
    aggregateType: 'MarketplaceOrder',
    aggregateId: ORDER_ID,
    eventVersion: '1.0',
    producer: 'marketplace-service',
    correlationId: '0198c7e0-0000-7000-8000-0000000000bb',
    occurredAt: new Date().toISOString(),
    payload: { orderId: ORDER_ID, cancelledBy: 'buyer-1', ...payload },
  };
}

function approvedAuthorization(providerTransactionId = 'sbx_auth_1'): PaymentAuthorization {
  return PaymentAuthorization.fromGatewayResult({
    paymentId: 'payment-1',
    providerId: 'sandbox',
    idempotencyKey: 'auth-key',
    result: {
      outcome: 'APPROVED',
      providerTransactionId,
      providerCode: 'approved',
      message: null,
      authorizationCode: 'ABC',
      authorizedAmountCents: 20000,
      expiresAt: null,
      rawResponse: {},
    },
  });
}

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

describe('RefundPaymentOnOrderCancelledConsumer (IP-008)', () => {
  let payment: Payment;
  let paymentRepository: PaymentRepository;
  let authorizationRepository: PaymentAuthorizationRepository;
  let custodyRepository: TrustCustodyRepository;
  let incrementalAuthorizationRepository: PaymentIncrementalAuthorizationRepository;
  let incrementalCustodyRepository: IncrementalTrustCustodyRepository;
  let refundPayment: RefundPaymentUseCase;
  let gateway: PaymentGateway;
  let outbox: OutboxService;
  let audit: AuditLogService;
  let db: Database;
  let consumer: RefundPaymentOnOrderCancelledConsumer;

  function build(): RefundPaymentOnOrderCancelledConsumer {
    return new RefundPaymentOnOrderCancelledConsumer(
      paymentRepository,
      authorizationRepository,
      custodyRepository,
      incrementalAuthorizationRepository,
      incrementalCustodyRepository,
      refundPayment,
      gateway,
      outbox,
      audit,
      db,
      logger(),
    );
  }

  beforeEach(() => {
    authorizationRepository = {
      findApprovedByPayment: vi.fn().mockResolvedValue(approvedAuthorization()),
    } as unknown as PaymentAuthorizationRepository;
    custodyRepository = {
      findByPaymentId: vi.fn().mockResolvedValue(null),
      markRefundedIfInCustody: vi.fn().mockResolvedValue(true),
    } as unknown as TrustCustodyRepository;
    incrementalAuthorizationRepository = {
      listByPayment: vi.fn().mockResolvedValue([]),
    } as unknown as PaymentIncrementalAuthorizationRepository;
    incrementalCustodyRepository = {
      findByChangeOrderId: vi.fn().mockResolvedValue(null),
      markRefundedIfInCustody: vi.fn().mockResolvedValue(true),
    } as unknown as IncrementalTrustCustodyRepository;
    refundPayment = { execute: vi.fn().mockResolvedValue({ result: 'COMPLETED', refundId: 'refund-1' }) } as unknown as RefundPaymentUseCase;
    gateway = {
      cancel: vi.fn().mockResolvedValue({
        outcome: 'APPROVED',
        providerTransactionId: 'sbx_cancel_1',
        providerCode: 'cancelled',
        message: null,
        rawResponse: {},
      }),
    } as unknown as PaymentGateway;
    outbox = {
      enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }),
      enqueueStandalone: vi.fn().mockResolvedValue({ eventId: 'evt-2' }),
    } as unknown as OutboxService;
    audit = { record: vi.fn(), recordSafe: vi.fn() } as unknown as AuditLogService;
    db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn('tx')),
    } as unknown as Database;
  });

  it('Payment CREATED (nada cobrado): só cancela — nenhuma chamada de gateway', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(refundPayment.execute).not.toHaveBeenCalled();
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);
    expect(vi.mocked(paymentRepository.save).mock.calls[0]![0].status).toBe('CANCELLED');
  });

  it('Payment AUTHORIZED (nunca custodiado): anula a autorização no gateway, não é reembolso', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    payment.markAuthorized('sandbox');
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionId: 'sbx_auth_1',
        idempotencyKey: cancelVoidIdempotencyKey(ORDER_ID),
      }),
    );
    expect(refundPayment.execute).not.toHaveBeenCalled();
    expect(vi.mocked(paymentRepository.save).mock.calls[0]![0].status).toBe('CANCELLED');
  });

  it('Payment FUNDS_IN_CUSTODY: reembolsa o valor total e marca a custódia REFUNDED', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    payment.markAuthorized('sandbox');
    payment.markInCustody();
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    const custody = TrustCustody.create({
      paymentId: payment.id,
      orderId: ORDER_ID,
      buyerId: 'b',
      sellerId: 's',
      amountCents: 20000,
      currency: 'BRL',
    });
    vi.mocked(custodyRepository.findByPaymentId).mockResolvedValue(custody);
    consumer = build();

    await consumer.handle(envelope({}));

    expect(refundPayment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: payment.id,
        amountCents: 20000,
        reason: 'ORDER_CANCELLED_BEFORE_EXECUTION',
        idempotencyKey: cancelRefundIdempotencyKey(ORDER_ID),
        providerTransactionId: 'sbx_auth_1',
      }),
    );
    expect(custodyRepository.markRefundedIfInCustody).toHaveBeenCalledWith(custody.id, expect.any(Date));
    const eventTypes = vi
      .mocked(outbox.enqueueStandalone)
      .mock.calls.map((call) => (call[0] as { eventType: string }).eventType);
    expect(eventTypes).toContain('TrustCustody.Refunded');
  });

  it('tranche incremental aprovada mas AINDA sem custódia: anula (gap amountAuthorizedNotInCustody), não reembolsa', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    payment.markAuthorized('sandbox');
    payment.markInCustody();
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    const tranche = PaymentIncrementalAuthorization.fromGatewayResult({
      paymentId: payment.id,
      changeOrderId: CHANGE_ORDER_ID,
      orderId: ORDER_ID,
      buyerId: 'b',
      sellerId: 's',
      providerId: 'sandbox',
      idempotencyKey: 'incremental-auth-key',
      amountCents: 3000,
      currency: 'BRL',
      result: {
        outcome: 'APPROVED',
        providerTransactionId: 'sbx_incremental_1',
        providerCode: 'approved',
        message: null,
        authorizationCode: null,
        authorizedAmountCents: 3000,
        expiresAt: null,
        rawResponse: {},
      },
    });
    vi.mocked(incrementalAuthorizationRepository.listByPayment).mockResolvedValue([tranche]);
    vi.mocked(incrementalCustodyRepository.findByChangeOrderId).mockResolvedValue(null);
    const custody = TrustCustody.create({
      paymentId: payment.id,
      orderId: ORDER_ID,
      buyerId: 'b',
      sellerId: 's',
      amountCents: 20000,
      currency: 'BRL',
    });
    vi.mocked(custodyRepository.findByPaymentId).mockResolvedValue(custody);
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ providerTransactionId: 'sbx_incremental_1' }),
    );
    // Não confunde com um reembolso: refundPayment é chamado só pela tranche
    // original (custodiada), nunca por esta tranche incremental sem custódia.
    const refundCalls = vi.mocked(refundPayment.execute).mock.calls;
    expect(refundCalls.every((call) => call[0].idempotencyKey !== `refund:cancel:incremental:${CHANGE_ORDER_ID}`)).toBe(true);
  });

  it('tranche incremental aprovada E já custodiada: reembolsa a tranche e marca REFUNDED', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    payment.markAuthorized('sandbox');
    payment.markInCustody();
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    const tranche = PaymentIncrementalAuthorization.fromGatewayResult({
      paymentId: payment.id,
      changeOrderId: CHANGE_ORDER_ID,
      orderId: ORDER_ID,
      buyerId: 'b',
      sellerId: 's',
      providerId: 'sandbox',
      idempotencyKey: 'incremental-auth-key',
      amountCents: 3000,
      currency: 'BRL',
      result: {
        outcome: 'APPROVED',
        providerTransactionId: 'sbx_incremental_1',
        providerCode: 'approved',
        message: null,
        authorizationCode: null,
        authorizedAmountCents: 3000,
        expiresAt: null,
        rawResponse: {},
      },
    });
    vi.mocked(incrementalAuthorizationRepository.listByPayment).mockResolvedValue([tranche]);
    const incrementalCustody = IncrementalTrustCustody.create({
      paymentId: payment.id,
      orderId: ORDER_ID,
      changeOrderId: CHANGE_ORDER_ID,
      incrementalAuthorizationId: tranche.id,
      buyerId: 'b',
      sellerId: 's',
      amountCents: 3000,
      currency: 'BRL',
    });
    vi.mocked(incrementalCustodyRepository.findByChangeOrderId).mockResolvedValue(incrementalCustody);
    vi.mocked(custodyRepository.findByPaymentId).mockResolvedValue(null); // sem tranche original ainda
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(refundPayment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 3000,
        idempotencyKey: `refund:cancel:incremental:${CHANGE_ORDER_ID}`,
        providerTransactionId: 'sbx_incremental_1',
      }),
    );
    expect(incrementalCustodyRepository.markRefundedIfInCustody).toHaveBeenCalledWith(
      incrementalCustody.id,
      expect.any(Date),
    );
  });

  it('tranche incremental RECUSADA: nenhuma chamada de gateway/refund — nada se moveu', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    const declined = PaymentIncrementalAuthorization.fromGatewayResult({
      paymentId: payment.id,
      changeOrderId: CHANGE_ORDER_ID,
      orderId: ORDER_ID,
      buyerId: 'b',
      sellerId: 's',
      providerId: 'sandbox',
      idempotencyKey: 'incremental-auth-key',
      amountCents: 3000,
      currency: 'BRL',
      result: {
        outcome: 'DECLINED',
        providerTransactionId: null,
        providerCode: 'insufficient_funds',
        message: null,
        authorizationCode: null,
        authorizedAmountCents: 0,
        expiresAt: null,
        rawResponse: {},
      },
    });
    expect(declined.status).toBe(AUTHORIZATION_STATUS.DECLINED);
    vi.mocked(incrementalAuthorizationRepository.listByPayment).mockResolvedValue([declined]);
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('reentrega do evento (Payment já CANCELLED): idempotente, nenhuma ação nova', async () => {
    payment = Payment.create({ orderId: ORDER_ID, buyerId: 'b', sellerId: 's', amountCents: 20000, currency: 'BRL' });
    payment.cancel();
    paymentRepository = {
      findByOrderId: vi.fn().mockResolvedValue(payment),
      findById: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    consumer = build();

    await consumer.handle(envelope({}));

    expect(gateway.cancel).not.toHaveBeenCalled();
    expect(refundPayment.execute).not.toHaveBeenCalled();
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });
});
