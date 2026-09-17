import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { RateLimitService } from '../../../../shared/safety/rate-limit.service';
import { EvidenceStorageService } from '../../../../shared/storage/evidence-storage.service';
import {
  ServiceExecutionPause,
  ServiceExecutionSession,
  minutesBetween,
} from '../../domain/entities/service-execution-session';
import {
  ExecutionEvidenceMediaTypeException,
  ExecutionEvidenceTooLargeException,
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
import {
  CHANGE_ORDER_STATUS,
  ExecutionEvidenceType,
} from '../../domain/entities/marketplace-types';
import { RequestMeta } from '../dto/marketplace.dtos';
import {
  ALLOWED_EXECUTION_EVIDENCE_MIME_TYPES,
  AddServiceNoteRequest,
  ExecutionEvidenceResponse,
  ExecutionSessionResponse,
  PauseExecutionRequest,
  ServiceNoteResponse,
  ServiceSummaryResponse,
} from '../dto/trust-change-order.dtos';
import {
  toChangeOrderResponse,
  toExecutionEvidenceResponse,
  toExecutionSessionResponse,
  toServiceNoteResponse,
} from '../mapper/trust-change-order.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { OrderLifecycleService } from './order-lifecycle.service';

/** IP-006 — bucket próprio; a Trust Evidence de execução não mistura com VRF/Change Order. */
const EXECUTION_EVIDENCE_BUCKET = 'service-execution-evidences';

export interface UploadExecutionEvidenceInput {
  orderId: string;
  evidenceType: ExecutionEvidenceType;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

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
    private readonly rateLimitService: RateLimitService,
    private readonly storage: EvidenceStorageService,
    private readonly config: AppConfigService,
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
      // IP-001 — compare-and-set: entre o `findOpenPause` acima e este
      // UPDATE, outra chamada concorrente de Resume pode ter fechado a mesma
      // pausa. `closePauseIfOpen` só grava se `resumed_at` ainda estiver NULL
      // no banco; se perder a corrida, a transação é abortada e o duplo
      // Resume nunca chega a persistir a sessão nem a publicar o evento.
      const closed = await this.executionRepository.closePauseIfOpen(openPause, tx);
      if (!closed) {
        throw new ServiceExecutionTransitionException(session.status, 'ACTIVE');
      }
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

  // ── IP-006 — Trust Evidence de execução (foto opcional antes/depois) ───────
  /**
   * Nunca obrigatória: nenhuma outra operação (check-in/pausa/check-out) exige
   * evidência para acontecer. Restrita ao Trust Partner do pedido — é ele quem
   * documenta o serviço, o mesmo ator do Change Order (§13 do PACK-03).
   */
  async uploadEvidence(
    identityId: string,
    input: UploadExecutionEvidenceInput,
    meta: RequestMeta = {},
  ): Promise<ExecutionEvidenceResponse> {
    try {
      await this.rateLimitService.assertWithinLimit(identityId, 'SubmitServiceExecutionEvidence', {
        maxAttempts: this.config.sensitiveActionRateLimitMaxAttempts,
        windowMinutes: this.config.sensitiveActionRateLimitWindowMinutes,
      });
    } catch (error) {
      await this.auditLogService.recordSafe({
        identityId,
        operation: 'SubmitServiceExecutionEvidence',
        resource: 'MarketplaceOrder',
        resourceId: input.orderId,
        result: 'DENIED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        metadata: { reason: 'RATE_LIMIT_EXCEEDED' },
      });
      throw error;
    }

    // Só o Trust Partner do pedido anexa evidência de execução; nunca pública.
    await this.lifecycle.loadForSeller(input.orderId, identityId);

    if (
      !ALLOWED_EXECUTION_EVIDENCE_MIME_TYPES.includes(
        input.mimeType as (typeof ALLOWED_EXECUTION_EVIDENCE_MIME_TYPES)[number],
      )
    ) {
      throw new ExecutionEvidenceMediaTypeException(input.mimeType);
    }
    if (input.content.length > this.config.evidenceMaxFileBytes) {
      throw new ExecutionEvidenceTooLargeException(this.config.evidenceMaxFileBytes);
    }

    const evidenceId = uuidv7();
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
    const storageKey = `orders/${input.orderId}/${evidenceId}-${safeName}`;
    const checksum = createHash('sha256').update(input.content).digest('hex');

    // Upload ANTES da transação: se o storage falhar, nada é persistido e não
    // fica metadado apontando para arquivo inexistente (mesmo padrão do §13).
    await this.storage.upload({
      bucket: EXECUTION_EVIDENCE_BUCKET,
      storageKey,
      content: input.content,
      mimeType: input.mimeType,
    });

    const uploadedAt = new Date();
    const record = {
      id: evidenceId,
      orderId: input.orderId,
      type: input.evidenceType,
      storageKey,
      fileName: safeName,
      mimeType: input.mimeType,
      fileSize: input.content.length,
      checksum,
      uploadedBy: identityId,
      uploadedAt,
    };
    await this.db.transaction(async (tx) => {
      await this.executionRepository.addEvidence(record, tx);
      await this.auditLogService.record(
        {
          identityId,
          operation: 'SubmitServiceExecutionEvidence',
          resource: 'MarketplaceOrder',
          resourceId: input.orderId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          // Nunca o conteúdo — só metadados (trust-logging).
          metadata: { evidenceType: input.evidenceType, fileSize: input.content.length },
        },
        tx,
      );
    });

    return toExecutionEvidenceResponse(record);
  }

  /** Lida a qualquer participante — nunca pública (§ acceptance: evidência privada e autorizada). */
  async listEvidences(
    identityId: string,
    orderId: string,
  ): Promise<ExecutionEvidenceResponse[]> {
    await this.lifecycle.loadForParticipant(orderId, identityId);
    const records = await this.executionRepository.listEvidences(orderId);
    return records.map(toExecutionEvidenceResponse);
  }

  // ── IP-006 — Nota de serviço do Partner ─────────────────────────────────────
  /** Texto livre sobre o que foi feito, separado do fluxo de disputa/avaliação. */
  async addNote(
    identityId: string,
    orderId: string,
    body: AddServiceNoteRequest,
    meta: RequestMeta = {},
  ): Promise<ServiceNoteResponse> {
    await this.lifecycle.loadForSeller(orderId, identityId);

    const record = {
      id: uuidv7(),
      orderId,
      body: body.body,
      createdBy: identityId,
      createdAt: new Date(),
    };
    await this.db.transaction(async (tx) => {
      await this.executionRepository.addNote(record, tx);
      await this.auditLogService.record(
        {
          identityId,
          operation: 'AddServiceNote',
          resource: 'MarketplaceOrder',
          resourceId: orderId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: {},
        },
        tx,
      );
    });

    return toServiceNoteResponse(record);
  }

  async listNotes(identityId: string, orderId: string): Promise<ServiceNoteResponse[]> {
    await this.lifecycle.loadForParticipant(orderId, identityId);
    const records = await this.executionRepository.listNotes(orderId);
    return records.map(toServiceNoteResponse);
  }

  // ── §15 — Service Summary ──────────────────────────────────────────────────
  async getServiceSummary(
    identityId: string,
    orderId: string,
    meta: RequestMeta = {},
  ): Promise<ServiceSummaryResponse> {
    const { order, role } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const isPartner = role === 'SELLER';

    const [snapshot, changeOrders, session, listing, executionEvidences, serviceNotes] =
      await Promise.all([
        this.snapshotRepository.findByOrderId(orderId),
        this.changeOrderRepository.listByOrder(orderId),
        this.executionRepository.findSessionByOrder(orderId),
        this.listingRepository.findById(order.listingId),
        this.executionRepository.listEvidences(orderId),
        this.executionRepository.listNotes(orderId),
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
      // IP-006 — completion handoff: fotos e notas relevantes às duas partes,
      // sempre presentes mesmo quando vazias ([]) — nunca obrigatórias.
      evidences: executionEvidences.map(toExecutionEvidenceResponse),
      notes: serviceNotes.map(toServiceNoteResponse),
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
