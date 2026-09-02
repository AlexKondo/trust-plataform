import { describe, expect, it } from 'vitest';
import {
  TrustChangeOrderTransitionException,
  TrustChangeOrderValidationException,
} from '../exceptions/marketplace.exceptions';
import { CHANGE_ORDER_STATUS, CHANGE_ORDER_TYPE, PRICING_MODEL } from './marketplace-types';
import { FrozenContractTerms, TrustChangeOrder } from './trust-change-order';

const ORDER_ID = '019fe8f0-0000-7000-8000-0000000000f1';
const PARTNER = '019fe8f0-0000-7000-8000-0000000000f2';
const MEMBER = '019fe8f0-0000-7000-8000-0000000000f3';

/** Contrato HOURLY do exemplo da spec (§7.1): R$150/h, incremento de 30min, fee 10%. */
const hourlyContract: FrozenContractTerms = {
  pricingModel: PRICING_MODEL.HOURLY,
  currency: 'BRL',
  hourlyRateAmount: 150,
  billingIncrementMinutes: 30,
  trustFeeRateBps: 1000,
};

const fixedContract: FrozenContractTerms = {
  pricingModel: PRICING_MODEL.FIXED_PRICE,
  currency: 'BRL',
  hourlyRateAmount: null,
  billingIncrementMinutes: null,
  trustFeeRateBps: 1000,
};

function additionalTime(minutes: number, contract = hourlyContract): TrustChangeOrder {
  return TrustChangeOrder.create({
    orderId: ORDER_ID,
    proposedBy: PARTNER,
    type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
    contract,
    additionalMinutes: minutes,
    reason: 'A fiação estava mais danificada do que o previsto.',
  });
}

describe('TrustChangeOrder — ADDITIONAL_TIME (PACK-03 §7.1)', () => {
  it('deriva o delta de serviço da taxa/hora congelada: 30min a R$150/h = R$75', () => {
    const changeOrder = additionalTime(30);
    expect(changeOrder.additionalMinutes).toBe(30);
    expect(changeOrder.serviceDeltaAmount).toBe(75);
    expect(changeOrder.changeGrossAmount).toBe(75);
    expect(changeOrder.changeTrustFeeBaseAmount).toBe(75);
    expect(changeOrder.changeTrustFeeAmount).toBe(7.5);
    expect(changeOrder.changeProviderNetBeforePspFees).toBe(67.5);
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.DRAFT);
  });

  it('aceita múltiplos exatos do incremento (60min sobre incremento de 30)', () => {
    expect(additionalTime(60).serviceDeltaAmount).toBe(150);
  });

  it('recusa minutos que não são múltiplo do incremento congelado', () => {
    expect(() => additionalTime(45)).toThrow(TrustChangeOrderValidationException);
  });

  it('usa o incremento do CONTRATO, não o padrão global de 30min', () => {
    const custom: FrozenContractTerms = { ...hourlyContract, billingIncrementMinutes: 15 };
    expect(additionalTime(15, custom).serviceDeltaAmount).toBe(37.5);
    // 30 continua válido (múltiplo de 15), mas 20 não é múltiplo de 15.
    expect(() => additionalTime(20, custom)).toThrow(TrustChangeOrderValidationException);
  });

  it('recusa tempo adicional sobre contrato FIXED_PRICE (§24)', () => {
    expect(() => additionalTime(30, fixedContract)).toThrow(TrustChangeOrderValidationException);
  });

  it('recusa valor de serviço informado pelo proponente — ele é derivado', () => {
    expect(() =>
      TrustChangeOrder.create({
        orderId: ORDER_ID,
        proposedBy: PARTNER,
        type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
        contract: hourlyContract,
        additionalMinutes: 30,
        serviceDeltaAmount: 500,
        reason: 'Tentativa de cobrar mais do que a taxa contratada.',
      }),
    ).toThrow(TrustChangeOrderValidationException);
  });
});

