import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { attributeForVerificationType } from '../../domain/entities/trust-passport';
import { TrustPassportRepository } from '../../domain/repositories/trust-passport.repository';

const TPS_PRODUCER = 'trust-passport-service';

interface VerificationDecisionPayload {
  trustPassportId?: string;
  type?: string;
}

/**
 * TPS-004 — projeção das decisões de verificação na visão consolidada do
 * Passport (BR-002/003/005). Idempotente: dedupe por eventId (plataforma) +
 * markVerified/markUnverified sem efeito quando o estado já é o desejado.
 */
abstract class VerificationProjectionConsumer extends EventConsumer {
  constructor(
    protected readonly repository: TrustPassportRepository,
    protected readonly outboxService: OutboxService,
    protected readonly logger: PinoLogger,
  ) {
    super();
  }

  protected abstract apply(
    passport: NonNullable<Awaited<ReturnType<TrustPassportRepository['findById']>>>,
    attribute: NonNullable<ReturnType<typeof attributeForVerificationType>>,
    now: Date,
  ): boolean;

  async handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const { trustPassportId, type } = envelope.payload as VerificationDecisionPayload;
    if (!trustPassportId || !type) {
      return; // payload malformado: irrecuperável, não reprocessar
    }
    const attribute = attributeForVerificationType(type);
    if (!attribute) {
      return; // tipo sem atributo consolidado (BR-004)
    }
    const passport = await this.repository.findById(trustPassportId);
    if (!passport) {
      // Passport ainda não criado — lançar faz o pg-boss reagendar (retry/backoff)
      throw new Error(`Trust Passport ${trustPassportId} not found yet; will retry.`);
    }

    const now = new Date();
    const changed = this.apply(passport, attribute, now);
    if (!changed) {
      return;
    }

    await this.repository.save(passport, tx);
    await this.outboxService.enqueue(tx, {
      eventName: 'TrustPassport.Updated',
      producer: TPS_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: {
        trustPassportId: passport.id,
        identityId: passport.identityId,
        updatedFields: [`${attribute}Verified`],
        profileCompletion: passport.profileCompletion,
        updatedAt: now.toISOString(),
      },
    });
    this.logger.info(
      {
        operation: 'SynchronizeVerification',
        trustPassportId: passport.id,
        attribute,
        profileCompletion: passport.profileCompletion,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Trust Passport synchronized with verification decision.',
    );
  }
}

@Injectable()
export class VerificationApprovedConsumer extends VerificationProjectionConsumer {
  readonly eventName = 'Verification.Approved';
  readonly consumerName = 'tps.sync-verification-approved';

  constructor(repository: TrustPassportRepository, outbox: OutboxService, logger: PinoLogger) {
    super(repository, outbox, logger);
    this.logger.setContext(VerificationApprovedConsumer.name);
  }

  protected apply(
    passport: NonNullable<Awaited<ReturnType<TrustPassportRepository['findById']>>>,
    attribute: NonNullable<ReturnType<typeof attributeForVerificationType>>,
    now: Date,
  ): boolean {
    return passport.markVerified(attribute, now);
  }
}

@Injectable()
export class VerificationRejectedConsumer extends VerificationProjectionConsumer {
  readonly eventName = 'Verification.Rejected';
  readonly consumerName = 'tps.sync-verification-rejected';

  constructor(repository: TrustPassportRepository, outbox: OutboxService, logger: PinoLogger) {
    super(repository, outbox, logger);
    this.logger.setContext(VerificationRejectedConsumer.name);
  }

  protected apply(
    passport: NonNullable<Awaited<ReturnType<TrustPassportRepository['findById']>>>,
    attribute: NonNullable<ReturnType<typeof attributeForVerificationType>>,
    now: Date,
  ): boolean {
    return passport.markUnverified(attribute, now);
  }
}
