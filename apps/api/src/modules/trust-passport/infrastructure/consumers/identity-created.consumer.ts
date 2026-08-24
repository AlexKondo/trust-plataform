import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { CreateTrustPassportUseCase } from '../../application/usecases/create-trust-passport.usecase';

/**
 * PRIMEIRO consumer da plataforma: `Identity.Created` (e-mail confirmado)
 * → cria o Trust Passport automaticamente (TPS-001, caminho automático).
 * Idempotente: reentrega do evento ou passport já existente = no-op.
 */
@Injectable()
export class IdentityCreatedConsumer extends EventConsumer {
  readonly eventType = 'Identity.Created';
  readonly consumerName = 'tps.create-trust-passport';

  constructor(private readonly createTrustPassport: CreateTrustPassportUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const { identityId } = envelope.payload as { identityId?: string };
    if (!identityId) {
      // payload malformado é irrecuperável — não relançar para não reprocessar
      return;
    }
    await this.createTrustPassport.execute(
      identityId,
      {
        correlationId: envelope.correlationId,
        causationId: envelope.eventId,
        idempotent: true,
      },
      tx,
    );
  }
}
