import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import {
  DisputeDecision,
  MarketplaceDispute,
} from '../../domain/entities/marketplace-dispute';
import { ORDER_STATUS } from '../../domain/entities/marketplace-types';
import {
  MarketplaceDisputeAlreadyOpenException,
  MarketplaceDisputeNotFoundException,
  MarketplaceOrderAccessDeniedException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import { MarketplaceReviewRepository } from '../../domain/repositories/marketplace-review.repository';
import {
  DisputeResponse,
  OpenDisputeRequest,
  ResolveDisputeRequest,
} from '../dto/marketplace-review.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toDisputeResponse } from '../mapper/marketplace.mapper';
import { OrderLifecycleService } from './order-lifecycle.service';

/**
 * Disputas (MRK-023/024). Abrir é direito de qualquer participante; decidir é
 * privativo da plataforma (admin/mediador) — a assimetria é proposital: quem
 * está em conflito não julga o próprio caso.
 */
@Injectable()
export class ManageDisputeUseCase {
  constructor(
    private readonly reviewRepository: MarketplaceReviewRepository,
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ManageDisputeUseCase.name);
  }

  /** MRK-023 — abre a disputa e leva o pedido para DISPUTE_OPEN (BR-005). */
  async open(
    identityId: string,
    orderId: string,
    body: OpenDisputeRequest,
    meta: RequestMeta = {},
  ): Promise<DisputeResponse> {
    const { order } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const previousStatus = order.status;

    // BR-002: uma disputa ativa por pedido (o índice parcial reforça no banco)
    if (await this.reviewRepository.findActiveDisputeByOrder(orderId)) {
      throw new MarketplaceDisputeAlreadyOpenException();
    }

    const dispute = MarketplaceDispute.open({
      orderId,
      openedBy: identityId,
      category: body.category,
      description: body.description,
    });
    // A transição valida se o estado atual admite disputa (MRK-017 BR-003)
    order.transitionTo(ORDER_STATUS.DISPUTE_OPEN);

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'OpenMarketplaceDispute',
      eventName: 'MarketplaceDispute.Opened',
      eventPayload: {
        disputeId: dispute.id,
        orderId,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        openedBy: identityId,
        category: dispute.category,
        openedAt: dispute.openedAt.toISOString(),
      },
      auditMetadata: { disputeId: dispute.id, category: dispute.category },
      meta,
      // BR-006: abrir disputa não toca em nenhuma evidência já registrada
      alsoInTransaction: (tx) => this.reviewRepository.saveDispute(dispute, tx),
    });

    this.logger.info(
      {
        operation: 'OpenMarketplaceDispute',
        identityId,
        disputeId: dispute.id,
        orderId,
        category: dispute.category,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace dispute opened.',
    );

    return toDisputeResponse(dispute, null);
  }

  /**
   * MRK-024 — decisão da plataforma (ADMIN). Encerra a disputa, leva o pedido
   * para DISPUTE_RESOLVED (BR-005) e publica o desfecho, que o Trust Engine usa
   * para penalizar a parte considerada culpada.
   */
  async resolve(
    adminId: string,
    disputeId: string,
    body: ResolveDisputeRequest,
    meta: RequestMeta = {},
  ): Promise<DisputeResponse> {
    const dispute = await this.reviewRepository.findDisputeById(disputeId);
    if (!dispute) {
      throw new MarketplaceDisputeNotFoundException();
    }
    const order = await this.orderRepository.findById(dispute.orderId);
    if (!order) {
      throw new MarketplaceDisputeNotFoundException();
    }
    const previousStatus = order.status;

    const decision = DisputeDecision.create({
      disputeId,
      decidedBy: adminId,
      decisionType: body.decisionType,
      justification: body.justification,
    });
    dispute.resolve(decision); // recusa disputa já decidida (BR-006)
    order.transitionTo(ORDER_STATUS.DISPUTE_RESOLVED);

    // Procedente = quem foi reclamado errou; nos demais desfechos ninguém é
    // penalizado (o Trust Engine ignora o evento sem `faultIdentityId`).
    const respondentId =
      dispute.openedBy === order.buyerId ? order.sellerId : order.buyerId;
    const faultIdentityId = decision.recognizesFault() ? respondentId : null;

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: adminId,
      operation: 'ResolveMarketplaceDispute',
      eventName: 'MarketplaceDispute.Resolved',
      eventPayload: {
        disputeId,
        decisionId: decision.id,
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        openedBy: dispute.openedBy,
        decisionType: decision.decisionType,
        faultIdentityId,
        decidedBy: adminId,
        decidedAt: decision.decidedAt.toISOString(),
      },
      auditMetadata: {
        disputeId,
        decisionId: decision.id,
        decisionType: decision.decisionType,
        faultIdentityId,
      },
      meta,
      alsoInTransaction: async (tx) => {
        await this.reviewRepository.saveDecision(decision, tx);
        await this.reviewRepository.saveDispute(dispute, tx);
      },
    });

    this.logger.info(
      {
        operation: 'ResolveMarketplaceDispute',
        identityId: adminId,
        disputeId,
        decisionId: decision.id,
        decisionType: decision.decisionType,
        faultIdentityId,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace dispute resolved.',
    );

    return toDisputeResponse(dispute, decision);
  }

  /** Disputas de um pedido (participantes). */
  async listByOrder(identityId: string, orderId: string): Promise<DisputeResponse[]> {
    await this.lifecycle.loadForParticipant(orderId, identityId);
    const disputes = await this.reviewRepository.listDisputesByOrder(orderId);
    return Promise.all(disputes.map((dispute) => this.withDecision(dispute)));
  }

  /** Consulta de uma disputa: participantes do pedido ou admin. */
  async get(identityId: string, disputeId: string, isAdmin: boolean): Promise<DisputeResponse> {
    const dispute = await this.reviewRepository.findDisputeById(disputeId);
    if (!dispute) {
      throw new MarketplaceDisputeNotFoundException();
    }
    if (!isAdmin) {
      const order = await this.orderRepository.findById(dispute.orderId);
      if (!order?.isParticipant(identityId)) {
        throw new MarketplaceOrderAccessDeniedException();
      }
    }
    return this.withDecision(dispute);
  }

  /** Fila de disputas abertas (ADMIN) — a mesa de trabalho da mediação. */
  async listActive(page: number, pageSize: number): Promise<PaginatedResult<DisputeResponse>> {
    const { items, totalItems } = await this.reviewRepository.listActiveDisputes(page, pageSize);
    const responses = await Promise.all(items.map((dispute) => this.withDecision(dispute)));
    return PaginatedResult.of(responses, page, pageSize, totalItems);
  }

  private async withDecision(dispute: MarketplaceDispute): Promise<DisputeResponse> {
    const decision = dispute.decisionId
      ? await this.reviewRepository.findDecisionByDispute(dispute.id)
      : null;
    return toDisputeResponse(dispute, decision);
  }
}
