/** Contratos da API consumidos pelo frontend (espelham docs/openapi.yaml). */

// ── Trust Passport (TPS) ────────────────────────────────────────────────────
export interface TrustPassport {
  trustPassportId: string;
  status: string;
  profileCompletion: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  documentVerified: boolean;
  addressVerified: boolean;
  /** A API devolve o perfil ACHATADO — `phone` e `address` no topo. */
  phone: string | null;
  address: { country: string; state: string; city: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ── Verificações (VRF) ──────────────────────────────────────────────────────
export const VERIFICATION_TYPES = [
  'DOCUMENT',
  'ADDRESS',
  'PHONE',
  'EMAIL',
  'BANK_ACCOUNT',
  'BUSINESS',
  'BIOMETRIC',
] as const;

export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export interface Verification {
  verificationId: string;
  type: string;
  status: string;
  currentAttempt: number;
  createdAt: string;
  updatedAt: string;
  evidences: Array<{ id: string; type: string; fileName: string; uploadedAt: string }>;
  decision: {
    decision: string;
    reasonCode: string | null;
    comments: string | null;
    decidedAt: string;
  } | null;
}

// ── Trust Score (TRS) ───────────────────────────────────────────────────────
export interface TrustScore {
  trustPassportId: string;
  score: number;
  level: string;
  calculatedAt: string;
}

export interface TrustEventEntry {
  eventName: string;
  points: number;
  occurredAt: string;
  description?: string | null;
}

export interface TrustBadge {
  code: string;
  name: string;
  description: string;
  badgeType: string;
  awardedAt: string;
}

export interface TrustBenefit {
  name: string;
  description: string;
  eligible: boolean;
}

export interface VisibilityPolicy {
  showScore: boolean;
  showLevel: boolean;
  showBadges: boolean;
  showVerifications: boolean;
}

export interface TrustProfile {
  view: 'PRIVATE_VIEW' | 'PUBLIC_VIEW';
  displayName: string;
  level: string | null;
  score: number | null;
  profileCompletion: number;
  verifications: {
    emailVerified: boolean;
    phoneVerified: boolean;
    documentVerified: boolean;
    addressVerified: boolean;
  } | null;
  badges: TrustBadge[] | null;
  memberSince: string;
}

export interface ProfileShare {
  shareId: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

// ── Marketplace: anúncios ───────────────────────────────────────────────────
export interface MarketplaceCategory {
  code: string;
  name: string;
  description: string | null;
  minimumTrustLevel: string | null;
  minimumScore: number;
}

export interface ListingSummary {
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

export interface OwnerListingSummary extends ListingSummary {
  status: string;
  missingFields: string[];
}

export interface SellerSummary {
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

export interface Listing {
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
  seller: SellerSummary | null;
  publishing?: { missingFields: string[]; requiredTrustLevel: string | null };
}

// ── Marketplace: conversas ──────────────────────────────────────────────────
export interface ConversationSummary {
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

export interface Conversation {
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

export interface Message {
  messageId: string;
  senderId: string;
  message: string;
  read: boolean;
  readAt: string | null;
  sentAt: string;
}

// ── Marketplace: propostas ──────────────────────────────────────────────────
export interface Offer {
  offerId: string;
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdBy: string;
  recipientId: string;
  parentOfferId: string | null;
  amount: number;
  currency: string;
  quantity: number;
  status: string;
  expiresAt: string;
  notes: string | null;
  withdrawReason: string | null;
  rejectReason: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Marketplace: pedidos ────────────────────────────────────────────────────
export interface Order {
  orderId: string;
  listingId: string;
  offerId: string;
  conversationId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  quantity: number;
  status: string;
  nextAction: string;
  startedAt: string | null;
  completedAt: string | null;
  actualDuration: number | null;
  customerConfirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetails extends Order {
  listingTitle: string | null;
  scheduling: {
    schedulingId: string;
    scheduledStart: string;
    scheduledEnd: string;
    estimatedDuration: number;
    timezone: string;
    status: string;
  } | null;
  timeline: Array<{
    type: string;
    occurredAt: string;
    performedBy: string | null;
    detail: string | null;
  }>;
}

// ── Marketplace: disputas e avaliações ──────────────────────────────────────
export interface Dispute {
  disputeId: string;
  orderId: string;
  openedBy: string;
  category: string;
  description: string;
  status: string;
  openedAt: string;
  decision: {
    decisionId: string;
    decidedBy: string;
    decisionType: string;
    justification: string;
    decidedAt: string;
  } | null;
}

export interface Review {
  reviewId: string;
  orderId: string;
  reviewerId: string;
  reviewedUserId: string;
  overallScore: number;
  recommended: boolean | null;
  comment: string | null;
  scores: Record<string, number>;
  createdAt: string;
}

export interface ReviewSummary {
  totalReviews: number;
  averageScore: number | null;
  recommendationRate: number | null;
}

export interface ReviewCatalog {
  disputeCategories: string[];
  decisionTypes: string[];
  reviewCriteria: string[];
}
