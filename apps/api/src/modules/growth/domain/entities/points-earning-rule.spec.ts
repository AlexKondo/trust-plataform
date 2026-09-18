import { describe, expect, it } from 'vitest';
import { PointsEarningRule } from './points-earning-rule';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

describe('PointsEarningRule', () => {
  it('defaults to inactive-safe: only fires when active and within window', () => {
    const rule = PointsEarningRule.create({
      eventName: 'ServiceRequest.Completed',
      description: 'x',
      points: 10,
      active: false,
    });
    expect(rule.isEffectiveAt(new Date())).toBe(false);
  });

  it('rejects startsAt after endsAt', () => {
    expect(() =>
      PointsEarningRule.create({
        eventName: 'x',
        description: 'x',
        points: 10,
        startsAt: new Date('2026-02-01T00:00:00Z'),
        endsAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toThrow(GrowthValidationException);
  });

  it('is effective only within an explicit window when active', () => {
    const rule = PointsEarningRule.create({
      eventName: 'x',
      description: 'x',
      points: 5,
      active: true,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-31T00:00:00Z'),
    });
    expect(rule.isEffectiveAt(new Date('2026-01-15T00:00:00Z'))).toBe(true);
    expect(rule.isEffectiveAt(new Date('2026-02-15T00:00:00Z'))).toBe(false);
  });
});
