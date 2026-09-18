import { describe, expect, it, vi } from 'vitest';
import { AttributeReferralUseCase } from './referral.usecases';
import { ReferralCode } from '../../domain/entities/referral';
import { GrowthValidationException, ReferralAlreadyAttributedException, SelfReferralException } from '../../domain/exceptions/growth.exceptions';

describe('AttributeReferralUseCase', () => {
  const code = ReferralCode.create({ identityId: 'referrer-1', code: 'ABC23456' });

  it('rejects an unknown referral code', async () => {
    const referrals = { findCodeByValue: vi.fn().mockResolvedValue(null), saveAttribution: vi.fn() };
    const usecase = new AttributeReferralUseCase(referrals as never);

    await expect(
      usecase.execute({ referralCode: 'DOESNOTEXIST', referredIdentityId: 'new-1' }),
    ).rejects.toThrow(GrowthValidationException);
  });

  it('blocks self-referral end-to-end (attribution built from the referrer identity)', async () => {
    const referrals = { findCodeByValue: vi.fn().mockResolvedValue(code), saveAttribution: vi.fn() };
    const usecase = new AttributeReferralUseCase(referrals as never);

    await expect(
      usecase.execute({ referralCode: code.code, referredIdentityId: 'referrer-1' }),
    ).rejects.toThrow(SelfReferralException);
    expect(referrals.saveAttribution).not.toHaveBeenCalled();
  });

  it('blocks reattribution of an already-attributed identity (one-time-use)', async () => {
    const referrals = { findCodeByValue: vi.fn().mockResolvedValue(code), saveAttribution: vi.fn().mockResolvedValue(false) };
    const usecase = new AttributeReferralUseCase(referrals as never);

    await expect(
      usecase.execute({ referralCode: code.code, referredIdentityId: 'new-1' }),
    ).rejects.toThrow(ReferralAlreadyAttributedException);
  });

  it('attributes a valid, distinct, first-time referral', async () => {
    const referrals = { findCodeByValue: vi.fn().mockResolvedValue(code), saveAttribution: vi.fn().mockResolvedValue(true) };
    const usecase = new AttributeReferralUseCase(referrals as never);

    const result = await usecase.execute({ referralCode: code.code, referredIdentityId: 'new-1' });

    expect(result).toEqual({ attributed: true });
  });
});
