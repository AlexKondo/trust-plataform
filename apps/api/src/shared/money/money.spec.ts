import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  applyBasisPoints,
  fromReais,
  splitAmount,
  sumCents,
  toReais,
  toReaisString,
} from './money';

describe('conversão reais ↔ centavos', () => {
  it('converte sem perder centavo em valores problemáticos para float', () => {
    expect(fromReais(0.1)).toBe(10);
    expect(fromReais(0.2)).toBe(20);
    expect(fromReais(1100.55)).toBe(110055);
    expect(fromReais('1100.55')).toBe(110055);
  });

  it('volta para reais com duas casas', () => {
    expect(toReaisString(110055)).toBe('1100.55');
    expect(toReaisString(5)).toBe('0.05');
    expect(toReais(110055)).toBe(1100.55);
  });

  it('recusa valor não numérico', () => {
    expect(() => fromReais('abc')).toThrow(MoneyError);
  });
});

describe('applyBasisPoints', () => {
  it('10% de R$ 1.100,00 são R$ 110,00', () => {
    expect(applyBasisPoints(110000, 1000)).toBe(11000);
  });

  it('arredonda para o centavo mais próximo', () => {
    // 10% de R$ 33,33 = R$ 3,333 → R$ 3,33
    expect(applyBasisPoints(3333, 1000)).toBe(333);
  });

  it('recusa taxa fora da faixa', () => {
    expect(() => applyBasisPoints(1000, -1)).toThrow(MoneyError);
    expect(() => applyBasisPoints(1000, 10_001)).toThrow(MoneyError);
    expect(() => applyBasisPoints(1000, 10.5)).toThrow(MoneyError);
  });
});

describe('splitAmount — a soma tem que fechar ao centavo (PAY-007 BR-005)', () => {
  it('divide taxa da plataforma e valor do prestador', () => {
    const result = splitAmount(110000, [
      { key: 'PLATFORM', basisPoints: 1000 },
      { key: 'SELLER', basisPoints: 9000 },
    ]);
    expect(result).toEqual([
      { key: 'PLATFORM', amountCents: 11000, basisPoints: 1000 },
      { key: 'SELLER', amountCents: 99000, basisPoints: 9000 },
    ]);
    expect(sumCents(result.map((item) => item.amountCents))).toBe(110000);
  });

  it('a sobra do arredondamento vai para o último — e a soma continua exata', () => {
    // R$ 0,01 dividido em três partes iguais é o pior caso possível
    const result = splitAmount(1, [
      { key: 'A', basisPoints: 3333 },
      { key: 'B', basisPoints: 3333 },
      { key: 'C', basisPoints: 3334 },
    ]);
    expect(sumCents(result.map((item) => item.amountCents))).toBe(1);
  });

  it('fecha exatamente em mil valores aleatórios', () => {
    for (let index = 0; index < 1000; index += 1) {
      const total = 1 + ((index * 7919) % 5_000_000);
      const result = splitAmount(total, [
        { key: 'PLATFORM', basisPoints: 1000 },
        { key: 'SELLER', basisPoints: 9000 },
      ]);
      expect(sumCents(result.map((item) => item.amountCents))).toBe(total);
    }
  });

  it('recusa rateio que não soma 100%', () => {
    expect(() =>
      splitAmount(1000, [
        { key: 'A', basisPoints: 1000 },
        { key: 'B', basisPoints: 1000 },
      ]),
    ).toThrow(MoneyError);
  });

  it('recusa total em fração de centavo', () => {
    expect(() => splitAmount(10.5, [{ key: 'A', basisPoints: 10_000 }])).toThrow(MoneyError);
  });
});

describe('sumCents', () => {
  it('recusa valor negativo ou fracionário em vez de propagar erro', () => {
    expect(() => sumCents([100, -1])).toThrow(MoneyError);
    expect(() => sumCents([100, 0.5])).toThrow(MoneyError);
  });
});
