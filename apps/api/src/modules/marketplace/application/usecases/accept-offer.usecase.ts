import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceCommercialSnapshot } from '../../domain/entities/marketplace-commercial-snapshot';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import { CommercialPolicyNotConfiguredException } from '../../domain/exceptions/marketplace.exceptions';
import { CommercialPolicyRepository } from '../../domain/repositories/commercial-policy.repository';
import { MarketplaceCommercialSnapshotRepository } from '../../domain/repositories/marketplace-commercial-snapshot.repository';
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
 *
 * PACK-02 §10 — este é também o ponto de "Contract Formation": na mesma
 * transação, a política comercial vigente é resolvida e o snapshot econômico
 * (`MarketplaceCommercialSnapshot`) é calculado e CONGELADO — a taxa de Trust
 * Fee usada aqui nunca muda depois, mesmo que a `CommercialPolicy` global
 * mude. `order.amount` já é o `grossAmount` no MVP (materialCost/markup
 * sempre 0 — PACK-02 não captura esses componentes ainda), então o Payment
 * criado pelo consumer `pay.create-payment-on-order` (que consome
 * `MarketplaceOrder.Created`, inalterado por este Pack) já nasce com o
 * grossAmount correto sem nenhuma mudança no módulo payment (§11).
 */
@Injectable()
export class AcceptOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly commercialPolicyRepository: CommercialPolicyRepository,
    private readonly commercialSnapshotRepository: MarketplaceCommercialSnapshotRepository,
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

      // PACK-02 §10 — resolve a política vigente DENTRO da transação: o rate
      // usado fica congelado no snapshot, mesmo que a policy mude depois.
      const policy = await this.commercialPolicyRepository.findActive(tx);
      if (!policy) {
        throw new CommercialPolicyNotConfiguredException();
      }

      // §5/§8: materialCost/materialMarkup são sempre 0 no MVP — PACK-02 não
      // captura esses componentes ainda (não existe evidência/compra de
      // material implementada). serviceAmount = order.amount inteiro.
      const snapshot = MarketplaceCommercialSnapshot.create({
        orderId: order.id,
        pricingModel: order.pricingModel,
        currency: order.currency,
        serviceAmount: order.amount,
        materialCostAmount: 0,
        materialMarkupAmount: 0,
        trustFeeRateBps: policy.trustFeeRateBps,
        hourlyRateAmount: order.hourlyRateAmount,
        minimumMinutes: order.minimumMinutes,
        billingIncrementMinutes: order.billingIncrementMinutes,
        now: acceptedAt,
      });
      await this.commercialSnapshotRepository.save(snapshot, tx);

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
            // PACK-02 §16 — auditoria da taxa efetiva e dos totais congelados.
            trustFeeRateBps: snapshot.trustFeeRateBps,
            grossAmount: snapshot.grossAmount,
            trustFeeAmount: snapshot.trustFeeAmount,
            providerNetBeforePspFees: snapshot.providerNetBeforePspFees,
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
