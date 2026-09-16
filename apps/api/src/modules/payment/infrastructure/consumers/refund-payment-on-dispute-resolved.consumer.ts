import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { fromReais } from '../../../../shared/money/money';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { RefundPaymentUseCase } from '../../application/usecases/refund-payment.usecase';

/** Chave determinística pela DECISÃO (imutável, uma por vez — MRK-024 BR-006). */
export function disputeRefundIdempotencyKey(decisionId: string): string {
  return `refund:dispute:${decisionId}`;
}

/**
 * IP-008 — a consequência FINANCEIRA que a resolução de disputa não tinha
 * antes desta IP (INCONSISTENCIAS #13: `MarketplaceDispute.Resolved` só
 * penalizava Trust Score; confirmado por leitura direta de
 * `manage-dispute.usecase.ts` antes desta IP — zero referência a Payment).
 *
 * Deliberadamente NÃO calcula quanto reembolsar a partir de `decisionType`
 * (ex.: "UPHELD = 100%"): esse número é sempre o que o administrador digitou
 * em `ResolveDisputeRequest.refundAmount` (ver `DisputeDecision`) — este
 * consumer só EXECUTA a decisão humana com segurança financeira (idempotente,
 * nunca excede o saldo), não a toma. Uma decisão sem `refundAmount` (ou com
 * `0`) não movimenta dinheiro nenhum — é o caso comum (REJECTED, ou UPHELD
 * sem consequência financeira, ex. só ajuste de reputação).
 *
 * Escopo deliberadamente restrito à tranche ORIGINAL do pedido (nunca a
 * tranches incrementais de Change Order): a disputa é sobre o serviço
 * contratado, e resolver "de qual tranche exatamente sai o valor parcial que
 * o admin decidiu" quando existem múltiplas tranches é uma decisão de
 * política que nenhum documento de produto define — ver Completion Report
 * §11/Conflict Escalation. `RefundPaymentUseCase` só olha para o Payment
 * como um todo (`refundableCents` já soma tudo que foi capturado, original +
 * incremental — a garantia "nunca excede o custodiado" vale igual), então
 * isto não bloqueia reembolsar um valor que veio de uma tranche incremental,
 * só não tenta decidir DE QUAL tranche ele saiu para fins de auditoria fina.
 */
@Injectable()
export class RefundPaymentOnDisputeResolvedConsumer extends EventConsumer {
  readonly eventType = 'MarketplaceDispute.Resolved';
  readonly consumerName = 'pay.refund-payment-on-dispute-resolved';
  // Chama o gateway via RefundPaymentUseCase — não pode rodar com transação aberta (§17).
  override readonly managesOwnTransaction = true;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
    private readonly refundPayment: RefundPaymentUseCase,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(RefundPaymentOnDisputeResolvedConsumer.name);
  }

  async handle(envelope: ConsumedEvent): Promise<void> {
    const payload = envelope.payload as {
      disputeId?: string;
      decisionId?: string;
      orderId?: string;
      decisionType?: string;
      decidedBy?: string;
      refundAmount?: number | null;
    };
    if (!payload.orderId || !payload.decisionId) {
      return;
    }
    if (!payload.refundAmount || payload.refundAmount <= 0) {
      return; // decisão sem consequência financeira — nada a fazer
    }

    const payment = await this.paymentRepository.findByOrderId(payload.orderId);
    if (!payment) {
      this.logger.warn(
        {
          operation: 'RefundPayment',
          orderId: payload.orderId,
          disputeId: payload.disputeId,
          correlationId: envelope.correlationId,
          result: 'SKIPPED',
          reason: 'PAYMENT_NOT_FOUND',
        },
        'Dispute resolved with a refund amount, but the order has no Payment.',
      );
      return;
    }

    const approved = await this.authorizationRepository.findApprovedByPayment(payment.id);
    if (!approved?.providerTransactionId) {
      this.logger.error(
        {
          operation: 'RefundPayment',
          orderId: payload.orderId,
          paymentId: payment.id,
          disputeId: payload.disputeId,
          correlationId: envelope.correlationId,
          result: 'FAILURE',
          reason: 'NO_APPROVED_AUTHORIZATION',
        },
        'Dispute resolved with a refund amount, but the Payment has no approved authorization to refund against.',
      );
      return;
    }

    await this.refundPayment.execute({
      paymentId: payment.id,
      orderId: payload.orderId,
      amountCents: fromReais(payload.refundAmount),
      currency: payment.currency,
      reason: 'DISPUTE_UPHELD',
      reasonDetail: `Dispute ${payload.disputeId} decision ${payload.decisionType ?? ''}`.trim(),
      requestedBy: payload.decidedBy ?? payment.sellerId,
      disputeId: payload.disputeId ?? null,
      idempotencyKey: disputeRefundIdempotencyKey(payload.decisionId),
      providerTransactionId: approved.providerTransactionId,
      correlationId: envelope.correlationId,
      causationId: envelope.eventId,
    });
  }
}
