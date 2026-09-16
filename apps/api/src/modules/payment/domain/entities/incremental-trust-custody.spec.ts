import { describe, expect, it } from 'vitest';
import { TrustCustodyTransitionException } from '../exceptions/payment.exceptions';
import { CUSTODY_STATUS } from './trust-custody';
import { IncrementalTrustCustody } from './incremental-trust-custody';

const INPUT = {
  paymentId: '019fe8f0-0000-7000-8000-0000000000d1',
  orderId: '019fe8f0-0000-7000-8000-0000000000d2',
  changeOrderId: '019fe8f0-0000-7000-8000-0000000000d3',
  incrementalAuthorizationId: '019fe8f0-0000-7000-8000-0000000000d4',
  buyerId: '019fe8f0-0000-7000-8000-0000000000d5',
  sellerId: '019fe8f0-0000-7000-8000-0000000000d6',
  amountCents: 22050,
  currency: 'BRL',
};

describe('IncrementalTrustCustody (IP-007)', () => {
  it('nasce em IN_CUSTODY, com o mesmo formato de estado do TrustCustody original', () => {
    const tranche = IncrementalTrustCustody.create(INPUT);
    expect(tranche.status).toBe(CUSTODY_STATUS.IN_CUSTODY);
    expect(tranche.isInCustody()).toBe(true);
    expect(tranche.releasedAt).toBeNull();
    expect(tranche.amountCents).toBe(22050);
    expect(tranche.changeOrderId).toBe(INPUT.changeOrderId);
    expect(tranche.incrementalAuthorizationId).toBe(INPUT.incrementalAuthorizationId);
  });

  it('segue a máquina de duas fases: IN_CUSTODY -> READY_FOR_RELEASE -> RELEASED', () => {
    const tranche = IncrementalTrustCustody.create(INPUT);
    tranche.markReadyForRelease();
    expect(tranche.isReadyForRelease()).toBe(true);
    tranche.markReleased();
    expect(tranche.isReleased()).toBe(true);
    expect(tranche.releasedAt).toBeInstanceOf(Date);
  });

  it('nunca pula fase: IN_CUSTODY não vai direto para RELEASED', () => {
    const tranche = IncrementalTrustCustody.create(INPUT);
    expect(() => tranche.markReleased()).toThrow(TrustCustodyTransitionException);
  });

  it('RELEASED é terminal — não aceita nova transição', () => {
    const tranche = IncrementalTrustCustody.create(INPUT);
    tranche.markReadyForRelease();
    tranche.markReleased();
    expect(() => tranche.markReadyForRelease()).toThrow(TrustCustodyTransitionException);
    expect(() => tranche.markReleased()).toThrow(TrustCustodyTransitionException);
  });

  it('rejeita valor não inteiro (nunca ponto flutuante em centavos)', () => {
    expect(() => IncrementalTrustCustody.create({ ...INPUT, amountCents: 100.5 })).toThrow();
  });

  it('restore() reidrata sem recalcular nada', () => {
    const original = IncrementalTrustCustody.create(INPUT);
    const restored = IncrementalTrustCustody.restore(original.toProps());
    expect(restored.toProps()).toEqual(original.toProps());
  });
});
