import { describe, expect, it } from 'vitest';
import { OrderTravelTransitionException } from '../exceptions/marketplace.exceptions';
import { ETA_SOURCE, TRAVEL_STATUS } from './marketplace-types';
import { OrderTravelStatus } from './order-travel-status';

const ORDER = '019fe8f0-0000-7000-8000-0000000000b1';

const estimate = (etaMinutes = 15) => ({
  source: ETA_SOURCE.PARTNER_DECLARED,
  etaMinutes,
  estimatedArrivalAt: new Date(Date.now() + etaMinutes * 60000),
});

describe('OrderTravelStatus (IP-005)', () => {
  it('nasce NOT_STARTED, sem nenhuma coordenada ou marco', () => {
    const status = OrderTravelStatus.notStarted(ORDER);
    expect(status.status).toBe(TRAVEL_STATUS.NOT_STARTED);
    expect(status.declaredEtaMinutes).toBeNull();
    expect(status.enRouteAt).toBeNull();
    expect(status.arrivedAt).toBeNull();
  });

  it('markEnRoute a partir de NOT_STARTED grava a estimativa e o instante', () => {
    const status = OrderTravelStatus.notStarted(ORDER);
    const now = new Date();
    status.markEnRoute(estimate(20), now);
    expect(status.status).toBe(TRAVEL_STATUS.EN_ROUTE);
    expect(status.declaredEtaMinutes).toBe(20);
    expect(status.etaSource).toBe(ETA_SOURCE.PARTNER_DECLARED);
    expect(status.enRouteAt).toEqual(now);
  });

  it('markEnRoute é idempotente/atualizável a partir de EN_ROUTE (redeclarar o ETA)', () => {
    const status = OrderTravelStatus.notStarted(ORDER);
    const firstNow = new Date();
    status.markEnRoute(estimate(20), firstNow);
    const secondNow = new Date(firstNow.getTime() + 5 * 60000);
    status.markEnRoute(estimate(10), secondNow);
    expect(status.status).toBe(TRAVEL_STATUS.EN_ROUTE);
    expect(status.declaredEtaMinutes).toBe(10);
    // enRouteAt não muda na redeclaração — continua marcando quando o Partner
    // realmente saiu pela primeira vez.
    expect(status.enRouteAt).toEqual(firstNow);
  });

  it('markArrived só é permitido a partir de EN_ROUTE', () => {
    const status = OrderTravelStatus.notStarted(ORDER);
    expect(() => status.markArrived()).toThrow(OrderTravelTransitionException);
  });

  it('markArrived a partir de EN_ROUTE grava o instante de chegada e é terminal', () => {
    const status = OrderTravelStatus.notStarted(ORDER);
    status.markEnRoute(estimate(20));
    const arrivedAt = new Date();
    status.markArrived(arrivedAt);
    expect(status.status).toBe(TRAVEL_STATUS.ARRIVED);
    expect(status.arrivedAt).toEqual(arrivedAt);
    expect(() => status.markArrived()).toThrow(OrderTravelTransitionException);
    expect(() => status.markEnRoute(estimate(5))).toThrow(OrderTravelTransitionException);
  });
});
