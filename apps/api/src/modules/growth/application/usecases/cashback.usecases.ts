import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { LEDGER_ACCOUNTS } from '../../../payment/domain/entities/ledger-entry';
import { LedgerPostingService } from '../../../payment/application/services/ledger-posting.service';
import { CashbackCampaignRepository } from '../../domain/repositories/growth.repository';

export interface AccrueCashbackLiabilityInput {
  paymentId: string;
  amountCents: number;
  currency: string;
  sourceEventId: string;
  sourceEventType: string;
  now?: Date;
}

/**
 * IP-012 — Cashback como PASSIVO CONTÁBIL real, nunca um número solto.
 * "no cash-equivalent liability without ledger treatment" (spec §4): este
 * use case NUNCA cria um passivo sem postar no ledger real do IP-010
 * (`LedgerPostingService` — mesmo ponto único de escrita usado por
 * PACK-01/IP-007/IP-008, nenhum posting manual). Só age se existir uma
 * `CashbackCampaign` ATIVA no momento do fato — sem campanha configurada
 * (padrão do Release 1.0), é NO-OP, nunca inventa um percentual.
 *
 * Desembolso real (transferir o cashback ao Member) depende de IP-009, que
 * está BLOCKED_EXTERNAL — este use case portanto só ACUMULA o passivo
 * (`CASHBACK_LIABILITY` / `CASHBACK_PAYABLE`); baixar `CASHBACK_PAYABLE`
 * quando o desembolso real existir é trabalho de uma IP futura, fora deste
 * escopo (ver IP-012-COMPLETION-REPORT.md §Lacunas).
 */
@Injectable()
export class AccrueCashbackLiabilityUseCase {
  constructor(
    private readonly campaigns: CashbackCampaignRepository,
    private readonly ledgerPosting: LedgerPostingService,
  ) {}

  async execute(
    input: AccrueCashbackLiabilityInput,
    tx: DatabaseExecutor,
  ): Promise<{ accrued: boolean; cashbackCents: number }> {
    const now = input.now ?? new Date();
    const [campaign] = await this.campaigns.findActiveAt(now);
    if (!campaign) {
      return { accrued: false, cashbackCents: 0 };
    }
    const cashbackCents = campaign.computeCashbackCents(input.amountCents);
    if (cashbackCents <= 0) {
      return { accrued: false, cashbackCents: 0 };
    }
    await this.ledgerPosting.post(
      {
        sourceEventId: input.sourceEventId,
        sourceEventType: input.sourceEventType,
        sourceAggregateType: 'CashbackCampaign',
        sourceAggregateId: campaign.id,
        paymentId: input.paymentId,
        amountCents: cashbackCents,
        currency: input.currency,
        debitAccount: LEDGER_ACCOUNTS.CASHBACK_LIABILITY,
        creditAccount: LEDGER_ACCOUNTS.CASHBACK_PAYABLE,
      },
      tx,
    );
    return { accrued: true, cashbackCents };
  }
}
