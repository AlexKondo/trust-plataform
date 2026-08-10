import { z } from 'zod';
import { OrderResponse } from './marketplace-order.dtos';

const amountSchema = z
  .number()
  .positive('amount must be greater than zero')
  .max(9_999_999_999.99)
  .refine((value) => Math.round(value * 100) === value * 100, {
    message: 'amount must have at most 2 decimal places',
  });

const quantitySchema = z.number().positive('quantity must be greater than zero').max(9_999_999);

const expiresAtSchema = z.coerce.date().refine((value) => value.getTime() > Date.now(), {
  message: 'expiresAt must be in the future',
});

const notesSchema = z.string().trim().max(2000);

/** MRK-009 — proposta do comprador. A moeda vem do anúncio quando omitida. */
export const createOfferRequestSchema = z.object({
  amount: amountSchema,
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  quantity: quantitySchema.default(1),
  expiresAt: expiresAtSchema,
  notes: notesSchema.optional(),
});
export type CreateOfferRequest = z.infer<typeof createOfferRequestSchema>;

/** MRK-010 BR-004 — só valor, quantidade, validade e observações mudam. */
export const updateOfferRequestSchema = z
  .object({
    amount: amountSchema,
    quantity: quantitySchema,
    expiresAt: expiresAtSchema,
    notes: notesSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field must be provided',
  });
export type UpdateOfferRequest = z.infer<typeof updateOfferRequestSchema>;

/** MRK-012 — contraoferta: mesmos termos, sem moeda (herda a da negociação). */
export const counterOfferRequestSchema = z.object({
  amount: amountSchema,
  quantity: quantitySchema.optional(),
  expiresAt: expiresAtSchema,
  notes: notesSchema.optional(),
});
export type CounterOfferRequest = z.infer<typeof counterOfferRequestSchema>;

export const offerReasonRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type OfferReasonRequest = z.infer<typeof offerReasonRequestSchema>;

// ── Respostas ───────────────────────────────────────────────────────────────

export interface OfferResponse {
  offerId: string;
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdBy: string;
  /** Quem deve decidir esta proposta (o outro lado de quem propôs). */
  recipientId: string;
  parentOfferId: string | null;
  amount: number;
  currency: string;
  quantity: number;
  /** Status efetivo: PENDING vencido é apresentado como EXPIRED. */
  status: string;
  expiresAt: string;
  notes: string | null;
  withdrawReason: string | null;
  rejectReason: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** MRK-013 — o aceite devolve os três efeitos da mesma transação. */
export interface AcceptOfferResponse {
  offer: OfferResponse;
  order: OrderResponse;
  listingStatus: string;
  closedOfferIds: string[];
}
