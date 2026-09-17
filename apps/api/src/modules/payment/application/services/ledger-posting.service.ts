import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Cents } from '../../../../shared/money/money';
import {
  LedgerAccount,
  assertBalanced,
  buildBalancedPosting,
} from '../../domain/entities/ledger-entry';
import { LedgerRepository } from '../../domain/repositories/ledger.repository';

export interface PostFactInput {
  sourceEventId: string;
  sourceEventType: string;
  sourceAggregateType: string;
  sourceAggregateId: string;
  paymentId: string;
  amountCents: Cents;
  currency: string;
  debitAccount: LedgerAccount;
  creditAccount: LedgerAccount;
}

/**
 * IP-010 — único ponto de escrita no ledger a partir de consumers de evento.
 *
 * A idempotência "exatamente uma vez" já é garantida DUAS vezes antes de
 * chegar aqui: (1) o `EventConsumer`/`processed_events` do próprio consumer
 * chamador (2) o índice único do ledger em si (defesa 2, mesmo padrão do
 * `FundsRefundRepository.create`). Este serviço só garante a TERCEIRA coisa
 * que falta: que o que é escrito está sempre balanceado (débito == crédito)
 * — nenhum consumer monta um posting manualmente.
 */
@Injectable()
export class LedgerPostingService {
  constructor(private readonly ledgerRepository: LedgerRepository) {}

  async post(input: PostFactInput, tx: DatabaseExecutor): Promise<void> {
    const [debit, credit] = buildBalancedPosting(input);
    assertBalanced([debit, credit]);
    await this.ledgerRepository.postGroup([debit, credit], tx);
  }
}
