import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { RuleCondition, conditionsMatch } from '../../domain/services/trust-score-engine';
import { TrustReputationRepository } from '../persistence/drizzle-trust-reputation.repository';

const TRS_PRODUCER = 'trust-engine';

/**
 * TRS-013 — premiação automática: a cada TrustScore.Calculated, avalia o
 * catálogo contra {score, level}. PERMANENT nunca é revogado; DYNAMIC é
 * revogado quando o critério deixa de valer. Só o TRS publica TrustBadge.*.
 */
@Injectable()
export class AwardBadgesConsumer extends EventConsumer {
  readonly eventType = 'TrustScore.Calculated';
  readonly consumerName = 'trs.award-badges';

  constructor(
    private readonly repository: TrustReputationRepository,
    private readonly outboxService: OutboxService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(AwardBadgesConsumer.name);
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const { trustPassportId, identityId, score, level } = envelope.payload as {
      trustPassportId?: string;
      identityId?: string;
      score?: number;
      level?: string;
    };
    if (!trustPassportId || score === undefined || !level) {
      return;
    }
    const context = { score, level };
    const [catalog, awards] = await Promise.all([
      this.repository.listBadges(true),
      this.repository.listActiveAwards(trustPassportId, tx),
    ]);
    const awardedByBadgeId = new Map(awards.map((award) => [award.badgeId, award]));
    const now = new Date();

    for (const badge of catalog) {
      const matches = conditionsMatch(badge.criteria as RuleCondition[], context);
      const currentAward = awardedByBadgeId.get(badge.id);

      if (matches && !currentAward) {
        const awardId = uuidv7();
        await this.repository.awardBadge(
          {
            id: awardId,
            trustPassportId,
            badgeId: badge.id,
            awardedAt: now,
            revokedAt: null,
          },
          tx,
        );
        await this.outboxService.enqueue(tx, {
          eventType: 'TrustBadge.Awarded',
          aggregateType: 'TrustBadge',
          aggregateId: awardId,
          producer: TRS_PRODUCER,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
          payload: { trustPassportId, identityId, badgeCode: badge.code, awardedAt: now.toISOString() },
        });
        this.logger.info(
          { operation: 'AwardBadge', trustPassportId, badgeCode: badge.code, result: 'SUCCESS' },
          'Badge awarded.',
        );
      } else if (!matches && currentAward && badge.badgeType === 'DYNAMIC') {
        await this.repository.revokeAward(currentAward.id, now, tx);
        await this.outboxService.enqueue(tx, {
          eventType: 'TrustBadge.Revoked',
          aggregateType: 'TrustBadge',
          aggregateId: currentAward.id,
          producer: TRS_PRODUCER,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
          payload: { trustPassportId, identityId, badgeCode: badge.code, revokedAt: now.toISOString() },
        });
        this.logger.info(
          { operation: 'RevokeBadge', trustPassportId, badgeCode: badge.code, result: 'SUCCESS' },
          'Dynamic badge revoked.',
        );
      }
    }
  }
}
