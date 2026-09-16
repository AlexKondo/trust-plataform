import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { toReais } from '../../../../shared/money/money';
import { IncrementalTrustCustody } from '../../domain/entities/incremental-trust-custody';
import { PAYMENT_STATUS } from '../../domain/entities/payment-types';
import { TrustCustody } from '../../domain/entities/trust-custody';
import { IncrementalTrustCustodyRepository } from '../../domain/repositories/incremental-trust-custody.repository';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { TrustCustodyRepository } from '../../domain/repositories/trust-custody.repository';
import { OrderDisputeQuery } from '../../domain/services/order-dispute.query';
import { PaymentGateway } from '../../domain/services/payment-gateway';
import {
  ReleaseDenialReason,
  evaluateIncrementalRelease,
  evaluateRelease,
} from '../../domain/services/trust-release-policy.service';
import { PAY_PRODUCER } from '../../infrastructure/consumers/create-payment.consumer';

export interface PrepareReleaseInput {
  orderId: string;
  correlationId: string;
  causationId?: string;
}

/**
 * IP-007 — o que aconteceu com as tranches incrementais nesta chamada de
 * `prepare`. É um resumo ADITIVO: só aparece na resposta quando existe pelo
 * menos uma tranche incremental para o pedido (pedidos sem Change Order
 * aprovado continuam com a resposta EXATAMENTE igual à do PACK-01, campo por
 * campo — nenhum teste existente deste use case quebra).
 */
export interface IncrementalReleasePrepareSummary {
  ready: string[];
  alreadyReady: string[];
  alreadyReleased: string[];
  denied: Array<{ custodyId: string; reasons: ReleaseDenialReason[] }>;
}

