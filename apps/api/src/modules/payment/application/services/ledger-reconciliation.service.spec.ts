import { describe, expect, it } from 'vitest';
import { Cents } from '../../../../shared/money/money';
import { LEDGER_ACCOUNTS, LedgerAccount } from '../../domain/entities/ledger-entry';
import { Payment } from '../../domain/entities/payment';
import { PaymentStatus } from '../../domain/entities/payment-types';
import { LedgerAccountBalance, LedgerRepository } from '../../domain/repositories/ledger.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { LedgerReconciliationService } from './ledger-reconciliation.service';

class FakePaymentRepository extends PaymentRepository {
  constructor(private readonly payment: Payment | null) {
    super();
  }
  create(): Promise<boolean> {
    return Promise.resolve(true);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  findById(): Promise<Payment | null> {
    return Promise.resolve(this.payment);
  }
  findByOrderId(): Promise<Payment | null> {
    return Promise.resolve(this.payment);
  }
  listForParticipant(): Promise<{ items: Payment[]; totalItems: number }> {
    return Promise.resolve({ items: [], totalItems: 0 });
  }
  applyRefundIfExpected(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class FakeLedgerRepository extends LedgerRepository {
  constructor(private readonly balances: Partial<Record<LedgerAccount, number>>) {
    super();
  }
  postGroup(): Promise<number> {
    return Promise.resolve(0);
  }
  listByPayment(): Promise<[]> {
    return Promise.resolve([]);
  }
  sumByPaymentAndAccount(_paymentId: string, account: LedgerAccount): Promise<number> {
    return Promise.resolve(this.balances[account] ?? 0);
  }
  totalsByAccount(): Promise<LedgerAccountBalance[]> {
    return Promise.resolve(
      Object.entries(this.balances).map(([account, balanceCents]) => ({
        account: account as LedgerAccount,
        balanceCents: balanceCents ?? 0,
      })),
    );
  }
}

function payment(amountCents: Cents, refundedCents: Cents, status: PaymentStatus): Payment {
  return Payment.restore({
    id: '019fe8f0-0000-7000-8000-000000000a01',
    orderId: '019fe8f0-0000-7000-8000-000000000b01',
    buyerId: '019fe8f0-0000-7000-8000-000000000c01',
    sellerId: '019fe8f0-0000-7000-8000-000000000c02',
    amountCents,
    currency: 'BRL',
    status,
    paymentMethodId: null,
    paymentProviderId: 'sandbox',
    refundedCents,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('LedgerReconciliationService (IP-010)', () => {
  it('OK quando o outstanding do ledger bate com o refundableCents do domínio', async () => {
    const domainPayment = payment(10000, 0, 'FUNDS_IN_CUSTODY');
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(domainPayment),
      new FakeLedgerRepository({ [LEDGER_ACCOUNTS.CUSTODY_HELD]: 10000 }),
    );

    const result = await service.reconcilePayment(domainPayment.id);
    expect(result?.status).toBe('OK');
    expect(result?.discrepancyCents).toBe(0);
  });

  it('OK após liberação parcial ao parceiro + reembolso parcial coerentes com o domínio (Diff Review F1)', async () => {
    // Pagamento de 10000: 6000 liberado ao parceiro, 2000 devolvido → domínio
    // registra refundedCents=2000, refundableCents=8000. Ledger (convenção de
    // ATIVO): CUSTODY_HELD = 10000 - 6000 - 2000 = 2000; PARTNER_PAYABLE = 6000;
    // REFUND_ISSUED = 2000. `custodyHeld + partnerPayable` já é líquido de
    // reembolso por construção (todo reembolso credita CUSTODY_HELD, nunca
    // PARTNER_PAYABLE): 2000 + 6000 = 8000 = domainRefundableCents. Bate.
    const domainPayment = payment(10000, 2000, 'PARTIALLY_REFUNDED');
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(domainPayment),
      new FakeLedgerRepository({
        [LEDGER_ACCOUNTS.CUSTODY_HELD]: 2000,
        [LEDGER_ACCOUNTS.PARTNER_PAYABLE]: 6000,
        [LEDGER_ACCOUNTS.REFUND_ISSUED]: 2000,
      }),
    );
    const result = await service.reconcilePayment(domainPayment.id);
    expect(result?.ledgerOutstandingCents).toBe(8000);
    expect(result?.domainRefundableCents).toBe(8000);
    expect(result?.discrepancyCents).toBe(0);
    expect(result?.status).toBe('OK');
  });

  it('OK após reembolso parcial SEM nenhuma liberação ao parceiro (regressão do bug F1 do Diff Review)', async () => {
    // Este é exatamente o cenário que o formula antigo (`custodyHeld +
    // partnerPayable - refundIssued`) quebrava: hold 10000, refund 2000, ZERO
    // liberação. custodyHeld=8000 (10000 debitado no hold, 2000 creditado no
    // reembolso), partnerPayable=0, refundIssued=2000.
    // Formula antiga: 8000 + 0 - 2000 = 6000 != domainRefundableCents (8000)
    //   → MISMATCH falso, mesmo sem nenhuma liberação envolvida.
    // Formula corrigida: 8000 + 0 = 8000 == domainRefundableCents (8000) → OK.
    const domainPayment = payment(10000, 2000, 'PARTIALLY_REFUNDED');
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(domainPayment),
      new FakeLedgerRepository({
        [LEDGER_ACCOUNTS.CUSTODY_HELD]: 8000,
        [LEDGER_ACCOUNTS.REFUND_ISSUED]: 2000,
      }),
    );
    const result = await service.reconcilePayment(domainPayment.id);
    expect(result?.ledgerOutstandingCents).toBe(8000);
    expect(result?.domainRefundableCents).toBe(8000);
    expect(result?.discrepancyCents).toBe(0);
    expect(result?.status).toBe('OK');
  });

  it('MISMATCH quando o ledger diverge do refundableCents do domínio (drift)', async () => {
    const domainPayment = payment(10000, 0, 'FUNDS_IN_CUSTODY');
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(domainPayment),
      // Ledger diz que só 7000 está em custódia — 3000 de drift silencioso.
      new FakeLedgerRepository({ [LEDGER_ACCOUNTS.CUSTODY_HELD]: 7000 }),
    );
    const result = await service.reconcilePayment(domainPayment.id);
    expect(result?.status).toBe('MISMATCH');
    expect(result?.discrepancyCents).toBe(3000);
  });

  it('NO_LEDGER_ACTIVITY quando o Payment existe mas nada foi postado ainda', async () => {
    const domainPayment = payment(10000, 0, 'AUTHORIZED');
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(domainPayment),
      new FakeLedgerRepository({}),
    );
    const result = await service.reconcilePayment(domainPayment.id);
    expect(result?.status).toBe('NO_LEDGER_ACTIVITY');
  });

  it('devolve null quando o Payment não existe', async () => {
    const service = new LedgerReconciliationService(
      new FakePaymentRepository(null),
      new FakeLedgerRepository({}),
    );
    const result = await service.reconcilePayment('019fe8f0-0000-7000-8000-000000000aff');
    expect(result).toBeNull();
  });
});
