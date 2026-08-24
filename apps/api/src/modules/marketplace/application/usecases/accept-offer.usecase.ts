import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import { AcceptOfferResponse } from '../dto/marketplace-offer.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOfferResponse, toOrderResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

/**
 * MRK-013 — o pivô do marketplace: negociação vira pedido.
 *
 * Quatro efeitos em UMA transação (BR-008 — se qualquer etapa falhar, nada
 * acontece): a proposta vira ACCEPTED, as concorrentes viram CLOSED (BR-004),
 * o anúncio é reservado (BR-005) e o MarketplaceOrder nasce (BR-006 + MRK-015
 * BR-007). Os três eventos publicados no mesmo outbox mantêm Orders,
 * Notifications, Trust Score e Analytics desacoplados (BR-009).
 */
@Injectable()
export class AcceptOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AcceptOfferUseCase.name);
  }

  async execute(
    identityId: string,
    offerId: string,
    meta: RequestMeta = {},
  ): Promise<AcceptOfferResponse> {
    const { offer, listing } = await this.offerService.loadOffer(offerId, identityId);

    const acceptedAt = new Date();
    // Valida destinatário (BR-001) e status PENDING/não vencida (BR-002).
    offer.accept(identityId, acceptedAt);
    // Só reserva anúncio publicado — impede aceitar duas negociações do mesmo anúncio.
    listing.reserve(acceptedAt);
    const order = MarketplaceOrder.createFromOffer(offer, acceptedAt);

    const closedOfferIds: string[] = [];

    await this.db.transaction(async (tx) => {
      // BR-004: as demais propostas vivas da mesma negociação são encerradas
      const competitors = await this.offerRepository.findPendingByConversation(
        offer.conversationId,
        tx,
      );
      const superseded = competitors.filter((candidate) => candidate.id !== offer.id);
      for (const candidate of superseded) {
        candidate.closeAsSuperseded(acceptedAt);
        closedOfferIds.push(candidate.id);
      }

      await this.offerRepository.saveAll([offer, ...superseded], tx);
      await this.listingRepository.save(listing, tx);
      await this.orderRepository.save(order, tx);

      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceOffer.Accepted',
        aggregateType: 'MarketplaceOffer',
        aggregateId: offer.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          offerId: offer.id,
          conversationId: offer.conversationId,
          listingId: listing.id,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          acceptedBy: identityId,
          orderId: order.id,
          acceptedAt: acceptedAt.toISOString(),
        },
      });
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceListing.Reserved',
        aggregateType: 'MarketplaceListing',
        aggregateId: listing.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          listingId: listing.id,
          ownerId: listing.ownerId,
          orderId: order.id,
          status: listing.status,
          reservedAt: acceptedAt.toISOString(),
        },
      });
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceOrder.Created',
        aggregateType: 'MarketplaceOrder',
        aggregateId: order.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          orderId: order.id,
          offerId: offer.id,
          conversationId: order.conversationId,
          listingId: order.listingId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'AcceptMarketplaceOffer',
          resource: 'MarketplaceOffer',
          resourceId: offer.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: {
            orderId: order.id,
            listingId: listing.id,
            amount: offer.amount,
            closedOfferIds,
          },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'AcceptMarketplaceOffer',
        identityId,
        offerId: offer.id,
        conversationId: offer.conversationId,
        listingId: listing.id,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        orderId: order.id,
        closedOfferIds,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace offer accepted; order created.',
    );

    return {
      offer: toOfferResponse(offer, acceptedAt),
      order: toOrderResponse(order),
      listingStatus: listing.status,
      closedOfferIds,
    };
  }
}
