import { describe, expect, it, vi } from 'vitest';
import { RecordTrustSignalUseCase } from './record-trust-signal.usecase';

const logger = { setContext: vi.fn(), info: vi.fn() } as never;

function makeEnvelope(eventType: string, payload: Record<string, unknown> = {}) {
  return {
    eventId: 'evt-1',
    eventType,
    aggregateType: 'X',
    aggregateId: 'agg-1',
    correlationId: 'corr-1',
    occurredAt: new Date().toISOString(),
    payload,
  } as never;
}

describe('RecordTrustSignalUseCase (IP-011)', () => {
  it('is a no-op for an event not in the signal registry (fail-closed)', async () => {
    const passportRepository = { findByIdentityId: vi.fn() };
    const signalRepository = { insertSignal: vi.fn() };
    const usecase = new RecordTrustSignalUseCase(passportRepository as never, signalRepository as never, logger);

    await usecase.execute(makeEnvelope('Unknown.Event'), 'identity-1', {} as never);

    expect(passportRepository.findByIdentityId).not.toHaveBeenCalled();
    expect(signalRepository.insertSignal).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no target identity', async () => {
    const passportRepository = { findByIdentityId: vi.fn() };
    const signalRepository = { insertSignal: vi.fn() };
    const usecase = new RecordTrustSignalUseCase(passportRepository as never, signalRepository as never, logger);

    await usecase.execute(makeEnvelope('TrustChangeOrder.Submitted'), undefined, {} as never);

    expect(passportRepository.findByIdentityId).not.toHaveBeenCalled();
  });

  it('throws (for pg-boss retry) when the Trust Passport does not exist yet', async () => {
    const passportRepository = { findByIdentityId: vi.fn().mockResolvedValue(null) };
    const signalRepository = { insertSignal: vi.fn() };
    const usecase = new RecordTrustSignalUseCase(passportRepository as never, signalRepository as never, logger);

    await expect(
      usecase.execute(makeEnvelope('TrustChangeOrder.Submitted'), 'identity-1', {} as never),
    ).rejects.toThrow(/not found yet/);
    expect(signalRepository.insertSignal).not.toHaveBeenCalled();
  });

  it('records a signal with affectsScore semantics: never touches score/level repositories', async () => {
    const passportRepository = { findByIdentityId: vi.fn().mockResolvedValue({ id: 'passport-1' }) };
    const signalRepository = { insertSignal: vi.fn().mockResolvedValue(true) };
    const usecase = new RecordTrustSignalUseCase(passportRepository as never, signalRepository as never, logger);

    await usecase.execute(
      makeEnvelope('TrustChangeOrder.Approved', { sellerId: 'identity-1' }),
      'identity-1',
      {} as never,
    );

    expect(signalRepository.insertSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        trustPassportId: 'passport-1',
        signalType: 'CHANGE_ORDER_APPROVED',
        sourceEventId: 'evt-1',
        sourceEventName: 'TrustChangeOrder.Approved',
        visibility: 'PRIVATE',
      }),
      {},
    );
  });

  it('is idempotent: a duplicate insert (same sourceEventId) is silently accepted', async () => {
    const passportRepository = { findByIdentityId: vi.fn().mockResolvedValue({ id: 'passport-1' }) };
    const signalRepository = { insertSignal: vi.fn().mockResolvedValue(false) };
    const usecase = new RecordTrustSignalUseCase(passportRepository as never, signalRepository as never, logger);

    await expect(
      usecase.execute(makeEnvelope('FundsRefund.Completed', {}), 'identity-1', {} as never),
    ).resolves.toBeUndefined();
  });
});
