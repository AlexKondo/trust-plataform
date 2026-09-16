import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { PaymentNotFoundException } from '../../domain/exceptions/payment.exceptions';
import { FundsRefundRepository } from '../../domain/repositories/funds-refund.repository';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { ChangeOrderCommercialQuery } from '../../domain/services/change-order-commercial.query';
import { calculatePaymentCustodySummary } from '../../domain/services/payment-custody-summary.service';
import { PaymentDetailsResponse, PaymentResponse } from '../dto/payment.dtos';
import {
  toAuthorizationResponse,
  toCustodySummaryResponse,
  toPaymentResponse,
  toRefundResponse,
} from '../mapper/payment.mapper';

/** Consulta do pagamento — só comprador e vendedor enxergam. */
@Injectable()
export class GetPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
    private readonly custodyRepository: TrustCustodyRepository,
    private readonly incrementalAuthorizationRepository: PaymentIncrementalAuthorizationRepository,
    private readonly incrementalCustodyRepository: IncrementalTrustCustodyRepository,
    private readonly refundRepository: FundsRefundRepository,
    private readonly changeOrderQuery: ChangeOrderCommercialQuery,
  ) {}

  async listMine(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<PaymentResponse>> {
    const { items, totalItems } = await this.paymentRepository.listForParticipant(
      identityId,
      page,
      pageSize,
    );
    return PaginatedResult.of(items.map(toPaymentResponse), page, pageSize, totalItems);
  }

  async get(identityId: string, paymentId: string): Promise<PaymentDetailsResponse> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new PaymentNotFoundException();
    }
    payment.assertParticipant(identityId);
    const [authorizations, refunds] = await Promise.all([
      this.authorizationRepository.listByPayment(paymentId),
      this.refundRepository.listByPayment(paymentId),
    ]);

    // IP-007 — resumo de custódia (§custody-mismatch): só busca as tranches
    // incrementais quando existe pelo menos uma autorização incremental para
    // este Payment, para não pagar 4 queries extras em todo pedido comum
    // (a grande maioria, sem Change Order aprovado nenhum).
    const incrementalAuthorizations =
      await this.incrementalAuthorizationRepository.listByPayment(paymentId);
    let custodySummary: PaymentDetailsResponse['custodySummary'];
    if (incrementalAuthorizations.length > 0) {
      const [originalCustody, incrementalCustodies, approvedChangeGrossCents] = await Promise.all([
        this.custodyRepository.findByPaymentId(paymentId),
        this.incrementalCustodyRepository.listByPaymentId(paymentId),
        this.changeOrderQuery.sumApprovedGrossCentsByOrder(payment.orderId),
      ]);
      custodySummary = toCustodySummaryResponse(
        calculatePaymentCustodySummary({
          payment,
          originalCustody,
          approvedChangeGrossCents,
          incrementalAuthorizations,
          incrementalCustodies,
        }),
      );
    }

    return {
      ...toPaymentResponse(payment),
      authorizations: authorizations.map(toAuthorizationResponse),
      refunds: refunds.map(toRefundResponse),
      ...(custodySummary ? { custodySummary } : {}),
    };
  }

  /** O pagamento do pedido — a tela do pedido usa isto para mostrar o botão. */
  async getByOrder(identityId: string, orderId: string): Promise<PaymentDetailsResponse> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      throw new PaymentNotFoundException();
    }
    return this.get(identityId, payment.id);
  }
}
