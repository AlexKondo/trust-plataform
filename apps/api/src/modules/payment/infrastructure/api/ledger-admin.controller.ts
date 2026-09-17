import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { LedgerReconciliationService } from '../../application/services/ledger-reconciliation.service';
import { LedgerRepository } from '../../domain/repositories/ledger.repository';

/**
 * IP-010 — superfície ADMIN-ONLY de leitura do ledger (mesmo padrão de
 * `AdminGuard` de `admin/analytics`/`admin/risk-flags`: a flag `is_admin` é
 * reavaliada a cada requisição, DOC-002).
 *
 * `GET /admin/ledger/balances` prova o critério de aceite "relatórios
 * financeiros derivam do ledger": soma pura das linhas imutáveis, nenhuma
 * outra tabela é lida.
 *
 * `GET /admin/ledger/reconcile/:paymentId` é a superfície de discrepância —
 * o critério de aceite "reconciliação detecta... mismatch" para o que é
 * genuinamente verificável hoje (domínio × ledger; ver
 * `LedgerReconciliationService` para o porquê da reconciliação de PSP ainda
 * não existir).
 */
@Controller('admin/ledger')
@UseGuards(AdminGuard)
export class LedgerAdminController {
  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly reconciliation: LedgerReconciliationService,
  ) {}

  @Get('balances')
  async getBalances() {
    const totals = await this.ledgerRepository.totalsByAccount();
    return {
      accounts: totals.map((entry) => ({
        account: entry.account,
        balanceCents: entry.balanceCents,
      })),
    };
  }

  @Get('reconcile/:paymentId')
  async reconcilePayment(@Param('paymentId') paymentId: string) {
    const result = await this.reconciliation.reconcilePayment(paymentId);
    if (!result) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    return result;
  }
}
