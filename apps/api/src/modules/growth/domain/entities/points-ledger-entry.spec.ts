import { describe, expect, it } from 'vitest';
import { PointsLedgerEntry } from './points-ledger-entry';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

describe('PointsLedgerEntry', () => {
  it('rejects zero/negative points', () => {
    expect(() =>
      PointsLedgerEntry.create({
        identityId: 'id-1',
        direction: 'EARN',
        points: 0,
        reason: 'x',
        sourceEventId: 'evt-1',
      }),
    ).toThrow(GrowthValidationException);
    expect(() =>
      PointsLedgerEntry.create({
        identityId: 'id-1',
        direction: 'EARN',
        points: -5,
        reason: 'x',
        sourceEventId: 'evt-1',
      }),
    ).toThrow(GrowthValidationException);
  });

  it('signedPoints is negative for REDEEM, positive for EARN/ADJUST', () => {
    const earn = PointsLedgerEntry.create({
      identityId: 'id-1',
      direction: 'EARN',
      points: 10,
      reason: 'x',
      sourceEventId: 'evt-1',
    });
    const redeem = PointsLedgerEntry.create({
      identityId: 'id-1',
      direction: 'REDEEM',
      points: 4,
      reason: 'x',
      sourceEventId: 'evt-2',
    });
    expect(earn.signedPoints()).toBe(10);
    expect(redeem.signedPoints()).toBe(-4);
  });
});
