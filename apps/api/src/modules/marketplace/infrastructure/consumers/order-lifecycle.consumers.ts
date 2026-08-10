import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { EventEnvelope } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { LISTING_STATUS, ORDER_STATUS } from '../../domain/entities/marketplace-types';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';

const MRK_PRODUCER = 'marketplace-service';

/**
 * INCONSISTENCIAS #12 — sem isto o anúncio ficaria `RESERVED` para sempre
 * quando o pedido é cancelado. Devolve o anúncio para `PUBLISHED`, de volta à
 * vitrine. Idempotente: só age se o anúncio ainda estiver reservado.
 */
@Injectable()
export class ReleaseListingOnCancelConsumer extends EventConsumer {
  readonly eventName = 'MarketplaceOrder.Cancelled';
  readonly consumerName = 'mrk.release-listing-on-cancel';

  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ReleaseListingOnCancelConsumer.name);
  }

  async handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const { listingId, orderId } = envelope.payload as { listingId?: string; orderId?: string };
    if (!listingId) {
      return;
    }
    const listing = await this.listingRepository.findById(listingId);
    if (!listing || listing.status !== LISTING_STATUS.RESERVED) {
      return; // já liberado ou em outro estado — nada a fazer
    }

    listing.release();
    await this.listingRepository.save(listing, tx);
    await this.outboxService.enqueue(tx, {
      eventName: 'MarketplaceListing.Released',
      producer: MRK_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: {
        listingId,
        ownerId: listing.ownerId,
        orderId: orderId ?? null,
        status: listing.status,
        releasedAt: new Date().toISOString(),
      },
    });

    this.logger.info(
      {
        operation: 'ReleaseMarketplaceListing',
        listingId,
        orderId,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Listing released back to the marketplace after order cancellation.',
    );
  }
}

/**
 * MRK-022 BR-006/BR-007 — a confirmação do cliente não encerra o pedido: ela
 * dispara os processos obrigatórios. No MVP o único é a atualização do Trust
 * Score (consumer irmão no TRS); concluídos os processos, o pedido evolui para
 * COMPLETED. `CLOSED` fica para depois da janela de avaliação (Módulo 9).
 */
@Injectable()
export class CompleteOrderOnConfirmationConsumer extends EventConsumer {
  readonly eventName = 'MarketplaceOrder.CustomerConfirmed';
  readonly consumerName = 'mrk.complete-confirmed-order';

  constructor(
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly outboxService: OutboxService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(CompleteOrderOnConfirmationConsumer.name);
  }

  async handle(envelope: EventEnvelope, tx: DatabaseExecutor): Promise<void> {
    const { orderId } = envelope.payload as { orderId?: string };
    if (!orderId) {
      return;
    }
    const order = await this.orderRepository.findById(orderId, tx);
    if (!order || order.status !== ORDER_STATUS.CUSTOMER_CONFIRMED) {
      return; // idempotente: já concluído ou em disputa
    }

    order.complete();
    await this.orderRepository.save(order, tx);
    await this.outboxService.enqueue(tx, {
      eventName: 'MarketplaceOrder.Completed',
      producer: MRK_PRODUCER,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
      payload: {
        orderId,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        completedAt: order.updatedAt.toISOString(),
      },
    });

    this.logger.info(
      {
        operation: 'CompleteMarketplaceOrder',
        orderId,
        newStatus: order.status,
        correlationId: envelope.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace order completed after customer confirmation.',
    );
  }
}
