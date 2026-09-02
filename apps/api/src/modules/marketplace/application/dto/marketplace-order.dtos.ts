import { z } from 'zod';

/** MRK-019 — janela de agendamento. O fim previsto é derivado, nunca informado. */
export const scheduleOrderRequestSchema = z.object({
  scheduledStart: z.coerce.date().refine((value) => value.getTime() > Date.now(), {
    message: 'scheduledStart must be in the future',
  }),
  /** Minutos previstos (BR-002); a sugestão da IA é informativa (BR-003). */
  estimatedDuration: z.number().int().min(15).max(1440),
  timezone: z.string().trim().min(3).max(50).default('America/Sao_Paulo'),
});
export type ScheduleOrderRequest = z.infer<typeof scheduleOrderRequestSchema>;

/**
 * MRK-020/021 — evidências do check-in/check-out. Tudo opcional: a
 * geolocalização informa, mas nunca bloqueia a execução (MRK-020 BR-004).
 * Fotos e vídeos ficam no futuro módulo de Evidências.
 */
export const executionEvidenceSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().max(999999).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ExecutionEvidenceRequest = z.infer<typeof executionEvidenceSchema>;

export const confirmOrderRequestSchema = z.object({
  comments: z.string().trim().max(2000).optional(),
});
export type ConfirmOrderRequest = z.infer<typeof confirmOrderRequestSchema>;

/** MRK-018 BR-003 — o motivo do cancelamento é obrigatório. */
export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().min(3, 'reason is required').max(500),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;

// ── Respostas ───────────────────────────────────────────────────────────────

export interface OrderResponse {
  orderId: string;
  listingId: string;
  offerId: string;
  conversationId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  quantity: number;
  /** PACK-02 §4 — copiado do offer aceito; imutável. */
  pricingModel: string;
  hourlyRateAmount: number | null;
  minimumMinutes: number | null;
  billingIncrementMinutes: number | null;
  status: string;
  /** O que a plataforma espera agora (MRK-016 BR-004). */
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

export interface SchedulingResponse {
  schedulingId: string;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedDuration: number;
  timezone: string;
  status: string;
}

export interface OrderTimelineEntry {
  type: string;
  occurredAt: string;
  performedBy: string | null;
  detail: string | null;
}

/** MRK-016 — visão consolidada: pedido + agenda + linha do tempo. */
export interface OrderDetailsResponse extends OrderResponse {
  listingTitle: string | null;
  scheduling: SchedulingResponse | null;
  timeline: OrderTimelineEntry[];
}
