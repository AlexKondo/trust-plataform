import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  ServiceExecutionPause,
  ServiceExecutionSession,
  minutesBetween,
} from '../../domain/entities/service-execution-session';
import {
  ServiceExecutionSessionNotFoundException,
  ServiceExecutionTransitionException,
  ServiceSummaryUnavailableException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceCommercialSnapshotRepository } from '../../domain/repositories/marketplace-commercial-snapshot.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { ServiceExecutionRepository } from '../../domain/repositories/service-execution.repository';
import { TrustChangeOrderRepository } from '../../domain/repositories/trust-change-order.repository';
import {
  calculateAuthorizedTime,
  calculateAuthorizedTotals,
  calculateBillableMinutes,
} from '../../domain/services/authorized-commercial.service';
import { CHANGE_ORDER_STATUS } from '../../domain/entities/marketplace-types';
import { RequestMeta } from '../dto/marketplace.dtos';
import {
  ExecutionSessionResponse,
  PauseExecutionRequest,
  ServiceSummaryResponse,
} from '../dto/trust-change-order.dtos';
import {
  toChangeOrderResponse,
  toExecutionSessionResponse,
} from '../mapper/trust-change-order.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { OrderLifecycleService } from './order-lifecycle.service';

/** Resultado do check-out já calculado, pronto para entrar na transação do pedido. */
export interface PreparedCheckOut {
  session: ServiceExecutionSession;
  closingPause: ServiceExecutionPause | null;
  elapsedMinutes: number | null;
  pausedMinutes: number;
  rawActiveMinutes: number | null;
  billableMinutes: number | null;
  authorizedMinutes: number | null;
  persist(tx: DatabaseExecutor): Promise<void>;
}

/**
 * PACK-03 §10/§11/§15 — o tempo da execução.
 *
 * Este use case é a camada de TEMPO sobre o check-in/check-out que já existia
 * (MRK-020/021). Ele não reimplementa aqueles marcos nem muda o status do
 * pedido: recebe os mesmos instantes e responde três perguntas que o MVP antes
 * não sabia separar — quanto durou, quanto foi pausa, e quanto disso é
 * faturável.
 */
