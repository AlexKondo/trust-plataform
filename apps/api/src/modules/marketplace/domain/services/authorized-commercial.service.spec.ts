import { describe, expect, it } from 'vitest';
import { MarketplaceCommercialSnapshot } from '../entities/marketplace-commercial-snapshot';
import { CHANGE_ORDER_TYPE, PRICING_MODEL } from '../entities/marketplace-types';
import { FrozenContractTerms, TrustChangeOrder } from '../entities/trust-change-order';
import {
  calculateAuthorizedTime,
  calculateAuthorizedTotals,
  calculateBillableMinutes,
} from './authorized-commercial.service';

const ORDER_ID = '019fe8f0-0000-7000-8000-0000000000b1';
const PARTNER = '019fe8f0-0000-7000-8000-0000000000b2';
const MEMBER = '019fe8f0-0000-7000-8000-0000000000b3';

/** Contrato HOURLY do exemplo da spec: R$150/h × 60min = R$150, fee 10%. */
const hourlySnapshot = MarketplaceCommercialSnapshot.create({
  orderId: ORDER_ID,
  pricingModel: PRICING_MODEL.HOURLY,
  currency: 'BRL',
  serviceAmount: 150,
  trustFeeRateBps: 1000,
  hourlyRateAmount: 150,
  minimumMinutes: 60,
  billingIncrementMinutes: 30,
});

const contract: FrozenContractTerms = {
  pricingModel: PRICING_MODEL.HOURLY,
  currency: 'BRL',
  hourlyRateAmount: 150,
  billingIncrementMinutes: 30,
  trustFeeRateBps: 1000,
};

function approvedAdditionalTime(minutes: number): TrustChangeOrder {
  const changeOrder = TrustChangeOrder.create({
    orderId: ORDER_ID,
    proposedBy: PARTNER,
    type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
    contract,
    additionalMinutes: minutes,
    reason: 'Serviço mais complexo que o previsto.',
  });
  changeOrder.submit();
  changeOrder.approve(MEMBER);
  return changeOrder;
}

function pendingAdditionalTime(minutes: number): TrustChangeOrder {
  const changeOrder = TrustChangeOrder.create({
    orderId: ORDER_ID,
    proposedBy: PARTNER,
    type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
    contract,
    additionalMinutes: minutes,
    reason: 'Ainda esperando o cliente decidir.',
  });
  changeOrder.submit();
  return changeOrder;
}

