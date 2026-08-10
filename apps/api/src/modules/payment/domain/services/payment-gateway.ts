import { Cents } from '../../../../shared/money/money';

/**
 * PORT do provedor de pagamento (PAY-ARCH-001).
 *
 * O domínio conhece SÓ esta interface — nunca um SDK, tipo ou constante de
 * gateway específico. Trocar de provedor é escrever um adapter novo; nenhuma
 * entidade, use case ou política muda.
 *
 * Regra do ADR §14: o adapter **não publica evento**. Ele devolve resultado ao
 * domínio, e o domínio decide o que publicar.
 */
export abstract class PaymentGateway {
  /** Identificador estável do provedor — vai para `payments.payment_provider_id`. */
  abstract readonly providerId: string;

  abstract authorize(request: AuthorizeRequest): Promise<AuthorizationResult>;
  abstract capture(request: CaptureRequest): Promise<CaptureResult>;
  abstract refund(request: RefundRequest): Promise<RefundResult>;
  abstract cancel(request: CancelRequest): Promise<CancelResult>;
  abstract getStatus(providerTransactionId: string): Promise<PaymentStatusResult>;
}

/**
 * Toda operação carrega chave de idempotência e correlation (ADR §9).
 * Repetir a chamada com a mesma chave NUNCA pode gerar segunda cobrança.
 */
export interface GatewayOperationContext {
  idempotencyKey: string;
  correlationId: string;
}

export interface AuthorizeRequest extends GatewayOperationContext {
  paymentId: string;
  amountCents: Cents;
  currency: string;
  /** Instrumento tokenizado pelo provedor — NUNCA PAN ou CVV (ADR §13). */
  paymentMethodToken: string | null;
}

export interface CaptureRequest extends GatewayOperationContext {
  providerTransactionId: string;
  amountCents: Cents;
}

export interface RefundRequest extends GatewayOperationContext {
  providerTransactionId: string;
  amountCents: Cents;
  reason: string;
}

export interface CancelRequest extends GatewayOperationContext {
  providerTransactionId: string;
}

export type GatewayOutcome = 'APPROVED' | 'DECLINED' | 'ERROR';

interface BaseResult {
  outcome: GatewayOutcome;
  providerTransactionId: string | null;
  /** Código do provedor (ex.: `insufficient_funds`) — usado em logs e suporte. */
  providerCode: string | null;
  message: string | null;
  /** Resposta crua já SANITIZADA (sem dado de cartão) para auditoria. */
  rawResponse: Record<string, unknown>;
}

export interface AuthorizationResult extends BaseResult {
  authorizationCode: string | null;
  authorizedAmountCents: Cents;
  expiresAt: Date | null;
}

export type CaptureResult = BaseResult;
export type CancelResult = BaseResult;

export interface RefundResult extends BaseResult {
  refundedAmountCents: Cents;
}

export interface PaymentStatusResult extends BaseResult {
  status: string;
}
