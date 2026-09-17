import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { fromReais } from '../../../../shared/money/money';
import { LEDGER_ACCOUNTS } from '../../domain/entities/ledger-entry';
import { LedgerPostingService } from '../../application/services/ledger-posting.service';

/**
 * IP-010 — primeiro lançamento da vida financeira de um Payment: o valor sai
 * da conta de trânsito do comprador (`MEMBER_FUNDING_CLEARING`, débito — está
 * "gasto" do ponto de vista do comprador) e entra em custódia da Trust
 * (`CUSTODY_HELD`, crédito — passivo da plataforma até liberar ou devolver).
 *
 * Mesmo gatilho canônico de `HoldFundsOnAuthorizedConsumer` (PAY-003,
 * PACK-01 §8.1) — de propósito: o ledger reflete o MESMO fato de domínio,
 * não um segundo cálculo independente.
 */
@Injectable()
export class PostLedgerOnPaymentAuthorizedConsumer extends EventConsumer {
  readonly eventType = 'Payment.Authorized';
  readonly consumerName = 'pay.post-ledger-on-payment-authorized';

  constructor(private readonly ledgerPosting: LedgerPostingService) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as {
      paymentId?: string;
      amount?: number;
      currency?: string;
    };
    const paymentId = envelope.aggregateId ?? payload.paymentId;
    if (!paymentId || payload.amount === undefined || !payload.currency) {
      return;
    }

    await this.ledgerPosting.post(
      {
        sourceEventId: envelope.eventId,
        sourceEventType: envelope.eventType,
        sourceAggregateType: 'Payment',
        sourceAggregateId: paymentId,
        paymentId,
        amountCents: fromReais(payload.amount),
        currency: payload.currency,
        // CUSTODY_HELD é tratada como conta de ATIVO (saldo positivo = valor
        // efetivamente retido agora) — débito aumenta o que está em custódia,
        // crédito (aqui, em MEMBER_FUNDING_CLEARING) é a contrapartida do
        // dinheiro que saiu do trânsito do comprador.
        debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
        creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
      },
      tx,
    );
  }
}
