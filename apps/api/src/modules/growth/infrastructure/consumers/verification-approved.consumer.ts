import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { ConfirmReferralOnVerificationUseCase } from '../../application/usecases/referral.usecases';

/**
 * IP-012 (Quality Gate finding #1) — o outro lado do fio que faltava: quando
 * uma verificação (KYC) é aprovada de verdade (VRF, `Verification.Approved`
 * — payload já emitido por `decide-verification.usecase.ts`, evento
 * PRÉ-EXISTENTE, nenhuma mudança em `verification/**`), promove a
 * atribuição de referral PENDING dessa Identity (se existir) para CONFIRMED.
 * Mesmo padrão estrutural de `trust-signal.consumers.ts` (IP-011): subclasse
 * de `EventConsumer`, descoberta automática pelo `OutboxRelayService`,
 * idempotente (dedupe por `(consumerName, eventId)` garantido pela
 * plataforma) e — como `ConfirmReferralOnVerificationUseCase.execute` já é
 * naturalmente idempotente (`status === 'CONFIRMED'` vira no-op) — seguro
 * sob reentrega.
 */
@Injectable()
export class VerificationApprovedReferralConfirmationConsumer extends EventConsumer {
  readonly eventType = 'Verification.Approved';
  readonly consumerName = 'growth.confirm-referral-on-verification-approved';

  constructor(private readonly confirmReferral: ConfirmReferralOnVerificationUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const identityId = envelope.payload.identityId as string | undefined;
    if (!identityId) {
      return;
    }
    await this.confirmReferral.execute(identityId, new Date(envelope.occurredAt), tx);
  }
}
