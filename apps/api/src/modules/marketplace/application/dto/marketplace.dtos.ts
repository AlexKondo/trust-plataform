import { z } from 'zod';
import { LISTING_TYPES, SEARCH_SORT, SEARCH_SORTS } from '../../domain/entities/marketplace-types';

export interface RequestMeta {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const titleSchema = z.string().trim().min(5, 'title must have at least 5 characters').max(255);
const descriptionSchema = z.string().trim().min(20, 'description must have at least 20 characters').max(5000);
const priceSchema = z
  .number()
  .positive('price must be greater than zero')
  .max(9_999_999_999.99)
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) === value * 100, {
    message: 'price must have at most 2 decimal places',
  });
const currencySchema = z
  .string()
  .trim()
  .length(3, 'currency must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());
const locationSchema = z.string().trim().min(2).max(160);
const imagesSchema = z
  .array(z.string().trim().url('each image must be a valid URL').max(1000))
  .max(10, 'a listing accepts at most 10 images');

/**
 * MRK-001 — só o título é exigido na criação: o rascunho pode nascer incompleto
 * (BR-004) e a obrigatoriedade do BR-002 é cobrada na publicação (MRK-003
 * BR-003). Ver INCONSISTENCIAS #29.
 */
export const createListingRequestSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  /** Código da categoria (ex.: `ELECTRICAL`) — mais estável que o UUID na UI. */
  category: z.string().trim().min(2).max(60).optional(),
  price: priceSchema.optional(),
  currency: currencySchema.optional(),
  location: locationSchema.optional(),
  images: imagesSchema.optional(),
});
export type CreateListingRequest = z.infer<typeof createListingRequestSchema>;

/** MRK-002 — atualização parcial; id, dono e status jamais entram aqui (BR-002/003). */
export const updateListingRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    listingType: z.enum(LISTING_TYPES),
    category: z.string().trim().min(2).max(60),
    price: priceSchema,
    currency: currencySchema,
    location: locationSchema,
    images: imagesSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field must be provided',
  });
export type UpdateListingRequest = z.infer<typeof updateListingRequestSchema>;

export const searchListingsQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).optional(),
  category: z.string().trim().min(2).max(60).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  currency: currencySchema.optional(),
  location: z.string().trim().min(2).max(160).optional(),
  minimumTrustLevel: z.string().trim().min(3).max(30).optional(),
  sort: z.enum(SEARCH_SORTS).default(SEARCH_SORT.RELEVANCE),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchListingsQuery = z.infer<typeof searchListingsQuerySchema>;

export const contactListingOwnerRequestSchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(2000),
});
export type ContactListingOwnerRequest = z.infer<typeof contactListingOwnerRequestSchema>;

export const sendMessageRequestSchema = contactListingOwnerRequestSchema;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const closeConversationRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CloseConversationRequest = z.infer<typeof closeConversationRequestSchema>;

export const paginationQuerySchema = z.coerce.number().int().min(1).optional();

// ── Respostas ───────────────────────────────────────────────────────────────

export interface ListingSummaryResponse {
  listingId: string;
  title: string;
  excerpt: string | null;
  listingType: string | null;
  category: string | null;
  categoryName: string | null;
  price: number | null;
  currency: string;
  location: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  seller: { trustScore: number | null; trustLevel: string | null };
}

/** Vitrine do dono: mostra status e o que falta para publicar (MRK-001..003). */
export interface OwnerListingSummaryResponse extends ListingSummaryResponse {
  status: string;
  missingFields: string[];
}

export interface SellerSummaryResponse {
  displayName: string;
  trustLevel: string | null;
  trustScore: number | null;
  badges: Array<{ code: string; name: string }> | null;
  verifications: {
    emailVerified: boolean;
    phoneVerified: boolean;
    documentVerified: boolean;
    addressVerified: boolean;
  } | null;
  memberSince: string;
}

export interface ListingResponse {
  listingId: string;
  ownerId: string;
  title: string;
  description: string | null;
  listingType: string | null;
  category: string | null;
  categoryName: string | null;
  price: number | null;
  currency: string;
  location: string | null;
  status: string;
  images: string[];
  viewCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente apenas na visão pública (MRK-005); null na visão do dono. */
  seller: SellerSummaryResponse | null;
  /** Requisitos da categoria e pendências — visão do dono (MRK-003). */
  publishing?: { missingFields: string[]; requiredTrustLevel: string | null };
}

export interface MessageResponse {
  messageId: string;
  senderId: string;
  message: string;
  read: boolean;
  readAt: string | null;
  sentAt: string;
}

export interface ConversationSummaryResponse {
  conversationId: string;
  listingId: string;
  listingTitle: string;
  counterpartName: string;
  status: string;
  startedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface ConversationResponse {
  conversationId: string;
  listingId: string;
  listingTitle: string | null;
  sellerId: string;
  buyerId: string;
  status: string;
  startedAt: string;
  lastMessageAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
}