export type PrepareReleaseOutcome = (
  | { result: 'READY'; custodyId: string }
  | { result: 'ALREADY_READY'; custodyId: string }
  | { result: 'ALREADY_RELEASED'; custodyId: string }
  | { result: 'DENIED'; custodyId: string; reasons: ReleaseDenialReason[] }
  | { result: 'NO_CUSTODY' }
) & { incremental?: IncrementalReleasePrepareSummary };

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
    private readonly incrementalCustodyRepository: IncrementalTrustCustodyRepository,
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
    // IP-007 — processa as tranches incrementais (Change Orders aprovados com
    // autorização aprovada) de forma independente da custódia original: um
    // pedido sem custódia original ainda pode ter (por inconsistência) ou não
    // ter tranches incrementais, e o inverso também é possível de investigar.
    // `undefined` quando não existe NENHUMA tranche — mantém a resposta
    // byte-idêntica à do PACK-01 para todo pedido sem Change Order aprovado.
    const incremental = await this.prepareIncrementalTranches(input, tx);
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
      return { result: 'NO_CUSTODY', ...(incremental ? { incremental } : {}) };
    }

    if (custody.isReleased()) {
      return {
        result: 'ALREADY_RELEASED',
        custodyId: custody.id,
        ...(incremental ? { incremental } : {}),
      };
    }
    if (custody.isReadyForRelease()) {
      // §9.1: não reexecuta a política; a fase 2 é que precisa continuar.
      return {
        result: 'ALREADY_READY',
        custodyId: custody.id,
        ...(incremental ? { incremental } : {}),
      };
    }

    const payment = await this.paymentRepository.findById(custody.paymentId, tx);
    if (!payment) {
      return {
        result: 'DENIED',
        custodyId: custody.id,
        reasons: ['SNAPSHOT_MISMATCH'],
        ...(incremental ? { incremental } : {}),
      };
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
      return {
        result: 'DENIED',
        custodyId: custody.id,
        reasons: decision.reasons,
        ...(incremental ? { incremental } : {}),
      };
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

    return { result: 'READY', custodyId: custody.id, ...(incremental ? { incremental } : {}) };
  }

  /**
   * Fase 2: chama o gateway FORA de transação e só depois persiste o desfecho.
   * Idempotente por `release:{custodyId}` — repetir depois de uma falha de rede
   * devolve a mesma transação do provedor em vez de soltar o dinheiro de novo.
   */
  async finalize(custodyId: string, correlationId: string): Promise<FinalizeReleaseOutcome> {
    const custody = await this.custodyRepository.findById(custodyId);
    if (custody) {
      return this.finalizeOriginal(custody, correlationId);
    }
    // IP-007 — o mesmo `custodyId` pode ser de uma tranche incremental: os
    // dois tipos de custódia reaproveitam o mesmo evento `Funds.ReadyForRelease`
    // e o mesmo `FinalizeReleaseConsumer` (ver comentário da classe), então o
    // espaço de ids é o mesmo e só uma das duas tabelas tem a linha.
    const tranche = await this.incrementalCustodyRepository.findById(custodyId);
    if (tranche) {
      return this.finalizeIncremental(tranche, correlationId);
    }
    return { result: 'NOT_READY', custodyId };
  }

  private async finalizeOriginal(
    custody: TrustCustody,
    correlationId: string,
  ): Promise<FinalizeReleaseOutcome> {
    if (custody.isReleased()) {
      // §18: resposta duplicada do gateway não pode gerar segundo Funds.Released.
      return { result: 'ALREADY_RELEASED', custodyId: custody.id };
    }
    if (!custody.isReadyForRelease()) {
      return { result: 'NOT_READY', custodyId: custody.id };
    }

    const payment = await this.paymentRepository.findById(custody.paymentId);
    if (!payment) {
      return { result: 'NOT_READY', custodyId: custody.id };
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

  /**
   * IP-007 — fase 2 para uma tranche incremental. Mesmo formato de duas fases
   * e mesma disciplina "gateway fora de transação, RELEASED só depois de
   * confirmação" da custódia original — a diferença deliberada é a escrita:
   * aqui é CAS explícito (`markReleasedIfReady`, `UPDATE ... WHERE status =
   * 'READY_FOR_RELEASE' RETURNING`) em vez do `save()` incondicional que a
   * custódia original usa, porque o mandato desta IP pede prova de que
   * "liberação não pode duplicar" com um teste de corrida real — ver
   * `create-incremental-authorization.usecase.spec.ts`/o spec deste arquivo.
   *
   * Também não chama `payment.transitionTo(FUNDS_RELEASED)`: esse status já
   * foi (ou será) definido pela tranche ORIGINAL — `PAYMENT_TRANSITIONS` não
   * tem `FUNDS_RELEASED -> FUNDS_RELEASED`, então chamar de novo aqui lançaria.
   * O que "todas as tranches liberadas" significa fica no resumo de custódia
   * (`payment-custody-summary.service.ts`), não no status escalar do Payment.
   */
  private async finalizeIncremental(
    tranche: IncrementalTrustCustody,
    correlationId: string,
  ): Promise<FinalizeReleaseOutcome> {
    if (tranche.isReleased()) {
      return { result: 'ALREADY_RELEASED', custodyId: tranche.id };
    }
    if (!tranche.isReadyForRelease()) {
      return { result: 'NOT_READY', custodyId: tranche.id };
    }

    const idempotencyKey = releaseIdempotencyKey(tranche.id);
    const result = await this.gateway.release({
      paymentId: tranche.paymentId,
      custodyId: tranche.id,
      amountCents: tranche.amountCents,
      currency: tranche.currency,
      providerTransactionId: null,
      idempotencyKey,
      correlationId,
    });

    if (result.outcome !== 'APPROVED') {
      await this.auditLogService.record({
        identityId: tranche.sellerId,
        operation: 'ReleaseIncrementalFunds',
        resource: 'IncrementalTrustCustody',
        resourceId: tranche.id,
        result: 'FAILURE',
        correlationId,
        metadata: {
          paymentId: tranche.paymentId,
          orderId: tranche.orderId,
          changeOrderId: tranche.changeOrderId,
          idempotencyKey,
          outcome: result.outcome,
          providerCode: result.providerCode,
          custodyStatus: tranche.status,
        },
      });
      this.logger.error(
        {
          operation: 'ReleaseIncrementalFunds',
          incrementalTrustCustodyId: tranche.id,
          changeOrderId: tranche.changeOrderId,
          idempotencyKey,
          outcome: result.outcome,
          providerCode: result.providerCode,
          correlationId,
          result: 'FAILURE',
        },
        'Gateway did not confirm incremental release; tranche stays READY_FOR_RELEASE for retry.',
      );
      return { result: 'GATEWAY_FAILED', custodyId: tranche.id, providerCode: result.providerCode };
    }

    const releasedAt = result.releasedAt ?? new Date();
    const amount = toReais(tranche.amountCents);
    let alreadyReleased = false;

    await this.db.transaction(async (tx) => {
      // CAS: só grava se o banco ainda disser READY_FOR_RELEASE (§release-funds
      // race test). `false` aqui significa que outra chamada concorrente já
      // terminou de liberar esta MESMA tranche entre a leitura acima e agora
      // — nesse caso, nenhum evento/auditoria novo é gravado (§18: resposta
      // duplicada do gateway não pode gerar segundo Funds.Released).
      const released = await this.incrementalCustodyRepository.markReleasedIfReady(
        tranche.id,
        releasedAt,
        tx,
      );
      if (!released) {
        alreadyReleased = true;
        return;
      }

      await this.outboxService.enqueue(tx, {
        eventType: 'Funds.Released',
        aggregateType: 'IncrementalTrustCustody',
        aggregateId: tranche.id,
        producer: PAY_PRODUCER,
        correlationId,
        payload: {
          trustCustodyId: tranche.id,
          paymentId: tranche.paymentId,
          orderId: tranche.orderId,
          changeOrderId: tranche.changeOrderId,
          buyerId: tranche.buyerId,
          sellerId: tranche.sellerId,
          amount,
          currency: tranche.currency,
          status: 'RELEASED',
          providerTransactionId: result.providerTransactionId,
          releasedAt: releasedAt.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId: tranche.sellerId,
          operation: 'ReleaseIncrementalFunds',
          resource: 'IncrementalTrustCustody',
          resourceId: tranche.id,
          result: 'SUCCESS',
          correlationId,
          metadata: {
            paymentId: tranche.paymentId,
            orderId: tranche.orderId,
            changeOrderId: tranche.changeOrderId,
            idempotencyKey,
            providerTransactionId: result.providerTransactionId,
            amount,
            currency: tranche.currency,
            previousStatus: 'READY_FOR_RELEASE',
            newStatus: 'RELEASED',
          },
        },
        tx,
      );
    });

    if (alreadyReleased) {
      return { result: 'ALREADY_RELEASED', custodyId: tranche.id };
    }

    this.logger.info(
      {
        operation: 'ReleaseIncrementalFunds',
        incrementalTrustCustodyId: tranche.id,
        changeOrderId: tranche.changeOrderId,
        paymentId: tranche.paymentId,
        orderId: tranche.orderId,
        amountCents: tranche.amountCents,
        idempotencyKey,
        correlationId,
        result: 'SUCCESS',
      },
      'Incremental funds released from trust custody.',
    );

    return { result: 'RELEASED', custodyId: tranche.id };
  }

  /**
   * IP-007 — fase 1 para TODAS as tranches incrementais de um pedido. Cada
   * tranche é avaliada e preparada de forma independente (uma tranche negada
   * não impede outra de liberar) — a mesma política `evaluateIncrementalRelease`
   * roda por tranche, então uma disputa ativa ou falta de confirmação nega
   * TODAS igualmente, mas por motivos computados individualmente.
   *
   * Devolve `undefined` (não um array vazio) quando o pedido não tem NENHUMA
   * tranche incremental — é o sinal que o chamador usa para não anexar o campo
   * `incremental` à resposta, mantendo-a idêntica à do PACK-01 nesse caso.
   */
  private async prepareIncrementalTranches(
    input: PrepareReleaseInput,
    tx: DatabaseExecutor,
  ): Promise<IncrementalReleasePrepareSummary | undefined> {
    const tranches = await this.incrementalCustodyRepository.listByOrderId(input.orderId, tx);
    if (tranches.length === 0) {
      return undefined;
    }

    const summary: IncrementalReleasePrepareSummary = {
      ready: [],
      alreadyReady: [],
      alreadyReleased: [],
      denied: [],
    };

    const payment = await this.paymentRepository.findByOrderId(input.orderId, tx);
    const hasActiveDispute = await this.disputeQuery.hasActiveDispute(input.orderId);

    for (const tranche of tranches) {
      if (tranche.isReleased()) {
        summary.alreadyReleased.push(tranche.id);
        continue;
      }
      if (tranche.isReadyForRelease()) {
        summary.alreadyReady.push(tranche.id);
        continue;
      }
      if (!payment) {
        summary.denied.push({ custodyId: tranche.id, reasons: ['SNAPSHOT_MISMATCH'] });
        continue;
      }

      const decision = evaluateIncrementalRelease({
        tranche,
        payment,
        confirmedOrderId: input.orderId,
        customerConfirmed: true,
        hasActiveDispute,
      });

      if (!decision.allowed) {
        summary.denied.push({ custodyId: tranche.id, reasons: decision.reasons });
        await this.auditLogService.record(
          {
            identityId: tranche.buyerId,
            operation: 'ReleaseIncrementalDenied',
            resource: 'IncrementalTrustCustody',
            resourceId: tranche.id,
            result: 'FAILURE',
            correlationId: input.correlationId,
            metadata: {
              paymentId: tranche.paymentId,
              orderId: tranche.orderId,
              changeOrderId: tranche.changeOrderId,
              reasons: decision.reasons,
              custodyStatus: tranche.status,
            },
          },
          tx,
        );
        continue;
      }

      // CAS fase 1 (mesmo padrão de IP-001's `closePauseIfOpen`): só marca
      // READY_FOR_RELEASE se o banco ainda disser IN_CUSTODY. `false` aqui
      // significa que outra chamada de `prepare` concorrente para o MESMO
      // pedido já preparou esta tranche entre a leitura e agora.
      const marked = await this.incrementalCustodyRepository.markReadyForReleaseIfInCustody(
        tranche.id,
        new Date(),
        tx,
      );
      if (!marked) {
        summary.alreadyReady.push(tranche.id);
        continue;
      }

      await this.outboxService.enqueue(tx, {
        eventType: 'Funds.ReadyForRelease',
        aggregateType: 'IncrementalTrustCustody',
        aggregateId: tranche.id,
        producer: PAY_PRODUCER,
        correlationId: input.correlationId,
        causationId: input.causationId,
        payload: {
          trustCustodyId: tranche.id,
          paymentId: tranche.paymentId,
          orderId: tranche.orderId,
          changeOrderId: tranche.changeOrderId,
          buyerId: tranche.buyerId,
          sellerId: tranche.sellerId,
          amount: toReais(tranche.amountCents),
          currency: tranche.currency,
          status: 'READY_FOR_RELEASE',
        },
      });

      await this.auditLogService.record(
        {
          identityId: tranche.buyerId,
          operation: 'PrepareIncrementalRelease',
          resource: 'IncrementalTrustCustody',
          resourceId: tranche.id,
          result: 'SUCCESS',
          correlationId: input.correlationId,
          metadata: {
            paymentId: tranche.paymentId,
            orderId: tranche.orderId,
            changeOrderId: tranche.changeOrderId,
            previousStatus: 'IN_CUSTODY',
            newStatus: 'READY_FOR_RELEASE',
          },
        },
        tx,
      );

      summary.ready.push(tranche.id);
    }

    return summary;
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
