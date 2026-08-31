/**
 * Testes unitários do PACK-01 §20.1 — custódia e liberação.
 *
 * O que estes testes protegem é uma frase só: **a plataforma nunca pode dar o
 * dinheiro como liberado sem o provedor ter confirmado.** Quase todo caso aqui
 * é uma variação disso.
 */
import { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { Payment } from '../../domain/entities/payment';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { CUSTODY_STATUS, TrustCustody } from '../../domain/entities/trust-custody';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { OrderDisputeQuery } from '../../domain/services/order-dispute.query';
import { PaymentGateway, ReleaseResult } from '../../domain/services/payment-gateway';
import {
  RELEASE_DENIAL_REASON,
  evaluateRelease,
} from '../../domain/services/trust-release-policy.service';
import { HoldFundsUseCase } from './hold-funds.usecase';
import { ReleaseFundsUseCase, releaseIdempotencyKey } from './release-funds.usecase';

const CORRELATION = '0198c7e0-0000-7000-8000-0000000000aa';
const TX = Symbol('tx') as never;

const logger = () =>
  ({ setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as PinoLogger;

function authorizedPayment(amountCents = 180000): Payment {
  const payment = Payment.create({
    orderId: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountCents,
    currency: 'BRL',
  });
  payment.markAuthorized('sandbox');
  return payment;
}

function custodyFor(payment: Payment): TrustCustody {
  return TrustCustody.create({
    paymentId: payment.id,
    orderId: payment.orderId,
    buyerId: payment.buyerId,
    sellerId: payment.sellerId,
    amountCents: payment.amountCents,
    currency: payment.currency,
  });
}

function approvedRelease(amountCents: number): ReleaseResult {
  return {
    outcome: 'APPROVED',
    providerTransactionId: 'sbx_release_1',
    providerCode: 'released',
    message: null,
    releasedAmountCents: amountCents,
    releasedAt: new Date(),
    rawResponse: {},
  };
}

describe('HoldFundsUseCase (PAY-003)', () => {
  let paymentRepository: PaymentRepository;
  let custodyRepository: TrustCustodyRepository;
  let outbox: OutboxService;
  let audit: AuditLogService;
  let useCase: HoldFundsUseCase;

  beforeEach(() => {
    paymentRepository = { findById: vi.fn(), save: vi.fn() } as unknown as PaymentRepository;
    custodyRepository = {
      findByPaymentId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(true),
    } as unknown as TrustCustodyRepository;
    outbox = {
      enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-created' }),
    } as unknown as OutboxService;
    audit = { record: vi.fn() } as unknown as AuditLogService;
    useCase = new HoldFundsUseCase(paymentRepository, custodyRepository, outbox, audit, logger());
  });

  it('cria a custódia e move o Payment para FUNDS_IN_CUSTODY', async () => {
    const payment = authorizedPayment();
    vi.mocked(paymentRepository.findById).mockResolvedValue(payment);

    const outcome = await useCase.execute({ paymentId: payment.id, correlationId: CORRELATION }, TX);

    expect(outcome.result).toBe('HELD');
    expect(payment.status).toBe(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    expect(paymentRepository.save).toHaveBeenCalledTimes(1);

    // §20.1: o snapshot da custódia é cópia fiel do Payment
    const custody = vi.mocked(custodyRepository.create).mock.calls[0]![0];
    expect(custody.paymentId).toBe(payment.id);
    expect(custody.orderId).toBe(payment.orderId);
    expect(custody.buyerId).toBe(payment.buyerId);
    expect(custody.sellerId).toBe(payment.sellerId);
    expect(custody.amountCents).toBe(payment.amountCents);
    expect(custody.currency).toBe(payment.currency);
    expect(custody.status).toBe(CUSTODY_STATUS.IN_CUSTODY);
  });

  it('publica TrustCustody.Created e Funds.Held com o agregado correto', async () => {
    const payment = authorizedPayment();
    vi.mocked(paymentRepository.findById).mockResolvedValue(payment);

    await useCase.execute({ paymentId: payment.id, correlationId: CORRELATION }, TX);

    const custody = vi.mocked(custodyRepository.create).mock.calls[0]![0];
    const events = vi
      .mocked(outbox.enqueue)
      .mock.calls.map(
        (call) => call[1] as { eventType: string; aggregateType: string; aggregateId: string },
      );

    // São dois FATOS distintos (§8.3), ambos do agregado TrustCustody.
    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'TrustCustody.Created',
        aggregateType: 'TrustCustody',
        aggregateId: custody.id,
      }),
      expect.objectContaining({
        eventType: 'Funds.Held',
        aggregateType: 'TrustCustody',
        aggregateId: custody.id,
      }),
    ]);
  });

  it('só cria custódia a partir de pagamento AUTORIZADO', async () => {
    const payment = Payment.create({
      orderId: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amountCents: 1000,
      currency: 'BRL',
    });
    vi.mocked(paymentRepository.findById).mockResolvedValue(payment);

    const outcome = await useCase.execute({ paymentId: payment.id, correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'PAYMENT_NOT_AUTHORIZED' });
    expect(custodyRepository.create).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('reentrega de Payment.Authorized NÃO cria segunda custódia', async () => {
    const payment = authorizedPayment();
    const existing = custodyFor(payment);
    vi.mocked(paymentRepository.findById).mockResolvedValue(payment);
    vi.mocked(custodyRepository.findByPaymentId).mockResolvedValue(existing);

    const outcome = await useCase.execute({ paymentId: payment.id, correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'ALREADY_HELD', custodyId: existing.id });
    expect(custodyRepository.create).not.toHaveBeenCalled();
    // e não reaplica a transição financeira
    expect(paymentRepository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('pagamento inexistente não gera custódia órfã', async () => {
    vi.mocked(paymentRepository.findById).mockResolvedValue(null);

    const outcome = await useCase.execute({ paymentId: 'sumiu', correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'SKIPPED', reason: 'PAYMENT_NOT_FOUND' });
    expect(custodyRepository.create).not.toHaveBeenCalled();
  });
});

describe('TrustReleasePolicyService (PACK-01 §10)', () => {
  function scenario(overrides: Partial<Parameters<typeof evaluateRelease>[0]> = {}) {
    const payment = authorizedPayment();
    payment.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    const custody = custodyFor(payment);
    return {
      custody,
      payment,
      confirmedOrderId: custody.orderId,
      customerConfirmed: true,
      hasActiveDispute: false,
      ...overrides,
    };
  }

  it('ALLOW quando o cliente confirmou e não há disputa', () => {
    expect(evaluateRelease(scenario())).toEqual({ allowed: true, reasons: [] });
  });

  it('DENY quando existe disputa ativa', () => {
    const decision = evaluateRelease(scenario({ hasActiveDispute: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.DISPUTE_OPEN);
  });

  it('DENY quando o pedido do evento não é o da custódia', () => {
    const decision = evaluateRelease(scenario({ confirmedOrderId: 'outro-pedido' }));
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.ORDER_MISMATCH);
  });

  it('DENY quando a custódia ou o pagamento estão no estado errado', () => {
    const base = scenario();
    base.custody.markReadyForRelease();
    const decision = evaluateRelease(base);
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.CUSTODY_NOT_IN_CUSTODY);

    const stillAuthorized = scenario();
    const decision2 = evaluateRelease({
      ...stillAuthorized,
      payment: authorizedPayment(),
    });
    expect(decision2.reasons).toContain(RELEASE_DENIAL_REASON.PAYMENT_NOT_IN_CUSTODY);
  });

  it('DENY quando o snapshot financeiro divergiu — não "corrige" o valor', () => {
    const base = scenario();
    const outroValor = authorizedPayment(999999);
    outroValor.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    const decision = evaluateRelease({ ...base, payment: outroValor });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain(RELEASE_DENIAL_REASON.SNAPSHOT_MISMATCH);
  });

  it('acumula TODOS os motivos, não só o primeiro', () => {
    const base = scenario({ hasActiveDispute: true, confirmedOrderId: 'errado' });
    const decision = evaluateRelease(base);
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        RELEASE_DENIAL_REASON.ORDER_MISMATCH,
        RELEASE_DENIAL_REASON.DISPUTE_OPEN,
      ]),
    );
  });
});

describe('ReleaseFundsUseCase (PAY-004)', () => {
  let paymentRepository: PaymentRepository;
  let custodyRepository: TrustCustodyRepository;
  let disputeQuery: OrderDisputeQuery;
  let gateway: PaymentGateway;
  let outbox: OutboxService;
  let audit: AuditLogService;
  let db: Database;
  let useCase: ReleaseFundsUseCase;
  let payment: Payment;
  let custody: TrustCustody;

  beforeEach(() => {
    payment = authorizedPayment();
    payment.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    custody = custodyFor(payment);

    paymentRepository = {
      findById: vi.fn().mockResolvedValue(payment),
      findByOrderId: vi.fn().mockResolvedValue(payment),
      save: vi.fn(),
    } as unknown as PaymentRepository;
    custodyRepository = {
      findByOrderId: vi.fn().mockResolvedValue(custody),
      findById: vi.fn().mockResolvedValue(custody),
      save: vi.fn(),
    } as unknown as TrustCustodyRepository;
    disputeQuery = { hasActiveDispute: vi.fn().mockResolvedValue(false) };
    gateway = {
      release: vi.fn().mockResolvedValue(approvedRelease(payment.amountCents)),
    } as unknown as PaymentGateway;
    outbox = { enqueue: vi.fn().mockResolvedValue({ eventId: 'evt-ready' }) } as unknown as OutboxService;
    audit = { record: vi.fn() } as unknown as AuditLogService;
    // A transação da fase 2 é da própria use case — executa o callback direto.
    db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(TX)),
    } as unknown as Database;

    useCase = new ReleaseFundsUseCase(
      paymentRepository,
      custodyRepository,
      disputeQuery,
      gateway,
      outbox,
      audit,
      db,
      logger(),
    );
  });

  it('fase 1 persiste READY_FOR_RELEASE ANTES de qualquer chamada ao gateway', async () => {
    const outcome = await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'READY', custodyId: custody.id });
    expect(custody.status).toBe(CUSTODY_STATUS.READY_FOR_RELEASE);
    expect(custodyRepository.save).toHaveBeenCalledTimes(1);
    // o gateway NÃO é tocado na fase 1
    expect(gateway.release).not.toHaveBeenCalled();
    expect(vi.mocked(outbox.enqueue).mock.calls[0]![1]).toMatchObject({
      eventType: 'Funds.ReadyForRelease',
      aggregateType: 'TrustCustody',
      aggregateId: custody.id,
    });
  });

  it('disputa aberta nega a liberação sem tocar em nada', async () => {
    vi.mocked(disputeQuery.hasActiveDispute).mockResolvedValue(true);

    const outcome = await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);

    expect(outcome).toMatchObject({ result: 'DENIED' });
    expect(custody.status).toBe(CUSTODY_STATUS.IN_CUSTODY);
    expect(payment.status).toBe(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    expect(custodyRepository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(gateway.release).not.toHaveBeenCalled();
    // o motivo fica auditado
    expect(vi.mocked(audit.record).mock.calls[0]![0]).toMatchObject({
      operation: 'ReleaseDenied',
      result: 'FAILURE',
    });
  });

  it('confirmação sem custódia não cria custódia nem libera nada', async () => {
    vi.mocked(custodyRepository.findByOrderId).mockResolvedValue(null);

    const outcome = await useCase.prepare({ orderId: 'order-x', correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'NO_CUSTODY' });
    expect(gateway.release).not.toHaveBeenCalled();
  });

  it('fase 2: gateway confirma → RELEASED + FUNDS_RELEASED + Funds.Released uma vez', async () => {
    custody.markReadyForRelease();

    const outcome = await useCase.finalize(custody.id, CORRELATION);

    expect(outcome).toEqual({ result: 'RELEASED', custodyId: custody.id });
    expect(custody.status).toBe(CUSTODY_STATUS.RELEASED);
    expect(custody.releasedAt).toBeInstanceOf(Date);
    expect(payment.status).toBe(PAYMENT_STATUS.FUNDS_RELEASED);

    const released = vi
      .mocked(outbox.enqueue)
      .mock.calls.filter((call) => (call[1] as { eventType: string }).eventType === 'Funds.Released');
    expect(released).toHaveLength(1);
    expect(released[0]![1]).toMatchObject({
      aggregateType: 'TrustCustody',
      aggregateId: custody.id,
    });
  });

  it('fase 2: falha do gateway NÃO libera — custódia fica retentável', async () => {
    custody.markReadyForRelease();
    vi.mocked(gateway.release).mockResolvedValue({
      ...approvedRelease(0),
      outcome: 'ERROR',
      providerTransactionId: null,
      providerCode: 'provider_unavailable',
      releasedAt: null,
    });

    const outcome = await useCase.finalize(custody.id, CORRELATION);

    expect(outcome).toMatchObject({ result: 'GATEWAY_FAILED' });
    // §11.3: não existe RELEASE_FAILED — o estado continua retentável
    expect(custody.status).toBe(CUSTODY_STATUS.READY_FOR_RELEASE);
    expect(custody.releasedAt).toBeNull();
    expect(payment.status).toBe(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(custodyRepository.save).not.toHaveBeenCalled();
  });

  it('retry usa a MESMA chave de idempotência', async () => {
    custody.markReadyForRelease();
    vi.mocked(gateway.release).mockResolvedValue({
      ...approvedRelease(0),
      outcome: 'ERROR',
      releasedAt: null,
    });

    await useCase.finalize(custody.id, CORRELATION);
    await useCase.finalize(custody.id, CORRELATION);

    const keys = vi
      .mocked(gateway.release)
      .mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([
      releaseIdempotencyKey(custody.id),
      releaseIdempotencyKey(custody.id),
    ]);
    expect(keys[0]).toBe(`release:${custody.id}`);
  });

  it('custódia já liberada é no-op — nem gateway, nem evento duplicado', async () => {
    custody.markReadyForRelease();
    custody.markReleased();

    const outcome = await useCase.finalize(custody.id, CORRELATION);

    expect(outcome).toEqual({ result: 'ALREADY_RELEASED', custodyId: custody.id });
    expect(gateway.release).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('CustomerConfirmed duplicado não reexecuta a política nem duplica liberação', async () => {
    await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);
    vi.mocked(custodyRepository.save).mockClear();
    vi.mocked(outbox.enqueue).mockClear();

    const second = await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);

    expect(second).toEqual({ result: 'ALREADY_READY', custodyId: custody.id });
    expect(custodyRepository.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});

/**
 * Desvio D2 do PACK-01 (§18): o Pack manda tratar "confirmou mas não há
 * custódia" como erro de consistência. No produto atual, porém, confirmar um
 * pedido que ninguém pagou pela plataforma é ROTINA — logar tudo como erro
 * afogaria a inconsistência de verdade no ruído.
 */
describe('ReleaseFundsUseCase — confirmação sem custódia (desvio D2)', () => {
  function build(paymentForOrder: Payment | null) {
    const log = {
      setContext: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as PinoLogger;
    const useCase = new ReleaseFundsUseCase(
      {
        findById: vi.fn(),
        findByOrderId: vi.fn().mockResolvedValue(paymentForOrder),
        save: vi.fn(),
      } as unknown as PaymentRepository,
      { findByOrderId: vi.fn().mockResolvedValue(null) } as unknown as TrustCustodyRepository,
      { hasActiveDispute: vi.fn() },
      { release: vi.fn() } as unknown as PaymentGateway,
      { enqueue: vi.fn() } as unknown as OutboxService,
      { record: vi.fn() } as unknown as AuditLogService,
      { transaction: vi.fn() } as unknown as Database,
      log,
    );
    return { useCase, log };
  }

  it('pedido sem pagamento nenhum é WARN, não erro', async () => {
    const { useCase, log } = build(null);

    const outcome = await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);

    expect(outcome).toEqual({ result: 'NO_CUSTODY' });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('Payment diz FUNDS_IN_CUSTODY sem custódia: ISSO é erro de consistência', async () => {
    const payment = authorizedPayment();
    payment.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    const { useCase, log } = build(payment);

    await useCase.prepare({ orderId: 'order-1', correlationId: CORRELATION }, TX);

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });
});
