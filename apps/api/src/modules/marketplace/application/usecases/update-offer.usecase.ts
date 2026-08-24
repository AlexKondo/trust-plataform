import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { OfferResponse, UpdateOfferRequest } from '../dto/marketplace-offer.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOfferResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

/** MRK-010 — quem propôs ajusta a proposta enquanto ela está pendente. */
@Injectable()
export class UpdateOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UpdateOfferUseCase.name);
  }

  async execute(
    identityId: string,
    offerId: string,
    body: UpdateOfferRequest,
    meta: RequestMeta = {},
  ): Promise<OfferResponse> {
    const { offer } = await this.offerService.loadOffer(offerId, identityId);
    const previousAmount = offer.amount;

    // O aggregate valida propriedade (BR-001), status PENDING (BR-002/003) e
    // os invariantes de valor/quantidade/validade (BR-005/006).
    const updatedFields = offer.update(identityId, {
      amount: body.amount,
      quantity: body.quantity,
      expiresAt: body.expiresAt,
      notes: body.notes,
    });

    if (updatedFields.length > 0) {
      await this.db.transaction(async (tx) => {
        await this.offerRepository.save(offer, tx);
        await this.outboxService.enqueue(tx, {
          eventType: 'MarketplaceOffer.Updated',
          aggregateType: 'MarketplaceOffer',
          aggregateId: offer.id,
          producer: MRK_PRODUCER,
          correlationId: meta.correlationId ?? offer.id,
          payload: {
            offerId: offer.id,
            conversationId: offer.conversationId,
            buyerId: offer.buyerId,
            updatedFields,
            updatedAt: offer.updatedAt.toISOString(),
          },
        });
        await this.auditLogService.record(
          {
            identityId,
            operation: 'UpdateMarketplaceOffer',
            resource: 'MarketplaceOffer',
            resourceId: offer.id,
            result: 'SUCCESS',
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            correlationId: meta.correlationId,
            requestId: meta.requestId,
            metadata: { updatedFields, previousAmount, newAmount: offer.amount },
          },
          tx,
        );
      });
    }

    this.logger.info(
      {
        operation: 'UpdateMarketplaceOffer',
        identityId,
        offerId: offer.id,
        updatedFields,
        previousAmount,
        newAmount: offer.amount,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace offer updated.',
    );

    return toOfferResponse(offer);
  }
}
