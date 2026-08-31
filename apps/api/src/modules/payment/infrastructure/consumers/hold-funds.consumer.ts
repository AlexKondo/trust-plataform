import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { HoldFundsUseCase } from '../../application/usecases/hold-funds.usecase';

/**
 * PAY-003 — gatilho canônico da custódia: `Payment.Authorized` (PACK-01 §8.1).
 *
 * O dinheiro entra em custódia na CONTRATAÇÃO, antes de o serviço ser executado.
 * É o oposto do que a PAY-001 histórica sugeria, e é essa ordem que faz a
 * custódia proteger alguém (PACK-01 §3).
 */
@Injectable()
export class HoldFundsOnAuthorizedConsumer extends EventConsumer {
  readonly eventType = 'Payment.Authorized';
  readonly consumerName = 'pay.hold-funds-on-authorized';

  constructor(private readonly holdFunds: HoldFundsUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as { paymentId?: string };
    // O agregado do evento JÁ é o Payment (PACK-00 §5.2); o payload é o
    // caminho tolerante para eventos anteriores ao envelope canônico.
    const paymentId = envelope.aggregateId ?? payload.paymentId;
    if (!paymentId) {
      return;
    }

    await this.holdFunds.execute(
      {
        paymentId,
        correlationId: envelope.correlationId,
        causationId: envelope.eventId,
      },
      tx,
    );
  }
}
