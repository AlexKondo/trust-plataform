import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceConversationNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import {
  CloseConversationRequest,
  ConversationResponse,
  RequestMeta,
} from '../dto/marketplace.dtos';
import { toConversationResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';

/** MRK-008 — encerra a conversa preservando todo o histórico (BR-004). */
@Injectable()
export class CloseConversationUseCase {
  constructor(
    private readonly conversationRepository: MarketplaceConversationRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CloseConversationUseCase.name);
  }

  async execute(
    identityId: string,
    conversationId: string,
    body: CloseConversationRequest,
    meta: RequestMeta = {},
  ): Promise<ConversationResponse> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new MarketplaceConversationNotFoundException();
    }

    // O aggregate valida participação (BR-001) e status OPEN (BR-002).
    conversation.close(identityId, body.reason ?? null);

    await this.db.transaction(async (tx) => {
      await this.conversationRepository.save(conversation, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceConversation.Closed',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? conversation.id,
        payload: {
          conversationId: conversation.id,
          listingId: conversation.listingId,
          closedBy: identityId,
          closedAt: conversation.closedAt!.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CloseMarketplaceConversation',
          resource: 'MarketplaceConversation',
          resourceId: conversation.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { reason: conversation.closeReason },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CloseMarketplaceConversation',
        identityId,
        conversationId: conversation.id,
        reason: conversation.closeReason,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace conversation closed.',
    );

    const listing = await this.listingRepository.findById(conversation.listingId);
    return toConversationResponse(conversation, listing?.title ?? null);
  }
}
