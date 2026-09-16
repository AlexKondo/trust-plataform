import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { Payment } from '../../domain/entities/payment';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { RefundPaymentUseCase } from '../../application/usecases/refund-payment.usecase';
import {
  RefundPaymentOnDisputeResolvedConsumer,
  disputeRefundIdempotencyKey,
} from './refund-payment-on-dispute-resolved.consumer';

const ORDER_ID = 'order-1';
const DECISION_ID = 'decision-1';

function envelope(payload: Record<string, unknown>): ConsumedEvent {
  return {
    eventId: '0198c7e0-0000-7000-8000-0000000000dd',
    eventType: 'MarketplaceDispute.Resolved',
    aggregateType: 'MarketplaceDispute',
    aggregateId: 'dispute-1',
    eventVersion: '1.0',
    producer: 'marketplace-service',
    correlationId: '0198c7e0-0000-7000-8000-0000000000ee',
    occurredAt: new Date().toISOString(),
    payload: {
      disputeId: 'dispute-1',
      decisionId: DECISION_ID,
      orderId: ORDER_ID,
      decisionType: 'UPHELD',
      decidedBy: 'admin-1',
      ...payload,
    },
  };
}

function approvedAuthorization(): PaymentAuthorization {
  return PaymentAuthorization.fromGatewayResult({
    paymentId: 'payment-1',
    providerId: 'sandbox',
    idempotencyKey: 'auth-key',
    result: {
      outcome: 'APPROVED',
      providerTransactionId: 'sbx_auth_1',
      providerCode: 'approved',
      message: null,
      authorizationCode: 'ABC',
      authorizedAmountCents: 50000,
      expiresAt: null,
      rawResponse: {},
    },
  });
}

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

describe('RefundPaymentOnDisputeResolvedConsumer (IP-008)', () => {
  let payment: Payment;
  let paymentRepository: PaymentRepository;
  let authorizationRepository: PaymentAuthorizationRepository;
  let refundPayment: RefundPaymentUseCase;
  let consumer: RefundPaymentOnDisputeResolvedConsumer;

  beforeEach(() => {
    payment = Payment.create({
      orderId: ORDER_ID,
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amountCents: 50000,
      currency: 'BRL',
    });
    payment.markAuthorized('sandbox');
    payment.markInCustody();
    paymentRepository = { findByOrderId: vi.fn().mockResolvedValue(payment) } as unknown as PaymentRepository;
    authorizationRepository = {
      findApprovedByPayment: vi.fn().mockResolvedValue(approvedAuthorization()),
    } as unknown as PaymentAuthorizationRepository;
    refundPayment = { execute: vi.fn().mockResolvedValue({ result: 'COMPLETED', refundId: 'refund-1' }) } as unknown as RefundPaymentUseCase;
    consumer = new RefundPaymentOnDisputeResolvedConsumer(
      paymentRepository,
      authorizationRepository,
      refundPayment,
      logger(),
    );
  });

  it('decisão com refundAmount positivo dispara o reembolso pelo valor exato digitado (nunca calculado de decisionType)', async () => {
    await consumer.handle(envelope({ refundAmount: 200.5 }));

    expect(refundPayment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: payment.id,
        orderId: ORDER_ID,
        amountCents: 20050,
        reason: 'DISPUTE_UPHELD',
        disputeId: 'dispute-1',
        idempotencyKey: disputeRefundIdempotencyKey(DECISION_ID),
        providerTransactionId: 'sbx_auth_1',
      }),
    );
  });

  it('sem refundAmount: decisão não movimenta dinheiro nenhum', async () => {
    await consumer.handle(envelope({}));
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('refundAmount 0: idêntico a ausente — nenhum reembolso', async () => {
    await consumer.handle(envelope({ refundAmount: 0 }));
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('refundAmount negativo (defesa contra payload malformado): ignorado, nenhum reembolso', async () => {
    await consumer.handle(envelope({ refundAmount: -50 }));
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('Payment inexistente para o pedido: não lança, apenas não reembolsa', async () => {
    vi.mocked(paymentRepository.findByOrderId).mockResolvedValue(null);
    await expect(consumer.handle(envelope({ refundAmount: 100 }))).resolves.not.toThrow();
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('sem autorização aprovada: não lança, apenas não reembolsa', async () => {
    vi.mocked(authorizationRepository.findApprovedByPayment).mockResolvedValue(null);
    await expect(consumer.handle(envelope({ refundAmount: 100 }))).resolves.not.toThrow();
    expect(refundPayment.execute).not.toHaveBeenCalled();
  });

  it('a chave de idempotência é pela DECISÃO — duas decisões diferentes do mesmo pedido nunca colidem', () => {
    expect(disputeRefundIdempotencyKey('decision-a')).not.toBe(disputeRefundIdempotencyKey('decision-b'));
  });
});
