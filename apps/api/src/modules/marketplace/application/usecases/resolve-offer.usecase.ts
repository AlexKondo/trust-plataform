import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { OfferReasonRequest, OfferResponse } from '../dto/marketplace-offer.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOfferResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { MarketplaceOfferService } from './marketplace-offer.service';

/**
 * MRK-011 — retirada da proposta pelo autor. A proposta não é apagada (BR-004):
 * vira WITHDRAWN com autor, momento e motivo, preservando o histórico da
 * negociação para eventuais disputas (BR-008).
 */
@Injectable()
export class WithdrawOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WithdrawOfferUseCase.name);
  }

  async execute(
    identityId: string,
    offerId: string,
    body: OfferReasonRequest,
    meta: RequestMeta = {},
  ): Promise<OfferResponse> {
    const { offer } = await this.offerService.loadOffer(offerId, identityId);
    const previousStatus = offer.status;
    offer.withdraw(identityId, body.reason ?? null);

    await this.db.transaction(async (tx) => {
      await this.offerRepository.save(offer, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceOffer.Withdrawn',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          offerId: offer.id,
          conversationId: offer.conversationId,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          status: offer.status,
          withdrawnAt: offer.withdrewAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'WithdrawMarketplaceOffer',
          resource: 'MarketplaceOffer',
          resourceId: offer.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { previousStatus, newStatus: offer.status, reason: offer.withdrawReason },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'WithdrawMarketplaceOffer',
        identityId,
        offerId: offer.id,
        conversationId: offer.conversationId,
        listingId: offer.listingId,
        previousStatus,
        newStatus: offer.status,
        reason: offer.withdrawReason,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace offer withdrawn.',
    );

    return toOfferResponse(offer);
  }
}

/**
 * MRK-014 — rejeição por quem recebeu a proposta. A conversa segue aberta e
 * uma nova rodada pode começar (BR-004/BR-005).
 */
@Injectable()
export class RejectOfferUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly offerService: MarketplaceOfferService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RejectOfferUseCase.name);
  }

  async execute(
    identityId: string,
    offerId: string,
    body: OfferReasonRequest,
    meta: RequestMeta = {},
  ): Promise<OfferResponse> {
    const { offer } = await this.offerService.loadOffer(offerId, identityId);
    const previousStatus = offer.status;
    offer.reject(identityId, body.reason ?? null);

    await this.db.transaction(async (tx) => {
      await this.offerRepository.save(offer, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceOffer.Rejected',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? offer.id,
        payload: {
          offerId: offer.id,
          conversationId: offer.conversationId,
          listingId: offer.listingId,
          buyerId: offer.buyerId,
          sellerId: offer.sellerId,
          rejectedBy: identityId,
          rejectedAt: offer.rejectedAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'RejectMarketplaceOffer',
          resource: 'MarketplaceOffer',
          resourceId: offer.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { previousStatus, newStatus: offer.status, reason: offer.rejectReason },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'RejectMarketplaceOffer',
        identityId,
        offerId: offer.id,
        conversationId: offer.conversationId,
        listingId: offer.listingId,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        reason: offer.rejectReason,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace offer rejected.',
    );

    return toOfferResponse(offer);
  }
}
