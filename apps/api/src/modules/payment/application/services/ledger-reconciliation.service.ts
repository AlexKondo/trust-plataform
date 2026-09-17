import { Injectable } from '@nestjs/common';
import { LEDGER_ACCOUNTS } from '../../domain/entities/ledger-entry';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { LedgerRepository } from '../../domain/repositories/ledger.repository';

export type PaymentReconciliationStatus = 'OK' | 'MISMATCH' | 'NO_LEDGER_ACTIVITY';

export interface PaymentReconciliationResult {
  paymentId: string;
  status: PaymentReconciliationStatus;
  /** `amountCents - refundedCents` do domínio `Payment` — o fato de referência. */
  domainRefundableCents: number;
  /** `CUSTODY_HELD` líquido + `PARTNER_PAYABLE` líquido derivados do ledger para este Payment. */
  ledgerOutstandingCents: number;
  ledgerCustodyHeldCents: number;
  ledgerPartnerPayableCents: number;
  ledgerRefundIssuedCents: number;
  discrepancyCents: number;
}

/**
 * IP-010 — reconciliação REAL disponível hoje (ver IP-010-COMPLETION-REPORT
 * §Reconciliação): compara o estado do domínio `Payment` com o que o próprio
 * ledger, somando suas linhas imutáveis, diz sobre o mesmo Payment.
 *
 * A reconciliação "de três pontas" que a spec do IP-010 descreve
 * (domínio × webhook do PSP × ledger) não é implementável nem testável hoje:
 * IP-009 está `BLOCKED_EXTERNAL` — não existe transação real de PSP para
 * comparar, só o `SandboxPaymentGateway`. Ver `PspTransactionReconciler`
 * abaixo: é o ponto de extensão já preparado para quando IP-009 tiver
 * credenciais reais, mas ele não roda contra dado nenhum ainda (nenhum dado
 * sintético é fabricado para "passar" no teste, conforme instrução do IP).
 *
 * Invariante verificada: `refundableCents` do Payment (o que ainda pode ser
 * devolvido) deve corresponder ao que ainda está "no sistema" do ponto de
 * vista do ledger: custódia ainda retida + já liberada ao parceiro. Isto já
 * é líquido de reembolso por construção (todo reembolso credita
 * `CUSTODY_HELD`, nunca `PARTNER_PAYABLE`) — não subtraia `REFUND_ISSUED` de
 * novo (ver Diff Review F1). Uma divergência aqui é dado real de drift, não
 * teórico.
 */
@Injectable()
export class LedgerReconciliationService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly ledgerRepository: LedgerRepository,
  ) {}

  async reconcilePayment(paymentId: string): Promise<PaymentReconciliationResult | null> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      return null;
    }

    const [custodyHeld, partnerPayable, refundIssued] = await Promise.all([
      this.ledgerRepository.sumByPaymentAndAccount(paymentId, LEDGER_ACCOUNTS.CUSTODY_HELD),
      this.ledgerRepository.sumByPaymentAndAccount(paymentId, LEDGER_ACCOUNTS.PARTNER_PAYABLE),
      this.ledgerRepository.sumByPaymentAndAccount(paymentId, LEDGER_ACCOUNTS.REFUND_ISSUED),
    ]);

    const hasLedgerActivity = custodyHeld !== 0 || partnerPayable !== 0 || refundIssued !== 0;
    // Convenção de conta de ATIVO (ver `ledger-entry.ts`/consumers): saldo
    // positivo de CUSTODY_HELD é o que ainda está literalmente retido;
    // PARTNER_PAYABLE positivo é o que já foi liberado ao parceiro.
    //
    // IP-010 Diff Review F1 (corrigido): `custodyHeld + partnerPayable` já é,
    // por CONSTRUÇÃO, líquido de todo reembolso — todo reembolso credita
    // CUSTODY_HELD (nunca PARTNER_PAYABLE, ver consumers), então
    // `custodyHeld + partnerPayable == amountCents - refundIssued` é um
    // invariante algébrico para qualquer sequência de hold/release/refund.
    // Subtrair `refundIssued` de novo aqui contava o reembolso DUAS vezes e
    // gerava MISMATCH falso em praticamente todo Payment reembolsado, mesmo
    // sem nenhuma liberação ao parceiro — bug real, não uma divergência
    // semântica legítima (ver regressão em `ledger-reconciliation.service.spec.ts`
    // e `IP-010-DIFF-REVIEW.md` §4).
    const ledgerOutstandingCents = custodyHeld + partnerPayable;

    const domainRefundableCents = payment.refundableCents;
    const discrepancyCents = domainRefundableCents - ledgerOutstandingCents;

    let status: PaymentReconciliationStatus = 'OK';
    if (!hasLedgerActivity) {
      status = 'NO_LEDGER_ACTIVITY';
    } else if (discrepancyCents !== 0) {
      status = 'MISMATCH';
    }

    return {
      paymentId,
      status,
      domainRefundableCents,
      ledgerOutstandingCents,
      ledgerCustodyHeldCents: custodyHeld,
      ledgerPartnerPayableCents: partnerPayable,
      ledgerRefundIssuedCents: refundIssued,
      discrepancyCents,
    };
  }
}

/**
 * Ponto de extensão para a reconciliação de três pontas (domínio × PSP ×
 * ledger) exigida pela spec. Deliberadamente sem implementação de dado real:
 * IP-009 é `BLOCKED_EXTERNAL` (sem credenciais Asaas reais), então não existe
 * nenhuma fonte de "transação de PSP" verdadeira para comparar — só o
 * `SandboxPaymentGateway` sintético, e usá-lo aqui fabricaria uma prova falsa
 * de reconciliação (proibido pela instrução deste IP). Quando IP-009 sair de
 * `BLOCKED_EXTERNAL`, a implementação real entra aqui, sem mudar o contrato.
 */
export interface PspTransaction {
  providerTransactionId: string;
  paymentId: string;
  amountCents: number;
  type: 'AUTHORIZATION' | 'RELEASE' | 'REFUND';
}

export abstract class PspTransactionReconciler {
  /** Compara transações reais do PSP com o ledger. Sem implementação até IP-009 ter credenciais reais. */
  abstract reconcile(transactions: readonly PspTransaction[]): Promise<
    Array<{ providerTransactionId: string; status: 'MATCHED' | 'MISSING_IN_LEDGER' | 'AMOUNT_MISMATCH' }>
  >;
}
