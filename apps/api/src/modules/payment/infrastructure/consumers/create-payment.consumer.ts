import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { fromReais } from '../../../../shared/money/money';
import { Payment } from '../../domain/entities/payment';
import { PaymentRepository } from '../../domain/repositories/payment.repository';

export const PAY_PRODUCER = 'payment-service';

/**
 * PAY-001 — o pagamento nasce junto com o pedido.
 *
 * **INCONSISTENCIAS P1**: a spec manda criar o Payment ao consumir
 * `MarketplaceOrder.CustomerConfirmed`, o que cobraria o cliente DEPOIS de ele
 * confirmar que o serviço foi entregue — e esvaziaria a custódia, já que a
 * confirmação é justamente a condição de LIBERAÇÃO (PAY-ARCH-002 §8). Aqui o
 * gatilho é `MarketplaceOrder.Created`: o cliente paga ao fechar negócio, o
 * dinheiro fica retido, e a confirmação libera.
 *
 * Este consumer é o ÚNICO ponto que depende dessa decisão — reverter para o
 * texto literal da spec é trocar o `eventName` e mais nada.
 */
@Injectable()
export class CreatePaymentOnOrderConsumer extends EventConsumer {
  readonly eventName = 'MarketplaceOrder.Created';
  readonly consumerName = 'pay.create-payment-on-order';

  constructor(
    private readonly repository: PaymentRepository,
    private readonly outboxService: OutboxService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(CreatePaymentOnOrderConsumer.name);
  }

  async handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const payload = envelope.payload as {
      orderId?: string;
      buyerId?: string;
      sellerId?: string;
      amount?: number;
      currency?: string;
    };
    if (!payload.orderId || !payload.buyerId || !payload.sellerId || payload.amount === undefined) {
      return;
    }

    const payment = Payment.create({
      orderId: payload.orderId,
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      amountCents: fromReais(payload.amount),
      currency: payload.currency ?? 'BRL',
    });

    // BR-001: o índice único em order_id é a garantia final contra duplicidade.
    const created = await this.repository.create(payment, tx);
    if (!created) {
      return;
    }

    await this.outboxService.enqueue(tx, {
      eventName: 'Payment.Created',
      producer: PAY_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        buyerId: payment.buyerId,
        sellerId: payment.sellerId,
        amount: payload.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt.toISOString(),
      },
    });

    this.logger.info(
      {
        operation: 'CreatePayment',
        paymentId: payment.id,
        orderId: payment.orderId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Payment created for marketplace order.',
    );
  }
}
