import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { RegisterTrustEventUseCase } from '../../application/usecases/register-trust-event.usecase';
import { determineLevel } from '../../domain/services/trust-score-engine';
import { TrustScoreRepository } from '../persistence/drizzle-trust-score.repository';

const TRS_PRODUCER = 'trust-engine';

/** TRS-001 — TrustPassport.Created → cria o Trust Score (0, UNVERIFIED). */
@Injectable()
export class TrustPassportCreatedConsumer extends EventConsumer {
  readonly eventType = 'TrustPassport.Created';
  readonly consumerName = 'trs.create-trust-score';

  constructor(
    private readonly repository: TrustScoreRepository,
    private readonly outboxService: OutboxService,
    private readonly registerTrustEvent: RegisterTrustEventUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(TrustPassportCreatedConsumer.name);
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const { trustPassportId, identityId } = envelope.payload as {
      trustPassportId?: string;
      identityId?: string;
    };
    if (!trustPassportId || !identityId) {
      return;
    }
    const calculatedAt = new Date();
    const levelRules = await this.repository.listLevelRules();
    const trustScoreId = uuidv7();
    const created = await this.repository.createScore(
      {
        id: trustScoreId,
        trustPassportId,
        identityId,
        level: determineLevel(levelRules, 0),
        calculatedAt,
      },
      tx,
    );
    if (!created) {
      return; // já existe (idempotência)
    }
    await this.outboxService.enqueue(tx, {
      eventType: 'TrustScore.Created',
      aggregateType: 'TrustScore',
      aggregateId: trustScoreId,
      producer: TRS_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: { trustPassportId, identityId, score: 0, createdAt: calculatedAt.toISOString() },
    });
    this.logger.info(
      { operation: 'CreateTrustScore', trustPassportId, correlationId: envelope.correlationId, result: 'SUCCESS' },
      'Trust Score created.',
    );

    // O próprio TrustPassport.Created também pontua (regra seed +25) —
    // registrado aqui na MESMA transação para não depender de ordem entre consumers.
    await this.registerTrustEvent.execute(envelope, tx);
  }
}

/** TRS-002 — decisões de verificação viram Trust Events e recalculam o score. */
@Injectable()
export class VerificationApprovedScoringConsumer extends EventConsumer {
  readonly eventType = 'Verification.Approved';
  readonly consumerName = 'trs.score-verification-approved';

  constructor(private readonly registerTrustEvent: RegisterTrustEventUseCase) {
    super();
  }

  handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    return this.registerTrustEvent.execute(envelope, tx);
  }
}

@Injectable()
export class VerificationRejectedScoringConsumer extends EventConsumer {
  readonly eventType = 'Verification.Rejected';
  readonly consumerName = 'trs.score-verification-rejected';

  constructor(private readonly registerTrustEvent: RegisterTrustEventUseCase) {
    super();
  }

  handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    return this.registerTrustEvent.execute(envelope, tx);
  }
}
