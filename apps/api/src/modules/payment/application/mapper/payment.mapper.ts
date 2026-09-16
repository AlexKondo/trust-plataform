import { toReais } from '../../../../shared/money/money';
import { PaymentAuthorization } from '../../domain/entities/payment-authorization';
import { Payment } from '../../domain/entities/payment';
import { FundsRefund } from '../../domain/entities/funds-refund';
import { PaymentCustodySummary } from '../../domain/services/payment-custody-summary.service';
import {
  AuthorizationAttemptResponse,
  CustodySummaryResponse,
  PaymentResponse,
  RefundResponse,
} from '../dto/payment.dtos';

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

export function toCustodySummaryResponse(summary: PaymentCustodySummary): CustodySummaryResponse {
  return {
    currency: summary.currency,
    originalAmount: toReais(summary.originalAmountCents),
    originalCustodyStatus: summary.originalCustodyStatus,
    totalCommerciallyAuthorized: toReais(summary.totalCommerciallyAuthorizedCents),
    totalHeld: toReais(summary.totalHeldCents),
    amountAuthorizedNotInCustody: toReais(summary.amountAuthorizedNotInCustodyCents),
    incrementalTranches: summary.incrementalTranches.map((tranche) => ({
      changeOrderId: tranche.changeOrderId,
      incrementalAuthorizationId: tranche.incrementalAuthorizationId,
      amount: toReais(tranche.amountCents),
      authorizationStatus: tranche.authorizationStatus,
      custodyStatus: tranche.custodyStatus,
    })),
  };
}

export function toRefundResponse(refund: FundsRefund): RefundResponse {
  return {
    refundId: refund.id,
    amount: toReais(refund.amountCents),
    currency: refund.currency,
    reason: refund.reason,
    reasonDetail: refund.reasonDetail,
    requestedBy: refund.requestedBy,
    disputeId: refund.disputeId,
    status: refund.status,
    providerRefundId: refund.providerRefundId,
    requestedAt: refund.requestedAt.toISOString(),
    completedAt: refund.completedAt?.toISOString() ?? null,
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
