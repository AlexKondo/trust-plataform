import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceConversation, MarketplaceMessage } from '../entities/marketplace-conversation';

/** Linha da lista de conversas (MRK-007) — já traz o resumo que a tela precisa. */
export interface ConversationSummaryRow {
  id: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  buyerId: string;
  counterpartName: string;
  status: string;
  startedAt: Date;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export abstract class MarketplaceConversationRepository {
  abstract save(
    conversation: MarketplaceConversation,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract findById(id: string): Promise<MarketplaceConversation | null>;

  /** MRK-006 BR-005 — a conversa ativa daquele trio é reutilizada, não duplicada. */
  abstract findActiveConversation(
    listingId: string,
    sellerId: string,
    buyerId: string,
  ): Promise<MarketplaceConversation | null>;

  abstract findByListing(listingId: string): Promise<MarketplaceConversation[]>;

  abstract listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ConversationSummaryRow[]; totalItems: number }>;

  abstract saveMessage(message: MarketplaceMessage, executor?: DatabaseExecutor): Promise<void>;

  abstract listMessages(
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceMessage[]; totalItems: number }>;

  /** Marca como lidas as mensagens recebidas por `readerId`; retorna quantas mudaram. */
  abstract markAsRead(
    conversationId: string,
    readerId: string,
    readAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<number>;

  abstract countUnread(conversationId: string, readerId: string): Promise<number>;
}
