import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { Scheduling } from '../../domain/entities/marketplace-order-execution';
import { ORDER_STATUS } from '../../domain/entities/marketplace-types';
import { SchedulingConflictException } from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import { ServiceExecutionRepository } from '../../domain/repositories/service-execution.repository';
import {
  CancelOrderRequest,
  ConfirmOrderRequest,
  ExecutionEvidenceRequest,
  OrderDetailsResponse,
  OrderResponse,
  OrderTimelineEntry,
  ScheduleOrderRequest,
} from '../dto/marketplace-order.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toOrderResponse, toSchedulingResponse } from '../mapper/marketplace.mapper';
import {
  ExecutionEvent,
  MarketplaceConfirmation,
} from '../../domain/entities/marketplace-order-execution';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ServiceExecutionUseCase } from './service-execution.usecase';

/**
 * Ciclo de vida do pedido (MRK-016..022). Cada operação valida a transição no
 * aggregate e delega a persistência + evento + auditoria ao
 * `OrderLifecycleService`, que garante atomicidade (MRK-017).
 */
@Injectable()
export class ManageOrderUseCase {
  constructor(
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly listingRepository: MarketplaceListingRepository,
    private readonly executionRepository: ServiceExecutionRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly serviceExecution: ServiceExecutionUseCase,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ── MRK-016 — consulta ─────────────────────────────────────────────────────
  async list(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<OrderResponse>> {
    const { items, totalItems } = await this.orderRepository.listForParticipant(
      identityId,
      page,
      pageSize,
    );
    return PaginatedResult.of(items.map(toOrderResponse), page, pageSize, totalItems);
  }

  /** Visão consolidada: pedido + agenda + linha do tempo (BR-003/BR-004). */
  async get(
    identityId: string,
    orderId: string,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const { order } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const [listing, scheduling, executionEvents, confirmation] = await Promise.all([
      this.listingRepository.findById(order.listingId),
      this.orderRepository.findSchedulingByOrder(orderId),
      this.orderRepository.listExecutionEvents(orderId),
      this.orderRepository.findConfirmationByOrder(orderId),
    ]);

    // BR-005: toda consulta ao pedido é auditada (leitura não derruba requisição)
    await this.auditLogService.recordSafe({
      identityId,
      operation: 'GetMarketplaceOrder',
      resource: 'MarketplaceOrder',
      resourceId: orderId,
      result: 'SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
    });

    const timeline: OrderTimelineEntry[] = [
      {
        type: 'ORDER_CREATED',
        occurredAt: order.createdAt.toISOString(),
        performedBy: null,
        detail: `${order.currency} ${order.amount.toFixed(2)}`,
      },
    ];
    if (scheduling) {
      timeline.push({
        type: 'SCHEDULED',
        occurredAt: scheduling.createdAt.toISOString(),
        performedBy: null,
        detail: `${scheduling.scheduledStart.toISOString()} (${scheduling.estimatedDuration} min)`,
      });
    }
    for (const event of executionEvents) {
      timeline.push({
        type: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        performedBy: event.performedBy,
        detail: event.notes ?? event.address,
      });
    }
    if (confirmation) {
      timeline.push({
        type: 'CUSTOMER_CONFIRMED',
        occurredAt: confirmation.confirmedAt.toISOString(),
        performedBy: confirmation.confirmedBy,
        detail: confirmation.comments,
      });
    }
    if (order.status === ORDER_STATUS.COMPLETED && order.customerConfirmedAt) {
      timeline.push({
        type: 'ORDER_COMPLETED',
        occurredAt: order.updatedAt.toISOString(),
        performedBy: null,
        detail: null,
      });
    }
    if (order.cancelledAt) {
      timeline.push({
        type: 'CANCELLED',
        occurredAt: order.cancelledAt.toISOString(),
        performedBy: order.cancelledBy,
        detail: order.cancellationReason,
      });
    }
    timeline.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    return {
      ...toOrderResponse(order),
      listingTitle: listing?.title ?? null,
      scheduling: scheduling ? toSchedulingResponse(scheduling) : null,
      timeline,
    };
  }

  // ── MRK-019 — agendamento ──────────────────────────────────────────────────
  async schedule(
    identityId: string,
    orderId: string,
    body: ScheduleOrderRequest,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const { order } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const previousStatus = order.status;

    const scheduling = Scheduling.create({
      orderId,
      scheduledStart: body.scheduledStart,
      estimatedDuration: body.estimatedDuration,
      timezone: body.timezone,
    });

    // BR-004: a agenda do prestador não pode ter dois serviços sobrepostos
    const existing = await this.orderRepository.findActiveSchedulingsForSeller(
      order.sellerId,
      orderId,
    );
    if (existing.some((other) => other.overlaps(scheduling.scheduledStart, scheduling.scheduledEnd))) {
      throw new SchedulingConflictException();
    }

    order.markScheduled(); // valida a transição (BR-001)

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'ScheduleMarketplaceOrder',
      eventType: 'MarketplaceOrder.Scheduled',
      eventPayload: {
        orderId,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        schedulingId: scheduling.id,
        scheduledStart: scheduling.scheduledStart.toISOString(),
        scheduledEnd: scheduling.scheduledEnd.toISOString(),
        status: order.status,
      },
      auditMetadata: { scheduledStart: scheduling.scheduledStart.toISOString() },
      meta,
      alsoInTransaction: (tx) => this.orderRepository.saveScheduling(scheduling, tx),
    });

    return this.get(identityId, orderId, meta);
  }

