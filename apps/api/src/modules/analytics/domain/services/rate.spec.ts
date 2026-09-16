import { describe, expect, it } from 'vitest';
import { calculateRate, roundTo } from './rate';

describe('calculateRate', () => {
  it('calcula a razão normal, arredondada em 4 casas', () => {
    expect(calculateRate(1, 3)).toBe(0.3333);
    expect(calculateRate(5, 10)).toBe(0.5);
  });

  it('devolve null quando o denominador é zero — nunca 0%', () => {
    expect(calculateRate(0, 0)).toBeNull();
    expect(calculateRate(10, 0)).toBeNull();
  });

  it('devolve null para denominador negativo (nunca deveria ocorrer, defensivo)', () => {
    expect(calculateRate(1, -5)).toBeNull();
  });

  it('devolve null para numerador negativo (nunca deveria ocorrer, defensivo)', () => {
    expect(calculateRate(-1, 5)).toBeNull();
  });

  it('numerador igual ao denominador é 1 (100%)', () => {
    expect(calculateRate(7, 7)).toBe(1);
  });

  it('numerador zero com denominador positivo é 0 (0% real, distinto de null)', () => {
    expect(calculateRate(0, 10)).toBe(0);
  });

  it('devolve null para NaN/Infinity em qualquer posição', () => {
    expect(calculateRate(Number.NaN, 10)).toBeNull();
    expect(calculateRate(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('roundTo', () => {
  it('arredonda para o número de casas decimais pedido', () => {
    expect(roundTo(0.123456, 2)).toBe(0.12);
    expect(roundTo(0.125, 2)).toBe(0.13);
    expect(roundTo(1, 4)).toBe(1);
  });
});
