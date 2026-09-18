import { describe, expect, it, vi } from 'vitest';
import { AccruePointsFromRuleUseCase, RedeemPointsUseCase } from './points.usecases';
import { PointsEarningRule } from '../../domain/entities/points-earning-rule';
import { InsufficientPointsBalanceException } from '../../domain/exceptions/growth.exceptions';

describe('AccruePointsFromRuleUseCase', () => {
  it('is a no-op when no admin-configured rule exists (safe-by-default infra)', async () => {
    const ledger = {
      append: vi.fn(),
      balanceOf: vi.fn(),
      listByIdentity: vi.fn(),
      lockIdentityForRedeem: vi.fn(),
    };
    const rules = { findActiveByEventName: vi.fn().mockResolvedValue([]), save: vi.fn(), listAll: vi.fn() };
    const usecase = new AccruePointsFromRuleUseCase(rules, ledger);

    const result = await usecase.execute({
      identityId: 'id-1',
      eventName: 'ServiceRequest.Completed',
      sourceEventId: 'evt-1',
    });

    expect(result).toEqual({ accrued: false, points: 0 });
    expect(ledger.append).not.toHaveBeenCalled();
  });

  it('accrues points per the active rule and is idempotent by sourceEventId', async () => {
    const rule = PointsEarningRule.create({
      eventName: 'ServiceRequest.Completed',
      description: 'x',
      points: 20,
      active: true,
    });
    const ledger = {
      append: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      balanceOf: vi.fn(),
      listByIdentity: vi.fn(),
      lockIdentityForRedeem: vi.fn(),
    };
    const rules = { findActiveByEventName: vi.fn().mockResolvedValue([rule]), save: vi.fn(), listAll: vi.fn() };
    const usecase = new AccruePointsFromRuleUseCase(rules, ledger);

    const first = await usecase.execute({
      identityId: 'id-1',
      eventName: 'ServiceRequest.Completed',
      sourceEventId: 'evt-1',
    });
    const second = await usecase.execute({
      identityId: 'id-1',
      eventName: 'ServiceRequest.Completed',
      sourceEventId: 'evt-1',
    });

    expect(first).toEqual({ accrued: true, points: 20 });
    expect(second).toEqual({ accrued: false, points: 20 });
    expect(ledger.append).toHaveBeenCalledTimes(2);
  });
});

function fakeTransactionalDb() {
  // Mimics `Database.transaction`: runs the callback with a fake tx object
  // (the repository mocks below don't care what `tx` actually is).
  return { transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) };
}

describe('RedeemPointsUseCase', () => {
  it('rejects redemption above balance (non-negative invariant)', async () => {
    const ledger = {
      append: vi.fn(),
      balanceOf: vi.fn().mockResolvedValue(5),
      listByIdentity: vi.fn(),
      lockIdentityForRedeem: vi.fn().mockResolvedValue(undefined),
    };
    const usecase = new RedeemPointsUseCase(ledger, fakeTransactionalDb() as never);

    await expect(
      usecase.execute({ identityId: 'id-1', points: 10, reason: 'x', sourceEventId: 'evt-1' }),
    ).rejects.toThrow(InsufficientPointsBalanceException);
    expect(ledger.append).not.toHaveBeenCalled();
    expect(ledger.lockIdentityForRedeem).toHaveBeenCalledWith('id-1', expect.anything());
  });

  it('redeems when balance suffices and returns the new balance', async () => {
    const ledger = {
      append: vi.fn().mockResolvedValue(true),
      balanceOf: vi.fn().mockResolvedValue(10),
      listByIdentity: vi.fn(),
      lockIdentityForRedeem: vi.fn().mockResolvedValue(undefined),
    };
    const usecase = new RedeemPointsUseCase(ledger, fakeTransactionalDb() as never);

    const result = await usecase.execute({ identityId: 'id-1', points: 4, reason: 'x', sourceEventId: 'evt-1' });

    expect(result).toEqual({ redeemed: true, balance: 6 });
    expect(ledger.lockIdentityForRedeem).toHaveBeenCalled();
  });

  it('takes the advisory lock before reading the balance (lock-then-read ordering)', async () => {
    const callOrder: string[] = [];
    const ledger = {
      append: vi.fn().mockResolvedValue(true),
      balanceOf: vi.fn(() => {
        callOrder.push('balanceOf');
        return Promise.resolve(10);
      }),
      listByIdentity: vi.fn(),
      lockIdentityForRedeem: vi.fn(() => {
        callOrder.push('lock');
        return Promise.resolve();
      }),
    };
    const usecase = new RedeemPointsUseCase(ledger, fakeTransactionalDb() as never);

    await usecase.execute({ identityId: 'id-1', points: 4, reason: 'x', sourceEventId: 'evt-1' });

    expect(callOrder).toEqual(['lock', 'balanceOf']);
  });
});