describe('calculateAuthorizedTotals (PACK-03 §5/§8)', () => {
  it('sem Change Order, o total corrente é exatamente o snapshot inicial', () => {
    const totals = calculateAuthorizedTotals(hourlySnapshot, []);
    expect(totals.currentGrossAmount).toBe(150);
    expect(totals.approvedChangesGrossAmount).toBe(0);
    expect(totals.currentTrustFeeAmount).toBe(15);
    expect(totals.currentProviderNetBeforePspFees).toBe(135);
  });

  it('soma apenas os APROVADOS (§5)', () => {
    const totals = calculateAuthorizedTotals(hourlySnapshot, [
      approvedAdditionalTime(30), // +R$75
      pendingAdditionalTime(30), // não conta
    ]);
    expect(totals.approvedChangesGrossAmount).toBe(75);
    expect(totals.currentGrossAmount).toBe(225);
    expect(totals.currentTrustFeeAmount).toBe(22.5); // 15 + 7.5
    expect(totals.currentProviderNetBeforePspFees).toBe(202.5);
  });

  it('rejeitado e cancelado não alteram nada', () => {
    const rejected = pendingAdditionalTime(30);
    rejected.reject(MEMBER, 'não autorizo');
    const cancelled = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
      contract,
      additionalMinutes: 30,
      reason: 'Retirada pelo prestador.',
    });
    cancelled.cancel(PARTNER);

    const totals = calculateAuthorizedTotals(hourlySnapshot, [rejected, cancelled]);
    expect(totals.currentGrossAmount).toBe(150);
    expect(totals.approvedChangesGrossAmount).toBe(0);
  });

  it('o delta aprovado entra exatamente uma vez, mesmo recalculando (§19)', () => {
    const approved = [approvedAdditionalTime(30)];
    const first = calculateAuthorizedTotals(hourlySnapshot, approved);
    const second = calculateAuthorizedTotals(hourlySnapshot, approved);
    expect(first.currentGrossAmount).toBe(225);
    expect(second.currentGrossAmount).toBe(225);
  });

  it('material aprovado mantém custo fora da base da fee e markup dentro', () => {
    const material = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.MATERIAL,
      contract,
      materialCostDeltaAmount: 200,
      materialMarkupDeltaAmount: 50,
      reason: 'Peça de reposição.',
    });
    material.submit();
    material.approve(MEMBER);

    const totals = calculateAuthorizedTotals(hourlySnapshot, [material]);
    expect(totals.currentGrossAmount).toBe(400); // 150 + 250
    expect(totals.currentMaterialCostAmount).toBe(200);
    expect(totals.currentMaterialMarkupAmount).toBe(50);
    // Base: 150 (serviço inicial) + 50 (markup). O custo de 200 fica de fora.
    expect(totals.currentTrustFeeBaseAmount).toBe(200);
    expect(totals.currentTrustFeeAmount).toBe(20);
  });

  it('§9 — o aprovado depois da contratação NÃO está em custódia', () => {
    const totals = calculateAuthorizedTotals(hourlySnapshot, [approvedAdditionalTime(30)]);
    expect(totals.amountInCustody).toBe(150); // valor congelado na contratação
    expect(totals.amountAuthorizedNotInCustody).toBe(75);
    expect(totals.amountInCustody + totals.amountAuthorizedNotInCustody).toBe(
      totals.currentGrossAmount,
    );
  });
});

describe('calculateAuthorizedTime (PACK-03 §12)', () => {
  it('mínimo contratado + tempo adicional aprovado', () => {
    const time = calculateAuthorizedTime(hourlySnapshot, [
      approvedAdditionalTime(30),
      pendingAdditionalTime(60),
    ]);
    expect(time.initialAuthorizedMinutes).toBe(60);
    expect(time.approvedAdditionalMinutes).toBe(30);
    expect(time.authorizedMinutes).toBe(90);
  });

  it('FIXED_PRICE não tem tempo autorizado — tempo não vira dinheiro ali', () => {
    const fixed = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 1000,
      trustFeeRateBps: 1000,
    });
    expect(calculateAuthorizedTime(fixed, []).authorizedMinutes).toBeNull();
  });
});

describe('calculateBillableMinutes (PACK-03 §11)', () => {
  it('presença além do autorizado NÃO vira cobrança', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: 90,
        authorizedMinutes: 60,
        minimumMinutes: 60,
      }),
    ).toBe(60);
  });

  it('com +30min aprovados, 90min ativos são faturáveis', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: 90,
        authorizedMinutes: 90,
        minimumMinutes: 60,
      }),
    ).toBe(90);
  });

  it('terminar antes do mínimo contratado não reduz o faturável (§4.2: sem reembolso)', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: 40,
        authorizedMinutes: 60,
        minimumMinutes: 60,
      }),
    ).toBe(60);
  });

  it('exemplo da spec: 60min ativos de 60 autorizados = 60 faturáveis', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: 60,
        authorizedMinutes: 60,
        minimumMinutes: 60,
      }),
    ).toBe(60);
  });

  it('FIXED_PRICE devolve null', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: 120,
        authorizedMinutes: null,
        minimumMinutes: null,
      }),
    ).toBeNull();
  });

  it('sem check-out ainda não há faturável calculado', () => {
    expect(
      calculateBillableMinutes({
        rawActiveMinutes: null,
        authorizedMinutes: 60,
        minimumMinutes: 60,
      }),
    ).toBeNull();
  });
});
