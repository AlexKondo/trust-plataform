import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { EvidenceStorageService } from '../../../../shared/storage/evidence-storage.service';
import { MarketplaceCommercialSnapshot } from '../../domain/entities/marketplace-commercial-snapshot';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import {
  CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS,
  ChangeOrderEvidenceType,
} from '../../domain/entities/marketplace-types';
import { FrozenContractTerms, TrustChangeOrder } from '../../domain/entities/trust-change-order';
import {
  ChangeOrderEvidenceMediaTypeException,
  ChangeOrderEvidenceTooLargeException,
  MarketplaceOrderAccessDeniedException,
  TrustChangeOrderAccessDeniedException,
  TrustChangeOrderExpiredException,
  TrustChangeOrderNotAllowedForOrderException,
  TrustChangeOrderNotFoundException,
  TrustChangeOrderTransitionException,
  TrustChangeOrderValidationException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceCommercialSnapshotRepository } from '../../domain/repositories/marketplace-commercial-snapshot.repository';
import { TrustChangeOrderRepository } from '../../domain/repositories/trust-change-order.repository';
import { calculateAuthorizedTotals } from '../../domain/services/authorized-commercial.service';
import { RequestMeta } from '../dto/marketplace.dtos';
import {
  ALLOWED_CHANGE_ORDER_EVIDENCE_MIME_TYPES,
  ChangeOrderResponse,
  CreateChangeOrderRequest,
  RejectChangeOrderRequest,
} from '../dto/trust-change-order.dtos';
import { toChangeOrderResponse } from '../mapper/trust-change-order.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { OrderLifecycleService } from './order-lifecycle.service';

/** §13 — bucket próprio; a evidência de Change Order não mistura com a do VRF. */
const CHANGE_ORDER_EVIDENCE_BUCKET = 'change-order-evidences';

export interface UploadChangeOrderEvidenceInput {
  changeOrderId: string;
  evidenceType: ChangeOrderEvidenceType;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

/**
 * PACK-03 §6/§12/§13 — ciclo de vida do Trust Change Order.
 *
 * A regra que este use case existe para impor: **o Trust Partner propõe, o
 * Trust Member decide**. Criar e submeter é do prestador; aprovar e rejeitar é
 * do cliente; e só `APPROVED` mexe no que está autorizado.
 *
 * O total corrente NÃO é gravado em lugar nenhum: ele é derivado do snapshot
 * imutável do PACK-02 mais os Change Orders aprovados
 * (`authorized-commercial.service.ts`). Isso resolve o "aplicar o delta
 * exatamente uma vez" do §19 por construção — não existe contador para
 * desincronizar.
 */
@Injectable()
export class ManageChangeOrderUseCase {
  constructor(
    private readonly changeOrderRepository: TrustChangeOrderRepository,
    private readonly snapshotRepository: MarketplaceCommercialSnapshotRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly storage: EvidenceStorageService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    private readonly config: AppConfigService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ManageChangeOrderUseCase.name);
  }

