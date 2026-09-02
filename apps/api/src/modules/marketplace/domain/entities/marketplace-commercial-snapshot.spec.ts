import { describe, expect, it } from 'vitest';
import { MarketplaceCommercialSnapshotValidationException } from '../exceptions/marketplace.exceptions';
import { MarketplaceCommercialSnapshot } from './marketplace-commercial-snapshot';
import { PRICING_MODEL } from './marketplace-types';

const ORDER_ID = '019fe8f0-0000-7000-8000-0000000000e1';

describe('MarketplaceCommercialSnapshot — FIXED_PRICE (PACK-02 §7/§8)', () => {
  it('grossAmount = serviceAmount quando não há material (materialCost/markup = 0)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 1000,
      trustFeeRateBps: 1000, // 10%
    });
    expect(snapshot.grossAmount).toBe(1000);
    expect(snapshot.serviceAmount).toBe(1000);
    expect(snapshot.materialCostAmount).toBe(0);
    expect(snapshot.materialMarkupAmount).toBe(0);
    expect(snapshot.trustFeeBaseAmount).toBe(1000);
    expect(snapshot.trustFeeAmount).toBe(100);
    expect(snapshot.providerNetBeforePspFees).toBe(900);
    expect(snapshot.hourlyRateAmount).toBeNull();
  });
});

describe('MarketplaceCommercialSnapshot — HOURLY (PACK-02 §4.2/§7)', () => {
  it('usa o serviceAmount já derivado (calculado fora, via hourly-pricing.service)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.HOURLY,
      currency: 'BRL',
      serviceAmount: 150, // R$150,00/h × 60min já derivado
      trustFeeRateBps: 1000,
      hourlyRateAmount: 150,
      minimumMinutes: 60,
      billingIncrementMinutes: 30,
    });
    expect(snapshot.pricingModel).toBe(PRICING_MODEL.HOURLY);
    expect(snapshot.grossAmount).toBe(150);
    expect(snapshot.trustFeeAmount).toBe(15);
    expect(snapshot.hourlyRateAmount).toBe(150);
    expect(snapshot.minimumMinutes).toBe(60);
    expect(snapshot.billingIncrementMinutes).toBe(30);
  });
});

describe('MarketplaceCommercialSnapshot — taxa congelada (§7/§18.1)', () => {
  it('a taxa é lida da config recebida e congelada no snapshot (não recalculada depois)', () => {
    const snapshotAt10pct = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 1000,
      trustFeeRateBps: 1000,
    });
    expect(snapshotAt10pct.trustFeeAmount).toBe(100);
  });

  it('mudar a config depois NÃO afeta um snapshot já criado — dois snapshots com taxas diferentes produzem trustFeeAmount diferentes', () => {
    const before = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 1000,
      trustFeeRateBps: 1000, // política "antiga": 10%
    });
    // A "política" muda para 20% — mas isso é passado explicitamente ao criar
    // um snapshot NOVO; o `before` já existente não é tocado (é imutável).
    const after = MarketplaceCommercialSnapshot.create({
      orderId: '019fe8f0-0000-7000-8000-0000000000e2',
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 1000,
      trustFeeRateBps: 2000, // política "nova": 20%
    });

    expect(before.trustFeeRateBps).toBe(1000);
    expect(before.trustFeeAmount).toBe(100); // continua o valor original
    expect(after.trustFeeRateBps).toBe(2000);
    expect(after.trustFeeAmount).toBe(200);
  });
});

describe('MarketplaceCommercialSnapshot — classificação de componentes (§5/§6/§8)', () => {
  it('SERVICE é elegível ao fee (base inclui o serviceAmount inteiro)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 500,
      trustFeeRateBps: 1000,
    });
    expect(snapshot.trustFeeBaseAmount).toBe(500);
  });

  it('MATERIAL_COST pass-through fica FORA da base do fee (0% sobre o custo)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 500,
      materialCostAmount: 300,
      trustFeeRateBps: 1000,
    });
    // gross = 500 + 300 = 800; base do fee = só o serviceAmount (500)
    expect(snapshot.grossAmount).toBe(800);
    expect(snapshot.trustFeeBaseAmount).toBe(500);
    expect(snapshot.trustFeeAmount).toBe(50); // 10% de 500, não de 800
  });

  it('MATERIAL_MARKUP entra na base do fee (fee-capable — §5)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 500,
      materialCostAmount: 300,
      materialMarkupAmount: 100,
      trustFeeRateBps: 1000,
    });
    // gross = 500 + 300 + 100 = 900; base do fee = serviceAmount + markup = 600
    expect(snapshot.grossAmount).toBe(900);
    expect(snapshot.trustFeeBaseAmount).toBe(600);
    expect(snapshot.trustFeeAmount).toBe(60); // 10% de 600
    expect(snapshot.providerNetBeforePspFees).toBe(840); // 900 - 60
  });
});

