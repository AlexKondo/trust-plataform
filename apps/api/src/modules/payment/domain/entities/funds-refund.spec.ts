import { describe, expect, it } from 'vitest';
import { RefundTransitionException, RefundValidationException } from '../exceptions/payment.exceptions';
import { RefundResult } from '../services/payment-gateway';
import { FundsRefund, REFUND_STATUS } from './funds-refund';

const INPUT = {
  paymentId: '019fe8f0-0000-7000-8000-0000000000f1',
  orderId: '019fe8f0-0000-7000-8000-0000000000f2',
  amountCents: 5000,
  currency: 'BRL',
  reason: 'ORDER_CANCELLED_BEFORE_EXECUTION' as const,
  requestedBy: '019fe8f0-0000-7000-8000-0000000000f3',
  providerId: 'sandbox',
  idempotencyKey: 'refund:cancel:019fe8f0-0000-7000-8000-0000000000f2',
};

function approvedResult(amountCents: number): RefundResult {
  return {
    outcome: 'APPROVED',
    providerTransactionId: 'sbx_refund_1',
    providerCode: 'refunded',
    message: null,
    refundedAmountCents: amountCents,
    rawResponse: { cvv: 'must-be-stripped' },
  };
}

describe('FundsRefund (PAY-006 / IP-008)', () => {
  it('nasce PENDING, com o valor e motivo informados', () => {
    const refund = FundsRefund.request(INPUT);
    expect(refund.status).toBe(REFUND_STATUS.PENDING);
    expect(refund.isPending()).toBe(true);
    expect(refund.amountCents).toBe(5000);
    expect(refund.reason).toBe('ORDER_CANCELLED_BEFORE_EXECUTION');
    expect(refund.disputeId).toBeNull();
    expect(refund.providerRefundId).toBeNull();
  });

  it('rejeita valor zero ou não inteiro (nunca ponto flutuante em centavos)', () => {
    expect(() => FundsRefund.request({ ...INPUT, amountCents: 0 })).toThrow(RefundValidationException);
    expect(() => FundsRefund.request({ ...INPUT, amountCents: 10.5 })).toThrow();
  });

  it('segue a máquina de duas fases: PENDING -> PROCESSING -> COMPLETED', () => {
    const refund = FundsRefund.request(INPUT);
    refund.markProcessing();
    refund.markCompleted(approvedResult(5000));
    expect(refund.isCompleted()).toBe(true);
    expect(refund.status).toBe(REFUND_STATUS.COMPLETED);
    expect(refund.providerRefundId).toBe('sbx_refund_1');
    expect(refund.completedAt).toBeInstanceOf(Date);
  });

  it('nunca pula fase: PENDING não vai direto para COMPLETED', () => {
    const refund = FundsRefund.request(INPUT);
    expect(() => refund.markCompleted(approvedResult(5000))).toThrow(RefundTransitionException);
  });

  it('sanitiza a resposta do gateway — nunca guarda CVV/dado de cartão', () => {
    const refund = FundsRefund.request(INPUT);
    refund.markProcessing();
    refund.markCompleted(approvedResult(5000));
    expect(refund.toProps().gatewayResponse).not.toHaveProperty('cvv');
  });

  it('COMPLETED e FAILED são terminais — nenhuma reautorização falsa é inventada', () => {
    const completed = FundsRefund.request(INPUT);
    completed.markProcessing();
    completed.markCompleted(approvedResult(5000));
    expect(() => completed.markProcessing()).toThrow(RefundTransitionException);

    const failed = FundsRefund.request(INPUT);
    failed.markProcessing();
    failed.markFailed(null);
    expect(failed.status).toBe(REFUND_STATUS.FAILED);
    expect(() => failed.markProcessing()).toThrow(RefundTransitionException);
  });

  it('restore() reidrata sem recalcular nada', () => {
    const original = FundsRefund.request(INPUT);
    const restored = FundsRefund.restore(original.toProps());
    expect(restored.toProps()).toEqual(original.toProps());
  });
});
