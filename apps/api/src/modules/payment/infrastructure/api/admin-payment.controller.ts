import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { AdminGuard } from '../../../identity/infrastructure/security/admin.guard';
import { ZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { RequestContext } from '../../../../shared/logging/correlation-id.middleware';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import { RefundPaymentUseCase } from '../../application/usecases/refund-payment.usecase';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';

type RequestWithContext = FastifyRequest & { requestContext?: RequestContext };

const paymentIdSchema = z.string().uuid();

const refundRequestSchema = z.object({
  amountCents: z.number().int().positive(),
  reasonDetail: z.string().trim().min(1).max(2000),
});

/**
 * IP-018 — reembolso ADMIN-INICIADO, para o caso de exceção que nenhum
 * consumer automático cobre (ex.: erro operacional fora de disputa/
 * cancelamento). Deliberadamente reusa `RefundPaymentUseCase` — o MESMO use
 * case dos consumers de IP-008 (CAS, defesa contra saldo excedido, chave de
 * idempotência) — nunca uma escrita direta em Payment/Ledger. Isto satisfaz a
 * restrição do IP-018 (§6 do spec): "manual resolution actions must never
 * bypass ledger/payment invariants".
 *
 * `reason` é sempre `'ADMINISTRATIVE_REFUND'` — a categoria de negócio já
 * existente em `RefundReason` para este canal (ver `funds-refund.ts`).
 */
@Controller('admin/payments')
@UseGuards(AdminGuard)
export class AdminPaymentController {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
    private readonly refundPayment: RefundPaymentUseCase,
  ) {}

  /**
   * O header `Idempotency-Key` tem a MESMA função do endpoint de comprador
   * (`PaymentController.refund`... equivalente): protege contra duplo clique
   * do admin. Sem ele, geramos uma chave por requisição (perde a proteção de
   * replay, mas nunca duplica silenciosamente — o admin precisa mandar o
   * header para poder repetir a chamada com segurança).
   */
  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.OK)
  async refund(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('paymentId', new ZodValidationPipe(paymentIdSchema)) paymentId: string,
    @Body(new ZodValidationPipe(refundRequestSchema)) body: z.infer<typeof refundRequestSchema>,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Req() request: RequestWithContext,
  ) {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }

    const approved = await this.authorizationRepository.findApprovedByPayment(payment.id);
    if (!approved?.providerTransactionId) {
      return {
        result: 'NOT_ELIGIBLE',
        detail: 'NO_APPROVED_AUTHORIZATION',
      };
    }

    const idempotencyKey = idempotencyKeyHeader ?? `refund:admin:${uuidv7()}`;
    const correlationId = request.requestContext?.correlationId ?? uuidv7();

    return this.refundPayment.execute({
      paymentId: payment.id,
      orderId: payment.orderId,
      amountCents: body.amountCents,
      currency: payment.currency,
      reason: 'ADMINISTRATIVE_REFUND',
      reasonDetail: body.reasonDetail,
      requestedBy: identity.identityId,
      idempotencyKey,
      providerTransactionId: approved.providerTransactionId,
      correlationId,
      causationId: request.requestContext?.requestId,
    });
  }
}
