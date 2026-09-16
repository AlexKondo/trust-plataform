import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { Cents, toReais } from '../../../../shared/money/money';
import { FundsRefund, RefundReason } from '../../domain/entities/funds-refund';
import { PAYMENT_STATUS, PaymentStatus } from '../../domain/entities/payment-types';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { FundsRefundRepository } from '../../domain/repositories/funds-refund.repository';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';

/** PAY-006 BR-001 — só um pagamento com dinheiro efetivamente capturado é elegível. */
export const REFUND_ELIGIBLE_STATUSES: readonly PaymentStatus[] = [
  PAYMENT_STATUS.FUNDS_IN_CUSTODY,
  PAYMENT_STATUS.FUNDS_RELEASED,
  PAYMENT_STATUS.SETTLED,
  PAYMENT_STATUS.PARTIALLY_REFUNDED,
];

/** Quantas vezes a fase 2 tenta a CAS antes de desistir e registrar inconsistência (ver §CAS). */
const MAX_CAS_ATTEMPTS = 3;

export interface RefundPaymentInput {
  paymentId: string;
  orderId: string;
  amountCents: Cents;
  currency: string;
  reason: RefundReason;
  reasonDetail?: string | null;
  requestedBy: string;
  disputeId?: string | null;
  /** Chave determinística por gatilho de negócio — nunca por chamada (ver os consumers). */
  idempotencyKey: string;
  /**
   * A transação ORIGINAL que será revertida no provedor. Quem chama resolve
   * qual (a autorização original do Payment ou a de uma tranche incremental) —
   * este use case fica agnóstico de onde o dinheiro veio (§ reuso).
   */
  providerTransactionId: string;
  correlationId: string;
  causationId?: string;
}

export type RefundPaymentOutcome =
  | { result: 'COMPLETED'; refundId: string }
  | { result: 'ALREADY_PROCESSED'; refundId: string }
  | { result: 'NOT_ELIGIBLE'; detail: string }
  | { result: 'LIMIT_EXCEEDED' }
  | { result: 'GATEWAY_FAILED'; refundId: string; providerCode: string | null }
  /**
   * O gateway CONFIRMOU o reembolso (o dinheiro já saiu para o comprador),
   * mas não foi possível refletir isto com segurança no Payment (a leitura
   * mais recente já não comporta o valor, ou o Payment sumiu). Ver
   * comentário da fase 2: sempre acompanhado de um log de erro; nunca
   * silencioso. Exige investigação humana — não é um "tentar de novo mais
   * tarde" automático (o gateway já foi chamado e já aprovou).
   */
  | { result: 'LEDGER_INCONSISTENT'; refundId: string };

/**
 * IP-008 (PAY-006) — reembolso total ou parcial de um Payment.
 *
 * Reusa o `PaymentGateway.refund()` que já existe no port desde o PACK-01 (o
 * ADR sempre previu esta operação; só nunca teve um use case chamando-a —
 * `Payment.registerRefund()` tinha zero chamadores antes desta IP, confirmado
 * no Completion Report do IP-007 §4). Mesma disciplina de duas fases das
 * demais operações financeiras deste módulo: o gateway é chamado FORA de
 * transação (§17); a persistência do desfecho é que é atômica.
 *
 * Três defesas contra reembolso duplicado/excedente, na mesma ordem de
 * `AuthorizePaymentUseCase`:
 * 1. chave de idempotência já usada → devolve o resultado anterior, sem
 *    tocar no gateway;
 * 2. `amountCents` verificado contra `payment.refundableCents` ANTES do
 *    gateway (barato, evita chamada desnecessária);
 * 3. a escrita final usa CAS (`applyRefundIfExpected`) — o valor NUNCA é
 *    gravado por um `UPDATE` incondicional, exatamente pelo mesmo motivo que
 *    a liberação do IP-007 nunca usa `save()` incondicional para o desfecho
 *    financeiro: duas chamadas concorrentes com sua própria cópia em memória
 *    do Payment não podem, juntas, ultrapassar o teto.
 */
