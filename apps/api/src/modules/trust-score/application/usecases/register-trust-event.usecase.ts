import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  calculateScore,
  determineLevel,
  matchRule,
} from '../../domain/services/trust-score-engine';
import { TrustScoreRepository } from '../../infrastructure/persistence/drizzle-trust-score.repository';

const TRS_PRODUCER = 'trust-engine';

/**
 * TRS-002/003/004 — registra o Trust Event (imutável, idempotente por
 * source_event_id), recalcula o score deterministicamente e determina o nível.
 * SÓ o Trust Engine altera Score/Level (regra de ouro TP-001/003).
 */
@Injectable()
export class RegisterTrustEventUseCase {
  constructor(
    private readonly repository: TrustScoreRepository,
    private readonly outboxService: OutboxService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegisterTrustEventUseCase.name);
  }

  async execute(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as Record<string, unknown> & { trustPassportId?: string };
    const trustPassportId = payload.trustPassportId;
    if (!trustPassportId) {
      return; // evento sem passport não pontua
    }

    const scoreRow = await this.repository.findScoreByPassportId(trustPassportId, tx);
    if (!scoreRow) {
      // TRS-001 ainda não criou o score — pg-boss reagenda
      throw new Error(`Trust Score for passport ${trustPassportId} not found yet; will retry.`);
    }

    const [rules, previousMatches] = await Promise.all([
      this.repository.listActiveScoreRules(),
      this.repository.countMatchesByRule(trustPassportId),
    ]);
    const rule = matchRule(rules, envelope.eventName, payload, previousMatches);

    const registered = await this.repository.insertTrustEvent(
      {
        id: uuidv7(),
        trustPassportId,
        identityId: scoreRow.identityId,
        eventName: envelope.eventName,
        sourceEventId: envelope.eventId,
        payload,
        ruleId: rule?.id ?? null,
        points: rule?.points ?? 0,
        occurredAt: new Date(envelope.occurredAt),
      },
      tx,
    );
    if (!registered) {
      return; // já registrado (idempotência TRS-002)
    }

    // Recalcular dentro da transação — a soma já enxerga o evento recém-inserido
    const allPoints = await this.repository.listPoints(trustPassportId, tx);
    const score = calculateScore(allPoints);
    const levelRules = await this.repository.listLevelRules();
    const newLevel = determineLevel(levelRules, score);
    const calculatedAt = new Date();

    await this.repository.updateScore(scoreRow.id, score, newLevel, calculatedAt, tx);

    const scoreEvent = await this.outboxService.enqueue(tx, {
      eventName: 'TrustScore.Calculated',
      producer: TRS_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: { trustPassportId, identityId: scoreRow.identityId, score, level: newLevel, calculatedAt: calculatedAt.toISOString() },
    });

    if (newLevel !== scoreRow.level) {
      await this.repository.insertLevelHistory(
        {
          id: uuidv7(),
          trustPassportId,
          previousLevel: scoreRow.level,
          newLevel,
          score,
          changedAt: calculatedAt,
        },
        tx,
      );
      await this.outboxService.enqueue(tx, {
        eventName: 'TrustLevel.Changed',
        producer: TRS_PRODUCER,
        correlationId: envelope.correlationId,
        causationId: scoreEvent.eventId,
        payload: {
          trustPassportId,
          identityId: scoreRow.identityId,
          previousLevel: scoreRow.level,
          newLevel,
          score,
          changedAt: calculatedAt.toISOString(),
        },
      });
    }

    this.logger.info(
      {
        operation: 'RegisterTrustEvent',
        trustPassportId,
        eventName: envelope.eventName,
        points: rule?.points ?? 0,
        score,
        level: newLevel,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Trust event registered and score recalculated.',
    );
  }
}
