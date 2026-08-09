import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceConversation, MarketplaceMessage } from '../../domain/entities/marketplace-conversation';
import { MarketplaceCategory, ListingSearchRow } from '../../domain/repositories/marketplace-listing.repository';
import {
  ConversationResponse,
  ListingResponse,
  ListingSummaryResponse,
  MessageResponse,
  SellerSummaryResponse,
} from '../dto/marketplace.dtos';

const EXCERPT_LENGTH = 180;

export function excerptOf(description: string | null): string | null {
  if (!description) {
    return null;
  }
  return description.length <= EXCERPT_LENGTH
    ? description
    : `${description.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/** MRK-004 BR-007 — resultado da busca traz só o resumo do anúncio. */
export function toListingSummary(row: ListingSearchRow): ListingSummaryResponse {
  return {
    listingId: row.id,
    title: row.title,
    excerpt: excerptOf(row.description),
    listingType: row.listingType,
    category: row.categoryCode,
    categoryName: row.categoryName,
    price: row.price,
    currency: row.currency,
    location: row.location,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    seller: { trustScore: row.sellerScore, trustLevel: row.sellerLevel },
  };
}

export function toListingResponse(
  listing: MarketplaceListing,
  options: {
    category: MarketplaceCategory | null;
    images: string[];
    seller?: SellerSummaryResponse | null;
    includePublishingHints?: boolean;
  },
): ListingResponse {
  const response: ListingResponse = {
    listingId: listing.id,
    ownerId: listing.ownerId,
    title: listing.title,
    description: listing.description,
    listingType: listing.listingType,
    category: options.category?.code ?? null,
    categoryName: options.category?.name ?? null,
    price: listing.price,
    currency: listing.currency,
    location: listing.location,
    status: listing.status,
    images: options.images,
    viewCount: listing.viewCount,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    seller: options.seller ?? null,
  };

  if (options.includePublishingHints) {
    response.publishing = {
      missingFields: listing.missingRequiredFields(),
      requiredTrustLevel: options.category?.minimumTrustLevel ?? null,
    };
  }
  return response;
}

export function toMessageResponse(message: MarketplaceMessage): MessageResponse {
  return {
    messageId: message.id,
    senderId: message.senderId,
    message: message.message,
    read: message.read,
    readAt: message.readAt?.toISOString() ?? null,
    sentAt: message.sentAt.toISOString(),
  };
}

export function toConversationResponse(
  conversation: MarketplaceConversation,
  listingTitle: string | null,
): ConversationResponse {
  return {
    conversationId: conversation.id,
    listingId: conversation.listingId,
    listingTitle,
    sellerId: conversation.sellerId,
    buyerId: conversation.buyerId,
    status: conversation.status,
    startedAt: conversation.startedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    closedAt: conversation.closedAt?.toISOString() ?? null,
    closedBy: conversation.closedBy,
    closeReason: conversation.closeReason,
  };
}
