import { z } from 'zod';

export interface RequestMeta {
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * PAY-002 — o instrumento vem TOKENIZADO pelo provedor. A API nunca recebe
 * número de cartão nem CVV (PAY-ARCH-001 §13); se receber, é bug de frontend.
 */
export const authorizePaymentRequestSchema = z.object({
  paymentMethodToken: z.string().trim().min(4).max(200).optional(),
});
export type AuthorizePaymentRequest = z.infer<typeof authorizePaymentRequestSchema>;

export const paginationQuerySchema = z.coerce.number().int().min(1).optional();

export interface AuthorizationAttemptResponse {
  authorizationId: string;
  status: string;
  providerId: string;
  providerCode: string | null;
  message: string | null;
  authorizedAmount: number;
  authorizedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PaymentResponse {
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
}

export interface PaymentDetailsResponse extends PaymentResponse {
  authorizations: AuthorizationAttemptResponse[];
}

/** Resultado da tentativa de pagar — o front usa `authorized` para decidir a tela. */
export interface AuthorizePaymentResponse {
  authorized: boolean;
  payment: PaymentResponse;
  authorization: AuthorizationAttemptResponse;
  /** true quando a chave de idempotência já tinha sido usada (nada foi cobrado de novo). */
  replayed: boolean;
}
