import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceConversation, MarketplaceMessage } from '../../domain/entities/marketplace-conversation';
import { MarketplaceConversationNotFoundException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import {
  ConversationResponse,
  ConversationSummaryResponse,
  MessageResponse,
  RequestMeta,
  SendMessageRequest,
} from '../dto/marketplace.dtos';
import { toConversationResponse, toMessageResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';

/**
 * MRK-007 — troca de mensagens e gestão das conversas.
 * Autorização única: `assertParticipant` no aggregate (BR-001). Mensagens são
 * append-only (BR-004/005) — só o estado de leitura muda depois do envio.
 */
@Injectable()
export class ConversationMessagingUseCase {
  constructor(
    private readonly conversationRepository: MarketplaceConversationRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConversationMessagingUseCase.name);
  }

  /** Lista as conversas do usuário (como comprador ou vendedor). */
  async list(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ConversationSummaryResponse>> {
    const { items, totalItems } = await this.conversationRepository.listForParticipant(
      identityId,
      page,
      pageSize,
    );
    return PaginatedResult.of(
      items.map((row) => ({
        conversationId: row.id,
        listingId: row.listingId,
        listingTitle: row.listingTitle,
        counterpartName: row.counterpartName,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: row.lastMessagePreview,
        unreadCount: row.unreadCount,
      })),
      page,
      pageSize,
      totalItems,
    );
  }

  /** Conversa + histórico paginado (BR-008: histórico sempre disponível). */
  async get(
    identityId: string,
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    conversation: ConversationResponse;
    messages: MessageResponse[];
    pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  }> {
    const conversation = await this.requireParticipant(identityId, conversationId);
    const listing = await this.listingRepository.findById(conversation.listingId);
    const { items, totalItems } = await this.conversationRepository.listMessages(
      conversationId,
      page,
      pageSize,
    );
    return {
      conversation: toConversationResponse(conversation, listing?.title ?? null),
      messages: items.map(toMessageResponse),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  /** Envia mensagem: só participante (BR-001) e só em conversa OPEN (BR-002). */
  async send(
    identityId: string,
    conversationId: string,
    body: SendMessageRequest,
    meta: RequestMeta = {},
  ): Promise<MessageResponse> {
    const conversation = await this.requireParticipant(identityId, conversationId);

    const message = MarketplaceMessage.create({
      conversationId,
      senderId: identityId,
      message: body.message,
    });
    conversation.registerMessage(message.sentAt); // lança se estiver CLOSED

    await this.db.transaction(async (tx) => {
      await this.conversationRepository.saveMessage(message, tx);
      await this.conversationRepository.save(conversation, tx);
      await this.outboxService.enqueue(tx, {
        eventName: 'MarketplaceMessage.Sent',
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? conversation.id,
        payload: {
          conversationId,
          messageId: message.id,
          senderId: identityId,
          sentAt: message.sentAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'SendMarketplaceMessage',
          resource: 'MarketplaceMessage',
          resourceId: message.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { conversationId },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'SendMarketplaceMessage',
        identityId,
        conversationId,
        messageId: message.id,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace message sent.',
    );

    return toMessageResponse(message);
  }

  /** BR-006 — marca como lidas as mensagens recebidas pelo leitor. */
  async markAsRead(
    identityId: string,
    conversationId: string,
    meta: RequestMeta = {},
  ): Promise<{ messagesRead: number }> {
    await this.requireParticipant(identityId, conversationId);
    const readAt = new Date();

    const messagesRead = await this.db.transaction(async (tx) => {
      const updated = await this.conversationRepository.markAsRead(
        conversationId,
        identityId,
        readAt,
        tx,
      );
      if (updated > 0) {
        await this.outboxService.enqueue(tx, {
          eventName: 'MarketplaceConversation.Read',
          producer: MRK_PRODUCER,
          correlationId: meta.correlationId ?? conversationId,
          payload: {
            conversationId,
            readerId: identityId,
            messagesRead: updated,
            readAt: readAt.toISOString(),
          },
        });
      }
      return updated;
    });

    return { messagesRead };
  }

  private async requireParticipant(
    identityId: string,
    conversationId: string,
  ): Promise<MarketplaceConversation> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new MarketplaceConversationNotFoundException();
    }
    conversation.assertParticipant(identityId);
    return conversation;
  }
}
