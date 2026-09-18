import { describe, expect, it, vi } from 'vitest';
import { AccrueCashbackLiabilityUseCase } from './cashback.usecases';
import { CashbackCampaign } from '../../domain/entities/cashback-campaign';

describe('AccrueCashbackLiabilityUseCase', () => {
  it('is a no-op when no active campaign exists (never invents a percentage)', async () => {
    const campaigns = { findActiveAt: vi.fn().mockResolvedValue([]), save: vi.fn(), listAll: vi.fn() };
    const ledgerPosting = { post: vi.fn() };
    const usecase = new AccrueCashbackLiabilityUseCase(campaigns, ledgerPosting as never);

    const result = await usecase.execute(
      {
        paymentId: 'pay-1',
        amountCents: 10_000,
        currency: 'BRL',
        sourceEventId: 'evt-1',
        sourceEventType: 'Payment.Settled',
      },
      {} as never,
    );

    expect(result).toEqual({ accrued: false, cashbackCents: 0 });
    expect(ledgerPosting.post).not.toHaveBeenCalled();
  });

  it('posts a balanced liability via the shared LedgerPostingService when a campaign is active', async () => {
    const campaign = CashbackCampaign.create({
      name: 'Launch',
      percentageBps: 500, // 5%
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
    });
    const campaigns = { findActiveAt: vi.fn().mockResolvedValue([campaign]), save: vi.fn(), listAll: vi.fn() };
    const ledgerPosting = { post: vi.fn().mockResolvedValue(undefined) };
    const usecase = new AccrueCashbackLiabilityUseCase(campaigns, ledgerPosting as never);

    const result = await usecase.execute(
      {
        paymentId: 'pay-1',
        amountCents: 10_000,
        currency: 'BRL',
        sourceEventId: 'evt-1',
        sourceEventType: 'Payment.Settled',
      },
      {} as never,
    );

    expect(result).toEqual({ accrued: true, cashbackCents: 500 });
    expect(ledgerPosting.post).toHaveBeenCalledWith(
      expect.objectContaining({
        debitAccount: 'CASHBACK_LIABILITY',
        creditAccount: 'CASHBACK_PAYABLE',
        amountCents: 500,
        paymentId: 'pay-1',
      }),
      expect.anything(),
    );
  });
});
