import { describe, expect, it } from 'vitest';
import { IncrementalTrustCustody } from '../entities/incremental-trust-custody';
import { Payment } from '../entities/payment';
import { PAYMENT_STATUS } from '../entities/payment-types';
import { RELEASE_DENIAL_REASON, evaluateIncrementalRelease } from './trust-release-policy.service';

function authorizedPayment(amountCents = 15000): Payment {
  const payment = Payment.create({
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountCents,
    currency: 'BRL',
  });
  payment.markAuthorized('sandbox');
  payment.markInCustody();
  return payment;
}

function trancheFor(payment: Payment, amountCents = 5000): IncrementalTrustCustody {
  return IncrementalTrustCustody.create({
    paymentId: payment.id,
    orderId: payment.orderId,
    changeOrderId: 'change-order-1',
    incrementalAuthorizationId: 'incremental-auth-1',
    buyerId: payment.buyerId,
    sellerId: payment.sellerId,
    amountCents,
    currency: payment.currency,
  });
}

function scenario(overrides: Partial<Parameters<typeof evaluateIncrementalRelease>[0]> = {}) {
  const payment = authorizedPayment();
  const tranche = trancheFor(payment);
  return {
    tranche,
    payment,
    confirmedOrderId: payment.orderId,
    customerConfirmed: true,
    hasActiveDispute: false,
    ...overrides,
  };
}

describe('evaluateIncrementalRelease (IP-007)', () => {
  it('ALLOW quando a tranche é menor que o Payment, cliente confirmou e não há disputa', () => {
    // Diferente de evaluateRelease: a tranche NUNCA tem o mesmo valor do
    // Payment (é só o delta) — se a checagem de igualdade da política
    // original fosse reaproveitada aqui, isto SEMPRE falharia.
    expect(evaluateIncrementalRelease(scenario())).toEqual({ allowed: true, reasons: [] });
  });

  it('DENY quando a tranche não está IN_CUSTODY', () => {
    const base = scenario();
    base.tranche.markReadyForRelease();
    const decision = evaluateIncrementalRelease(base);
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.CUSTODY_NOT_IN_CUSTODY);
  });

  it('DENY quando existe disputa ativa', () => {
    const decision = evaluateIncrementalRelease(scenario({ hasActiveDispute: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.DISPUTE_OPEN);
  });

  it('DENY quando o pedido confirmado não é o da tranche', () => {
    const decision = evaluateIncrementalRelease(scenario({ confirmedOrderId: 'outro-pedido' }));
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.ORDER_MISMATCH);
  });

  it('DENY quando a tranche referencia outro Payment (pertencimento, não igualdade de valor)', () => {
    const payment = authorizedPayment();
    const outroPayment = authorizedPayment(99999);
    const tranche = trancheFor(outroPayment);
    const decision = evaluateIncrementalRelease({
      tranche,
      payment,
      confirmedOrderId: payment.orderId,
      customerConfirmed: true,
      hasActiveDispute: false,
    });
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.SNAPSHOT_MISMATCH);
  });

  it('ALLOW mesmo quando o Payment já está FUNDS_RELEASED (tranche original liberou primeiro)', () => {
    // Ponto central do desenho: a tranche incremental não depende do Payment
    // ainda estar em FUNDS_IN_CUSTODY — as duas liberações são independentes.
    const payment = authorizedPayment();
    const tranche = trancheFor(payment);
    payment.transitionTo(PAYMENT_STATUS.FUNDS_RELEASED);
    const decision = evaluateIncrementalRelease({
      tranche,
      payment,
      confirmedOrderId: payment.orderId,
      customerConfirmed: true,
      hasActiveDispute: false,
    });
    expect(decision.allowed).toBe(true);
  });

  it('acumula TODOS os motivos, não só o primeiro', () => {
    const decision = evaluateIncrementalRelease(
      scenario({ hasActiveDispute: true, confirmedOrderId: 'errado' }),
    );
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        RELEASE_DENIAL_REASON.ORDER_MISMATCH,
        RELEASE_DENIAL_REASON.DISPUTE_OPEN,
      ]),
    );
  });
});