describe('TrustChangeOrder — MATERIAL (PACK-03 §7.3/§14)', () => {
  const material = (cost: number, markup: number) =>
    TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.MATERIAL,
      contract: hourlyContract,
      materialCostDeltaAmount: cost,
      materialMarkupDeltaAmount: markup,
      reason: 'Disjuntor queimado precisou ser substituído.',
    });

  it('custo é pass-through (fora da base da fee) e markup é fee-eligible', () => {
    const changeOrder = material(200, 50);
    expect(changeOrder.changeGrossAmount).toBe(250);
    // Base = só o markup: R$50. Fee 10% = R$5.
    expect(changeOrder.changeTrustFeeBaseAmount).toBe(50);
    expect(changeOrder.changeTrustFeeAmount).toBe(5);
    expect(changeOrder.changeProviderNetBeforePspFees).toBe(245);
  });

  it('custo sem markup não gera Trust Fee nenhuma', () => {
    const changeOrder = material(200, 0);
    expect(changeOrder.changeTrustFeeBaseAmount).toBe(0);
    expect(changeOrder.changeTrustFeeAmount).toBe(0);
  });

  it('mantém custo e markup separados — nunca colapsados num valor opaco', () => {
    const changeOrder = material(200, 50);
    expect(changeOrder.materialCostDeltaAmount).toBe(200);
    expect(changeOrder.materialMarkupDeltaAmount).toBe(50);
  });

  it('recusa MATERIAL sem nenhum componente de material', () => {
    expect(() => material(0, 0)).toThrow(TrustChangeOrderValidationException);
  });
});

describe('TrustChangeOrder — MIXED e SCOPE_CHANGE (PACK-03 §7.2/§7.4)', () => {
  it('MIXED soma serviço + custo + markup com a base de fee correta', () => {
    const changeOrder = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.MIXED,
      contract: hourlyContract,
      serviceDeltaAmount: 100,
      materialCostDeltaAmount: 200,
      materialMarkupDeltaAmount: 50,
      reason: 'Troca de peça mais mão de obra extra.',
    });
    expect(changeOrder.changeGrossAmount).toBe(350);
    expect(changeOrder.changeTrustFeeBaseAmount).toBe(150); // 100 serviço + 50 markup
    expect(changeOrder.changeTrustFeeAmount).toBe(15);
  });

  it('SCOPE_CHANGE vale em FIXED_PRICE e não aceita material', () => {
    const scope = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.SCOPE_CHANGE,
      contract: fixedContract,
      serviceDeltaAmount: 300,
      reason: 'Cliente pediu mais dois pontos de luz.',
    });
    expect(scope.changeGrossAmount).toBe(300);
    expect(() =>
      TrustChangeOrder.create({
        orderId: ORDER_ID,
        proposedBy: PARTNER,
        type: CHANGE_ORDER_TYPE.SCOPE_CHANGE,
        contract: fixedContract,
        serviceDeltaAmount: 300,
        materialCostDeltaAmount: 20,
        reason: 'Escopo com material embutido.',
      }),
    ).toThrow(TrustChangeOrderValidationException);
  });

  it('recusa aumento de valor zero (§24)', () => {
    expect(() =>
      TrustChangeOrder.create({
        orderId: ORDER_ID,
        proposedBy: PARTNER,
        type: CHANGE_ORDER_TYPE.SCOPE_CHANGE,
        contract: fixedContract,
        serviceDeltaAmount: 0,
        reason: 'Mudança sem efeito financeiro.',
      }),
    ).toThrow(TrustChangeOrderValidationException);
  });

  it('recusa delta negativo', () => {
    expect(() =>
      TrustChangeOrder.create({
        orderId: ORDER_ID,
        proposedBy: PARTNER,
        type: CHANGE_ORDER_TYPE.SCOPE_CHANGE,
        contract: fixedContract,
        serviceDeltaAmount: -100,
        reason: 'Desconto disfarçado de mudança.',
      }),
    ).toThrow(TrustChangeOrderValidationException);
  });

  it('recusa criação sem justificativa', () => {
    expect(() =>
      TrustChangeOrder.create({
        orderId: ORDER_ID,
        proposedBy: PARTNER,
        type: CHANGE_ORDER_TYPE.SCOPE_CHANGE,
        contract: fixedContract,
        serviceDeltaAmount: 100,
        reason: '  ',
      }),
    ).toThrow(TrustChangeOrderValidationException);
  });
});