  // ── MRK-020 — check-in do prestador ────────────────────────────────────────
  async start(
    identityId: string,
    orderId: string,
    body: ExecutionEvidenceRequest,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    const previousStatus = order.status;

    const startedAt = new Date();
    order.start(identityId, startedAt); // valida SCHEDULED/AWAITING_EXECUTION (BR-001)
    const checkIn = ExecutionEvent.checkIn(orderId, identityId, body, startedAt);
    // PACK-03 §10.1: a sessão de tempo nasce junto do check-in, na MESMA
    // transação — não existe execução em andamento sem sessão para medi-la.
    const session = this.serviceExecution.buildSessionForCheckIn(orderId, identityId, startedAt);

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'StartMarketplaceOrder',
      eventType: 'MarketplaceOrder.Started',
      eventPayload: {
        orderId,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        startedBy: identityId,
        startedAt: startedAt.toISOString(),
        // Adição retrocompatível (PACK-03 §22): quem já consumia este evento
        // ignora o campo novo.
        sessionId: session.id,
        status: order.status,
      },
      auditMetadata: { hasLocation: checkIn.hasLocation(), sessionId: session.id },
      meta,
      alsoInTransaction: async (tx) => {
        await this.orderRepository.saveExecutionEvent(checkIn, tx);
        await this.executionRepository.saveSession(session, tx);
      },
    });

    return this.get(identityId, orderId, meta);
  }

  // ── MRK-021 — check-out do prestador ───────────────────────────────────────
  async completeExecution(
    identityId: string,
    orderId: string,
    body: ExecutionEvidenceRequest,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    const previousStatus = order.status;

    const completedAt = new Date();
    order.completeExecution(identityId, completedAt); // exige IN_PROGRESS (BR-001)
    const checkOut = ExecutionEvent.checkOut(orderId, identityId, body, completedAt);
    // PACK-03 §10.4/§11: fecha a sessão em memória para o evento já sair com o
    // tempo decorrido, pausado e FATURÁVEL separados. `actualDuration` continua
    // significando o que sempre significou (decorrido) — não foi redefinido.
    const execution = await this.serviceExecution.prepareCheckOut(
      orderId,
      identityId,
      completedAt,
    );

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'CompleteMarketplaceOrderExecution',
      eventType: 'MarketplaceOrder.ExecutionCompleted',
      eventPayload: {
        orderId,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        completedBy: identityId,
        completedAt: completedAt.toISOString(),
        actualDuration: order.actualDuration,
        // Adições retrocompatíveis (PACK-03 §22).
        sessionId: execution?.session.id ?? null,
        elapsedMinutes: execution?.elapsedMinutes ?? null,
        pausedMinutes: execution?.pausedMinutes ?? null,
        billableMinutes: execution?.billableMinutes ?? null,
        authorizedMinutes: execution?.authorizedMinutes ?? null,
        status: order.status,
      },
      auditMetadata: {
        actualDuration: order.actualDuration,
        elapsedMinutes: execution?.elapsedMinutes ?? null,
        pausedMinutes: execution?.pausedMinutes ?? null,
        billableMinutes: execution?.billableMinutes ?? null,
      },
      meta,
      alsoInTransaction: async (tx) => {
        await this.orderRepository.saveExecutionEvent(checkOut, tx);
        await execution?.persist(tx);
      },
    });

    return this.get(identityId, orderId, meta);
  }

  // ── MRK-022 — confirmação do cliente ───────────────────────────────────────
  async confirmCompletion(
    identityId: string,
    orderId: string,
    body: ConfirmOrderRequest,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const order = await this.lifecycle.loadForBuyer(orderId, identityId);
    const previousStatus = order.status;

    const confirmedAt = new Date();
    order.confirmByCustomer(identityId, confirmedAt);
    const confirmation = MarketplaceConfirmation.create({
      orderId,
      confirmedBy: identityId,
      comments: body.comments,
      now: confirmedAt,
    });

    // BR-006: a confirmação NÃO encerra o pedido — ela dispara os processos
    // assíncronos (Trust Score e conclusão) via MarketplaceOrder.CustomerConfirmed.
    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'ConfirmMarketplaceOrderCompletion',
      eventType: 'MarketplaceOrder.CustomerConfirmed',
      eventPayload: {
        orderId,
        listingId: order.listingId,
        conversationId: order.conversationId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        confirmedBy: identityId,
        amount: order.amount,
        currency: order.currency,
        confirmedAt: confirmedAt.toISOString(),
        status: order.status,
      },
      auditMetadata: { confirmationId: confirmation.id },
      meta,
      alsoInTransaction: (tx) => this.orderRepository.saveConfirmation(confirmation, tx),
    });

    return this.get(identityId, orderId, meta);
  }

  // ── MRK-018 — cancelamento ─────────────────────────────────────────────────
  async cancel(
    identityId: string,
    orderId: string,
    body: CancelOrderRequest,
    meta: RequestMeta = {},
  ): Promise<OrderDetailsResponse> {
    const { order, role } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const previousStatus = order.status;

    // Valida a política de estado (BR-002) e exige o motivo (BR-003)
    order.cancel(identityId, body.reason);
    const scheduling = await this.orderRepository.findSchedulingByOrder(orderId);
    scheduling?.cancel();

    await this.lifecycle.commit({
      order,
      previousStatus,
      actorId: identityId,
      operation: 'CancelMarketplaceOrder',
      eventType: 'MarketplaceOrder.Cancelled',
      eventPayload: {
        orderId,
        listingId: order.listingId,
        conversationId: order.conversationId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        cancelledBy: identityId,
        cancelledByRole: role,
        previousStatus,
        reason: order.cancellationReason,
        cancelledAt: order.cancelledAt!.toISOString(),
        status: order.status,
      },
      auditMetadata: { reason: order.cancellationReason, cancelledByRole: role },
      meta,
      alsoInTransaction: async (tx) => {
        if (scheduling) {
          await this.orderRepository.saveScheduling(scheduling, tx);
        }
      },
    });

    return this.get(identityId, orderId, meta);
  }
}
