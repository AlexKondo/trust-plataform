import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { EventConsumer } from '../../../../shared/events/event-consumer';
import { ConsumedEvent } from '../../../../shared/events/event-envelope';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AUTHORIZATION_STATUS, PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { CUSTODY_STATUS } from '../../domain/entities/trust-custody';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentIncrementalAuthorizationRepository } from '../../domain/repositories/payment-incremental-authorization.repository';
import { PaymentAuthorizationRepository } from '../../domain/repositories/payment-authorization.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import { RefundPaymentUseCase } from '../../application/usecases/refund-payment.usecase';
import { PAY_PRODUCER } from './create-payment.consumer';

/** Chave determinística por pedido — cancelamento acontece no máximo uma vez (CANCELLED é terminal). */
export function cancelRefundIdempotencyKey(orderId: string): string {
  return `refund:cancel:${orderId}`;
}

export function cancelVoidIdempotencyKey(orderId: string): string {
  return `cancel-auth:${orderId}`;
}

export function cancelIncrementalRefundIdempotencyKey(changeOrderId: string): string {
  return `refund:cancel:incremental:${changeOrderId}`;
}

export function cancelIncrementalVoidIdempotencyKey(changeOrderId: string): string {
  return `cancel-auth:incremental:${changeOrderId}`;
}

/**
 * IP-008 — consequência financeira do cancelamento ANTES da execução.
 *
 * `MarketplaceOrder.Cancelled` só é alcançável, por construção do
 * `CANCELLABLE_STATUSES` do Marketplace (CREATED/AWAITING_SCHEDULING/
 * SCHEDULED/AWAITING_EXECUTION), ANTES de `IN_PROGRESS` — ou seja, antes do
 * único gatilho de liberação que este código conhece
 * (`MarketplaceOrder.CustomerConfirmed`). Isso prova, sem precisar adivinhar,
 * que o Payment deste pedido NUNCA pode estar `FUNDS_RELEASED`/`SETTLED`
 * quando este consumer roda — só pode estar `CREATED`,
 * `AUTHORIZATION_FAILED`, `AUTHORIZED` ou `FUNDS_IN_CUSTODY` (mesmo raciocínio
 * que o Completion Report do IP-007 §11.1 já aplicou à janela de aprovação de
 * Change Orders). Os quatro casos abaixo cobrem exatamente essas possibilidades.
 *
 * Sem taxa/multa de cancelamento: `CANCELLABLE_STATUSES`
 * (marketplace-types.ts) já documenta que "prazos, multas e taxas são
 * política configurável... fora desta regra" — como nenhuma política de
 * multa está configurada em lugar nenhum do baseline, o único default seguro
 * (que não inventa um percentual de negócio) é devolver 100% do que foi
 * efetivamente capturado, sem desconto algum.
 *
 * IP-007 — este consumer também resolve tranches incrementais (Change Orders
 * aprovados) que podem coexistir com um pedido ainda cancelável
 * (`CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES` inclui SCHEDULED/AWAITING_EXECUTION,
 * que também são `CANCELLABLE_STATUSES`) — inclusive o caso em que a
 * autorização incremental foi aprovada no gateway mas a custódia ainda não
 * chegou a existir (o `amountAuthorizedNotInCustody` do PACK-03/IP-007): esse
 * caso é ANULADO (gateway.cancel), não reembolsado, porque nada chegou a ser
 * capturado.
 */
