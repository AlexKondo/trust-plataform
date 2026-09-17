import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { fromReais } from '../../../../shared/money/money';
import { LEDGER_ACCOUNTS } from '../../domain/entities/ledger-entry';
import { LedgerPostingService } from '../../application/services/ledger-posting.service';

/**
 * IP-010 — reembolso (PAY-006/IP-008): o valor sai de custódia — débito em
 * `REFUND_ISSUED` (fato histórico: "isto foi devolvido"), crédito em
 * `CUSTODY_HELD` (o que a Trust ainda segura por este Payment diminui).
 *
 * Decisão deliberada, reavaliada e CONFIRMADA correta no ciclo de correção do
 * Diff Review (F1/F4): o ledger sempre credita `CUSTODY_HELD`, mesmo quando
 * um reembolso alcança um Payment cuja custódia JÁ foi total ou parcialmente
 * liberada (`TrustCustody.markRefunded` só existe a partir de `IN_CUSTODY` —
 * ver comentário em `trust-custody.ts` — mas reembolso por disputa em
 * `refund-payment.usecase.ts` não exige o mesmo). Isto é seguro porque a
 * invariante que `LedgerReconciliationService` verifica
 * (`custodyHeld + partnerPayable == amountCents - refundIssued`) continua
 * valendo mesmo que `CUSTODY_HELD` fique negativo para ESTE Payment depois de
 * um reembolso pós-liberação: `PARTNER_PAYABLE` não muda, então a soma dos
 * dois ainda cai exatamente no valor líquido esperado — um saldo negativo de
 * `CUSTODY_HELD` por Payment é uma leitura válida (dinheiro que "voltou" além
 * do que estava fisicamente retido, porque a contrapartida real já tinha ido
 * para `PARTNER_PAYABLE`), não um erro. Mudar isto agora reintroduziria a
 * complexidade que o Diff Review confirmou ser desnecessária.
 */
@Injectable()
export class PostLedgerOnRefundCompletedConsumer extends EventConsumer {
  readonly eventType = 'FundsRefund.Completed';
  readonly consumerName = 'pay.post-ledger-on-refund-completed';

  constructor(private readonly ledgerPosting: LedgerPostingService) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as {
      refundId?: string;
      paymentId?: string;
      amount?: number;
      currency?: string;
    };
    const refundId = envelope.aggregateId ?? payload.refundId;
    if (!refundId || !payload.paymentId || payload.amount === undefined || !payload.currency) {
      return;
    }

    await this.ledgerPosting.post(
      {
        sourceEventId: envelope.eventId,
        sourceEventType: envelope.eventType,
        sourceAggregateType: 'FundsRefund',
        sourceAggregateId: refundId,
        paymentId: payload.paymentId,
        amountCents: fromReais(payload.amount),
        currency: payload.currency,
        // Mesma convenção de ATIVO: débito em REFUND_ISSUED (valor devolvido,
        // fato histórico), crédito em CUSTODY_HELD (reduz o que a Trust
        // ainda retém para este Payment).
        debitAccount: LEDGER_ACCOUNTS.REFUND_ISSUED,
        creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      },
      tx,
    );
  }
}
