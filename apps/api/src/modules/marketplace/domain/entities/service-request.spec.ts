import { describe, expect, it } from 'vitest';
import {
  ServiceRequestNotEngageableException,
  ServiceRequestOwnershipException,
  ServiceRequestTransitionException,
  ServiceRequestValidationException,
} from '../exceptions/marketplace.exceptions';
import { SERVICE_REQUEST_STATUS, URGENCY_LEVEL } from './marketplace-types';
import { ServiceRequest } from './service-request';

const MEMBER = '019fe41e-0000-7000-8000-000000000001';
const OTHER = '019fe41e-0000-7000-8000-000000000002';
const CATEGORY = '019fe41e-0000-7000-8000-0000000000c1';

function baseInput() {
  return {
    memberId: MEMBER,
    categoryId: CATEGORY,
    title: 'Preciso de um eletricista',
    description: 'Chuveiro parou de esquentar e um dos disjuntores desarma sozinho.',
    locationLabel: 'Vila Mariana, São Paulo/SP',
    urgency: URGENCY_LEVEL.THIS_WEEK,
  };
}

describe('ServiceRequest (IP-003)', () => {
  it('nasce OPEN, pertence ao Member e expira em 30 dias por padrão', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const request = ServiceRequest.create(baseInput(), now);

    expect(request.status).toBe(SERVICE_REQUEST_STATUS.OPEN);
    expect(request.isOwnedBy(MEMBER)).toBe(true);
    expect(request.isOwnedBy(OTHER)).toBe(false);
    expect(request.matchedAt).toBeNull();
    expect(request.expiresAt.toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('rejeita budgetMin maior que budgetMax', () => {
    expect(() =>
      ServiceRequest.create({ ...baseInput(), budgetMinAmount: 500, budgetMaxAmount: 100 }),
    ).toThrow(ServiceRequestValidationException);
  });

  it('rejeita expiresAt no passado', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    expect(() =>
      ServiceRequest.create(
        { ...baseInput(), expiresAt: new Date('2026-09-01T00:00:00.000Z') },
        now,
      ),
    ).toThrow(ServiceRequestValidationException);
  });

  it('markMatched: OPEN -> MATCHED na primeira vez, e é idempotente depois (não é exclusividade)', () => {
    const request = ServiceRequest.create(baseInput());
    request.markMatched();
    expect(request.status).toBe(SERVICE_REQUEST_STATUS.MATCHED);
    const matchedAt = request.matchedAt;
    expect(matchedAt).not.toBeNull();

    // segunda chamada (segundo Partner engajado) não é erro nem regrava matchedAt de novo via transitionTo
    expect(() => request.markMatched()).not.toThrow();
    expect(request.status).toBe(SERVICE_REQUEST_STATUS.MATCHED);
  });

  it('markMatched depois de CLOSED/CANCELLED é rejeitado (nunca reabre um pedido terminal)', () => {
    const request = ServiceRequest.create(baseInput());
    request.close(MEMBER, null);
    expect(() => request.markMatched()).toThrow(ServiceRequestTransitionException);
  });

  it('effectiveStatus deriva EXPIRED sem nunca persistir esse valor (mesmo padrão de MarketplaceOffer)', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const request = ServiceRequest.create(
      { ...baseInput(), expiresAt: new Date('2026-09-16T00:00:00.000Z') },
      now,
    );
    const later = new Date('2026-09-17T00:00:00.000Z');
    expect(request.effectiveStatus(later)).toBe(SERVICE_REQUEST_STATUS.EXPIRED);
    expect(request.status).toBe(SERVICE_REQUEST_STATUS.OPEN); // campo persistido não muda
    expect(request.isEngageable(later)).toBe(false);
  });

  it('CLOSED/CANCELLED não são afetados pela expiração (effectiveStatus não sobrescreve estado terminal)', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const request = ServiceRequest.create(
      { ...baseInput(), expiresAt: new Date('2026-09-16T00:00:00.000Z') },
      now,
    );
    request.cancel(MEMBER, 'Resolvi por conta própria.', now);
    const later = new Date('2026-09-17T00:00:00.000Z');
    expect(request.effectiveStatus(later)).toBe(SERVICE_REQUEST_STATUS.CANCELLED);
  });

  it('close/cancel: só o dono pode encerrar', () => {
    const request = ServiceRequest.create(baseInput());
    expect(() => request.close(OTHER, null)).toThrow(ServiceRequestOwnershipException);
    expect(() => request.cancel(OTHER, 'motivo')).toThrow(ServiceRequestOwnershipException);
  });

  it('close/cancel: porta única de mudança de estado recusa saltos (CLOSED/CANCELLED são terminais)', () => {
    const request = ServiceRequest.create(baseInput());
    request.close(MEMBER, 'Contratei fora da plataforma.');
    expect(request.status).toBe(SERVICE_REQUEST_STATUS.CLOSED);
    expect(() => request.cancel(MEMBER, 'motivo')).toThrow(ServiceRequestTransitionException);
    expect(() => request.close(MEMBER, null)).toThrow(ServiceRequestTransitionException);
  });

  it('assertEngageable: aceita OPEN/MATCHED não vencidos, recusa CLOSED/CANCELLED/EXPIRED', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const open = ServiceRequest.create(baseInput(), now);
    expect(() => open.assertEngageable(now)).not.toThrow();

    const closed = ServiceRequest.create(baseInput(), now);
    closed.close(MEMBER, null, now);
    expect(() => closed.assertEngageable(now)).toThrow(ServiceRequestNotEngageableException);

    const expired = ServiceRequest.create(
      { ...baseInput(), expiresAt: new Date('2026-09-16T00:00:00.000Z') },
      now,
    );
    expect(() => expired.assertEngageable(new Date('2026-09-17T00:00:00.000Z'))).toThrow(
      ServiceRequestNotEngageableException,
    );
  });

  it('cancel exige motivo (mesmo padrão de MarketplaceOrder.cancel)', () => {
    const request = ServiceRequest.create(baseInput());
    request.cancel(MEMBER, '  Encontrei um profissional fora da plataforma.  ');
    expect(request.cancellationReason).toBe('Encontrei um profissional fora da plataforma.');
    expect(request.cancelledBy).toBe(MEMBER);
  });

  it('restore reidrata o aggregate sem recalcular nada', () => {
    const original = ServiceRequest.create(baseInput());
    const restored = ServiceRequest.restore(original.toProps());
    expect(restored.toProps()).toEqual(original.toProps());
  });
});
