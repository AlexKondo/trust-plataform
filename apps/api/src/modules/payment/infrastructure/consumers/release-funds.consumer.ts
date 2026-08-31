import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { ReleaseFundsUseCase } from '../../application/usecases/release-funds.usecase';

/**
 * PAY-004 fase 1 — `MarketplaceOrder.CustomerConfirmed` significa **aceite do
 * cliente para o serviço concluído** (PACK-01 §9), e por isso é gatilho de
 * ELEGIBILIDADE de liberação, nunca de criação de pagamento.
 *
 * Este consumer não fala com o gateway: ele avalia a política e persiste
 * READY_FOR_RELEASE. A execução externa é a fase 2.
 */
@Injectable()
export class PrepareReleaseOnCustomerConfirmedConsumer extends EventConsumer {
  readonly eventType = 'MarketplaceOrder.CustomerConfirmed';
  readonly consumerName = 'pay.prepare-release-on-customer-confirmed';

  constructor(private readonly releaseFunds: ReleaseFundsUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as { orderId?: string };
    const orderId = envelope.aggregateId ?? payload.orderId;
    if (!orderId) {
      return;
    }

    await this.releaseFunds.prepare(
      { orderId, correlationId: envelope.correlationId, causationId: envelope.eventId },
      tx,
    );
  }
}
