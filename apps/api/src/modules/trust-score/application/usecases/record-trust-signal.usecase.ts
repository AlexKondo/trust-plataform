import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { findSignalDefinition } from '../../domain/services/trust-signal-registry';
import { TrustSignalRepository } from '../../infrastructure/persistence/drizzle-trust-signal.repository';

/**
 * IP-011 — records an OBJECTIVE Trust Signal from a domain event.
 *
 * Deliberately mirrors `RegisterTrustEventUseCase`'s idempotency/shape, but
 * with one hard difference that is the whole point of this IP: it NEVER
 * touches `trust_scores`/`trust_level_history` and NEVER matches against
 * `trust_score_rules`. It only records the fact so it is explainable on the
 * owner's timeline/profile (subject to visibility). Only signal types
 * declared in TRUST_SIGNAL_REGISTRY can be recorded — an unknown event is a
 * silent no-op (fail-closed on the registry, same as `matchRule` returning
 * null for an unmapped event).
 */
@Injectable()
export class RecordTrustSignalUseCase {
  constructor(
    private readonly passportRepository: TrustPassportRepository,
    private readonly signalRepository: TrustSignalRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RecordTrustSignalUseCase.name);
  }

  async execute(
    envelope: ConsumedEvent,
    targetIdentityId: string | undefined,
    tx: DatabaseExecutor,
  ): Promise<void> {
    if (!targetIdentityId) {
      return;
    }
    const definition = findSignalDefinition(envelope.eventType);
    if (!definition) {
      return; // evento não catalogado como sinal — nenhum efeito
    }

    const passport = await this.passportRepository.findByIdentityId(targetIdentityId);
    if (!passport) {
      // Passport pode ainda não existir — o relay reagenda (mesmo padrão dos
      // scoring consumers do marketplace).
      throw new Error(`Trust Passport for identity ${targetIdentityId} not found yet; will retry.`);
    }

    const recorded = await this.signalRepository.insertSignal(
      {
        id: uuidv7(),
        trustPassportId: passport.id,
        identityId: targetIdentityId,
        signalType: definition.signalType,
        signalVersion: definition.version,
        sourceEventId: envelope.eventId,
        sourceEventName: envelope.eventType,
        payload: envelope.payload,
        visibility: definition.defaultVisibility,
        occurredAt: new Date(envelope.occurredAt),
      },
      tx,
    );
    if (!recorded) {
      return; // já registrado (idempotência)
    }

    this.logger.info(
      {
        operation: 'RecordTrustSignal',
        signalType: definition.signalType,
        trustPassportId: passport.id,
        sourceEventName: envelope.eventType,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Trust signal recorded (observational — no score effect).',
    );
  }
}
