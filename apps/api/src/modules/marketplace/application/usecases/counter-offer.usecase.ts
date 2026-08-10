import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { CounterOfferRequest, OfferResponse } from '../dto/marketplace-offer.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOfferResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

/**
 * MRK-012 — contraoferta: a proposta recebida vira COUNTERED (BR-003) e nasce a
 * rodada seguinte apontando para ela via `parentOfferId` (BR-004). Sem limite de
 * rodadas (BR-007) — a cadeia inteira é o histórico da negociação.
 */
@Injectable()
export class CounterOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CounterOfferUseCase.name);
  }

  async execute(
    identityId: string,
    offerId: string,
    body: CounterOfferRequest,
    meta: RequestMeta = {},
  ): Promise<OfferResponse> {
    const { offer } = await this.offerService.loadOffer(offerId, identityId);
    const previousAmount = offer.amount;

    // O aggregate valida que quem contrapõe é quem RECEBEU a proposta e que ela
    // ainda está pendente; devolve a nova rodada com a moeda herdada (BR-009).
    const counterOffer = offer.counter(identityId, {
      amount: body.amount,
      currency: offer.currency,
      quantity: body.quantity ?? offer.quantity,
      expiresAt: body.expiresAt,
      notes: body.notes ?? null,
    });

    await this.db.transaction(async (tx) => {
      await this.offerRepository.saveAll([offer, counterOffer], tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceOffer.Countered',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? counterOffer.id,
        payload: {
          offerId: counterOffer.id,
          parentOfferId: offer.id,
          conversationId: counterOffer.conversationId,
          listingId: counterOffer.listingId,
          buyerId: counterOffer.buyerId,
          sellerId: counterOffer.sellerId,
          amount: counterOffer.amount,
          currency: counterOffer.currency,
          status: counterOffer.status,
          createdAt: counterOffer.createdAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CounterMarketplaceOffer',
          resource: 'MarketplaceOffer',
          resourceId: counterOffer.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { parentOfferId: offer.id, previousAmount, newAmount: counterOffer.amount },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CounterMarketplaceOffer',
        identityId,
        offerId: counterOffer.id,
        parentOfferId: offer.id,
        conversationId: counterOffer.conversationId,
        listingId: counterOffer.listingId,
        previousAmount,
        newAmount: counterOffer.amount,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace counter offer created.',
    );

    return toOfferResponse(counterOffer);
  }
}
