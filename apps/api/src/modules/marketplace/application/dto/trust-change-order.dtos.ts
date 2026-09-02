import { z } from 'zod';
import {
  CHANGE_ORDER_TYPES,
  CHANGE_ORDER_EVIDENCE_TYPES,
  PAUSE_REASON_CODES,
} from '../../domain/entities/marketplace-types';

/** Valor monetário na fronteira: reais com no máximo 2 casas (trust-payments §1). */
const moneyAmount = z
  .number()
  .nonnegative()
  .max(9_999_999)
  .refine((value) => Number.isInteger(Math.round(value * 100)), {
    message: 'amount must have at most 2 decimal places',
  });

/**
 * PACK-03 §7 — criação do Change Order.
 *
 * `serviceDelta` NÃO é aceito em ADDITIONAL_TIME: ali o valor é derivado da
 * taxa/hora congelada no contrato (§7.1). Quem tentar mandar recebe 422 do
 * agregado, não uma cobrança silenciosa.
 */
export const createChangeOrderRequestSchema = z.object({
  type: z.enum(CHANGE_ORDER_TYPES),
  additionalMinutes: z.number().int().positive().max(1440).optional(),
  serviceDeltaAmount: moneyAmount.optional(),
  materialCostDeltaAmount: moneyAmount.optional(),
  materialMarkupDeltaAmount: moneyAmount.optional(),
  reason: z.string().trim().min(3, 'reason is required').max(1000),
  description: z.string().trim().max(2000).optional(),
  /** Sem job de expiração: a data é avaliada na leitura e na decisão (#33). */
  expiresAt: z.coerce.date().optional(),
});
export type CreateChangeOrderRequest = z.infer<typeof createChangeOrderRequestSchema>;

export const rejectChangeOrderRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});
export type RejectChangeOrderRequest = z.infer<typeof rejectChangeOrderRequestSchema>;

/** §10.2 — pausa não faturável; motivo obrigatório, nota opcional. */
export const pauseExecutionRequestSchema = z.object({
  reasonCode: z.enum(PAUSE_REASON_CODES),
  note: z.string().trim().max(500).optional(),
});
export type PauseExecutionRequest = z.infer<typeof pauseExecutionRequestSchema>;

export const changeOrderEvidenceTypeSchema = z.enum(CHANGE_ORDER_EVIDENCE_TYPES);

/** §13 — mesmos tipos aceitos pelas evidências de verificação (VRF-002 BR-003). */
export const ALLOWED_CHANGE_ORDER_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

// ── Respostas ───────────────────────────────────────────────────────────────

export interface ChangeOrderEvidenceResponse {
  evidenceId: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ChangeOrderResponse {
  changeOrderId: string;
  orderId: string;
  proposedBy: string;
  type: string;
  /** Já considera a expiração derivada (§6.1). */
  status: string;
  currency: string;
  additionalMinutes: number | null;
  serviceDeltaAmount: number;
  /** Pass-through: 0% de Trust Fee (§7.3). */
  materialCostDeltaAmount: number;
  materialMarkupDeltaAmount: number;
  changeGrossAmount: number;
  /** Só aparece para o Trust Partner e para o admin (§15). */
  trustFeeRateBps?: number;
  changeTrustFeeBaseAmount?: number;
  changeTrustFeeAmount?: number;
  changeProviderNetBeforePspFees?: number;
  reason: string;
  description: string | null;
  expiresAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  evidences: ChangeOrderEvidenceResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionPauseResponse {
  pauseId: string;
  reasonCode: string;
  note: string | null;
  pausedAt: string;
  resumedAt: string | null;
  durationMinutes: number | null;
}

export interface ExecutionSessionResponse {
  sessionId: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Decorrido, pausado e ativo são coisas diferentes (§11). */
  elapsedMinutes: number | null;
  pausedMinutes: number;
  rawActiveMinutes: number | null;
  /** Presença não é automaticamente faturável (§11) — pode ser menor que o ativo. */
  billableMinutes: number | null;
  authorizedMinutes: number | null;
  pauses: ExecutionPauseResponse[];
}

/**
 * PACK-03 §15 — Service Summary. O princípio é o da última seção: o Member tem
 * que ver "o que contratei + o que aprovei depois = o total".
 */
export interface ServiceSummaryResponse {
  orderId: string;
  listingTitle: string | null;
  buyerId: string;
  sellerId: string;
  pricingModel: string;
  currency: string;
  status: string;
  execution: ExecutionSessionResponse | null;
  initialAuthorizedAmount: number;
  approvedChangesAmount: number;
  currentAuthorizedGrossAmount: number;
  currentServiceAmount: number;
  currentMaterialCostAmount: number;
  currentMaterialMarkupAmount: number;
  /**
   * PACK-03 §9 — a custódia do PACK-01 congela o valor da contratação. O que os
   * Change Orders aprovaram está autorizado mas NÃO custodiado; a cobrança
   * desse saldo depende do provedor real (PACK-05).
   */
  amountInCustody: number;
  amountAuthorizedNotInCustody: number;
  /** Só para o Trust Partner e admin (§15) — o Member não vê economia interna. */
  currentTrustFeeAmount?: number;
  currentProviderNetBeforePspFees?: number;
  approvedChangeOrders: ChangeOrderResponse[];
  pendingChangeOrders: ChangeOrderResponse[];
  rejectedChangeOrders: ChangeOrderResponse[];
  customerConfirmedAt: string | null;
  completedAt: string | null;
}
