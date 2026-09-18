import { describe, expect, it } from 'vitest';
import { ReferralAttribution, ReferralCode } from './referral';
import { GrowthValidationException, SelfReferralException } from '../exceptions/growth.exceptions';

describe('ReferralCode', () => {
  it('rejects malformed codes', () => {
    expect(() => ReferralCode.create({ identityId: 'id-1', code: 'ab' })).toThrow(GrowthValidationException);
    expect(() => ReferralCode.create({ identityId: 'id-1', code: 'lowercase' })).toThrow(
      GrowthValidationException,
    );
  });

  it('accepts a valid code', () => {
    const code = ReferralCode.create({ identityId: 'id-1', code: 'AB23CD45' });
    expect(code.code).toBe('AB23CD45');
  });
});

describe('ReferralAttribution', () => {
  it('blocks self-referral (acceptance criteria: referral self-abuse blocked)', () => {
    expect(() =>
      ReferralAttribution.create({
        referralCodeId: 'code-1',
        referrerIdentityId: 'id-1',
        referredIdentityId: 'id-1',
      }),
    ).toThrow(SelfReferralException);
  });

  it('allows a distinct referrer/referred pair, starting PENDING', () => {
    const attribution = ReferralAttribution.create({
      referralCodeId: 'code-1',
      referrerIdentityId: 'id-1',
      referredIdentityId: 'id-2',
    });
    expect(attribution.status).toBe('PENDING');
  });

  it('confirm() transitions to CONFIRMED and is idempotent', () => {
    const attribution = ReferralAttribution.create({
      referralCodeId: 'code-1',
      referrerIdentityId: 'id-1',
      referredIdentityId: 'id-2',
    });
    const confirmed = attribution.confirm(new Date('2026-01-01T00:00:00Z'));
    expect(confirmed.status).toBe('CONFIRMED');
    const confirmedAgain = confirmed.confirm(new Date('2026-02-01T00:00:00Z'));
    expect(confirmedAgain.toProps().confirmedAt).toEqual(confirmed.toProps().confirmedAt);
  });
});
