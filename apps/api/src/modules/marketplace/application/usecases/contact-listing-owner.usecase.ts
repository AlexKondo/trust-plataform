import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  MarketplaceConversation,
  MarketplaceMessage,
} from '../../domain/entities/marketplace-conversation';
import {
  CannotContactOwnListingException,
  MarketplaceListingNotFoundException,
  MarketplaceListingUnavailableException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import {
  ContactListingOwnerRequest,
  ConversationResponse,
  MessageResponse,
  RequestMeta,
} from '../dto/marketplace.dtos';
import { toConversationResponse, toMessageResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';

export interface ContactListingOwnerResult {
  conversation: ConversationResponse;
  message: MessageResponse;
  /** false quando uma conversa ativa foi reaproveitada (INCONSISTENCIAS #9 → 200). */
  created: boolean;
}

/**
 * MRK-006 — abre (ou reaproveita) a conversa entre comprador e anunciante.
 * BR-005 + INCONSISTENCIAS #9: conversa ativa existente é REUTILIZADA e a nova
 * mensagem é anexada — nunca 409, nunca duplicata.
 */
@Injectable()
export class ContactListingOwnerUseCase {
  constructor(
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly conversationRepository: MarketplaceConversationRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactListingOwnerUseCase.name);
  }

  async execute(
    buyerId: string,
    listingId: string,
    body: ContactListingOwnerRequest,
    meta: RequestMeta = {},
  ): Promise<ContactListingOwnerResult> {
    const listing = await this.listingRepository.findById(listingId);
    if (!listing || listing.deletedAt) {
      throw new MarketplaceListingNotFoundException();
    }
    // BR-003 antes do BR-002: para o dono, o problema é ser dono — não o status.
    if (listing.isOwnedBy(buyerId)) {
      throw new CannotContactOwnListingException();
    }
    if (!listing.isPubliclyVisible()) {
      throw new MarketplaceListingUnavailableException();
    }

    const existing = await this.conversationRepository.findActiveConversation(
      listing.id,
      listing.ownerId,
      buyerId,
    );
    const conversation =
      existing ??
      MarketplaceConversation.open({
        listingId: listing.id,
        sellerId: listing.ownerId,
        buyerId,
      });
    const created = existing === null;

    const message = MarketplaceMessage.create({
      conversationId: conversation.id,
      senderId: buyerId,
      message: body.message,
    });
    conversation.registerMessage(message.sentAt);

    await this.db.transaction(async (tx) => {
      await this.conversationRepository.save(conversation, tx);
      await this.conversationRepository.saveMessage(message, tx);

      if (created) {
        await this.outboxService.enqueue(tx, {
          eventName: 'MarketplaceConversation.Created',
          producer: MRK_PRODUCER,
          correlationId: meta.correlationId ?? conversation.id,
          payload: {
            conversationId: conversation.id,
            listingId: listing.id,
            buyerId,
            sellerId: listing.ownerId,
            startedAt: conversation.startedAt.toISOString(),
          },
        });
      }
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceMessage.Sent',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? conversation.id,
        payload: {
          conversationId: conversation.id,
          messageId: message.id,
          senderId: buyerId,
          recipientId: listing.ownerId,
          sentAt: message.sentAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: buyerId,
          operation: 'ContactMarketplaceListingOwner',
          resource: 'MarketplaceConversation',
          resourceId: conversation.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { listingId: listing.id, sellerId: listing.ownerId, reused: !created },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'ContactMarketplaceListingOwner',
        identityId: buyerId,
        conversationId: conversation.id,
        listingId: listing.id,
        sellerId: listing.ownerId,
        reused: !created,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      created ? 'Marketplace conversation created.' : 'Marketplace conversation reused.',
    );

    return {
      conversation: toConversationResponse(conversation, listing.title),
      message: toMessageResponse(message),
      created,
    };
  }
}
