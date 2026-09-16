import { z } from 'zod';
import { DECISION_TYPES, DISPUTE_CATEGORIES } from '../../domain/entities/marketplace-dispute';
import { REVIEW_CRITERIA } from '../../domain/entities/marketplace-review';

/** MRK-023 BR-003 — categoria e descrição são obrigatórias. */
export const openDisputeRequestSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES, {
    errorMap: () => ({ message: `category must be one of: ${DISPUTE_CATEGORIES.join(', ')}` }),
  }),
  description: z.string().trim().min(20, 'description must have at least 20 characters').max(5000),
});
export type OpenDisputeRequest = z.infer<typeof openDisputeRequestSchema>;

/**
 * MRK-024 BR-003 — tipo e fundamentação obrigatórios.
 *
 * IP-008 — `refundAmount` é OPCIONAL e em reais: a consequência financeira
 * explícita da decisão, digitada pelo administrador (nunca calculada de
 * `decisionType`, ver comentário de `DisputeDecision.create`). Omitido/zero
 * significa "esta decisão não movimenta dinheiro".
 */
export const resolveDisputeRequestSchema = z.object({
  decisionType: z.enum(DECISION_TYPES, {
    errorMap: () => ({ message: `decisionType must be one of: ${DECISION_TYPES.join(', ')}` }),
  }),
  justification: z
    .string()
    .trim()
    .min(10, 'justification must have at least 10 characters')
    .max(5000),
  refundAmount: z.number().finite().nonnegative().optional(),
});
export type ResolveDisputeRequest = z.infer<typeof resolveDisputeRequestSchema>;

const criterionScore = z.number().int().min(1).max(5);

/** MRK-025 — só `overallScore` é obrigatório (BR-004); o resto é opcional (BR-005). */
export const createReviewRequestSchema = z.object({
  overallScore: criterionScore,
  recommended: z.boolean().optional(),
  comment: z.string().trim().max(2000).optional(),
  scores: z
    .object(Object.fromEntries(REVIEW_CRITERIA.map((c) => [c, criterionScore.optional()])) as Record<
      (typeof REVIEW_CRITERIA)[number],
      z.ZodOptional<typeof criterionScore>
    >)
    .optional(),
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

// ── Respostas ───────────────────────────────────────────────────────────────

export interface DisputeDecisionResponse {
  decisionId: string;
  decidedBy: string;
  decisionType: string;
  justification: string;
  /** IP-008 — reais; `null` quando a decisão não envolve reembolso. */
  refundAmount: number | null;
  decidedAt: string;
}

export interface DisputeResponse {
  disputeId: string;
  orderId: string;
  openedBy: string;
  category: string;
  description: string;
  status: string;
  openedAt: string;
  decision: DisputeDecisionResponse | null;
}

export interface ReviewResponse {
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

/** Reputação transacional consolidada — complementa o Trust Score no perfil. */
export interface ReviewSummaryResponse {
  totalReviews: number;
  averageScore: number | null;
  recommendationRate: number | null;
}
