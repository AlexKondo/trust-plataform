import { describe, expect, it } from 'vitest';
import {
  PaymentAccessDeniedException,
  PaymentTransitionException,
  PaymentValidationException,
} from '../exceptions/payment.exceptions';
import { Payment } from './payment';
import { PAYMENT_STATUS, PaymentStatus } from './payment-types';

const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';
const STRANGER = '019fe8f0-0000-7000-8000-000000000003';

const newPayment = (amountCents = 110000) =>
  Payment.create({
    orderId: '019fe8f0-0000-7000-8000-0000000000b1',
    buyerId: BUYER,
    sellerId: SELLER,
    amountCents,
    currency: 'BRL',
  });

/** Leva o pagamento até o estado desejado pelo caminho feliz. */
function paymentAt(status: PaymentStatus, amountCents = 110000): Payment {
  const payment = newPayment(amountCents);
  if (status === PAYMENT_STATUS.CREATED) return payment;
  payment.markAuthorized('sandbox');
  if (status === PAYMENT_STATUS.AUTHORIZED) return payment;
  payment.markInCustody();
  if (status === PAYMENT_STATUS.FUNDS_IN_CUSTODY) return payment;
  payment.markReleased();
  if (status === PAYMENT_STATUS.FUNDS_RELEASED) return payment;
  payment.markSettled();
  return payment;
}

describe('Payment — criação (PAY-001)', () => {
  it('nasce em CREATED com os valores do pedido', () => {
    const payment = newPayment();
    expect(payment.status).toBe(PAYMENT_STATUS.CREATED);
    expect(payment.amountCents).toBe(110000);
    expect(payment.refundedCents).toBe(0);
    expect(payment.refundableCents).toBe(110000);
    expect(payment.paymentProviderId).toBeNull();
  });

  it('recusa valor zero e valor fracionário de centavo', () => {
    expect(() => newPayment(0)).toThrow(PaymentValidationException);
    expect(() => newPayment(10.5)).toThrow(Error);
  });

  it('recusa comprador igual a vendedor', () => {
    expect(() =>
      Payment.create({
        orderId: 'o',
        buyerId: BUYER,
        sellerId: BUYER,
        amountCents: 1000,
        currency: 'BRL',
      }),
    ).toThrow(PaymentValidationException);
  });

  it('só participantes acessam; só o comprador paga', () => {
    const payment = newPayment();
    expect(() => payment.assertParticipant(STRANGER)).toThrow(PaymentAccessDeniedException);
    expect(() => payment.assertBuyer(SELLER)).toThrow(PaymentAccessDeniedException);
    expect(() => payment.assertBuyer(BUYER)).not.toThrow();
  });
});

describe('Payment — máquina de estados', () => {
  it('percorre o caminho feliz até a liquidação', () => {
    const payment = newPayment();
    payment.markAuthorized('sandbox');
    expect(payment.status).toBe(PAYMENT_STATUS.AUTHORIZED);
    expect(payment.paymentProviderId).toBe('sandbox');
    payment.markInCustody();
    expect(payment.status).toBe(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    payment.markReleased();
    payment.markSettled();
    expect(payment.status).toBe(PAYMENT_STATUS.SETTLED);
  });

  it('recusa salto: não vai de CREATED direto para custódia ou liquidação', () => {
    const payment = newPayment();
    expect(() => payment.markInCustody()).toThrow(PaymentTransitionException);
    expect(() => payment.markSettled()).toThrow(PaymentTransitionException);
  });

  it('falha de autorização permite nova tentativa (PAY-002 BR-005)', () => {
    const payment = newPayment();
    payment.markAuthorizationFailed();
    expect(payment.status).toBe(PAYMENT_STATUS.AUTHORIZATION_FAILED);
    payment.retryAuthorization();
    expect(payment.status).toBe(PAYMENT_STATUS.CREATED);
    payment.markAuthorized('sandbox');
    expect(payment.status).toBe(PAYMENT_STATUS.AUTHORIZED);
  });

  it('não autoriza duas vezes', () => {
    const payment = paymentAt(PAYMENT_STATUS.AUTHORIZED);
    expect(() => payment.markAuthorized('sandbox')).toThrow(PaymentTransitionException);
  });

  it('liquidado e reembolsado são terminais para novo pagamento', () => {
    const payment = paymentAt(PAYMENT_STATUS.SETTLED);
    expect(() => payment.markAuthorized('sandbox')).toThrow(PaymentTransitionException);
  });
});

describe('Payment — reembolso (PAY-006 BR-005)', () => {
  it('reembolso parcial deixa o pagamento como PARTIALLY_REFUNDED', () => {
    const payment = paymentAt(PAYMENT_STATUS.SETTLED);
    payment.registerRefund(30000);
    expect(payment.status).toBe(PAYMENT_STATUS.PARTIALLY_REFUNDED);
    expect(payment.refundedCents).toBe(30000);
    expect(payment.refundableCents).toBe(80000);
  });

  it('reembolsos somados até o total levam a REFUNDED', () => {
    const payment = paymentAt(PAYMENT_STATUS.SETTLED);
    payment.registerRefund(30000);
    payment.registerRefund(80000);
    expect(payment.status).toBe(PAYMENT_STATUS.REFUNDED);
    expect(payment.refundableCents).toBe(0);
  });

  it('a soma dos reembolsos nunca ultrapassa o valor pago', () => {
    const payment = paymentAt(PAYMENT_STATUS.SETTLED);
    payment.registerRefund(100000);
    expect(() => payment.registerRefund(20000)).toThrow(PaymentValidationException);
    expect(payment.refundedCents).toBe(100000);
  });

  it('recusa reembolso de valor zero', () => {
    const payment = paymentAt(PAYMENT_STATUS.SETTLED);
    expect(() => payment.registerRefund(0)).toThrow(PaymentValidationException);
  });

  it('dinheiro em custódia pode ser devolvido antes de liquidar', () => {
    const payment = paymentAt(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    payment.registerRefund(110000);
    expect(payment.status).toBe(PAYMENT_STATUS.REFUNDED);
  });
});
