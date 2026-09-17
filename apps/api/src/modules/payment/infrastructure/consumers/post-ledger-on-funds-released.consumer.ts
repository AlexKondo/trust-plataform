import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { fromReais } from '../../../../shared/money/money';
import { LEDGER_ACCOUNTS } from '../../domain/entities/ledger-entry';
import { LedgerPostingService } from '../../application/services/ledger-posting.service';

/**
 * IP-010 — a custódia deixa de ser retida pela plataforma e passa a ser
 * devida ao prestador: débito em `CUSTODY_HELD` (reduz o que a Trust ainda
 * segura), crédito em `PARTNER_PAYABLE` (valor pago/a pagar ao Trust Partner).
 *
 * Cobre TANTO a custódia original quanto tranches incrementais (IP-007): as
 * duas publicam `Funds.Released` com o mesmo formato de payload
 * (`paymentId`/`amount`/`currency`), e o ledger não precisa distinguir —
 * cada linha carrega `sourceAggregateId` (o id da custódia OU da tranche)
 * para rastreabilidade, mas a conta é a mesma.
 */
@Injectable()
export class PostLedgerOnFundsReleasedConsumer extends EventConsumer {
  readonly eventType = 'Funds.Released';
  readonly consumerName = 'pay.post-ledger-on-funds-released';

  constructor(private readonly ledgerPosting: LedgerPostingService) {
    super();
  }

  async handle(envelope: ConsumedEvent, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as {
      paymentId?: string;
      trustCustodyId?: string;
      amount?: number;
      currency?: string;
    };
    const paymentId = payload.paymentId;
    const custodyId = envelope.aggregateId ?? payload.trustCustodyId;
    if (!paymentId || !custodyId || payload.amount === undefined || !payload.currency) {
      return;
    }

    await this.ledgerPosting.post(
      {
        sourceEventId: envelope.eventId,
        sourceEventType: envelope.eventType,
        sourceAggregateType: envelope.aggregateType ?? 'TrustCustody',
        sourceAggregateId: custodyId,
        paymentId,
        amountCents: fromReais(payload.amount),
        currency: payload.currency,
        // Mesma convenção de ATIVO de `post-ledger-on-payment-authorized`:
        // débito em PARTNER_PAYABLE (valor agora devido/pago ao parceiro),
        // crédito em CUSTODY_HELD (reduz o que a Trust ainda retém).
        debitAccount: LEDGER_ACCOUNTS.PARTNER_PAYABLE,
        creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      },
      tx,
    );
  }
}
