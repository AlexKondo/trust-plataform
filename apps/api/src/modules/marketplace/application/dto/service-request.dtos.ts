import { z } from 'zod';
import { URGENCY_LEVELS } from '../../domain/entities/marketplace-types';

const titleSchema = z.string().trim().min(5, 'title must have at least 5 characters').max(255);
const descriptionSchema = z
  .string()
  .trim()
  .min(20, 'description must have at least 20 characters')
  .max(5000);
const locationLabelSchema = z.string().trim().min(2).max(160);
const amountSchema = z
  .number()
  .positive('amount must be greater than zero')
  .max(9_999_999_999.99)
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) === value * 100, {
    message: 'amount must have at most 2 decimal places',
  });
const currencySchema = z
  .string()
  .trim()
  .length(3, 'currency must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());
const radiusSchema = z.coerce.number().int().positive().max(500);

/**
 * IP-003 — cria o pedido de serviço. Nasce completo e já OPEN (não existe
 * rascunho: este agregado nunca é publicamente navegável, ao contrário de
 * MarketplaceListing — só o próprio Member o lê).
 */
export const createServiceRequestRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    /** Código da categoria (ex.: `ELECTRICAL`) — mesmo vocabulário do MRK-001. */
    category: z.string().trim().min(2).max(60),
    locationLabel: locationLabelSchema,
    radiusKm: radiusSchema.optional(),
    urgency: z.enum(URGENCY_LEVELS).default('FLEXIBLE'),
    preferredDate: z.coerce.date().optional(),
    budgetMinAmount: amountSchema.optional(),
    budgetMaxAmount: amountSchema.optional(),
    currency: currencySchema.optional(),
    minimumTrustLevel: z.string().trim().min(3).max(30).optional(),
  })
  .refine(
    (body) =>
      body.budgetMinAmount === undefined ||
      body.budgetMaxAmount === undefined ||
      body.budgetMinAmount <= body.budgetMaxAmount,
    { message: 'budgetMinAmount cannot be greater than budgetMaxAmount', path: ['budgetMinAmount'] },
  );
export type CreateServiceRequestRequest = z.infer<typeof createServiceRequestRequestSchema>;

export const engageServiceRequestRequestSchema = z.object({
  listingId: z.string().uuid('listingId must be a valid UUID'),
  message: z.string().trim().min(1, 'message is required').max(2000),
});
export type EngageServiceRequestRequest = z.infer<typeof engageServiceRequestRequestSchema>;

export const closeServiceRequestRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CloseServiceRequestRequest = z.infer<typeof closeServiceRequestRequestSchema>;

export const cancelServiceRequestRequestSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(500),
});
export type CancelServiceRequestRequest = z.infer<typeof cancelServiceRequestRequestSchema>;

export const discoverMatchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
});
export type DiscoverMatchesQuery = z.infer<typeof discoverMatchesQuerySchema>;

// ── Respostas ───────────────────────────────────────────────────────────────

/**
 * Visão do DONO (privada, IP-003 §privacidade): tudo que o Member declarou,
 * incluindo `locationLabel`/`radiusKm` como ele mesmo escreveu. Nunca é
 * retornada para outro identityId que não seja `memberId` — não existe
 * endpoint/rota que exponha este shape a um Partner (ver §11 do Completion
 * Report: descoberta é sempre iniciada pelo Member, nunca o inverso).
 */
export interface ServiceRequestResponse {
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

export interface ServiceRequestSummaryResponse {
  serviceRequestId: string;
  title: string;
  category: string | null;
  locationLabel: string;
  urgency: string;
  status: string;
  createdAt: string;
}

/**
 * Um candidato elegível — reaproveita EXATAMENTE o shape de `ListingSummaryResponse`
 * (MRK-004): "eligible Partner" nesta IP é "Partner com anúncio PUBLISHED que
 * bate categoria/localização/nível mínimo do pedido", não uma entidade nova.
 */
export interface ServiceRequestMatchResponse {
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

export interface ServiceRequestEngagementResponse {
  serviceRequestId: string;
  listingId: string;
  partnerId: string;
  conversationId: string;
  engagedAt: string;
}

// ── Competitive Quotes & Comparison Map (IP-004) ────────────────────────────

/**
 * Termos normalizados da proposta viva de uma negociação, para comparação
 * lado a lado. `amount` é sempre o valor LITERAL da proposta (MRK-009/PACK-02):
 * para FIXED_PRICE é o total fechado; para HOURLY é o valor MÍNIMO contratado
 * (`hourlyRateAmount × minimumMinutes`, já derivado pelo domínio — ver
 * `hourly-pricing.service.ts`), nunca um total "equivalente" inventado por
 * esta IP. `estimatedTotalBasis` é o rótulo explícito que distingue os dois
 * significados — nenhum dos dois é silenciosamente convertido no outro. Tempo
 * além de `minimumMinutes` só se torna dinheiro através de um Trust Change
 * Order aprovado (PACK-03), nunca automaticamente aqui.
 */
export interface OfferComparisonTerms {
  offerId: string;
  /** Status efetivo (`MarketplaceOffer.effectiveStatus`) — PENDING vencida já aparece como EXPIRED. */
  status: string;
  createdBy: string;
  /** FIXED_PRICE | HOURLY — nunca traduzido/convertido entre si. */
  pricingModel: string;
  currency: string;
  quantity: number;
  /** Valor literal da proposta — ver comentário da interface. */
  amount: number;
  /** FIXED_TOTAL (amount = total fechado) | HOURLY_MINIMUM_COMMITMENT (amount = mínimo contratado, não um teto). */
  estimatedTotalBasis: 'FIXED_TOTAL' | 'HOURLY_MINIMUM_COMMITMENT';
  hourlyRateAmount: number | null;
  minimumMinutes: number | null;
  billingIncrementMinutes: number | null;
  notes: string | null;
  expiresAt: string;
  createdAt: string;
  /** Quantas rodadas (proposta + contrapropostas) essa negociação já teve — sinal de transparência, não ranking. */
  roundCount: number;
}

/**
 * Um Partner engajado neste pedido, com a proposta viva (se houver) da sua
 * própria negociação (conversa). Cada Partner tem sua PRÓPRIA conversa/cadeia
 * de ofertas (`ServiceRequestEngagement`, IP-003) — esta IP não funde nem
 * reordena essas negociações, só as lista lado a lado. Sem ranking oculto e
 * sem vencedor automático (IP-004 §4): a ordem é sempre por `engagedAt`
 * (ordem de contato), nunca por preço/score.
 */
export interface ServiceRequestOfferComparisonItem {
  engagementId: string;
  listingId: string;
  listingTitle: string | null;
  partner: { identityId: string; trustScore: number | null; trustLevel: string | null };
  conversationId: string;
  /** OPEN | CLOSED — sinal de disponibilidade/condição comercial (conversa encerrada = negociação não segue). */
  conversationStatus: string | null;
  engagedAt: string;
  /** false quando o Partner foi engajado mas ainda não existe proposta na conversa (MRK-009: quem abre é o comprador/Member). */
  hasOffer: boolean;
  offer: OfferComparisonTerms | null;
}

export interface ServiceRequestOfferComparisonResponse {
  serviceRequestId: string;
  serviceRequestStatus: string;
  items: ServiceRequestOfferComparisonItem[];
}
