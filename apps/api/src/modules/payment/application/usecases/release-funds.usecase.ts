import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReais } from '../../../../shared/money/money';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { TrustCustody } from '../../domain/entities/trust-custody';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { OrderDisputeQuery } from '../../domain/services/order-dispute.query';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import {
  ReleaseDenialReason,
  evaluateRelease,
} from '../../domain/services/trust-release-policy.service';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';

export interface PrepareReleaseInput {
  orderId: string;
  correlationId: string;
  causationId?: string;
}

export type PrepareReleaseOutcome =
  | { result: 'READY'; custodyId: string }
  | { result: 'ALREADY_READY'; custodyId: string }
  | { result: 'ALREADY_RELEASED'; custodyId: string }
  | { result: 'DENIED'; custodyId: string; reasons: ReleaseDenialReason[] }
  | { result: 'NO_CUSTODY' };

export type FinalizeReleaseOutcome =
  | { result: 'RELEASED'; custodyId: string }
  | { result: 'ALREADY_RELEASED'; custodyId: string }
  | { result: 'GATEWAY_FAILED'; custodyId: string; providerCode: string | null }
  | { result: 'NOT_READY'; custodyId: string };

/** Chave determinística por custódia (PACK-01 §11.2) — retry não paga duas vezes. */
export function releaseIdempotencyKey(custodyId: string): string {
  return `release:${custodyId}`;
}

/**
 * PAY-004 — liberação em DUAS FASES (PACK-01 §11.1).
 *
 * A separação não é estilo, é segurança financeira:
 *
 *   fase 1 (`prepare`)  decide e PERSISTE READY_FOR_RELEASE
 *   ── commit ──
 *   fase 2 (`finalize`) chama o gateway e só então marca RELEASED
 *
 * Se o processo morrer no meio, a custódia fica em READY_FOR_RELEASE e a mesma
 * liberação é retentável com a mesma chave de idempotência. O que NUNCA pode
 * acontecer é marcar o dinheiro como liberado sem confirmação do provedor —
 * por isso `markReleased` só é chamado depois do `outcome === 'APPROVED'`.
 */
