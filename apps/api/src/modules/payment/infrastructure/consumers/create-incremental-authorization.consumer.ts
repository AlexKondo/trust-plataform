import { Injectable } from '@nestjs/common';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { CreateIncrementalAuthorizationUseCase } from '../../application/usecases/create-incremental-authorization.usecase';

/**
 * IP-007 — gatilho canônico da autorização incremental: `TrustChangeOrder.Approved`.
 *
 * É o único evento que dispara este fluxo, e isso já garante por construção
 * (não por checagem extra aqui) que um Change Order `Rejected`/`Cancelled`/
 * `Expired` nunca cria autorização nenhuma — esses três status publicam
 * eventos DIFERENTES (`TrustChangeOrder.Rejected`; cancelamento/expiração não
 * publicam evento algum, ver `manage-change-order.usecase.ts`), e este consumer
 * não está inscrito neles.
 *
 * `managesOwnTransaction = true` pelo mesmo motivo de `FinalizeReleaseConsumer`
 * (PACK-01 §17): o use case chama o gateway de pagamento, uma dependência
 * externa, e isso não pode acontecer com uma transação de banco aberta. É
 * seguro rodar sem o dedupe transacional do relay porque o use case é
 * idempotente por desenho (`UNIQUE(change_order_id)`, ver
 * `create-incremental-authorization.usecase.ts`).
 */
@Injectable()
export class CreateIncrementalAuthorizationOnChangeOrderApprovedConsumer extends EventConsumer {
  readonly eventType = 'TrustChangeOrder.Approved';
  readonly consumerName = 'pay.create-incremental-authorization-on-change-order-approved';
  override readonly managesOwnTransaction = true;

  constructor(private readonly createIncrementalAuthorization: CreateIncrementalAuthorizationUseCase) {
    super();
  }

  async handle(envelope: ConsumedEvent): Promise<void> {
    const payload = envelope.payload as { changeOrderId?: string };
    const changeOrderId = envelope.aggregateId ?? payload.changeOrderId;
    if (!changeOrderId) {
      return;
    }

    await this.createIncrementalAuthorization.execute({
      changeOrderId,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
    });
  }
}
