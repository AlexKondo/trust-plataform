import { fromReais, toReais } from '../../../../shared/money/money';

/**
 * PACK-02 §4.2 — valor inicial contratado de uma proposta HOURLY.
 *
 * `initialAmountCents = round(hourlyRateCents * minimumMinutes / 60)`. O
 * cálculo acontece inteiramente em CENTAVOS (shared/money/money.ts) — nunca em
 * ponto flutuante de reais (trust-payments §1) — e o arredondamento é o mesmo
 * `Math.round` determinístico usado por `applyBasisPoints`.
 *
 * Exemplo da spec (§4.2): hourlyRateAmount=150.00, minimumMinutes=60 → 150.00.
 *
 * Tempo adicional além de `minimumMinutes` NÃO é calculado aqui — isso é
 * elapsed/billable time, fora de escopo do PACK-02 (§19), e vai depender de um
 * Trust Change Order aprovado no PACK-03.
 */
export function calculateInitialHourlyAmount(
  hourlyRateAmount: number,
  minimumMinutes: number,
): number {
  const hourlyRateCents = fromReais(hourlyRateAmount);
  const initialAmountCents = Math.round((hourlyRateCents * minimumMinutes) / 60);
  return toReais(initialAmountCents);
}
