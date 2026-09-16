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

/** IP-007 — uma tranche incremental (Change Order aprovado) e seu status. */
export interface IncrementalTrancheResponse {
  changeOrderId: string;
  incrementalAuthorizationId: string;
  amount: number;
  authorizationStatus: string;
  /** null quando a autorização foi recusada/errou — nunca chegou a existir custódia. */
  custodyStatus: string | null;
}

/**
 * IP-007 — resolve o gap `amountAuthorizedNotInCustody` (PACK-03 §9.1): agora
 * é um valor computado e exposto aqui, não só no Service Summary do
 * Marketplace (que continua mostrando o corte comercial-only, sem saber se o
 * delta foi de fato custodiado — ver Completion Report §16 para a razão).
 */
export interface CustodySummaryResponse {
  currency: string;
  originalAmount: number;
  originalCustodyStatus: string | null;
  totalCommerciallyAuthorized: number;
  totalHeld: number;
  amountAuthorizedNotInCustody: number;
  incrementalTranches: IncrementalTrancheResponse[];
}

export interface PaymentDetailsResponse extends PaymentResponse {
  authorizations: AuthorizationAttemptResponse[];
  /** IP-007 — omitido quando o pedido não tem nenhum Change Order aprovado. */
  custodySummary?: CustodySummaryResponse;
}

/** Resultado da tentativa de pagar — o front usa `authorized` para decidir a tela. */
export interface AuthorizePaymentResponse {
  authorized: boolean;
  payment: PaymentResponse;
  authorization: AuthorizationAttemptResponse;
  /** true quando a chave de idempotência já tinha sido usada (nada foi cobrado de novo). */
  replayed: boolean;
}
