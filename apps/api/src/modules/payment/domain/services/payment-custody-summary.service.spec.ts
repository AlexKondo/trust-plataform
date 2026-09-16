import { describe, expect, it } from 'vitest';
import { IncrementalTrustCustody } from '../entities/incremental-trust-custody';
import { Payment } from '../entities/payment';
import { PaymentIncrementalAuthorization } from '../entities/payment-incremental-authorization';
import { TrustCustody } from '../entities/trust-custody';
import { calculatePaymentCustodySummary } from './payment-custody-summary.service';

function payment(amountCents = 15000): Payment {
  return Payment.create({
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountCents,
    currency: 'BRL',
  });
}

function originalCustody(forPayment: Payment): TrustCustody {
  return TrustCustody.create({
    paymentId: forPayment.id,
    orderId: forPayment.orderId,
    buyerId: forPayment.buyerId,
    sellerId: forPayment.sellerId,
    amountCents: forPayment.amountCents,
    currency: forPayment.currency,
  });
}

function incrementalAuthorization(
  forPayment: Payment,
  changeOrderId: string,
  amountCents: number,
  status: 'APPROVED' | 'DECLINED' = 'APPROVED',
): PaymentIncrementalAuthorization {
  return PaymentIncrementalAuthorization.fromGatewayResult({
    paymentId: forPayment.id,
    changeOrderId,
    orderId: forPayment.orderId,
    buyerId: forPayment.buyerId,
    sellerId: forPayment.sellerId,
    providerId: 'sandbox',
    idempotencyKey: `incremental-auth:${changeOrderId}`,
    amountCents,
    currency: forPayment.currency,
    result: {
      outcome: status,
      providerTransactionId: status === 'APPROVED' ? 'sbx_1' : null,
      providerCode: status === 'APPROVED' ? 'approved' : 'insufficient_funds',
      message: null,
      authorizationCode: status === 'APPROVED' ? 'ABC' : null,
      authorizedAmountCents: status === 'APPROVED' ? amountCents : 0,
      expiresAt: null,
      rawResponse: {},
    },
  });
}

function incrementalCustody(
  forPayment: Payment,
  changeOrderId: string,
  authorizationId: string,
  amountCents: number,
): IncrementalTrustCustody {
  return IncrementalTrustCustody.create({
    paymentId: forPayment.id,
    orderId: forPayment.orderId,
    changeOrderId,
    incrementalAuthorizationId: authorizationId,
    buyerId: forPayment.buyerId,
    sellerId: forPayment.sellerId,
    amountCents,
    currency: forPayment.currency,
  });
}

describe('calculatePaymentCustodySummary (IP-007)', () => {
  it('sem Change Order nenhum: comercialmente autorizado == custodiado == valor original', () => {
    const p = payment();
    const custody = originalCustody(p);
    const summary = calculatePaymentCustodySummary({
      payment: p,
      originalCustody: custody,
      approvedChangeGrossCents: 0,
      incrementalAuthorizations: [],
      incrementalCustodies: [],
    });
    expect(summary.totalCommerciallyAuthorizedCents).toBe(15000);
    expect(summary.totalHeldCents).toBe(15000);
    expect(summary.amountAuthorizedNotInCustodyCents).toBe(0);
    expect(summary.incrementalTranches).toEqual([]);
  });

  it('incremental APROVADO e custodiado: o descasamento fecha em zero', () => {
    const p = payment();
    const custody = originalCustody(p);
    const authorization = incrementalAuthorization(p, 'co-1', 5000);
    const tranche = incrementalCustody(p, 'co-1', authorization.id, 5000);

    const summary = calculatePaymentCustodySummary({
      payment: p,
      originalCustody: custody,
      approvedChangeGrossCents: 5000,
      incrementalAuthorizations: [authorization],
      incrementalCustodies: [tranche],
    });

    expect(summary.totalCommerciallyAuthorizedCents).toBe(20000);
    expect(summary.totalHeldCents).toBe(20000);
    expect(summary.amountAuthorizedNotInCustodyCents).toBe(0);
    expect(summary.incrementalTranches).toEqual([
      {
        changeOrderId: 'co-1',
        incrementalAuthorizationId: authorization.id,
        amountCents: 5000,
        authorizationStatus: 'APPROVED',
        custodyStatus: 'IN_CUSTODY',
      },
    ]);
  });

  it('exatamente o gap PACK-03 §9.1: aprovado comercialmente mas RECUSADO pelo gateway — não custodiado', () => {
    const p = payment();
    const custody = originalCustody(p);
    // O Change Order foi aprovado pelo Member (por isso entra em
    // approvedChangeGrossCents), mas o gateway recusou a autorização
    // incremental — nenhuma tranche de custódia chega a existir.
    const authorization = incrementalAuthorization(p, 'co-declined', 5013, 'DECLINED');

    const summary = calculatePaymentCustodySummary({
      payment: p,
      originalCustody: custody,
      approvedChangeGrossCents: 5013,
      incrementalAuthorizations: [authorization],
      incrementalCustodies: [],
    });

    expect(summary.totalCommerciallyAuthorizedCents).toBe(15000 + 5013);
    expect(summary.totalHeldCents).toBe(15000);
    expect(summary.amountAuthorizedNotInCustodyCents).toBe(5013);
    expect(summary.incrementalTranches[0]).toEqual({
      changeOrderId: 'co-declined',
      incrementalAuthorizationId: authorization.id,
      amountCents: 5013,
      authorizationStatus: 'DECLINED',
      custodyStatus: null,
    });
  });

  it('sem custódia original nenhuma ainda: totalHeld reflete só o que existe de fato', () => {
    const p = payment();
    const summary = calculatePaymentCustodySummary({
      payment: p,
      originalCustody: null,
      approvedChangeGrossCents: 0,
      incrementalAuthorizations: [],
      incrementalCustodies: [],
    });
    expect(summary.originalCustodyStatus).toBeNull();
    expect(summary.totalHeldCents).toBe(0);
    expect(summary.amountAuthorizedNotInCustodyCents).toBe(15000);
  });
});