@Injectable()
export class RefundPaymentUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly refundRepository: FundsRefundRepository,
    private readonly gateway: PaymentGateway,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefundPaymentUseCase.name);
  }

  async execute(input: RefundPaymentInput): Promise<RefundPaymentOutcome> {
    // Defesa 1 — a mesma chave nunca reembolsa duas vezes.
    const previous = await this.refundRepository.findByIdempotencyKey(input.idempotencyKey);
    if (previous) {
      this.logger.info(
        {
          operation: 'RefundPayment',
          paymentId: input.paymentId,
          idempotencyKey: input.idempotencyKey,
          result: 'REPLAYED',
          correlationId: input.correlationId,
        },
        'Idempotent replay: returning the previous refund without touching the gateway again.',
      );
      return { result: 'ALREADY_PROCESSED', refundId: previous.id };
    }

    const payment = await this.paymentRepository.findById(input.paymentId);
    if (!payment) {
      return { result: 'NOT_ELIGIBLE', detail: 'PAYMENT_NOT_FOUND' };
    }
    if (!REFUND_ELIGIBLE_STATUSES.includes(payment.status)) {
      await this.auditLogService.recordSafe({
        identityId: input.requestedBy,
        operation: 'RefundPayment',
        resource: 'Payment',
        resourceId: payment.id,
        result: 'FAILURE',
        correlationId: input.correlationId,
        metadata: { reason: 'PAYMENT_NOT_ELIGIBLE', paymentStatus: payment.status },
      });
      return { result: 'NOT_ELIGIBLE', detail: `PAYMENT_STATUS_${payment.status}` };
    }

    // Defesa 2 — nunca chama o gateway por um valor que já sabemos exceder o saldo.
    if (input.amountCents <= 0 || input.amountCents > payment.refundableCents) {
      await this.auditLogService.recordSafe({
        identityId: input.requestedBy,
        operation: 'RefundPayment',
        resource: 'Payment',
        resourceId: payment.id,
        result: 'FAILURE',
        correlationId: input.correlationId,
        metadata: {
          reason: 'REFUND_LIMIT_EXCEEDED',
          requestedCents: input.amountCents,
          refundableCents: payment.refundableCents,
        },
      });
      this.logger.warn(
        {
          operation: 'RefundPayment',
          paymentId: payment.id,
          requestedCents: input.amountCents,
          refundableCents: payment.refundableCents,
          correlationId: input.correlationId,
          result: 'DENIED',
        },
        'Refund amount exceeds the refundable balance; gateway not called.',
      );
      return { result: 'LIMIT_EXCEEDED' };
    }

    // Fora de transação de propósito (§17): a chamada de rede não pode segurar conexão.
    const result = await this.gateway.refund({
      providerTransactionId: input.providerTransactionId,
      amountCents: input.amountCents,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    const refund = FundsRefund.request({
      paymentId: payment.id,
      orderId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency,
      reason: input.reason,
      reasonDetail: input.reasonDetail,
      requestedBy: input.requestedBy,
      disputeId: input.disputeId,
      providerId: this.gateway.providerId,
      idempotencyKey: input.idempotencyKey,
    });

    if (result.outcome !== 'APPROVED') {
      refund.markProcessing();
      refund.markFailed(result);
      const created = await this.refundRepository.create(refund);
      if (!created) {
        const concurrent = await this.refundRepository.findByIdempotencyKey(input.idempotencyKey);
        return { result: 'ALREADY_PROCESSED', refundId: concurrent!.id };
      }
      await this.auditLogService.recordSafe({
        identityId: input.requestedBy,
        operation: 'RefundPayment',
        resource: 'FundsRefund',
        resourceId: refund.id,
        result: 'FAILURE',
        correlationId: input.correlationId,
        metadata: {
          paymentId: payment.id,
          idempotencyKey: input.idempotencyKey,
          outcome: result.outcome,
          providerCode: result.providerCode,
        },
      });
      this.logger.error(
        {
          operation: 'RefundPayment',
          refundId: refund.id,
          paymentId: payment.id,
          outcome: result.outcome,
          providerCode: result.providerCode,
          correlationId: input.correlationId,
          result: 'FAILURE',
        },
        'Gateway did not confirm the refund.',
      );
      return { result: 'GATEWAY_FAILED', refundId: refund.id, providerCode: result.providerCode };
    }

    refund.markProcessing();
    refund.markCompleted(result);

    // Fase 2 — grava o desfecho. CAS com retry curto (ver comentário de classe):
    // o gateway já confirmou: o que resta é garantir que ISTO se reflita no
    // Payment sem nunca ultrapassar o teto, mesmo sob corrida com outra escrita.
    //
    // `CasLostSignal` é lançado DE PROPÓSITO dentro da transação: se a escrita
    // no Payment perder a corrida (`applyRefundIfExpected` devolve `false`),
    // a transação inteira precisa dar ROLLBACK — inclusive o `create()` do
    // `FundsRefund` que rodou momentos antes NA MESMA transação. Sem isto, um
    // retorno normal (sem lançar) faria o `db.transaction` COMMITAR o insert
    // do reembolso como COMPLETED mesmo com o Payment não refletindo o valor
    // — exatamente o tipo de inconsistência financeira que este use case
    // existe para impedir.
    class CasLostSignal extends Error {}

    let attempt = 0;
    for (;;) {
      attempt += 1;
      const freshPayment = await this.paymentRepository.findById(payment.id);
      if (!freshPayment) {
        // Não deveria acontecer (Payment não é apagável) — registra e para.
        this.logger.error(
          {
            operation: 'RefundPayment',
            refundId: refund.id,
            paymentId: payment.id,
            correlationId: input.correlationId,
            result: 'FAILURE',
            reason: 'PAYMENT_DISAPPEARED_MID_REFUND',
          },
          'Payment vanished between the gateway call and persistence; refund at the provider is NOT reflected in our books. Needs investigation.',
        );
        return { result: 'LEDGER_INCONSISTENT', refundId: refund.id };
      }
      const expectedRefundedCents = freshPayment.refundedCents;
      if (input.amountCents > freshPayment.refundableCents) {
        // O saldo mudou sob nós (outro reembolso concorrente consumiu o
        // espaço) DEPOIS que o gateway já confirmou o nosso. O dinheiro já
        // saiu de verdade — não inventamos uma correção; registramos a
        // inconsistência para investigação humana (mesmo espírito de
        // `TrustCustodyInconsistentException`, PACK-01 §18).
        this.logger.error(
          {
            operation: 'RefundPayment',
            refundId: refund.id,
            paymentId: payment.id,
            requestedCents: input.amountCents,
            refundableCentsNow: freshPayment.refundableCents,
            correlationId: input.correlationId,
            result: 'FAILURE',
            reason: 'REFUND_APPROVED_AT_GATEWAY_BUT_EXCEEDS_LEDGER',
          },
          'Gateway approved this refund, but the Payment ledger can no longer safely account for it. Needs investigation.',
        );
        return { result: 'LEDGER_INCONSISTENT', refundId: refund.id };
      }
      freshPayment.registerRefund(input.amountCents);

      let applied: 'OK' | 'ALREADY_PROCESSED';
      try {
        applied = await this.db.transaction(async (tx) => {
          const created = await this.refundRepository.create(refund, tx);
          if (!created) {
            return 'ALREADY_PROCESSED' as const;
          }
          const cas = await this.paymentRepository.applyRefundIfExpected(
            payment.id,
            expectedRefundedCents,
            freshPayment.refundedCents,
            freshPayment.status,
            new Date(),
            tx,
          );
          if (!cas) {
            throw new CasLostSignal();
          }
          await this.outboxService.enqueue(tx, {
            eventType: 'FundsRefund.Completed',
            aggregateType: 'FundsRefund',
            aggregateId: refund.id,
            producer: PAY_PRODUCER,
            correlationId: input.correlationId,
            causationId: input.causationId,
            payload: {
              refundId: refund.id,
              paymentId: payment.id,
              orderId: input.orderId,
              buyerId: payment.buyerId,
              sellerId: payment.sellerId,
              amount: toReais(input.amountCents),
              currency: input.currency,
              reason: input.reason,
              disputeId: input.disputeId ?? null,
              paymentStatus: freshPayment.status,
              providerRefundId: result.providerTransactionId,
              completedAt: refund.completedAt!.toISOString(),
            },
          });
          await this.auditLogService.record(
            {
              identityId: input.requestedBy,
              operation: 'RefundPayment',
              resource: 'FundsRefund',
              resourceId: refund.id,
              result: 'SUCCESS',
              correlationId: input.correlationId,
              metadata: {
                paymentId: payment.id,
                orderId: input.orderId,
                amountCents: input.amountCents,
                reason: input.reason,
                disputeId: input.disputeId ?? null,
                idempotencyKey: input.idempotencyKey,
                previousRefundedCents: expectedRefundedCents,
                newRefundedCents: freshPayment.refundedCents,
                newPaymentStatus: freshPayment.status,
              },
            },
            tx,
          );
          return 'OK' as const;
        });
      } catch (error) {
        if (error instanceof CasLostSignal) {
          // Outra escrita mudou `refunded_amount` entre a leitura e agora —
          // relê e tenta de novo, até o limite. O `create()` do reembolso
          // desta tentativa foi revertido junto com o resto da transação.
          if (attempt >= MAX_CAS_ATTEMPTS) {
            this.logger.error(
              {
                operation: 'RefundPayment',
                refundId: refund.id,
                paymentId: payment.id,
                attempts: attempt,
                correlationId: input.correlationId,
                result: 'FAILURE',
                reason: 'CAS_RETRIES_EXHAUSTED',
              },
              'Gateway approved this refund, but the ledger CAS write kept losing the race. Needs investigation.',
            );
            return { result: 'LEDGER_INCONSISTENT', refundId: refund.id };
          }
          continue;
        }
        throw error;
      }

      if (applied === 'OK') {
        this.logger.info(
          {
            operation: 'RefundPayment',
            refundId: refund.id,
            paymentId: payment.id,
            amountCents: input.amountCents,
            attempt,
            correlationId: input.correlationId,
            result: 'SUCCESS',
          },
          'Payment refunded.',
        );
        return { result: 'COMPLETED', refundId: refund.id };
      }
      // applied === 'ALREADY_PROCESSED': outra entrega concorrente da MESMA
      // chave já concluiu o `create()` primeiro — nada mais a fazer aqui.
      const concurrent = await this.refundRepository.findByIdempotencyKey(input.idempotencyKey);
      return { result: 'ALREADY_PROCESSED', refundId: concurrent!.id };
    }
  }
}