  // ── §7 — criação (rascunho) ────────────────────────────────────────────────
  async create(
    identityId: string,
    orderId: string,
    body: CreateChangeOrderRequest,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    // §18: só o Partner do contrato propõe aumento.
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    this.assertOrderAcceptsChanges(order);
    const snapshot = await this.loadSnapshot(orderId);

    const changeOrder = TrustChangeOrder.create({
      orderId,
      proposedBy: identityId,
      type: body.type,
      contract: frozenTermsOf(snapshot),
      additionalMinutes: body.additionalMinutes,
      serviceDeltaAmount: body.serviceDeltaAmount,
      materialCostDeltaAmount: body.materialCostDeltaAmount,
      materialMarkupDeltaAmount: body.materialMarkupDeltaAmount,
      reason: body.reason,
      description: body.description,
      expiresAt: body.expiresAt,
    });

    // §6.1: DRAFT não muda valor autorizado nenhum — por isso não há evento
    // aqui, só auditoria. Evento só quando o fato interessa a outro módulo.
    await this.db.transaction(async (tx) => {
      await this.changeOrderRepository.create(changeOrder, tx);
      await this.auditLogService.record(
        {
          identityId,
          operation: 'CreateTrustChangeOrder',
          resource: 'TrustChangeOrder',
          resourceId: changeOrder.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: {
            orderId,
            type: changeOrder.type,
            changeGrossAmount: changeOrder.changeGrossAmount,
            additionalMinutes: changeOrder.additionalMinutes,
          },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: 'CreateTrustChangeOrder',
        identityId,
        orderId,
        changeOrderId: changeOrder.id,
        type: changeOrder.type,
        changeGrossAmount: changeOrder.changeGrossAmount,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Trust Change Order drafted.',
    );

    return toChangeOrderResponse(changeOrder, [], true);
  }

  // ── §6.1 — submissão ao Trust Member ───────────────────────────────────────
  async submit(
    identityId: string,
    changeOrderId: string,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    const { changeOrder, order } = await this.loadForProposer(changeOrderId, identityId);
    this.assertOrderAcceptsChanges(order);
    this.assertNotExpired(changeOrder);

    const previousStatus = changeOrder.status;
    changeOrder.submit();

    await this.db.transaction(async (tx) => {
      await this.assertPersisted(changeOrder, previousStatus, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'TrustChangeOrder.Submitted',
        aggregateType: 'TrustChangeOrder',
        aggregateId: changeOrder.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? changeOrder.id,
        payload: {
          changeOrderId: changeOrder.id,
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          proposedBy: changeOrder.proposedBy,
          type: changeOrder.type,
          additionalMinutes: changeOrder.additionalMinutes,
          changeGrossAmount: changeOrder.changeGrossAmount,
          currency: changeOrder.currency,
          reason: changeOrder.reason,
          submittedAt: changeOrder.submittedAt!.toISOString(),
          status: changeOrder.status,
        },
      });
      await this.audit(tx, identityId, 'SubmitTrustChangeOrder', changeOrder, meta, {
        previousStatus,
      });
    });

    return this.present(changeOrder, true);
  }

  // ── §6.1/§12 — decisão do Trust Member ─────────────────────────────────────
  async approve(
    identityId: string,
    changeOrderId: string,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    const { changeOrder, order } = await this.loadForMember(changeOrderId, identityId);
    this.assertNotExpired(changeOrder);

    const previousStatus = changeOrder.status;
    changeOrder.approve(identityId);

    // O total corrente entra no evento porque é o número que o resto da
    // plataforma precisa saber — e porque deixa explícito, no próprio fato,
    // quanto está autorizado mas fora da custódia (§9). A aprovação recém
    // aplicada entra no cálculo antes de ser gravada.
    const totals = await this.currentTotals(order.id, changeOrder);

    await this.db.transaction(async (tx) => {
      await this.assertPersisted(changeOrder, previousStatus, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'TrustChangeOrder.Approved',
        aggregateType: 'TrustChangeOrder',
        aggregateId: changeOrder.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? changeOrder.id,
        payload: {
          changeOrderId: changeOrder.id,
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          approvedBy: identityId,
          type: changeOrder.type,
          additionalMinutes: changeOrder.additionalMinutes,
          changeGrossAmount: changeOrder.changeGrossAmount,
          changeTrustFeeAmount: changeOrder.changeTrustFeeAmount,
          currency: changeOrder.currency,
          currentAuthorizedGrossAmount: totals.currentGrossAmount,
          // PACK-03 §9: a custódia do PACK-01 continua no valor da contratação.
          amountAuthorizedNotInCustody: totals.amountAuthorizedNotInCustody,
          approvedAt: changeOrder.decidedAt!.toISOString(),
          status: changeOrder.status,
        },
      });
      await this.audit(tx, identityId, 'ApproveTrustChangeOrder', changeOrder, meta, {
        previousStatus,
        currentAuthorizedGrossAmount: totals.currentGrossAmount,
      });
    });

    this.logger.info(
      {
        operation: 'ApproveTrustChangeOrder',
        identityId,
        orderId: order.id,
        changeOrderId: changeOrder.id,
        changeGrossAmount: changeOrder.changeGrossAmount,
        currentAuthorizedGrossAmount: totals.currentGrossAmount,
        amountAuthorizedNotInCustody: totals.amountAuthorizedNotInCustody,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Trust Change Order approved by the customer.',
    );

    return this.present(changeOrder, false);
  }

  async reject(
    identityId: string,
    changeOrderId: string,
    body: RejectChangeOrderRequest,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    const { changeOrder, order } = await this.loadForMember(changeOrderId, identityId);
    this.assertNotExpired(changeOrder);

    const previousStatus = changeOrder.status;
    changeOrder.reject(identityId, body.reason);

    await this.db.transaction(async (tx) => {
      await this.assertPersisted(changeOrder, previousStatus, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'TrustChangeOrder.Rejected',
        aggregateType: 'TrustChangeOrder',
        aggregateId: changeOrder.id,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? changeOrder.id,
        payload: {
          changeOrderId: changeOrder.id,
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          rejectedBy: identityId,
          type: changeOrder.type,
          changeGrossAmount: changeOrder.changeGrossAmount,
          currency: changeOrder.currency,
          reason: changeOrder.decisionReason,
          rejectedAt: changeOrder.decidedAt!.toISOString(),
          status: changeOrder.status,
        },
      });
      await this.audit(tx, identityId, 'RejectTrustChangeOrder', changeOrder, meta, {
        previousStatus,
      });
    });

    return this.present(changeOrder, false);
  }

  /** §6.1 — retirada pelo proponente, só antes da decisão. Sem evento: nada muda. */
  async cancel(
    identityId: string,
    changeOrderId: string,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    const { changeOrder } = await this.loadForProposer(changeOrderId, identityId);

    const previousStatus = changeOrder.status;
    changeOrder.cancel(identityId);

    await this.db.transaction(async (tx) => {
      await this.assertPersisted(changeOrder, previousStatus, tx);
      await this.audit(tx, identityId, 'CancelTrustChangeOrder', changeOrder, meta, {
        previousStatus,
      });
    });

    return this.present(changeOrder, true);
  }

  // ── §21 — leitura ──────────────────────────────────────────────────────────
  async listByOrder(identityId: string, orderId: string): Promise<ChangeOrderResponse[]> {
    const { order, role } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const changeOrders = await this.changeOrderRepository.listByOrder(order.id);
    return Promise.all(
      changeOrders.map(async (changeOrder) =>
        toChangeOrderResponse(
          changeOrder,
          await this.changeOrderRepository.listEvidences(changeOrder.id),
          role === 'SELLER',
        ),
      ),
    );
  }

  async get(identityId: string, changeOrderId: string): Promise<ChangeOrderResponse> {
    const changeOrder = await this.load(changeOrderId);
    const { role } = await this.lifecycle.loadForParticipant(changeOrder.orderId, identityId);
    return toChangeOrderResponse(
      changeOrder,
      await this.changeOrderRepository.listEvidences(changeOrder.id),
      role === 'SELLER',
    );
  }

  // ── §13 — evidência ────────────────────────────────────────────────────────
  async uploadEvidence(
    identityId: string,
    input: UploadChangeOrderEvidenceInput,
    meta: RequestMeta = {},
  ): Promise<ChangeOrderResponse> {
    const { changeOrder } = await this.loadForProposer(input.changeOrderId, identityId);

    // §6.1: aprovado é imutável — anexar prova depois da decisão mudaria o que
    // o Member aprovou.
    if (
      changeOrder.status !== CHANGE_ORDER_STATUS.DRAFT &&
      changeOrder.status !== CHANGE_ORDER_STATUS.PENDING_MEMBER_APPROVAL
    ) {
      throw new TrustChangeOrderTransitionException(changeOrder.status, changeOrder.status);
    }
    if (
      !ALLOWED_CHANGE_ORDER_EVIDENCE_MIME_TYPES.includes(
        input.mimeType as (typeof ALLOWED_CHANGE_ORDER_EVIDENCE_MIME_TYPES)[number],
      )
    ) {
      throw new ChangeOrderEvidenceMediaTypeException(input.mimeType);
    }
    if (input.content.length > this.config.evidenceMaxFileBytes) {
      throw new ChangeOrderEvidenceTooLargeException(this.config.evidenceMaxFileBytes);
    }

    const evidenceId = uuidv7();
    const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
    const storageKey = `change-orders/${changeOrder.id}/${evidenceId}-${safeName}`;
    const checksum = createHash('sha256').update(input.content).digest('hex');

    // Upload ANTES da transação: se o storage falhar, nada é persistido e não
    // fica metadado apontando para arquivo inexistente (mesmo padrão do VRF-002).
    await this.storage.upload({
      bucket: CHANGE_ORDER_EVIDENCE_BUCKET,
      storageKey,
      content: input.content,
      mimeType: input.mimeType,
    });

    const uploadedAt = new Date();
    await this.db.transaction(async (tx) => {
      await this.changeOrderRepository.addEvidence(
        {
          id: evidenceId,
          changeOrderId: changeOrder.id,
          type: input.evidenceType,
          storageKey,
          fileName: safeName,
          mimeType: input.mimeType,
          fileSize: input.content.length,
          checksum,
          uploadedBy: identityId,
          uploadedAt,
        },
        tx,
      );
      await this.auditLogService.record(
        {
          identityId,
          operation: 'SubmitTrustChangeOrderEvidence',
          resource: 'TrustChangeOrder',
          resourceId: changeOrder.id,
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

    return this.present(changeOrder, true);
  }

  // ── Infra interna ──────────────────────────────────────────────────────────

  private async load(changeOrderId: string): Promise<TrustChangeOrder> {
    const changeOrder = await this.changeOrderRepository.findById(changeOrderId);
    if (!changeOrder) {
      throw new TrustChangeOrderNotFoundException();
    }
    return changeOrder;
  }

  /** §18 — quem propôs (o Partner do contrato) e mais ninguém. */
  private async loadForProposer(
    changeOrderId: string,
    identityId: string,
  ): Promise<{ changeOrder: TrustChangeOrder; order: MarketplaceOrder }> {
    const changeOrder = await this.load(changeOrderId);
    const order = await this.lifecycle
      .loadForSeller(changeOrder.orderId, identityId)
      .catch((error: unknown) => {
        if (error instanceof MarketplaceOrderAccessDeniedException) {
          throw new TrustChangeOrderAccessDeniedException(
            'Only the service provider who proposed this change order can perform this operation.',
          );
        }
        throw error;
      });
    if (changeOrder.proposedBy !== identityId) {
      throw new TrustChangeOrderAccessDeniedException(
        'Only the service provider who proposed this change order can perform this operation.',
      );
    }
    return { changeOrder, order };
  }

  /** §18 — só o Trust Member do contrato decide; nem o Partner, nem terceiros. */
  private async loadForMember(
    changeOrderId: string,
    identityId: string,
  ): Promise<{ changeOrder: TrustChangeOrder; order: MarketplaceOrder }> {
    const changeOrder = await this.load(changeOrderId);
    const order = await this.lifecycle.loadForBuyer(changeOrder.orderId, identityId).catch(
      (error: unknown) => {
        if (error instanceof MarketplaceOrderAccessDeniedException) {
          throw new TrustChangeOrderAccessDeniedException(
            'Only the customer can approve or reject a change order.',
          );
        }
        throw error;
      },
    );
    return { changeOrder, order };
  }

  private async loadSnapshot(orderId: string): Promise<MarketplaceCommercialSnapshot> {
    const snapshot = await this.snapshotRepository.findByOrderId(orderId);
    if (!snapshot) {
      // Pedido anterior ao PACK-02: sem taxa congelada não há como precificar um
      // delta sem inventar política — parar é mais seguro que adivinhar.
      throw new TrustChangeOrderValidationException(
        'This order has no frozen commercial snapshot; change orders are not supported for it.',
      );
    }
    return snapshot;
  }

  /** §24 — o contrato tem que estar vivo e ainda não confirmado pelo cliente. */
  private assertOrderAcceptsChanges(order: MarketplaceOrder): void {
    if (!CHANGE_ORDER_ELIGIBLE_ORDER_STATUSES.includes(order.status)) {
      throw new TrustChangeOrderNotAllowedForOrderException(order.status);
    }
  }

  private assertNotExpired(changeOrder: TrustChangeOrder): void {
    if (changeOrder.isExpiredAt()) {
      throw new TrustChangeOrderExpiredException();
    }
  }

  /**
   * §19 — a gravação só passa se o status no banco ainda for o anterior. Duas
   * aprovações simultâneas: uma grava, a outra recebe 409 em vez de aplicar o
   * delta duas vezes.
   */
  private async assertPersisted(
    changeOrder: TrustChangeOrder,
    previousStatus: string,
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  ): Promise<void> {
    const persisted = await this.changeOrderRepository.saveWithExpectedStatus(
      changeOrder,
      previousStatus as never,
      tx,
    );
    if (!persisted) {
      throw new TrustChangeOrderTransitionException(previousStatus, changeOrder.status);
    }
  }

  /**
   * Totais correntes do contrato. `pending` é a decisão que ainda não foi
   * gravada: sem ela o cálculo leria o estado ANTERIOR do banco e o evento
   * sairia anunciando um total que já está desatualizado no instante em que
   * é publicado.
   */
  private async currentTotals(orderId: string, pending?: TrustChangeOrder) {
    const [snapshot, persisted] = await Promise.all([
      this.loadSnapshot(orderId),
      this.changeOrderRepository.listByOrder(orderId),
    ]);
    const changeOrders = pending
      ? persisted.map((changeOrder) => (changeOrder.id === pending.id ? pending : changeOrder))
      : persisted;
    return calculateAuthorizedTotals(snapshot, changeOrders);
  }

  private async audit(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    identityId: string,
    operation: string,
    changeOrder: TrustChangeOrder,
    meta: RequestMeta,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.record(
      {
        identityId,
        operation,
        resource: 'TrustChangeOrder',
        resourceId: changeOrder.id,
        result: 'SUCCESS',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
        requestId: meta.requestId,
        metadata: {
          orderId: changeOrder.orderId,
          newStatus: changeOrder.status,
          changeGrossAmount: changeOrder.changeGrossAmount,
          ...metadata,
        },
      },
      tx,
    );
  }

  private async present(
    changeOrder: TrustChangeOrder,
    includeFinancials: boolean,
  ): Promise<ChangeOrderResponse> {
    return toChangeOrderResponse(
      changeOrder,
      await this.changeOrderRepository.listEvidences(changeOrder.id),
      includeFinancials,
    );
  }
}

/** §8 — os termos vêm SEMPRE do snapshot congelado, nunca da política vigente. */
export function frozenTermsOf(snapshot: MarketplaceCommercialSnapshot): FrozenContractTerms {
  return {
    pricingModel: snapshot.pricingModel,
    currency: snapshot.currency,
    hourlyRateAmount: snapshot.hourlyRateAmount,
    billingIncrementMinutes: snapshot.billingIncrementMinutes,
    trustFeeRateBps: snapshot.trustFeeRateBps,
  };
}
