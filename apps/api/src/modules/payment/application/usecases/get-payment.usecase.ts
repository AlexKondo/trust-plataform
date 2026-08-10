import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { PaymentNotFoundException } from '../../domain/exceptions/payment.exceptions';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentDetailsResponse, PaymentResponse } from '../dto/payment.dtos';
import { toAuthorizationResponse, toPaymentResponse } from '../mapper/payment.mapper';

/** Consulta do pagamento — só comprador e vendedor enxergam. */
@Injectable()
export class GetPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
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
    const authorizations = await this.authorizationRepository.listByPayment(paymentId);
    return {
      ...toPaymentResponse(payment),
      authorizations: authorizations.map(toAuthorizationResponse),
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