@Injectable()
export class ReleaseFundsUseCase {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly custodyRepository: TrustCustodyRepository,
    private readonly disputeQuery: OrderDisputeQuery,
    private readonly gateway: PaymentGateway,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReleaseFundsUseCase.name);
  }

  /**
   * Fase 1: avalia a política e persiste READY_FOR_RELEASE. Roda dentro da
   * transação do consumer; nenhum efeito externo acontece aqui.
   */
  async prepare(input: PrepareReleaseInput, tx: DatabaseExecutor): Promise<PrepareReleaseOutcome> {
    const custody = await this.custodyRepository.findByOrderId(input.orderId, tx);
    if (!custody) {
      // §9.1: nunca criamos custódia a partir de CustomerConfirmed nem
      // liberamos nada. Mas há DOIS casos aqui, e tratá-los igual cegaria o
      // monitoramento: pedido que ninguém pagou pela plataforma é rotina; o
      // Payment dizer FUNDS_IN_CUSTODY sem existir custódia é inconsistência
      // financeira de verdade (ver desvio D2 no relatório do PACK-01).
      const payment = await this.paymentRepository.findByOrderId(input.orderId, tx);
      const inconsistent = payment?.status === PAYMENT_STATUS.FUNDS_IN_CUSTODY;
      const context = {
        operation: 'PrepareRelease',
        orderId: input.orderId,
        paymentId: payment?.id ?? null,
        paymentStatus: payment?.status ?? null,
        correlationId: input.correlationId,
        result: 'FAILURE',
        reason: 'NO_CUSTODY',
      };
      if (inconsistent) {
        this.logger.error(
          context,
          'Payment reports funds in custody but no custody record exists; nothing released.',
        );
      } else {
        this.logger.warn(
          context,
          'Order confirmed without funds in custody; nothing to release.',
        );
      }
      return { result: 'NO_CUSTODY' };
    }

    if (custody.isReleased()) {
      return { result: 'ALREADY_RELEASED', custodyId: custody.id };
    }
    if (custody.isReadyForRelease()) {
      // §9.1: não reexecuta a política; a fase 2 é que precisa continuar.
      return { result: 'ALREADY_READY', custodyId: custody.id };
    }

    const payment = await this.paymentRepository.findById(custody.paymentId, tx);
    if (!payment) {
      return { result: 'DENIED', custodyId: custody.id, reasons: ['SNAPSHOT_MISMATCH'] };
    }

    const hasActiveDispute = await this.disputeQuery.hasActiveDispute(custody.orderId);
    const decision = evaluateRelease({
      custody,
      payment,
      confirmedOrderId: input.orderId,
      customerConfirmed: true,
      hasActiveDispute,
    });

    if (!decision.allowed) {
      // §10.1: nenhuma operação de gateway, nenhum evento, nenhuma mudança de
      // estado. Só o registro do motivo.
      await this.auditLogService.record(
        {
          identityId: custody.buyerId,
          operation: 'ReleaseDenied',
          resource: 'TrustCustody',
          resourceId: custody.id,
          result: 'FAILURE',
          correlationId: input.correlationId,
          metadata: {
            paymentId: custody.paymentId,
            orderId: custody.orderId,
            reasons: decision.reasons,
            custodyStatus: custody.status,
            paymentStatus: payment.status,
          },
        },
        tx,
      );
      this.logger.warn(
        {
          operation: 'PrepareRelease',
          trustCustodyId: custody.id,
          orderId: custody.orderId,
          reasons: decision.reasons,
          correlationId: input.correlationId,
          result: 'DENIED',
        },
        'Release denied by trust release policy.',
      );
      return { result: 'DENIED', custodyId: custody.id, reasons: decision.reasons };
    }

    custody.markReadyForRelease();
    await this.custodyRepository.save(custody, tx);

    await this.outboxService.enqueue(tx, {
      eventType: 'Funds.ReadyForRelease',
      aggregateType: 'TrustCustody',
      aggregateId: custody.id,
      producer: PAY_PRODUCER,
      correlationId: input.correlationId,
      causationId: input.causationId,
      payload: this.payloadOf(custody, { status: custody.status }),
    });

    await this.auditLogService.record(
      {
        identityId: custody.buyerId,
        operation: 'PrepareRelease',
        resource: 'TrustCustody',
        resourceId: custody.id,
        result: 'SUCCESS',
        correlationId: input.correlationId,
        metadata: {
          paymentId: custody.paymentId,
          orderId: custody.orderId,
          previousStatus: 'IN_CUSTODY',
          newStatus: custody.status,
        },
      },
      tx,
    );

    this.logger.info(
      {
        operation: 'PrepareRelease',
        trustCustodyId: custody.id,
        orderId: custody.orderId,
        correlationId: input.correlationId,
        result: 'SUCCESS',
      },
      'Release policy allowed; custody ready for release.',
    );

    return { result: 'READY', custodyId: custody.id };
  }

  /**
   * Fase 2: chama o gateway FORA de transação e só depois persiste o desfecho.
   * Idempotente por `release:{custodyId}` — repetir depois de uma falha de rede
   * devolve a mesma transação do provedor em vez de soltar o dinheiro de novo.
   */
  async finalize(custodyId: string, correlationId: string): Promise<FinalizeReleaseOutcome> {
    const custody = await this.custodyRepository.findById(custodyId);
    if (!custody) {
      return { result: 'NOT_READY', custodyId };
    }
    if (custody.isReleased()) {
      // §18: resposta duplicada do gateway não pode gerar segundo Funds.Released.
      return { result: 'ALREADY_RELEASED', custodyId };
    }
    if (!custody.isReadyForRelease()) {
      return { result: 'NOT_READY', custodyId };
    }

    const payment = await this.paymentRepository.findById(custody.paymentId);
    if (!payment) {
      return { result: 'NOT_READY', custodyId };
    }

    const idempotencyKey = releaseIdempotencyKey(custody.id);
    // Fora de transação de propósito (§17): nenhuma conexão fica presa
    // esperando dependência externa.
    const result = await this.gateway.release({
      paymentId: payment.id,
      custodyId: custody.id,
      amountCents: custody.amountCents,
      currency: custody.currency,
      providerTransactionId: null,
      idempotencyKey,
      correlationId,
    });

    if (result.outcome !== 'APPROVED') {
      // §11.3: NÃO existe estado RELEASE_FAILED. A custódia continua em
      // READY_FOR_RELEASE para que a mesma liberação seja retentável.
      await this.auditLogService.record({
        identityId: custody.sellerId,
        operation: 'ReleaseFunds',
        resource: 'TrustCustody',
        resourceId: custody.id,
        result: 'FAILURE',
        correlationId,
        metadata: {
          paymentId: payment.id,
          orderId: custody.orderId,
          idempotencyKey,
          outcome: result.outcome,
          providerCode: result.providerCode,
          custodyStatus: custody.status,
        },
      });
      this.logger.error(
        {
          operation: 'ReleaseFunds',
          trustCustodyId: custody.id,
          idempotencyKey,
          outcome: result.outcome,
          providerCode: result.providerCode,
          correlationId,
          result: 'FAILURE',
        },
        'Gateway did not confirm release; custody stays READY_FOR_RELEASE for retry.',
      );
      return { result: 'GATEWAY_FAILED', custodyId: custody.id, providerCode: result.providerCode };
    }

    const releasedAt = result.releasedAt ?? new Date();
    custody.markReleased(releasedAt);
    payment.transitionTo(PAYMENT_STATUS.FUNDS_RELEASED);

    await this.db.transaction(async (tx) => {
      await this.custodyRepository.save(custody, tx);
      await this.paymentRepository.save(payment, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'Funds.Released',
        aggregateType: 'TrustCustody',
        aggregateId: custody.id,
        producer: PAY_PRODUCER,
        correlationId,
        payload: this.payloadOf(custody, {
          status: custody.status,
          paymentStatus: payment.status,
          providerTransactionId: result.providerTransactionId,
          releasedAt: releasedAt.toISOString(),
        }),
      });
      await this.auditLogService.record(
        {
          identityId: custody.sellerId,
          operation: 'ReleaseFunds',
          resource: 'TrustCustody',
          resourceId: custody.id,
          result: 'SUCCESS',
          correlationId,
          metadata: {
            paymentId: payment.id,
            orderId: custody.orderId,
            idempotencyKey,
            providerTransactionId: result.providerTransactionId,
            amount: toReais(custody.amountCents),
            currency: custody.currency,
            previousStatus: 'READY_FOR_RELEASE',
            newStatus: custody.status,
            paymentStatus: payment.status,
          },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'ReleaseFunds',
        trustCustodyId: custody.id,
        paymentId: payment.id,
        orderId: custody.orderId,
        amountCents: custody.amountCents,
        idempotencyKey,
        correlationId,
        result: 'SUCCESS',
      },
      'Funds released from trust custody.',
    );

    return { result: 'RELEASED', custodyId: custody.id };
  }

  private payloadOf(custody: TrustCustody, extra: Record<string, unknown>): Record<string, unknown> {
    return {
      trustCustodyId: custody.id,
      paymentId: custody.paymentId,
      orderId: custody.orderId,
      buyerId: custody.buyerId,
      sellerId: custody.sellerId,
      amount: toReais(custody.amountCents),
      currency: custody.currency,
      ...extra,
    };
  }
}
