import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { AwardedBadgeRow, TrustBadgeRow } from '../persistence/trust-reputation.schema';
import { TrustReputationRepository } from '../persistence/drizzle-trust-reputation.repository';
import { AwardBadgesConsumer } from './award-badges.consumer';

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function badge(partial: Partial<TrustBadgeRow>): TrustBadgeRow {
  const now = new Date();
  return {
    id: partial.id ?? 'badge-1',
    code: partial.code ?? 'BADGE',
    name: 'Badge',
    description: 'desc',
    badgeType: partial.badgeType ?? 'PERMANENT',
    criteria: partial.criteria ?? [],
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function award(badgeId: string): AwardedBadgeRow {
  return {
    id: `award-${badgeId}`,
    trustPassportId: 'tp-1',
    badgeId,
    awardedAt: new Date(),
    revokedAt: null,
  };
}

function envelope(score: number, level: string): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventName: 'TrustScore.Calculated',
    eventVersion: '1.0',
    occurredAt: new Date().toISOString(),
    producer: 'trust-engine',
    correlationId: 'corr-1',
    payload: { trustPassportId: 'tp-1', identityId: 'id-1', score, level },
  };
}

function makeScenario(catalog: TrustBadgeRow[], awards: AwardedBadgeRow[]) {
  const repository = {
    listBadges: vi.fn().mockResolvedValue(catalog),
    listActiveAwards: vi.fn().mockResolvedValue(awards),
    awardBadge: vi.fn().mockResolvedValue(undefined),
    revokeAward: vi.fn().mockResolvedValue(undefined),
  } as unknown as TrustReputationRepository;
  const outbox = {
    enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-2' }),
  } as unknown as OutboxService;
  const consumer = new AwardBadgesConsumer(repository, outbox, logger());
  return { repository, outbox, consumer, tx: Symbol('tx') as never };
}

describe('AwardBadgesConsumer (TRS-013)', () => {
  it('concede badge quando o critério passa a valer', async () => {
    const catalog = [
      badge({ id: 'b-25', code: 'TRUSTED_MEMBER', criteria: [{ field: 'score', op: 'gte', value: 25 }] }),
      badge({ id: 'b-gold', code: 'GOLD_TIER', criteria: [{ field: 'level', op: 'in', value: ['GOLD', 'PLATINUM'] }] }),
    ];
    const { consumer, repository, outbox, tx } = makeScenario(catalog, []);

    await consumer.handle(envelope(25, 'BRONZE'), tx);

    expect(repository.awardBadge).toHaveBeenCalledTimes(1); // só o TRUSTED_MEMBER
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({ eventName: 'TrustBadge.Awarded' });
    expect((event?.payload as { badgeCode: string }).badgeCode).toBe('TRUSTED_MEMBER');
  });

  it('não premia em duplicidade (idempotente)', async () => {
    const catalog = [
      badge({ id: 'b-25', code: 'TRUSTED_MEMBER', criteria: [{ field: 'score', op: 'gte', value: 25 }] }),
    ];
    const { consumer, repository, tx } = makeScenario(catalog, [award('b-25')]);
    await consumer.handle(envelope(175, 'BRONZE'), tx);
    expect(repository.awardBadge).not.toHaveBeenCalled();
    expect(repository.revokeAward).not.toHaveBeenCalled();
  });

  it('PERMANENT permanece quando o critério deixa de valer; DYNAMIC é revogado', async () => {
    const catalog = [
      badge({ id: 'b-perm', code: 'GOLD_TIER', badgeType: 'PERMANENT', criteria: [{ field: 'level', op: 'in', value: ['GOLD', 'PLATINUM'] }] }),
      badge({ id: 'b-dyn', code: 'TOP_TRUST', badgeType: 'DYNAMIC', criteria: [{ field: 'level', op: 'eq', value: 'PLATINUM' }] }),
    ];
    const { consumer, repository, outbox, tx } = makeScenario(catalog, [
      award('b-perm'),
      award('b-dyn'),
    ]);

    // caiu para SILVER: perde só o DYNAMIC
    await consumer.handle(envelope(300, 'SILVER'), tx);

    expect(repository.revokeAward).toHaveBeenCalledTimes(1);
    expect(repository.revokeAward).toHaveBeenCalledWith('award-b-dyn', expect.any(Date), tx);
    const event = vi.mocked(outbox.enqueue).mock.calls[0]?.[1];
    expect(event).toMatchObject({ eventName: 'TrustBadge.Revoked' });
  });
});
