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

/** IP-021 — solicitação de acesso/exclusão de dados (LGPD art. 18). */
export interface PrivacyRequest {
  id: string;
  type: 'DATA_EXPORT' | 'DATA_DELETION';
  status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  resultSummary: Record<string, number> | null;
  /** Só presente na resposta síncrona de criação de um DATA_EXPORT; nunca recuperável depois. */
  exportedData?: unknown;
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

// ── IP-003: pedidos de serviço (ServiceRequest) ─────────────────────────────
export interface ServiceRequest {
  serviceRequestId: string;
  memberId: string;
  title: string;
  description: string;
  category: string | null;
  categoryName: string | null;
  locationLabel: string;
  radiusKm: number | null;
  urgency: string;
  preferredDate: string | null;
  budgetMinAmount: number | null;
  budgetMaxAmount: number | null;
  currency: string;
  minimumTrustLevel: string | null;
  status: string;
  expiresAt: string;
  matchedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestSummary {
  serviceRequestId: string;
  title: string;
  category: string | null;
  locationLabel: string;
  urgency: string;
  status: string;
  createdAt: string;
}

// ── IP-003/IP-004: descoberta e comparação de propostas ────────────────────
export interface ServiceRequestMatch {
  listingId: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  categoryName: string | null;
  price: number | null;
  currency: string;
  location: string | null;
  imageUrl: string | null;
  partner: { identityId: string; trustScore: number | null; trustLevel: string | null };
  alreadyEngaged: boolean;
}

export interface ServiceRequestEngagement {
  serviceRequestId: string;
  listingId: string;
  partnerId: string;
  conversationId: string;
  engagedAt: string;
}

export interface OfferComparisonTerms {
  offerId: string;
  status: string;
  createdBy: string;
  pricingModel: string;
  currency: string;
  quantity: number;
  amount: number;
  estimatedTotalBasis: 'FIXED_TOTAL' | 'HOURLY_MINIMUM_COMMITMENT';
  hourlyRateAmount: number | null;
  minimumMinutes: number | null;
  billingIncrementMinutes: number | null;
  notes: string | null;
  expiresAt: string;
  createdAt: string;
  roundCount: number;
}

export interface ServiceRequestOfferComparisonItem {
  engagementId: string;
  listingId: string;
  listingTitle: string | null;
  partner: { identityId: string; trustScore: number | null; trustLevel: string | null };
  conversationId: string;
  conversationStatus: string | null;
  engagedAt: string;
  hasOffer: boolean;
  offer: OfferComparisonTerms | null;
}

export interface ServiceRequestOfferComparison {
  serviceRequestId: string;
  serviceRequestStatus: string;
  items: ServiceRequestOfferComparisonItem[];
}

// ── IP-005: status de deslocamento / ETA ────────────────────────────────────
export interface TravelStatus {
  orderId: string;
  status: string;
  declaredEtaMinutes: number | null;
  estimatedArrivalAt: string | null;
  etaSource: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
}

// ── PACK-03 / IP-006: Change Order, evidências e Service Summary ───────────
export interface ChangeOrderEvidence {
  evidenceId: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * Campos de economia interna do Partner (`trustFeeRateBps`, `changeTrustFeeAmount`,
 * `changeProviderNetBeforePspFees`) existem no DTO da API mas são OPCIONAIS e
 * só preenchidos para quem chama como Partner/admin. O frontend do Trust
 * Member nunca deve ler nem renderizar esses campos.
 */
export interface ChangeOrder {
  changeOrderId: string;
  orderId: string;
  proposedBy: string;
  type: string;
  status: string;
  currency: string;
  additionalMinutes: number | null;
  serviceDeltaAmount: number;
  materialCostDeltaAmount: number;
  materialMarkupDeltaAmount: number;
  changeGrossAmount: number;
  reason: string;
  description: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  evidences: ChangeOrderEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEvidence {
  evidenceId: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ServiceNote {
  noteId: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

export interface ServiceSummary {
  orderId: string;
  listingTitle: string | null;
  buyerId: string;
  sellerId: string;
  pricingModel: string;
  currency: string;
  status: string;
  initialAuthorizedAmount: number;
  approvedChangesAmount: number;
  currentAuthorizedGrossAmount: number;
  currentServiceAmount: number;
  currentMaterialCostAmount: number;
  currentMaterialMarkupAmount: number;
  amountInCustody: number;
  amountAuthorizedNotInCustody: number;
  approvedChangeOrders: ChangeOrder[];
  pendingChangeOrders: ChangeOrder[];
  rejectedChangeOrders: ChangeOrder[];
  customerConfirmedAt: string | null;
  completedAt: string | null;
}

// ── IP-007: pagamento / custódia incremental ────────────────────────────────
export interface IncrementalTranche {
  changeOrderId: string;
  incrementalAuthorizationId: string;
  amount: number;
  authorizationStatus: string;
  custodyStatus: string;
}

export interface CustodySummary {
  currency: string;
  originalAmount: number;
  originalCustodyStatus: string;
  totalCommerciallyAuthorized: number;
  totalHeld: number;
  amountAuthorizedNotInCustody: number;
  incrementalTranches: IncrementalTranche[];
}

export interface PaymentDetails {
  paymentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: string;
  refundedAmount: number;
  refundableAmount: number;
  paymentProviderId: string | null;
  createdAt: string;
  updatedAt: string;
  authorizations: Array<{
    authorizationId: string;
    status: string;
    authorizedAmount: number;
    authorizedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }>;
  refunds: Array<{ refundId: string; amount: number; status: string; requestedAt: string }>;
  custodySummary?: CustodySummary;
}