describe('MarketplaceCommercialSnapshot — arredondamento determinístico (§8/§18.1)', () => {
  it('arredonda em centavos, deterministicamente, para valores que não fecham redondo', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 33.33,
      trustFeeRateBps: 1000, // 10% de 3333 centavos = 333.3 → arredonda 333
    });
    expect(snapshot.trustFeeAmount).toBe(3.33);
    expect(snapshot.providerNetBeforePspFees).toBe(30.0);
  });

  it('é determinístico: a mesma entrada sempre produz a mesma saída', () => {
    const build = () =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 87.55,
        trustFeeRateBps: 1234,
      });
    const results = Array.from({ length: 10 }, () => build().trustFeeAmount);
    expect(new Set(results).size).toBe(1);
  });
});

describe('MarketplaceCommercialSnapshot — providerNetBeforePspFees (§7/§8)', () => {
  it('= grossAmount - trustFeeAmount, sem descontar taxas de PSP (fora de escopo)', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 200,
      trustFeeRateBps: 1500, // 15%
    });
    expect(snapshot.trustFeeAmount).toBe(30);
    expect(snapshot.providerNetBeforePspFees).toBe(170);
  });
});

describe('MarketplaceCommercialSnapshot — rejeição de valores inválidos (§15)', () => {
  it('serviceAmount <= 0 é rejeitado', () => {
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 0,
        trustFeeRateBps: 1000,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
  });

  it('materialCostAmount negativo é rejeitado', () => {
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 100,
        materialCostAmount: -1,
        trustFeeRateBps: 1000,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
  });

  it('materialMarkupAmount negativo é rejeitado', () => {
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 100,
        materialMarkupAmount: -1,
        trustFeeRateBps: 1000,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
  });

  it('trustFeeRateBps fora de 0..10000 é rejeitado', () => {
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 100,
        trustFeeRateBps: 10_001,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 100,
        trustFeeRateBps: -1,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
  });

  it('trustFeeRateBps não inteiro é rejeitado', () => {
    expect(() =>
      MarketplaceCommercialSnapshot.create({
        orderId: ORDER_ID,
        pricingModel: PRICING_MODEL.FIXED_PRICE,
        currency: 'BRL',
        serviceAmount: 100,
        trustFeeRateBps: 10.5,
      }),
    ).toThrow(MarketplaceCommercialSnapshotValidationException);
  });

  it('invariante trustFeeAmount <= trustFeeBaseAmount <= grossAmount vale sempre no caminho feliz', () => {
    const snapshot = MarketplaceCommercialSnapshot.create({
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      serviceAmount: 777.77,
      materialCostAmount: 12.34,
      materialMarkupAmount: 5.67,
      trustFeeRateBps: 10_000, // 100% — caso extremo, ainda deve valer o invariante
    });
    expect(snapshot.trustFeeAmount).toBeLessThanOrEqual(snapshot.trustFeeBaseAmount);
    expect(snapshot.trustFeeBaseAmount).toBeLessThanOrEqual(snapshot.grossAmount);
  });
});

describe('MarketplaceCommercialSnapshot — restore (persistência)', () => {
  it('restore() reidrata sem recalcular nada', () => {
    const createdAt = new Date('2026-08-10T12:00:00.000Z');
    const snapshot = MarketplaceCommercialSnapshot.restore({
      id: 'snap-1',
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      grossAmount: 1000,
      serviceAmount: 1000,
      materialCostAmount: 0,
      materialMarkupAmount: 0,
      trustFeeRateBps: 1000,
      trustFeeBaseAmount: 1000,
      trustFeeAmount: 100,
      providerNetBeforePspFees: 900,
      hourlyRateAmount: null,
      minimumMinutes: null,
      billingIncrementMinutes: null,
      createdAt,
    });
    expect(snapshot.toProps()).toEqual({
      id: 'snap-1',
      orderId: ORDER_ID,
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      currency: 'BRL',
      grossAmount: 1000,
      serviceAmount: 1000,
      materialCostAmount: 0,
      materialMarkupAmount: 0,
      trustFeeRateBps: 1000,
      trustFeeBaseAmount: 1000,
      trustFeeAmount: 100,
      providerNetBeforePspFees: 900,
      hourlyRateAmount: null,
      minimumMinutes: null,
      billingIncrementMinutes: null,
      createdAt,
    });
  });
});
