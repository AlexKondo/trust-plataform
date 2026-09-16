import { describe, expect, it } from 'vitest';
import { TrustCustodyTransitionException } from '../exceptions/payment.exceptions';
import { CUSTODY_STATUS, TrustCustody } from './trust-custody';

const INPUT = {
  paymentId: '019fe8f0-0000-7000-8000-0000000000e1',
  orderId: '019fe8f0-0000-7000-8000-0000000000e2',
  buyerId: '019fe8f0-0000-7000-8000-0000000000e3',
  sellerId: '019fe8f0-0000-7000-8000-0000000000e4',
  amountCents: 15000,
  currency: 'BRL',
};

/**
 * IP-008 — cobertura dedicada da custódia original (PACK-01 nunca teve um
 * spec próprio para esta entidade; a lógica era exercitada só através de
 * `custody-release.usecase.spec.ts`). Cobre especificamente o novo estado
 * aditivo `REFUNDED` — o resto da máquina de estados (IN_CUSTODY ->
 * READY_FOR_RELEASE -> RELEASED) já é exercitado por aquele spec e não é
 * duplicado aqui.
 */
describe('TrustCustody — REFUNDED (IP-008)', () => {
  it('nasce em IN_CUSTODY e pode ir direto para REFUNDED (cancelamento antes da execução)', () => {
    const custody = TrustCustody.create(INPUT);
    expect(custody.isInCustody()).toBe(true);
    custody.markRefunded();
    expect(custody.status).toBe(CUSTODY_STATUS.REFUNDED);
    expect(custody.isRefunded()).toBe(true);
  });

  it('REFUNDED é terminal — não aceita nova transição', () => {
    const custody = TrustCustody.create(INPUT);
    custody.markRefunded();
    expect(() => custody.markReadyForRelease()).toThrow(TrustCustodyTransitionException);
    expect(() => custody.markRefunded()).toThrow(TrustCustodyTransitionException);
  });

  it('READY_FOR_RELEASE não pode ser reembolsado — a liberação já começou', () => {
    const custody = TrustCustody.create(INPUT);
    custody.markReadyForRelease();
    expect(() => custody.markRefunded()).toThrow(TrustCustodyTransitionException);
  });

  it('RELEASED não pode ser reembolsado — o dinheiro já foi para o prestador', () => {
    const custody = TrustCustody.create(INPUT);
    custody.markReadyForRelease();
    custody.markReleased();
    expect(() => custody.markRefunded()).toThrow(TrustCustodyTransitionException);
  });
});
