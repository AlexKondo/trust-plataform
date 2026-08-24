import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import { MarketplaceOfferNotRecipientException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import {
  CreateOfferRequest,
  OfferResponse,
} from '../dto/marketplace-offer.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOfferResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

/**
 * MRK-009 — o comprador formaliza a proposta dentro de uma conversa aberta.
 * INCONSISTENCIAS #25: no MVP só o comprador ABRE a negociação; o vendedor
 * participa contrapondo (MRK-012).
 */
@Injectable()
export class CreateOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CreateOfferUseCase.name);
  }

  async execute(
    identityId: string,
    conversationId: string,
    body: CreateOfferRequest,
    meta: RequestMeta = {},
  ): Promise<OfferResponse> {
    const { conversation, listing } = await this.offerService.loadNegotiation(
      conversationId,
      identityId,
    );

    // BR-001: quem abre a negociação é o comprador da conversa
    if (conversation.buyerId !== identityId) {
      throw new MarketplaceOfferNotRecipientException();
    }
    await this.offerService.assertNoLiveOffer(conversationId);

    const offer = MarketplaceOffer.create({
      conversationId,
      listingId: listing.id,
      buyerId: conversation.buyerId,
      sellerId: conversation.sellerId,
      createdBy: identityId,
      terms: {
        amount: body.amount,
        currency: body.currency ?? listing.currency,
        quantity: body.quantity,
        expiresAt: body.expiresAt,
        notes: body.notes ?? null,
      },
    });

    await this.db.transaction(async (tx) => {
      await this.offerRepository.save(offer, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceOffer.Created',
        aggregateType: 'MarketplaceOffer',
        aggregateId: offer.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          offerId: offer.id,
          conversationId,
          listingId: listing.id,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          amount: offer.amount,
          currency: offer.currency,
          status: offer.status,
          createdAt: offer.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CreateMarketplaceOffer',
          resource: 'MarketplaceOffer',
          resourceId: offer.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { conversationId, listingId: listing.id, amount: offer.amount },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CreateMarketplaceOffer',
        identityId,
        offerId: offer.id,
        conversationId,
        listingId: listing.id,
        sellerId: offer.sellerId,
        amount: offer.amount,
        status: offer.status,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace offer created.',
    );

    return toOfferResponse(offer);
  }
}