@Injectable()
export class ServiceExecutionUseCase {
  constructor(
    private readonly executionRepository: ServiceExecutionRepository,
    private readonly changeOrderRepository: TrustChangeOrderRepository,
    private readonly snapshotRepository: MarketplaceCommercialSnapshotRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceExecutionUseCase.name);
  }

  /**
   * §10.1 — a sessão nasce no check-in do MRK-020, na MESMA transação: ou o
   * pedido entra em execução com sessão, ou não entra em execução.
   */
  buildSessionForCheckIn(orderId: string, performedBy: string, now: Date): ServiceExecutionSession {
    const session = ServiceExecutionSession.create(orderId, now);
    session.checkIn(performedBy, now);
    return session;
  }

  /**
   * §10.4 — prepara o check-out sem tocar no banco: aplica o fechamento em
   * memória para que o evento do pedido já saia com os números certos, e
   * devolve o `persist` que a transação do `OrderLifecycleService` executa.
   *
   * Devolve `null` para pedidos iniciados antes desta migration — eles seguem o
   * comportamento antigo, sem sessão, em vez de quebrar no check-out.
   */
  async prepareCheckOut(
    orderId: string,
    performedBy: string,
    now: Date,
  ): Promise<PreparedCheckOut | null> {
    const session = await this.executionRepository.findSessionByOrder(orderId);
    if (!session || session.isCompleted()) {
      return null;
    }

    // Pausa aberta no check-out é fechada aqui (regra determinística do §10.4):
    // recusar o check-out deixaria o prestador preso numa sessão viva.
    const openPause = await this.executionRepository.findOpenPause(session.id);
    const closingMinutes = openPause ? minutesBetween(openPause.pausedAt, now) : 0;
    openPause?.close(now);
    session.checkOut(performedBy, closingMinutes, now);

    const { billableMinutes, authorizedMinutes } = await this.resolveBillableTime(
      orderId,
      session.rawActiveMinutes,
    );

    return {
      session,
      closingPause: openPause,
      elapsedMinutes: session.elapsedMinutes,
      pausedMinutes: session.pausedMinutes,
      rawActiveMinutes: session.rawActiveMinutes,
      billableMinutes,
      authorizedMinutes,
      persist: async (tx: DatabaseExecutor) => {
        if (openPause) {
          await this.executionRepository.savePause(openPause, tx);
        }
        await this.executionRepository.saveSession(session, tx);
      },
    };
  }

  // ── §10.2 — Trust Pause ────────────────────────────────────────────────────
  async pause(
    identityId: string,
    orderId: string,
    body: PauseExecutionRequest,
    meta: RequestMeta = {},
  ): Promise<ExecutionSessionResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    const session = await this.loadSession(orderId);

    const now = new Date();
    session.pause(now); // recusa pausar fora de ACTIVE (§24)
    const pause = ServiceExecutionPause.open({
      sessionId: session.id,
      orderId,
      reasonCode: body.reasonCode,
      note: body.note,
      performedBy: identityId,
      now,
    });

    await this.db.transaction(async (tx) => {
      // O índice parcial (session_id) WHERE resumed_at IS NULL é quem garante,
      // em concorrência, que não existem duas pausas abertas (§19).
      await this.executionRepository.savePause(pause, tx);
      await this.executionRepository.saveSession(session, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'ServiceExecution.Paused',
        aggregateType: 'ServiceExecutionSession',
        aggregateId: session.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? session.id,
        payload: {
          sessionId: session.id,
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          pauseId: pause.id,
          reasonCode: pause.reasonCode,
          pausedAt: pause.pausedAt.toISOString(),
          status: session.status,
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'PauseServiceExecution',
          resource: 'ServiceExecutionSession',
          resourceId: session.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { orderId, reasonCode: pause.reasonCode },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'PauseServiceExecution',
        identityId,
        orderId,
        sessionId: session.id,
        reasonCode: pause.reasonCode,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Service execution paused (non-billable).',
    );

    return this.presentSession(orderId, session);
  }

  // ── §10.3 — Trust Resume ───────────────────────────────────────────────────
  async resume(
    identityId: string,
    orderId: string,
    meta: RequestMeta = {},
  ): Promise<ExecutionSessionResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    const session = await this.loadSession(orderId);

    // §10.3/§24: não se retoma o que não foi pausado.
    const openPause = await this.executionRepository.findOpenPause(session.id);
    if (!openPause) {
      throw new ServiceExecutionTransitionException(session.status, 'ACTIVE');
    }

    const now = new Date();
    const pausedMinutes = openPause.close(now);
    session.resume(pausedMinutes, now); // recusa retomar fora de PAUSED (§24)

    await this.db.transaction(async (tx) => {
      await this.executionRepository.savePause(openPause, tx);
      await this.executionRepository.saveSession(session, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'ServiceExecution.Resumed',
        aggregateType: 'ServiceExecutionSession',
        aggregateId: session.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? session.id,
        payload: {
          sessionId: session.id,
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          pauseId: openPause.id,
          reasonCode: openPause.reasonCode,
          pausedMinutes,
          totalPausedMinutes: session.pausedMinutes,
          resumedAt: now.toISOString(),
          status: session.status,
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'ResumeServiceExecution',
          resource: 'ServiceExecutionSession',
          resourceId: session.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { orderId, pausedMinutes, totalPausedMinutes: session.pausedMinutes },
        },
        tx,
      );
    });

    return this.presentSession(orderId, session);
  }

  // ── §15 — Service Summary ──────────────────────────────────────────────────
  async getServiceSummary(
    identityId: string,
    orderId: string,
    meta: RequestMeta = {},
  ): Promise<ServiceSummaryResponse> {
    const { order, role } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const isPartner = role === 'SELLER';

    const [snapshot, changeOrders, session, listing] = await Promise.all([
      this.snapshotRepository.findByOrderId(orderId),
      this.changeOrderRepository.listByOrder(orderId),
      this.executionRepository.findSessionByOrder(orderId),
      this.listingRepository.findById(order.listingId),
    ]);
    if (!snapshot) {
      throw new ServiceSummaryUnavailableException();
    }

    const totals = calculateAuthorizedTotals(snapshot, changeOrders);
    const time = calculateAuthorizedTime(snapshot, changeOrders);
    const pauses = session ? await this.executionRepository.listPauses(session.id) : [];
    const billableMinutes = calculateBillableMinutes({
      rawActiveMinutes: session?.rawActiveMinutes ?? null,
      authorizedMinutes: time.authorizedMinutes,
      minimumMinutes: snapshot.minimumMinutes,
    });

    // §15 BR de leitura: consulta ao resumo é auditada, mas nunca derruba a
    // requisição (mesmo padrão do MRK-016).
    await this.auditLogService.recordSafe({
      identityId,
      operation: 'GetServiceSummary',
      resource: 'MarketplaceOrder',
      resourceId: orderId,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
    });

    const present = async (changeOrder: (typeof changeOrders)[number]) =>
      toChangeOrderResponse(
        changeOrder,
        await this.changeOrderRepository.listEvidences(changeOrder.id),
        isPartner,
      );

    const now = new Date();
    const approved = await Promise.all(
      changeOrders.filter((changeOrder) => changeOrder.isApproved()).map(present),
    );
    // §15: pendentes e rejeitados aparecem "where useful for transparency" — o
    // Member precisa ver o que foi pedido e não entrou na conta.
    const pending = await Promise.all(
      changeOrders
        .filter(
          (changeOrder) =>
            changeOrder.effectiveStatus(now) === CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL,
        )
        .map(present),
    );
    const rejected = await Promise.all(
      changeOrders
        .filter((changeOrder) => changeOrder.effectiveStatus(now) === CHANGE_ORDER_STATUS.REJECTED)
        .map(present),
    );

    return {
      orderId,
      listingTitle: listing?.title ?? null,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      pricingModel: order.pricingModel,
      currency: totals.currency,
      status: order.status,
      execution: session
        ? toExecutionSessionResponse(session, pauses, billableMinutes, time.authorizedMinutes)
        : null,
      initialAuthorizedAmount: totals.initialGrossAmount,
      approvedChangesAmount: totals.approvedChangesGrossAmount,
      currentAuthorizedGrossAmount: totals.currentGrossAmount,
      currentServiceAmount: totals.currentServiceAmount,
      currentMaterialCostAmount: totals.currentMaterialCostAmount,
      currentMaterialMarkupAmount: totals.currentMaterialMarkupAmount,
      amountInCustody: totals.amountInCustody,
      amountAuthorizedNotInCustody: totals.amountAuthorizedNotInCustody,
      ...(isPartner
        ? {
            currentTrustFeeAmount: totals.currentTrustFeeAmount,
            currentProviderNetBeforePspFees: totals.currentProviderNetBeforePspFees,
          }
        : {}),
      approvedChangeOrders: approved,
      pendingChangeOrders: pending,
      rejectedChangeOrders: rejected,
      customerConfirmedAt: order.customerConfirmedAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
    };
  }

  /** Tempo faturável corrente do pedido (§11) — usado no check-out e no resumo. */
  async resolveBillableTime(
    orderId: string,
    rawActiveMinutes: number | null,
  ): Promise<{ billableMinutes: number | null; authorizedMinutes: number | null }> {
    const snapshot = await this.snapshotRepository.findByOrderId(orderId);
    if (!snapshot) {
      return { billableMinutes: null, authorizedMinutes: null };
    }
    const changeOrders = await this.changeOrderRepository.listByOrder(orderId);
    const time = calculateAuthorizedTime(snapshot, changeOrders);
    return {
      authorizedMinutes: time.authorizedMinutes,
      billableMinutes: calculateBillableMinutes({
        rawActiveMinutes,
        authorizedMinutes: time.authorizedMinutes,
        minimumMinutes: snapshot.minimumMinutes,
      }),
    };
  }

  private async loadSession(orderId: string): Promise<ServiceExecutionSession> {
    const session = await this.executionRepository.findSessionByOrder(orderId);
    if (!session) {
      throw new ServiceExecutionSessionNotFoundException();
    }
    return session;
  }

  private async presentSession(
    orderId: string,
    session: ServiceExecutionSession,
  ): Promise<ExecutionSessionResponse> {
    const [pauses, time] = await Promise.all([
      this.executionRepository.listPauses(session.id),
      this.resolveBillableTime(orderId, session.rawActiveMinutes),
    ]);
    return toExecutionSessionResponse(
      session,
      pauses,
      time.billableMinutes,
      time.authorizedMinutes,
    );
  }
}
