import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { RecordTrustSignalUseCase } from '../../application/usecases/record-trust-signal.usecase';

/**
 * IP-011 — gap consumers: events that the preflight found have NO approved
 * Trust Score rule (not in `trust_score_rules`, not in INCONSISTENCIAS #13),
 * but that are objective, execution/payment facts worth surfacing on the
 * Trust Timeline for explainability. They record a `trust_signal`
 * (observational only — see RecordTrustSignalUseCase) and never call
 * RegisterTrustEventUseCase, so Score/Level are untouched (TP-001/003).
 *
 * Target identity choice: the Trust Partner (`sellerId`) is credited with
 * the signal in all four cases — change orders are proposals/decisions in a
 * negotiation the Partner is party to, and refunds are a fact about an order
 * the Partner delivered. This mirrors the existing convention in
 * `marketplace-scoring.consumers.ts` (OrderConfirmed → sellerId).
 */
abstract class TrustSignalConsumer extends EventConsumer {
  constructor(private readonly recordTrustSignal: RecordTrustSignalUseCase) {
    super();
  }

  protected abstract targetIdentityId(payload: Record<string, unknown>): string | undefined;

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    await this.recordTrustSignal.execute(envelope, this.targetIdentityId(envelope.payload), tx);
  }
}

/**
 * Cada subclasse precisa do PRÓPRIO construtor explícito (mesmo só repassando
 * pra `super`): o Nest resolve dependências via `design:paramtypes` emitido
 * pelo TypeScript na classe declarante, e uma subclasse SEM construtor
 * próprio não recebe esse metadado (confirmado em runtime: sem isto, o
 * OutboxRelayService injeta a classe com `recordTrustSignal` undefined e o
 * consumer quebra ao chamar `.execute`). Mesmo padrão já usado em
 * `marketplace-scoring.consumers.ts`.
 */
@Injectable()
export class ChangeOrderSubmittedSignalConsumer extends TrustSignalConsumer {
  readonly eventType = 'TrustChangeOrder.Submitted';
  readonly consumerName = 'trs.signal-change-order-submitted';

  constructor(recordTrustSignal: RecordTrustSignalUseCase) {
    super(recordTrustSignal);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.sellerId as string | undefined;
  }
}

@Injectable()
export class ChangeOrderApprovedSignalConsumer extends TrustSignalConsumer {
  readonly eventType = 'TrustChangeOrder.Approved';
  readonly consumerName = 'trs.signal-change-order-approved';

  constructor(recordTrustSignal: RecordTrustSignalUseCase) {
    super(recordTrustSignal);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.sellerId as string | undefined;
  }
}

@Injectable()
export class ChangeOrderRejectedSignalConsumer extends TrustSignalConsumer {
  readonly eventType = 'TrustChangeOrder.Rejected';
  readonly consumerName = 'trs.signal-change-order-rejected';

  constructor(recordTrustSignal: RecordTrustSignalUseCase) {
    super(recordTrustSignal);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.sellerId as string | undefined;
  }
}

@Injectable()
export class FundsRefundCompletedSignalConsumer extends TrustSignalConsumer {
  readonly eventType = 'FundsRefund.Completed';
  readonly consumerName = 'trs.signal-refund-completed';

  constructor(recordTrustSignal: RecordTrustSignalUseCase) {
    super(recordTrustSignal);
  }

  protected targetIdentityId(payload: Record<string, unknown>): string | undefined {
    return payload.sellerId as string | undefined;
  }
}
