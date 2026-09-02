import { describe, expect, it } from 'vitest';
import { calculateInitialHourlyAmount } from './hourly-pricing.service';

describe('calculateInitialHourlyAmount (PACK-02 §4.2)', () => {
  it('exemplo da spec: R$150,00/h por 60 minutos → R$150,00', () => {
    expect(calculateInitialHourlyAmount(150.0, 60)).toBe(150.0);
  });

  it('arredonda deterministicamente quando a divisão não fecha redondo', () => {
    // R$100,00/h por 45min = 10000 centavos * 45 / 60 = 7500 centavos = R$75,00 (exato)
    expect(calculateInitialHourlyAmount(100.0, 45)).toBe(75.0);
  });

  it('arredonda para o centavo mais próximo quando o resultado não é inteiro', () => {
    // R$100,00/h por 20min = 10000 * 20 / 60 = 3333.33... → arredonda para 3333 centavos
    expect(calculateInitialHourlyAmount(100.0, 20)).toBe(33.33);
    // R$150,00/h por 25min = 15000 * 25 / 60 = 6250 centavos exatos
    expect(calculateInitialHourlyAmount(150.0, 25)).toBe(62.5);
  });

  it('é determinístico: mesma entrada sempre produz a mesma saída', () => {
    const results = Array.from({ length: 10 }, () => calculateInitialHourlyAmount(87.5, 37));
    expect(new Set(results).size).toBe(1);
  });

  it('minimumMinutes de 30 (default MVP) sobre uma taxa quebrada', () => {
    // R$33,33/h por 30min = 3333 * 30 / 60 = 1666.5 → arredonda para 1667 centavos
    expect(calculateInitialHourlyAmount(33.33, 30)).toBe(16.67);
  });
});
