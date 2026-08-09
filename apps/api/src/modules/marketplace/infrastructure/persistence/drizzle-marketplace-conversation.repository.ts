import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { identities } from '../../../identity/infrastructure/persistence/identities.schema';
import {
  MarketplaceConversation,
  MarketplaceMessage,
} from '../../domain/entities/marketplace-conversation';
import { CONVERSATION_STATUS, ConversationStatus } from '../../domain/entities/marketplace-types';
import {
  ConversationSummaryRow,
  MarketplaceConversationRepository,
} from '../../domain/repositories/marketplace-conversation.repository';
import {
  MarketplaceConversationRow,
  MarketplaceMessageRow,
  marketplaceConversations,
  marketplaceListings,
  marketplaceMessages,
} from './marketplace.schema';

const PREVIEW_LENGTH = 120;

@Injectable()
export class DrizzleMarketplaceConversationRepository extends MarketplaceConversationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(conversation: MarketplaceConversation, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = conversation.toProps();
    await target
      .insert(marketplaceConversations)
      .values(props)
      .onConflictDoUpdate({
        target: marketplaceConversations.id,
        set: {
          status: props.status,
          lastMessageAt: props.lastMessageAt,
          closedAt: props.closedAt,
          closedBy: props.closedBy,
          closeReason: props.closeReason,
          updatedAt: props.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<MarketplaceConversation | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceConversations)
      .where(eq(marketplaceConversations.id, id))
      .limit(1);
    return row ? toConversation(row) : null;
  }

  async findActiveConversation(
    listingId: string,
    sellerId: string,
    buyerId: string,
  ): Promise<MarketplaceConversation | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceConversations)
      .where(
        and(
          eq(marketplaceConversations.listingId, listingId),
          eq(marketplaceConversations.sellerId, sellerId),
          eq(marketplaceConversations.buyerId, buyerId),
          eq(marketplaceConversations.status, CONVERSATION_STATUS.OPEN),
        ),
      )
      .limit(1);
    return row ? toConversation(row) : null;
  }

  async findByListing(listingId: string): Promise<MarketplaceConversation[]> {
    const rows = await this.db
      .select()
      .from(marketplaceConversations)
      .where(eq(marketplaceConversations.listingId, listingId))
      .orderBy(desc(marketplaceConversations.startedAt));
    return rows.map(toConversation);
  }

  async listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ConversationSummaryRow[]; totalItems: number }> {
    const seller = alias(identities, 'seller_identity');
    const buyer = alias(identities, 'buyer_identity');
    const where = or(
      eq(marketplaceConversations.sellerId, identityId),
      eq(marketplaceConversations.buyerId, identityId),
    );

    const unreadCount = sql<number>`(
      select count(*)::int from ${marketplaceMessages} m
      where m.conversation_id = ${marketplaceConversations.id}
        and m.sender_id <> ${identityId}
        and m.read = false
    )`;
    const lastMessagePreview = sql<string | null>`(
      select left(m.message, ${PREVIEW_LENGTH}) from ${marketplaceMessages} m
      where m.conversation_id = ${marketplaceConversations.id}
      order by m.sent_at desc limit 1
    )`;

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: marketplaceConversations.id,
          listingId: marketplaceConversations.listingId,
          listingTitle: marketplaceListings.title,
          sellerId: marketplaceConversations.sellerId,
          buyerId: marketplaceConversations.buyerId,
          sellerName: seller.fullName,
          buyerName: buyer.fullName,
          status: marketplaceConversations.status,
          startedAt: marketplaceConversations.startedAt,
          lastMessageAt: marketplaceConversations.lastMessageAt,
          lastMessagePreview,
          unreadCount,
        })
        .from(marketplaceConversations)
        .innerJoin(marketplaceListings, eq(marketplaceConversations.listingId, marketplaceListings.id))
        .innerJoin(seller, eq(marketplaceConversations.sellerId, seller.id))
        .innerJoin(buyer, eq(marketplaceConversations.buyerId, buyer.id))
        .where(where)
        .orderBy(sql`${marketplaceConversations.lastMessageAt} desc nulls last`)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketplaceConversations)
        .where(where),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        listingId: row.listingId,
        listingTitle: row.listingTitle,
        sellerId: row.sellerId,
        buyerId: row.buyerId,
        counterpartName: row.sellerId === identityId ? row.buyerName : row.sellerName,
        status: row.status,
        startedAt: row.startedAt,
        lastMessageAt: row.lastMessageAt,
        lastMessagePreview: row.lastMessagePreview,
        unreadCount: row.unreadCount,
      })),
      totalItems: total?.count ?? 0,
    };
  }

  async saveMessage(message: MarketplaceMessage, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    // Append-only (BR-004/005): insert puro, sem upsert nem update de conteúdo.
    await target.insert(marketplaceMessages).values(message.toProps());
  }

  async listMessages(
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceMessage[]; totalItems: number }> {
    const where = eq(marketplaceMessages.conversationId, conversationId);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(marketplaceMessages)
        .where(where)
        .orderBy(asc(marketplaceMessages.sentAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(marketplaceMessages).where(where),
    ]);
    return { items: rows.map(toMessage), totalItems: total?.count ?? 0 };
  }

  async markAsRead(
    conversationId: string,
    readerId: string,
    readAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<number> {
    const target = executor ?? this.db;
    const updated = await target
      .update(marketplaceMessages)
      .set({ read: true, readAt })
      .where(
        and(
          eq(marketplaceMessages.conversationId, conversationId),
          ne(marketplaceMessages.senderId, readerId),
          eq(marketplaceMessages.read, false),
        ),
      )
      .returning({ id: marketplaceMessages.id });
    return updated.length;
  }

  async countUnread(conversationId: string, readerId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketplaceMessages)
      .where(
        and(
          eq(marketplaceMessages.conversationId, conversationId),
          ne(marketplaceMessages.senderId, readerId),
          eq(marketplaceMessages.read, false),
        ),
      );
    return row?.count ?? 0;
  }
}

function toConversation(row: MarketplaceConversationRow): MarketplaceConversation {
  return MarketplaceConversation.restore({
    id: row.id,
    listingId: row.listingId,
    sellerId: row.sellerId,
    buyerId: row.buyerId,
    status: row.status as ConversationStatus,
    startedAt: row.startedAt,
    lastMessageAt: row.lastMessageAt,
    closedAt: row.closedAt,
    closedBy: row.closedBy,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toMessage(row: MarketplaceMessageRow): MarketplaceMessage {
  return MarketplaceMessage.restore({
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    message: row.message,
    read: row.read,
    readAt: row.readAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  });
}
