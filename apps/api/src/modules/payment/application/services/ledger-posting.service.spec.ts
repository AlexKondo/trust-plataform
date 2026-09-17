import { describe, expect, it } from 'vitest';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { LEDGER_ACCOUNTS, LedgerAccount, LedgerEntry } from '../../domain/entities/ledger-entry';
import { LedgerAccountBalance, LedgerRepository } from '../../domain/repositories/ledger.repository';
import { LedgerPostingService } from './ledger-posting.service';

/** Fake em memória — simula a defesa de dedupe do índice único do banco. */
class FakeLedgerRepository extends LedgerRepository {
  entries: LedgerEntry[] = [];

  postGroup(entries: readonly LedgerEntry[]): Promise<number> {
    let inserted = 0;
    for (const entry of entries) {
      const props = entry.toProps();
      const duplicate = this.entries.some((existing) => {
        const existingProps = existing.toProps();
        return (
          existingProps.sourceEventId === props.sourceEventId &&
          existingProps.account === props.account &&
          existingProps.direction === props.direction
        );
      });
      if (!duplicate) {
        this.entries.push(entry);
        inserted += 1;
      }
    }
    return Promise.resolve(inserted);
  }

  listByPayment(paymentId: string): Promise<LedgerEntry[]> {
    return Promise.resolve(this.entries.filter((e) => e.paymentId === paymentId));
  }

  sumByPaymentAndAccount(paymentId: string, account: LedgerAccount): Promise<number> {
    return Promise.resolve(
      this.entries
        .filter((e) => e.paymentId === paymentId && e.account === account)
        .reduce((total, entry) => total + entry.signedAmountCents(), 0),
    );
  }

  totalsByAccount(): Promise<LedgerAccountBalance[]> {
    const map = new Map<string, number>();
    for (const entry of this.entries) {
      map.set(entry.account, (map.get(entry.account) ?? 0) + entry.signedAmountCents());
    }
    return Promise.resolve(
      Array.from(map.entries()).map(([account, balanceCents]) => ({
        account: account as LedgerAccount,
        balanceCents,
      })),
    );
  }
}

const FAKE_TX = {} as DatabaseExecutor;

const BASE_FACT = {
  sourceEventType: 'Payment.Authorized',
  sourceAggregateType: 'Payment',
  sourceAggregateId: '019fe8f0-0000-7000-8000-000000000a01',
  paymentId: '019fe8f0-0000-7000-8000-000000000a01',
  currency: 'BRL',
  amountCents: 15000,
  debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
  creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
};

describe('LedgerPostingService (IP-010)', () => {
  it('posta duas linhas balanceadas para um fato', async () => {
    const repository = new FakeLedgerRepository();
    const service = new LedgerPostingService(repository);

    await service.post({ ...BASE_FACT, sourceEventId: '019fe8f0-0000-7000-8000-000000000e01' }, FAKE_TX);

    expect(repository.entries).toHaveLength(2);
    const sum = repository.entries.reduce((total, e) => total + e.signedAmountCents(), 0);
    expect(sum).toBe(0);
  });

  it('é idempotente por evento de origem: reprocessar o MESMO eventId não duplica linha', async () => {
    const repository = new FakeLedgerRepository();
    const service = new LedgerPostingService(repository);
    const fact = { ...BASE_FACT, sourceEventId: '019fe8f0-0000-7000-8000-000000000e02' };

    await service.post(fact, FAKE_TX);
    await service.post(fact, FAKE_TX); // retry/replay do outbox relay
    await service.post(fact, FAKE_TX);

    expect(repository.entries).toHaveLength(2);
    const balance = await repository.sumByPaymentAndAccount(
      BASE_FACT.paymentId,
      LEDGER_ACCOUNTS.CUSTODY_HELD,
    );
    // Um único débito de 15000 (não 45000 se tivesse duplicado).
    expect(balance).toBe(15000);
  });

  it('eventos DIFERENTES para o mesmo Payment acumulam corretamente (sem interferência do dedupe)', async () => {
    const repository = new FakeLedgerRepository();
    const service = new LedgerPostingService(repository);

    await service.post({ ...BASE_FACT, sourceEventId: '019fe8f0-0000-7000-8000-000000000e03' }, FAKE_TX);
    await service.post(
      {
        ...BASE_FACT,
        sourceEventId: '019fe8f0-0000-7000-8000-000000000e04',
        amountCents: 9000,
        debitAccount: LEDGER_ACCOUNTS.PARTNER_PAYABLE,
        creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      },
      FAKE_TX,
    );

    const custodyBalance = await repository.sumByPaymentAndAccount(
      BASE_FACT.paymentId,
      LEDGER_ACCOUNTS.CUSTODY_HELD,
    );
    // 15000 (débito de posse) - 9000 (crédito de liberação) = 6000 ainda retido.
    expect(custodyBalance).toBe(6000);
  });
});
