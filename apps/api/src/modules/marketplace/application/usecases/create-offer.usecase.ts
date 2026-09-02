import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOffer, OfferTerms } from '../../domain/entities/marketplace-offer';
import { PRICING_MODEL } from '../../domain/entities/marketplace-types';
import {
  CommercialPolicyNotConfiguredException,
  MarketplaceOfferNotRecipientException,
} from '../../domain/exceptions/marketplace.exceptions';
import { calculateInitialHourlyAmount } from '../../domain/services/hourly-pricing.service';
import { CommercialPolicyRepository } from '../../domain/repositories/commercial-policy.repository';
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
 *
 * PACK-02 §9 — resolve o modelo comercial da proposta: FIXED_PRICE preserva o
 * comportamento legado; HOURLY deriva o valor inicial contratado a partir de
 * `hourlyRateAmount`/`minimumMinutes` (nunca aceita `amount` livre) e resolve
 * `billingIncrementMinutes` da `CommercialPolicy` vigente quando o cliente não
 * o informa (default MVP = 30min, configurável — nunca hard-coded aqui).
 */
@Injectable()
export class CreateOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly commercialPolicyRepository: CommercialPolicyRepository,
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

    const currency = body.currency ?? listing.currency;
    const terms: OfferTerms =
      body.pricingModel === PRICING_MODEL.HOURLY
        ? {
            // §4.2/§9 — valor inicial contratado é sempre DERIVADO; o cliente
            // nunca propõe `amount` livre para HOURLY.
            amount: calculateInitialHourlyAmount(body.hourlyRateAmount!, body.minimumMinutes!),
            currency,
            quantity: body.quantity,
            expiresAt: body.expiresAt,
            notes: body.notes ?? null,
            pricingModel: PRICING_MODEL.HOURLY,
            hourlyRateAmount: body.hourlyRateAmount!,
            minimumMinutes: body.minimumMinutes!,
            billingIncrementMinutes:
              body.billingIncrementMinutes ?? (await this.resolveDefaultBillingIncrement()),
          }
        : {
            amount: body.amount!,
            currency,
            quantity: body.quantity,
            expiresAt: body.expiresAt,
            notes: body.notes ?? null,
            pricingModel: PRICING_MODEL.FIXED_PRICE,
            hourlyRateAmount: null,
            minimumMinutes: null,
            billingIncrementMinutes: null,
          };

    const offer = MarketplaceOffer.create({
      conversationId,
      listingId: listing.id,
      buyerId: conversation.buyerId,
      sellerId: conversation.sellerId,
      createdBy: identityId,
      terms,
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
          // PACK-02 §17 — adição retrocompatível: campos novos, evento existente.
          pricingModel: offer.pricingModel,
          hourlyRateAmount: offer.hourlyRateAmount,
          minimumMinutes: offer.minimumMinutes,
          billingIncrementMinutes: offer.billingIncrementMinutes,
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
          metadata: {
            conversationId,
            listingId: listing.id,
            amount: offer.amount,
            pricingModel: offer.pricingModel,
          },
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

  /** PACK-02 §9 — resolve o default de `billingIncrementMinutes` (MVP: 30min, configurável). */
  private async resolveDefaultBillingIncrement(): Promise<number> {
    const policy = await this.commercialPolicyRepository.findActive();
    if (!policy) {
      throw new CommercialPolicyNotConfiguredException();
    }
    return policy.defaultBillingIncrementMinutes;
  }
}
