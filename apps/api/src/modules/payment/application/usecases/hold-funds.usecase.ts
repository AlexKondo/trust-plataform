import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReais } from '../../../../shared/money/money';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { TrustCustody } from '../../domain/entities/trust-custody';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';

export interface HoldFundsInput {
  paymentId: string;
  correlationId: string;
  /** eventId de `Payment.Authorized` — encadeia a causalidade. */
  causationId?: string;
}

export type HoldFundsOutcome =
  | { result: 'HELD'; custodyId: string }
  | { result: 'ALREADY_HELD'; custodyId: string }
  | { result: 'SKIPPED'; reason: 'PAYMENT_NOT_FOUND' | 'PAYMENT_NOT_AUTHORIZED' };

/**
 * PAY-003 — o dinheiro entra em custódia (PACK-01 §8).
 *
 * É aqui que a plataforma passa a **segurar** o dinheiro do cliente: o Payment
 * já foi autorizado, mas o prestador ainda não recebeu nada e só receberá
 * quando o serviço for confirmado como concluído.
 *
 * Tudo acontece na MESMA transação — custódia + estado do Payment + eventos +
 * auditoria (§17). Se qualquer parte falhar, nada aconteceu e o pg-boss retenta.
 */
@Injectable()
export class HoldFundsUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly custodyRepository: TrustCustodyRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HoldFundsUseCase.name);
  }

  async execute(input: HoldFundsInput, tx: DatabaseExecutor): Promise<HoldFundsOutcome> {
    const payment = await this.paymentRepository.findById(input.paymentId, tx);
    if (!payment) {
      // Consistência: o evento existe mas o pagamento não. Não criamos custódia
      // órfã — registra e sai (§18).
      this.logger.error(
        {
          operation: 'HoldFunds',
          paymentId: input.paymentId,
          correlationId: input.correlationId,
          result: 'FAILURE',
          reason: 'PAYMENT_NOT_FOUND',
        },
        'Payment.Authorized received for unknown payment; no custody created.',
      );
      return { result: 'SKIPPED', reason: 'PAYMENT_NOT_FOUND' };
    }

    // Idempotência de negócio: reentrega do evento não cria segunda custódia
    // nem reaplica a transição financeira (§8.1).
    const existing = await this.custodyRepository.findByPaymentId(payment.id, tx);
    if (existing) {
      return { result: 'ALREADY_HELD', custodyId: existing.id };
    }

    // A custódia só nasce de um pagamento AUTORIZADO (§6.2).
    if (payment.status !== PAYMENT_STATUS.AUTHORIZED) {
      this.logger.warn(
        {
          operation: 'HoldFunds',
          paymentId: payment.id,
          status: payment.status,
          correlationId: input.correlationId,
          result: 'FAILURE',
          reason: 'PAYMENT_NOT_AUTHORIZED',
        },
        'Payment is not AUTHORIZED; custody not created.',
      );
      return { result: 'SKIPPED', reason: 'PAYMENT_NOT_AUTHORIZED' };
    }

    const custody = TrustCustody.create({
      paymentId: payment.id,
      orderId: payment.orderId,
      buyerId: payment.buyerId,
      sellerId: payment.sellerId,
      amountCents: payment.amountCents,
      currency: payment.currency,
    });

    // O índice único em payment_id é a garantia final contra corrida.
    const created = await this.custodyRepository.create(custody, tx);
    if (!created) {
      const concurrent = await this.custodyRepository.findByPaymentId(payment.id, tx);
      return { result: 'ALREADY_HELD', custodyId: concurrent!.id };
    }

    payment.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY);
    await this.paymentRepository.save(payment, tx);

    const amount = toReais(custody.amountCents);
    const basePayload = {
      trustCustodyId: custody.id,
      paymentId: payment.id,
      orderId: custody.orderId,
      buyerId: custody.buyerId,
      sellerId: custody.sellerId,
      amount,
      currency: custody.currency,
    };

    // Dois fatos distintos (§8.3): o agregado nasceu, e o dinheiro está retido.
    const createdEvent = await this.outboxService.enqueue(tx, {
      eventType: 'TrustCustody.Created',
      aggregateType: 'TrustCustody',
      aggregateId: custody.id,
      producer: PAY_PRODUCER,
      correlationId: input.correlationId,
      causationId: input.causationId,
      payload: {
        ...basePayload,
        status: custody.status,
        startedAt: custody.startedAt.toISOString(),
      },
    });
    await this.outboxService.enqueue(tx, {
      eventType: 'Funds.Held',
      aggregateType: 'TrustCustody',
      aggregateId: custody.id,
      producer: PAY_PRODUCER,
      correlationId: input.correlationId,
      causationId: createdEvent.eventId,
      payload: {
        ...basePayload,
        paymentStatus: payment.status,
        heldAt: custody.startedAt.toISOString(),
      },
    });

    await this.auditLogService.record(
      {
        identityId: custody.buyerId,
        operation: 'HoldFunds',
        resource: 'TrustCustody',
        resourceId: custody.id,
        result: 'SUCCESS',
        correlationId: input.correlationId,
        metadata: {
          paymentId: payment.id,
          orderId: custody.orderId,
          sellerId: custody.sellerId,
          amount,
          currency: custody.currency,
          previousStatus: PAYMENT_STATUS.AUTHORIZED,
          newStatus: payment.status,
          custodyStatus: custody.status,
        },
      },
      tx,
    );

    this.logger.info(
      {
        operation: 'HoldFunds',
        trustCustodyId: custody.id,
        paymentId: payment.id,
        orderId: custody.orderId,
        amountCents: custody.amountCents,
        currency: custody.currency,
        correlationId: input.correlationId,
        result: 'SUCCESS',
      },
      'Funds held in trust custody.',
    );

    return { result: 'HELD', custodyId: custody.id };
  }
}