@Injectable()
export class RefundPaymentOnOrderCancelledConsumer extends EventConsumer {
  readonly eventType = 'MarketplaceOrder.Cancelled';
  readonly consumerName = 'pay.refund-payment-on-order-cancelled';
  // Chama o gateway (cancel/refund) — não pode rodar com transação aberta (§17).
  override readonly managesOwnTransaction = true;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authorizationRepository: PaymentAuthorizationRepository,
    private readonly custodyRepository: TrustCustodyRepository,
    private readonly incrementalAuthorizationRepository: PaymentIncrementalAuthorizationRepository,
    private readonly incrementalCustodyRepository: IncrementalTrustCustodyRepository,
    private readonly refundPayment: RefundPaymentUseCase,
    private readonly gateway: PaymentGateway,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(RefundPaymentOnOrderCancelledConsumer.name);
  }

  async handle(envelope: ConsumedEvent): Promise<void> {
    const payload = envelope.payload as { orderId?: string; cancelledBy?: string; reason?: string };
    const orderId = payload.orderId;
    if (!orderId) {
      return;
    }

    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      // Pedido cancelado antes de o Payment.Created ter sido processado — nada a desfazer.
      return;
    }

    const requestedBy = payload.cancelledBy ?? payment.buyerId;

    await this.handleOriginalTranche(payment.id, orderId, requestedBy, envelope);
    await this.handleIncrementalTranches(payment.id, orderId, requestedBy, envelope);
  }

  private async handleOriginalTranche(
    paymentId: string,
    orderId: string,
    requestedBy: string,
    envelope: ConsumedEvent,
  ): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      return;
    }

    switch (payment.status) {
      case PAYMENT_STATUS.CREATED:
      case PAYMENT_STATUS.AUTHORIZATION_FAILED: {
        // Nada foi cobrado — só fecha o Payment.
        payment.cancel();
        await this.db.transaction(async (tx) => {
          await this.paymentRepository.save(payment, tx);
          await this.auditLogService.record(
            {
              identityId: requestedBy,
              operation: 'CancelPayment',
              resource: 'Payment',
              resourceId: payment.id,
              result: 'SUCCESS',
              correlationId: envelope.correlationId,
              metadata: { orderId, previousStatus: payment.status, reason: 'ORDER_CANCELLED' },
            },
            tx,
          );
        });
        return;
      }
      case PAYMENT_STATUS.AUTHORIZED: {
        // Autorizado no PSP mas NUNCA chegou a virar custódia — anula a
        // reserva, não é um reembolso (nada foi capturado, ver PAY-006 §2).
        const approved = await this.authorizationRepository.findApprovedByPayment(paymentId);
        if (approved?.providerTransactionId) {
          const result = await this.gateway.cancel({
            providerTransactionId: approved.providerTransactionId,
            idempotencyKey: cancelVoidIdempotencyKey(orderId),
            correlationId: envelope.correlationId,
          });
          if (result.outcome !== 'APPROVED') {
            this.logger.error(
              {
                operation: 'CancelPaymentAuthorization',
                paymentId,
                orderId,
                outcome: result.outcome,
                correlationId: envelope.correlationId,
                result: 'FAILURE',
              },
              'Gateway did not confirm voiding the authorization on order cancellation.',
            );
            return; // não fecha o Payment se a anulação não foi confirmada
          }
        }
        payment.cancel();
        await this.db.transaction(async (tx) => {
          await this.paymentRepository.save(payment, tx);
          await this.auditLogService.record(
            {
              identityId: requestedBy,
              operation: 'CancelPayment',
              resource: 'Payment',
              resourceId: payment.id,
              result: 'SUCCESS',
              correlationId: envelope.correlationId,
              metadata: { orderId, previousStatus: PAYMENT_STATUS.AUTHORIZED, reason: 'ORDER_CANCELLED' },
            },
            tx,
          );
        });
        return;
      }
      case PAYMENT_STATUS.FUNDS_IN_CUSTODY: {
        const approved = await this.authorizationRepository.findApprovedByPayment(paymentId);
        if (!approved?.providerTransactionId) {
          this.logger.error(
            {
              operation: 'RefundPayment',
              paymentId,
              orderId,
              correlationId: envelope.correlationId,
              result: 'FAILURE',
              reason: 'NO_APPROVED_AUTHORIZATION_FOR_CUSTODIED_PAYMENT',
            },
            'Payment is FUNDS_IN_CUSTODY but has no approved authorization on record; cannot refund.',
          );
          return;
        }
        const outcome = await this.refundPayment.execute({
          paymentId,
          orderId,
          amountCents: payment.refundableCents,
          currency: payment.currency,
          reason: 'ORDER_CANCELLED_BEFORE_EXECUTION',
          reasonDetail: 'Order cancelled before execution started; full refund of the captured amount.',
          requestedBy,
          idempotencyKey: cancelRefundIdempotencyKey(orderId),
          providerTransactionId: approved.providerTransactionId,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
        });
        if (outcome.result !== 'COMPLETED' && outcome.result !== 'ALREADY_PROCESSED') {
          return; // já auditado/logado dentro do use case
        }
        // A custódia original ainda é INTEGRALMENTE devolvida (a mesma quantia
        // que estava retida) — CAS: só marca REFUNDED se ainda estiver IN_CUSTODY.
        const custody = await this.custodyRepository.findByPaymentId(paymentId);
        if (custody && custody.status === CUSTODY_STATUS.IN_CUSTODY) {
          const marked = await this.custodyRepository.markRefundedIfInCustody(custody.id, new Date());
          if (marked) {
            await this.outboxService.enqueueStandalone({
              eventType: 'TrustCustody.Refunded',
              aggregateType: 'TrustCustody',
              aggregateId: custody.id,
              producer: PAY_PRODUCER,
              correlationId: envelope.correlationId,
              causationId: envelope.eventId,
              payload: {
                trustCustodyId: custody.id,
                paymentId,
                orderId,
                status: CUSTODY_STATUS.REFUNDED,
              },
            });
          }
        }
        return;
      }
      case PAYMENT_STATUS.CANCELLED:
      case PAYMENT_STATUS.REFUNDED:
        // Reentrega do evento (`managesOwnTransaction`, ao-menos-uma-vez):
        // este consumer já terminou de processar este pedido antes —
        // silenciosamente idempotente, sem novo log de alerta.
        return;
      default:
        // FUNDS_RELEASED/SETTLED/PARTIALLY_REFUNDED: não deveria ser
        // alcançável a partir de um pedido ainda cancelável (ver comentário
        // de classe) — idempotente, não faz nada em vez de lançar.
        this.logger.warn(
          {
            operation: 'RefundPayment',
            paymentId,
            orderId,
            paymentStatus: payment.status,
            correlationId: envelope.correlationId,
            result: 'SKIPPED',
          },
          'Order cancelled but Payment is in an unexpected status for a pre-execution cancellation; no financial action taken.',
        );
    }
  }

  private async handleIncrementalTranches(
    paymentId: string,
    orderId: string,
    requestedBy: string,
    envelope: ConsumedEvent,
  ): Promise<void> {
    const authorizations = await this.incrementalAuthorizationRepository.listByPayment(paymentId);
    for (const authorization of authorizations) {
      if (authorization.status !== AUTHORIZATION_STATUS.APPROVED) {
        continue; // recusada/erro — nenhum dinheiro se moveu
      }
      const custody = await this.incrementalCustodyRepository.findByChangeOrderId(
        authorization.changeOrderId,
      );

      if (!custody) {
        // O gap exato que o mandato desta IP pede para verificar: aprovado no
        // gateway mas AINDA não custodiado (`amountAuthorizedNotInCustody`,
        // PACK-03 §9.1 / IP-007 §12.2). Anula a reserva; não é reembolso.
        if (!authorization.providerTransactionId) {
          continue;
        }
        const result = await this.gateway.cancel({
          providerTransactionId: authorization.providerTransactionId,
          idempotencyKey: cancelIncrementalVoidIdempotencyKey(authorization.changeOrderId),
          correlationId: envelope.correlationId,
        });
        this.logger.info(
          {
            operation: 'CancelIncrementalAuthorization',
            paymentId,
            orderId,
            changeOrderId: authorization.changeOrderId,
            outcome: result.outcome,
            correlationId: envelope.correlationId,
            result: result.outcome === 'APPROVED' ? 'SUCCESS' : 'FAILURE',
          },
          'Voided an incremental authorization that had not yet reached custody, on order cancellation.',
        );
        await this.auditLogService.recordSafe({
          identityId: requestedBy,
          operation: 'CancelIncrementalAuthorization',
          resource: 'PaymentIncrementalAuthorization',
          resourceId: authorization.id,
          result: result.outcome === 'APPROVED' ? 'SUCCESS' : 'FAILURE',
          correlationId: envelope.correlationId,
          metadata: { paymentId, orderId, changeOrderId: authorization.changeOrderId },
        });
        continue;
      }

      if (custody.status !== CUSTODY_STATUS.IN_CUSTODY) {
        // READY_FOR_RELEASE/RELEASED/REFUNDED já em andamento/concluído — não
        // deveria acontecer num pedido ainda cancelável, mas idempotente.
        continue;
      }

      const outcome = await this.refundPayment.execute({
        paymentId,
        orderId,
        amountCents: custody.amountCents,
        currency: custody.currency,
        reason: 'ORDER_CANCELLED_BEFORE_EXECUTION',
        reasonDetail: `Change Order ${authorization.changeOrderId} tranche refunded on order cancellation.`,
        requestedBy,
        idempotencyKey: cancelIncrementalRefundIdempotencyKey(authorization.changeOrderId),
        providerTransactionId: authorization.providerTransactionId ?? '',
        correlationId: envelope.correlationId,
        causationId: envelope.eventId,
      });
      if (outcome.result !== 'COMPLETED' && outcome.result !== 'ALREADY_PROCESSED') {
        continue;
      }
      const marked = await this.incrementalCustodyRepository.markRefundedIfInCustody(
        custody.id,
        new Date(),
      );
      if (marked) {
        await this.outboxService.enqueueStandalone({
          eventType: 'TrustCustody.Refunded',
          aggregateType: 'IncrementalTrustCustody',
          aggregateId: custody.id,
          producer: PAY_PRODUCER,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
          payload: {
            trustCustodyId: custody.id,
            paymentId,
            orderId,
            changeOrderId: authorization.changeOrderId,
            status: CUSTODY_STATUS.REFUNDED,
          },
        });
      }
    }
  }
}
