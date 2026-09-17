import { describe, expect, it } from 'vitest';
import { LedgerValidationException } from '../exceptions/payment.exceptions';
import {
  LEDGER_ACCOUNTS,
  LEDGER_DIRECTIONS,
  LedgerEntry,
  assertBalanced,
  buildBalancedPosting,
} from './ledger-entry';

const BASE = {
  sourceEventId: '019fe8f0-0000-7000-8000-000000000e01',
  sourceEventType: 'Payment.Authorized',
  sourceAggregateType: 'Payment',
  sourceAggregateId: '019fe8f0-0000-7000-8000-000000000a01',
  paymentId: '019fe8f0-0000-7000-8000-000000000a01',
  currency: 'BRL',
};

describe('LedgerEntry (IP-010)', () => {
  it('rejeita valor zero ou negativo (nunca ponto flutuante, sempre centavos inteiros)', () => {
    expect(() =>
      LedgerEntry.create({
        ...BASE,
        account: LEDGER_ACCOUNTS.CUSTODY_HELD,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amountCents: 0,
        postingGroupId: '019fe8f0-0000-7000-8000-000000000g01',
      }),
    ).toThrow(LedgerValidationException);

    expect(() =>
      LedgerEntry.create({
        ...BASE,
        account: LEDGER_ACCOUNTS.CUSTODY_HELD,
        direction: LEDGER_DIRECTIONS.DEBIT,
        amountCents: 10.5,
        postingGroupId: '019fe8f0-0000-7000-8000-000000000g01',
      }),
    ).toThrow();
  });

  it('signedAmountCents: débito é positivo, crédito é negativo', () => {
    const debit = LedgerEntry.create({
      ...BASE,
      account: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
      direction: LEDGER_DIRECTIONS.DEBIT,
      amountCents: 1000,
      postingGroupId: '019fe8f0-0000-7000-8000-000000000g01',
    });
    const credit = LedgerEntry.create({
      ...BASE,
      account: LEDGER_ACCOUNTS.CUSTODY_HELD,
      direction: LEDGER_DIRECTIONS.CREDIT,
      amountCents: 1000,
      postingGroupId: '019fe8f0-0000-7000-8000-000000000g01',
    });
    expect(debit.signedAmountCents()).toBe(1000);
    expect(credit.signedAmountCents()).toBe(-1000);
  });

  it('buildBalancedPosting sempre soma zero (partidas dobradas)', () => {
    const [debit, credit] = buildBalancedPosting({
      ...BASE,
      amountCents: 25000,
      debitAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
      creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
    });
    expect(debit.direction).toBe(LEDGER_DIRECTIONS.DEBIT);
    expect(credit.direction).toBe(LEDGER_DIRECTIONS.CREDIT);
    expect(debit.postingGroupId).toBe(credit.postingGroupId);
    expect(() => assertBalanced([debit, credit])).not.toThrow();
    expect(debit.signedAmountCents() + credit.signedAmountCents()).toBe(0);
  });

  it('assertBalanced recusa um grupo desbalanceado (prova o critério de aceite "ledger entries balance")', () => {
    const [debit] = buildBalancedPosting({
      ...BASE,
      amountCents: 500,
      debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      creditAccount: LEDGER_ACCOUNTS.PARTNER_PAYABLE,
    });
    expect(() => assertBalanced([debit])).toThrow(LedgerValidationException);
  });

  it('múltiplos fatos do mesmo Payment continuam somando zero globalmente (custódia + liberação + reembolso parcial)', () => {
    // Convenção de ATIVO (ver comentário dos consumers): débito em
    // CUSTODY_HELD aumenta o que está retido; crédito reduz.
    const hold = buildBalancedPosting({
      ...BASE,
      amountCents: 10000,
      debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
      creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
    });
    const release = buildBalancedPosting({
      ...BASE,
      amountCents: 6000,
      debitAccount: LEDGER_ACCOUNTS.PARTNER_PAYABLE,
      creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
    });
    const refund = buildBalancedPosting({
      ...BASE,
      amountCents: 4000,
      debitAccount: LEDGER_ACCOUNTS.REFUND_ISSUED,
      creditAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
    });
    const all = [...hold, ...release, ...refund];
    const sum = all.reduce((total, entry) => total + entry.signedAmountCents(), 0);
    expect(sum).toBe(0);

    const custodyNet = all
      .filter((e) => e.account === LEDGER_ACCOUNTS.CUSTODY_HELD)
      .reduce((total, entry) => total + entry.signedAmountCents(), 0);
    // 10000 entrou, 6000 liberado, 4000 devolvido → 0 restante em custódia.
    expect(custodyNet).toBe(0);
  });
});
