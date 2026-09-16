import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReaisString } from '../../../../shared/money/money';
import { FundsRefund } from '../../domain/entities/funds-refund';
import { Payment } from '../../domain/entities/payment';
import { PAYMENT_STATUS, PaymentStatus } from '../../domain/entities/payment-types';
import { FundsRefundRepository } from '../../domain/repositories/funds-refund.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentGateway, RefundResult } from '../../domain/services/payment-gateway';
import { RefundPaymentUseCase } from './refund-payment.usecase';

const CORRELATION = '0198c7e0-0000-7000-8000-0000000000cc';
const REQUESTED_BY = '019fe8f0-0000-7000-8000-000000000099';

function custodiedPayment(amountCents = 20000): Payment {
  const payment = Payment.create({
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountCents,
    currency: 'BRL',
  });
  payment.markAuthorized('sandbox');
  payment.markInCustody();
  return payment;
}

function approvedRefund(amountCents: number): RefundResult {
  return {
    outcome: 'APPROVED',
    providerTransactionId: 'sbx_refund_1',
    providerCode: 'refunded',
    message: null,
    refundedAmountCents: amountCents,
    rawResponse: {},
  };
}

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function baseInput(payment: Payment, overrides: Partial<Parameters<RefundPaymentUseCase['execute']>[0]> = {}) {
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    amountCents: 5000,
    currency: payment.currency,
    reason: 'ORDER_CANCELLED_BEFORE_EXECUTION' as const,
    requestedBy: REQUESTED_BY,
    idempotencyKey: 'refund:cancel:order-1',
    providerTransactionId: 'sbx_auth_1',
    correlationId: CORRELATION,
    ...overrides,
  };
}

