import { describe, expect, it, vi } from 'vitest';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { LEDGER_ACCOUNTS } from '../../domain/entities/ledger-entry';
import { LedgerPostingService } from '../../application/services/ledger-posting.service';
import { PostLedgerOnPaymentAuthorizedConsumer } from './post-ledger-on-payment-authorized.consumer';

const PAYMENT_ID = '019fe8f0-0000-7000-8000-000000000a01';
const FAKE_TX = {} as DatabaseExecutor;

function envelope(payload: Record<string, unknown>): ConsumedEvent {
  return {
    eventId: '019fe8f0-0000-7000-8000-0000000000e1',
    eventType: 'Payment.Authorized',
    aggregateType: 'Payment',
    aggregateId: PAYMENT_ID,
    eventVersion: '1.0',
    producer: 'payment-service',
    correlationId: '019fe8f0-0000-7000-8000-0000000000c1',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

describe('PostLedgerOnPaymentAuthorizedConsumer (IP-010)', () => {
  it('posta débito em MEMBER_FUNDING_CLEARING e crédito em CUSTODY_HELD, com o valor convertido de reais para centavos', async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const consumer = new PostLedgerOnPaymentAuthorizedConsumer({ post } as unknown as LedgerPostingService);

    await consumer.handle(
      envelope({ paymentId: PAYMENT_ID, amount: 150.5, currency: 'BRL' }),
      FAKE_TX,
    );

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEventId: '019fe8f0-0000-7000-8000-0000000000e1',
        paymentId: PAYMENT_ID,
        amountCents: 15050,
        currency: 'BRL',
        debitAccount: LEDGER_ACCOUNTS.CUSTODY_HELD,
        creditAccount: LEDGER_ACCOUNTS.MEMBER_FUNDING_CLEARING,
      }),
      FAKE_TX,
    );
  });

  it('é um no-op quando o payload não traz o essencial (nunca posta lançamento incompleto)', async () => {
    const post = vi.fn();
    const consumer = new PostLedgerOnPaymentAuthorizedConsumer({ post } as unknown as LedgerPostingService);

    await consumer.handle(envelope({ paymentId: PAYMENT_ID }), FAKE_TX);

    expect(post).not.toHaveBeenCalled();
  });
});
