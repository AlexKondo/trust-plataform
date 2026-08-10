import { toReais } from '../../../../shared/money/money';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { Payment } from '../../domain/entities/payment';
import { AuthorizationAttemptResponse, PaymentResponse } from '../dto/payment.dtos';

export function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    buyerId: payment.buyerId,
    sellerId: payment.sellerId,
    // Centavos só existem dentro do domínio; a API fala reais.
    amount: toReais(payment.amountCents),
    currency: payment.currency,
    status: payment.status,
    refundedAmount: toReais(payment.refundedCents),
    refundableAmount: toReais(payment.refundableCents),
    paymentProviderId: payment.paymentProviderId,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export function toAuthorizationResponse(
  authorization: PaymentAuthorization,
): AuthorizationAttemptResponse {
  return {
    authorizationId: authorization.id,
    status: authorization.status,
    providerId: authorization.providerId,
    providerCode: authorization.providerCode,
    message: authorization.message,
    authorizedAmount: toReais(authorization.authorizedAmountCents),
    authorizedAt: authorization.authorizedAt?.toISOString() ?? null,
    expiresAt: authorization.expiresAt?.toISOString() ?? null,
    createdAt: authorization.createdAt.toISOString(),
  };
}