describe('RefundPaymentUseCase (IP-008 / PAY-006) — mocked repos', () => {
  let payment: Payment;
  let paymentRepository: PaymentRepository;
  let refundRepository: FundsRefundRepository;
  let gateway: PaymentGateway;
  let outbox: OutboxService;
  let audit: AuditLogService;
  let db: Database;
  let useCase: RefundPaymentUseCase;

  beforeEach(() => {
    payment = custodiedPayment();
    paymentRepository = {
      findById: vi.fn().mockResolvedValue(payment),
      applyRefundIfExpected: vi.fn().mockResolvedValue(true),
    } as unknown as PaymentRepository;
    refundRepository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(true),
    } as unknown as FundsRefundRepository;
    gateway = {
      providerId: 'sandbox',
      refund: vi.fn().mockResolvedValue(approvedRefund(5000)),
    } as unknown as PaymentGateway;
    outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-1' }) } as unknown as OutboxService;
    audit = { record: vi.fn(), recordSafe: vi.fn() } as unknown as AuditLogService;
    db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn('tx')),
    } as unknown as Database;

    useCase = new RefundPaymentUseCase(
      paymentRepository,
      refundRepository,
      gateway,
      outbox,
      audit,
      db,
      logger(),
    );
  });

  it('reembolsa parcialmente: chama o gateway, grava via CAS e publica FundsRefund.Completed', async () => {
    const outcome = await useCase.execute(baseInput(payment));

    expect(outcome.result).toBe('COMPLETED');
    expect(gateway.refund).toHaveBeenCalledWith(
      expect.objectContaining({ providerTransactionId: 'sbx_auth_1', amountCents: 5000 }),
    );
    expect(paymentRepository.applyRefundIfExpected).toHaveBeenCalledWith(
      payment.id,
      0,
      5000,
      PAYMENT_STATUS.PARTIALLY_REFUNDED,
      expect.any(Date),
      'tx',
    );
    const eventTypes = vi
      .mocked(outbox.enqueue)
      .mock.calls.map((call) => (call[1] as { eventType: string }).eventType);
    expect(eventTypes).toEqual(['FundsRefund.Completed']);
  });

  it('reembolso integral move o Payment para REFUNDED', async () => {
    const outcome = await useCase.execute(baseInput(payment, { amountCents: 20000 }));
    expect(outcome.result).toBe('COMPLETED');
    expect(paymentRepository.applyRefundIfExpected).toHaveBeenCalledWith(
      payment.id,
      0,
      20000,
      PAYMENT_STATUS.REFUNDED,
      expect.any(Date),
      'tx',
    );
  });

  it('reentrega da MESMA chave de idempotência não chama o gateway de novo', async () => {
    const existing = FundsRefund.request({
      paymentId: payment.id,
      orderId: payment.orderId,
      amountCents: 5000,
      currency: 'BRL',
      reason: 'ORDER_CANCELLED_BEFORE_EXECUTION',
      requestedBy: REQUESTED_BY,
      providerId: 'sandbox',
      idempotencyKey: 'refund:cancel:order-1',
    });
    vi.mocked(refundRepository.findByIdempotencyKey).mockResolvedValue(existing);

    const outcome = await useCase.execute(baseInput(payment));

    expect(outcome).toEqual({ result: 'ALREADY_PROCESSED', refundId: existing.id });
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('Payment não elegível (ex.: CREATED) nunca chama o gateway', async () => {
    const fresh = Payment.create({
      orderId: 'order-2',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amountCents: 10000,
      currency: 'BRL',
    });
    vi.mocked(paymentRepository.findById).mockResolvedValue(fresh);

    const outcome = await useCase.execute(baseInput(fresh));

    expect(outcome.result).toBe('NOT_ELIGIBLE');
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('valor acima do saldo reembolsável nunca chama o gateway (defesa 2, barata)', async () => {
    const outcome = await useCase.execute(baseInput(payment, { amountCents: 999999 }));

    expect(outcome).toEqual({ result: 'LIMIT_EXCEEDED' });
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('gateway recusa/erra: reembolso persistido como FAILED, Payment NUNCA mutado', async () => {
    vi.mocked(gateway.refund).mockResolvedValue({
      outcome: 'ERROR',
      providerTransactionId: null,
      providerCode: 'provider_unavailable',
      message: 'boom',
      refundedAmountCents: 0,
      rawResponse: {},
    });

    const outcome = await useCase.execute(baseInput(payment));

    expect(outcome.result).toBe('GATEWAY_FAILED');
    expect(paymentRepository.applyRefundIfExpected).not.toHaveBeenCalled();
    const savedRefund = vi.mocked(refundRepository.create).mock.calls[0]![0];
    expect(savedRefund.status).toBe('FAILED');
  });

  it('corrida na fase 2: CAS perde uma vez, relê e tenta de novo com sucesso', async () => {
    vi.mocked(paymentRepository.applyRefundIfExpected)
      .mockResolvedValueOnce(false) // 1ª tentativa perde a corrida
      .mockResolvedValueOnce(true); // 2ª tentativa, após reler, ganha

    const outcome = await useCase.execute(baseInput(payment));

    expect(outcome.result).toBe('COMPLETED');
    expect(paymentRepository.applyRefundIfExpected).toHaveBeenCalledTimes(2);
    expect(paymentRepository.findById).toHaveBeenCalledTimes(3); // defesa 2 + 2 tentativas da fase 2
  });

  it('CAS esgota as tentativas: devolve LEDGER_INCONSISTENT em vez de fingir sucesso (gateway já aprovou, livro não reflete)', async () => {
    vi.mocked(paymentRepository.applyRefundIfExpected).mockResolvedValue(false);

    const outcome = await useCase.execute(baseInput(payment));

    expect(outcome.result).toBe('LEDGER_INCONSISTENT');
    expect(typeof (outcome as { refundId: string }).refundId).toBe('string');
    // Nunca commitou um FundsRefund COMPLETED sem o Payment refletir o valor.
    expect(paymentRepository.applyRefundIfExpected).toHaveBeenCalledTimes(3); // MAX_CAS_ATTEMPTS
  });
});

/**
 * IP-008 — teste de corrida GENUÍNO (não apenas mock de retorno): duas
 * chamadas concorrentes de `RefundPaymentUseCase.execute` para o MESMO
 * Payment, com valores que cabem individualmente mas NÃO cabem somados,
 * contra um fake de repositório que reproduz a semântica real de CAS
 * (`UPDATE ... WHERE refunded_amount = expected`). Prova a invariante "nunca
 * excede o valor custodiado" sob concorrência de verdade, não por inspeção —
 * o mesmo padrão que o Completion Report do IP-007 usou para a liberação.
 */
describe('RefundPaymentUseCase — corrida real (IP-008)', () => {
  it('duas chamadas concorrentes que juntas excederiam o saldo: exatamente uma COMPLETED, a soma nunca excede o valor pago', async () => {
    const payment = custodiedPayment(10000); // total pago: R$ 100,00

    // Fake em memória com semântica de CAS real (compare-and-set na coluna).
    let stored: { refundedAmountStr: string; status: PaymentStatus } = {
      refundedAmountStr: toReaisString(0),
      status: PAYMENT_STATUS.FUNDS_IN_CUSTODY,
    };
    const paymentRepository: PaymentRepository = {
      findById: vi.fn().mockImplementation(() => {
        const restored = Payment.restore({
          ...payment.toProps(),
          refundedCents: Number((Number(stored.refundedAmountStr) * 100).toFixed(0)),
          status: stored.status,
        });
        return Promise.resolve(restored);
      }),
      applyRefundIfExpected: vi
        .fn()
        .mockImplementation(
          (
            _id: string,
            expectedRefundedCents: number,
            newRefundedCents: number,
            newStatus: PaymentStatus,
          ) => {
            if (stored.refundedAmountStr !== toReaisString(expectedRefundedCents)) {
              return Promise.resolve(false); // CAS perdeu: outra escrita já mudou o valor
            }
            stored = { refundedAmountStr: toReaisString(newRefundedCents), status: newStatus };
            return Promise.resolve(true);
          },
        ),
    } as unknown as PaymentRepository;

    const idempotencyKeys = new Map<string, FundsRefund>();
    const refundRepository: FundsRefundRepository = {
      findByIdempotencyKey: vi.fn().mockImplementation((key: string) => Promise.resolve(idempotencyKeys.get(key) ?? null)),
      create: vi.fn().mockImplementation((refund: FundsRefund) => {
        if (idempotencyKeys.has(refund.idempotencyKey)) {
          return Promise.resolve(false);
        }
        idempotencyKeys.set(refund.idempotencyKey, refund);
        return Promise.resolve(true);
      }),
    } as unknown as FundsRefundRepository;

    const gateway: PaymentGateway = {
      providerId: 'sandbox',
      refund: vi.fn().mockImplementation((req: { amountCents: number }) => Promise.resolve(approvedRefund(req.amountCents))),
    } as unknown as PaymentGateway;
    const outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt' }) } as unknown as OutboxService;
    const audit = { record: vi.fn(), recordSafe: vi.fn() } as unknown as AuditLogService;
    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn('tx')),
    } as unknown as Database;

    const useCaseA = new RefundPaymentUseCase(paymentRepository, refundRepository, gateway, outbox, audit, db, logger());
    const useCaseB = new RefundPaymentUseCase(paymentRepository, refundRepository, gateway, outbox, audit, db, logger());

    // R$ 60 + R$ 60 = R$ 120 > R$ 100 pagos — juntas excedem; sozinhas cabem.
    const [outcomeA, outcomeB] = await Promise.all([
      useCaseA.execute(baseInput(payment, { amountCents: 6000, idempotencyKey: 'refund:cancel:order-1' })),
      useCaseB.execute(baseInput(payment, { amountCents: 6000, idempotencyKey: 'refund:dispute:decision-1' })),
    ]);

    const results = [outcomeA.result, outcomeB.result].sort();
    // A soma nunca pode ultrapassar o valor pago: OU uma delas nunca é
    // COMPLETED (LEDGER_INCONSISTENT/LIMIT_EXCEEDED), OU as duas são
    // COMPLETED mas isso só seria seguro se coubessem juntas — o que NÃO é o
    // caso aqui (6000 + 6000 > 10000). A asserção central é: no máximo uma
    // completou.
    const completedCount = results.filter((r) => r === 'COMPLETED').length;
    expect(completedCount).toBe(1);
    expect(Number(stored.refundedAmountStr)).toBeLessThanOrEqual(100); // nunca > R$ 100,00 pagos
  });
});