describe('TrustChangeOrder — ciclo de vida (PACK-03 §6)', () => {
  it('DRAFT → PENDING → APPROVED, e APPROVED é terminal', () => {
    const changeOrder = additionalTime(30);
    changeOrder.submit();
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL);
    expect(changeOrder.submittedAt).not.toBeNull();

    changeOrder.approve(MEMBER);
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.APPROVED);
    expect(changeOrder.decidedBy).toBe(MEMBER);
    expect(changeOrder.isApproved()).toBe(true);

    // §6.1: aprovado não é editável nem revogável — correção é Change Order novo.
    expect(() => changeOrder.approve(MEMBER)).toThrow(TrustChangeOrderTransitionException);
    expect(() => changeOrder.reject(MEMBER)).toThrow(TrustChangeOrderTransitionException);
    expect(() => changeOrder.cancel(PARTNER)).toThrow(TrustChangeOrderTransitionException);
  });

  it('REJECTED também é terminal', () => {
    const changeOrder = additionalTime(30);
    changeOrder.submit();
    changeOrder.reject(MEMBER, 'Não autorizo esse valor.');
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.REJECTED);
    expect(changeOrder.decisionReason).toBe('Não autorizo esse valor.');
    expect(() => changeOrder.approve(MEMBER)).toThrow(TrustChangeOrderTransitionException);
  });

  it('não é possível aprovar um rascunho que nunca foi submetido', () => {
    expect(() => additionalTime(30).approve(MEMBER)).toThrow(TrustChangeOrderTransitionException);
  });

  it('cancelamento só vale antes da decisão', () => {
    const changeOrder = additionalTime(30);
    changeOrder.cancel(PARTNER);
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.CANCELLED);
  });

  it('expiração é derivada da data e reportada na leitura (#33)', () => {
    const past = new Date(Date.now() - 3600_000);
    const changeOrder = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
      contract: hourlyContract,
      additionalMinutes: 30,
      reason: 'Precisa de mais meia hora.',
      expiresAt: past,
    });
    expect(changeOrder.isExpiredAt()).toBe(true);
    expect(changeOrder.effectiveStatus()).toBe(CHANGE_ORDER_STATUS.EXPIRED);
    // O status persistido continua DRAFT até alguém agir — nada de job de fundo.
    expect(changeOrder.status).toBe(CHANGE_ORDER_STATUS.DRAFT);
  });

  it('depois de decidido, a data de expiração deixa de importar', () => {
    const changeOrder = TrustChangeOrder.create({
      orderId: ORDER_ID,
      proposedBy: PARTNER,
      type: CHANGE_ORDER_TYPE.ADDITIONAL_TIME,
      contract: hourlyContract,
      additionalMinutes: 30,
      reason: 'Precisa de mais meia hora.',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    changeOrder.submit();
    changeOrder.approve(MEMBER);
    expect(changeOrder.isExpiredAt(new Date(Date.now() + 7200_000))).toBe(false);
    expect(changeOrder.effectiveStatus(new Date(Date.now() + 7200_000))).toBe(
      CHANGE_ORDER_STATUS.APPROVED,
    );
  });
});

describe('TrustChangeOrder — taxa congelada (PACK-03 §8)', () => {
  it('usa a taxa do contrato, não a política global vigente', () => {
    // Mesmo pedido, mas o contrato foi fechado quando a fee era 5%.
    const frozenAt5Percent: FrozenContractTerms = { ...hourlyContract, trustFeeRateBps: 500 };
    const changeOrder = additionalTime(30, frozenAt5Percent);
    expect(changeOrder.trustFeeRateBps).toBe(500);
    expect(changeOrder.changeTrustFeeAmount).toBe(3.75); // 5% de R$75, não 10%
  });

  it('a taxa fica gravada no Change Order — mudança futura não o reescreve', () => {
    const changeOrder = additionalTime(30);
    const beforeProps = changeOrder.toProps();
    changeOrder.submit();
    changeOrder.approve(MEMBER);
    expect(changeOrder.toProps().trustFeeRateBps).toBe(beforeProps.trustFeeRateBps);
    expect(changeOrder.toProps().changeTrustFeeAmount).toBe(beforeProps.changeTrustFeeAmount);
  });
});
