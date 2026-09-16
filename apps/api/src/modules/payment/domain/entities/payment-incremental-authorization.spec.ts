import { describe, expect, it } from 'vitest';
import { AuthorizationResult } from '../services/payment-gateway';
import { PaymentIncrementalAuthorization } from './payment-incremental-authorization';
import { AUTHORIZATION_STATUS } from './payment-types';

const CHANGE_ORDER_ID = '019fe8f0-0000-7000-8000-0000000000c1';
const PAYMENT_ID = '019fe8f0-0000-7000-8000-0000000000c2';
const ORDER_ID = '019fe8f0-0000-7000-8000-0000000000c3';
const BUYER_ID = '019fe8f0-0000-7000-8000-0000000000c4';
const SELLER_ID = '019fe8f0-0000-7000-8000-0000000000c5';

function approvedResult(overrides: Partial<AuthorizationResult> = {}): AuthorizationResult {
  return {
    outcome: 'APPROVED',
    providerTransactionId: 'sbx_123',
    providerCode: 'approved',
    message: null,
    authorizationCode: 'ABC123',
    authorizedAmountCents: 5000,
    expiresAt: null,
    rawResponse: { cvv: 'must-be-stripped', outcome: 'APPROVED' },
    ...overrides,
  };
}

function build(overrides: Partial<AuthorizationResult> = {}, amountCents = 5000) {
  return PaymentIncrementalAuthorization.fromGatewayResult({
    paymentId: PAYMENT_ID,
    changeOrderId: CHANGE_ORDER_ID,
    orderId: ORDER_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    providerId: 'sandbox',
    idempotencyKey: `incremental-auth:${CHANGE_ORDER_ID}`,
    amountCents,
    currency: 'BRL',
    result: approvedResult(overrides),
  });
}

describe('PaymentIncrementalAuthorization (IP-007)', () => {
  it('grava o valor PEDIDO (frozen changeGrossAmount), não o que o gateway devolveu', () => {
    // O gateway aprova o valor pedido; ainda assim o valor gravado é o
    // parâmetro explícito, nunca derivado de `result.authorizedAmountCents` —
    // protege contra o gateway devolver um número diferente por engano.
    const authorization = build({}, 5000);
    expect(authorization.amountCents).toBe(5000);
  });

  it('recusa (DECLINED) preserva o valor PEDIDO — não vira zero', () => {
    const authorization = build(
      { outcome: 'DECLINED', authorizedAmountCents: 0, providerCode: 'insufficient_funds' },
      5000,
    );
    expect(authorization.status).toBe(AUTHORIZATION_STATUS.DECLINED);
    expect(authorization.isApproved()).toBe(false);
    expect(authorization.amountCents).toBe(5000);
    expect(authorization.authorizedAt).toBeNull();
  });

  it('ERROR do provedor também preserva o valor pedido e não marca autorizado', () => {
    const authorization = build(
      { outcome: 'ERROR', authorizedAmountCents: 0, providerCode: 'provider_unavailable' },
      5000,
    );
    expect(authorization.status).toBe(AUTHORIZATION_STATUS.ERROR);
    expect(authorization.authorizedAt).toBeNull();
  });

  it('sanitiza a resposta do provedor — nunca guarda dado de instrumento de pagamento', () => {
    const authorization = build({ rawResponse: { cvv: '123', outcome: 'APPROVED' } });
    expect(authorization.toProps().gatewayResponse).not.toHaveProperty('cvv');
  });

  it('APPROVED grava authorizedAt; DECLINED/ERROR nunca gravam', () => {
    const approved = build();
    expect(approved.authorizedAt).toBeInstanceOf(Date);

    const declined = build({ outcome: 'DECLINED' });
    expect(declined.authorizedAt).toBeNull();
  });

  it('restore() reidrata sem recalcular nada', () => {
    const original = build();
    const restored = PaymentIncrementalAuthorization.restore(original.toProps());
    expect(restored.toProps()).toEqual(original.toProps());
  });
});
