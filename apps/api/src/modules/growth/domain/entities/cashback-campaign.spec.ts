import { describe, expect, it } from 'vitest';
import { CashbackCampaign } from './cashback-campaign';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

describe('CashbackCampaign', () => {
  const startsAt = new Date('2026-01-01T00:00:00Z');
  const endsAt = new Date('2026-02-01T00:00:00Z');

  it('rejects a campaign without an end date before the start ("no campaign forever")', () => {
    expect(() =>
      CashbackCampaign.create({ name: 'x', percentageBps: 500, startsAt: endsAt, endsAt: startsAt }),
    ).toThrow(GrowthValidationException);
  });

  it('rejects an invalid percentage', () => {
    expect(() => CashbackCampaign.create({ name: 'x', percentageBps: 0, startsAt, endsAt })).toThrow(
      GrowthValidationException,
    );
    expect(() => CashbackCampaign.create({ name: 'x', percentageBps: 10_001, startsAt, endsAt })).toThrow(
      GrowthValidationException,
    );
  });

  it('computes cashback in integer cents, floored', () => {
    const campaign = CashbackCampaign.create({ name: 'x', percentageBps: 333, startsAt, endsAt }); // 3.33%
    expect(campaign.computeCashbackCents(10_000)).toBe(333);
    expect(campaign.computeCashbackCents(1)).toBe(0);
  });

  it('isEffectiveAt respects active flag and window', () => {
    const campaign = CashbackCampaign.create({ name: 'x', percentageBps: 500, startsAt, endsAt, active: false });
    expect(campaign.isEffectiveAt(new Date('2026-01-15T00:00:00Z'))).toBe(false);
    const active = CashbackCampaign.create({ name: 'x', percentageBps: 500, startsAt, endsAt, active: true });
    expect(active.isEffectiveAt(new Date('2026-01-15T00:00:00Z'))).toBe(true);
    expect(active.isEffectiveAt(new Date('2026-03-01T00:00:00Z'))).toBe(false);
  });
});
