import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import { OrderTravelStatus } from '../../domain/entities/order-travel-status';
import { ORDER_STATUS } from '../../domain/entities/marketplace-types';
import { OrderTravelStatusNotApplicableException } from '../../domain/exceptions/marketplace.exceptions';
import { EtaEstimatorPort } from '../../domain/ports/eta-estimator.port';
import { OrderTravelStatusRepository } from '../../domain/repositories/order-travel-status.repository';
import { DeclareEnRouteRequest, TravelStatusResponse } from '../dto/marketplace-order.dtos';
import { RequestMeta } from '../dto/marketplace.dtos';
import { toTravelStatusResponse } from '../mapper/marketplace.mapper';
import { MRK_PRODUCER } from './create-listing.usecase';
import { OrderLifecycleService } from './order-lifecycle.service';

/**
 * IP-005 — status de deslocamento do Partner até o local do serviço. Modelo
 * de TRANSIÇÃO DECLARADA ("saí"/"cheguei"), nunca rastreamento contínuo de
 * GPS (ver `order-travel-status.ts` para a justificativa de privacidade
 * completa). Só o Partner (vendedor do pedido) declara; ambos os participantes
 * podem consultar — é exatamente "visibilidade do Member sobre o progresso da
 * chegada sem vazar localização precisa contínua" que o mandato pede.
 */
@Injectable()
export class ManageOrderTravelStatusUseCase {
  constructor(
    private readonly repository: OrderTravelStatusRepository,
    private readonly lifecycle: OrderLifecycleService,
    private readonly etaEstimator: EtaEstimatorPort,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async get(identityId: string, orderId: string): Promise<TravelStatusResponse> {
    const { order } = await this.lifecycle.loadForParticipant(orderId, identityId);
    const status = await this.repository.findByOrder(orderId);
    return toTravelStatusResponse(status ?? OrderTravelStatus.notStarted(order.id));
  }

  async markEnRoute(
    identityId: string,
    orderId: string,
    body: DeclareEnRouteRequest,
    meta: RequestMeta = {},
  ): Promise<TravelStatusResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    this.assertTravelApplicable(order);

    const now = new Date();
    const existing = await this.repository.findByOrder(orderId);
    const status = existing ?? OrderTravelStatus.notStarted(orderId, now);
    const estimate = await this.etaEstimator.estimate({
      orderId,
      partnerId: identityId,
      declaredEtaMinutes: body.declaredEtaMinutes,
      now,
    });
    status.markEnRoute(estimate, now);

    await this.db.transaction(async (tx) => {
      await this.repository.save(status, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceOrder.PartnerEnRoute',
        aggregateType: 'MarketplaceOrder',
        aggregateId: orderId,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? orderId,
        payload: {
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          declaredEtaMinutes: estimate.etaMinutes,
          estimatedArrivalAt: estimate.estimatedArrivalAt.toISOString(),
          etaSource: estimate.source,
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'DeclarePartnerEnRoute',
          resource: 'MarketplaceOrder',
          resourceId: orderId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: { declaredEtaMinutes: estimate.etaMinutes },
        },
        tx,
      );
    });

    return toTravelStatusResponse(status);
  }

  async markArrived(
    identityId: string,
    orderId: string,
    meta: RequestMeta = {},
  ): Promise<TravelStatusResponse> {
    const order = await this.lifecycle.loadForSeller(orderId, identityId);
    this.assertTravelApplicable(order);

    const existing = await this.repository.findByOrder(orderId);
    const status = existing ?? OrderTravelStatus.notStarted(orderId);
    const now = new Date();
    status.markArrived(now); // recusa fora de EN_ROUTE (BR desta IP)

    await this.db.transaction(async (tx) => {
      await this.repository.save(status, tx);
      await this.outboxService.enqueue(tx, {
        eventType: 'MarketplaceOrder.PartnerArrived',
        aggregateType: 'MarketplaceOrder',
        aggregateId: orderId,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? orderId,
        payload: {
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          arrivedAt: now.toISOString(),
        },
      });
      await this.auditLogService.record(
        {
          identityId,
          operation: 'DeclarePartnerArrived',
          resource: 'MarketplaceOrder',
          resourceId: orderId,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
        },
        tx,
      );
    });

    return toTravelStatusResponse(status);
  }

  /** Deslocamento só faz sentido ANTES do check-in (MRK-020) já ter começado. */
  private assertTravelApplicable(order: MarketplaceOrder): void {
    if (order.status !== ORDER_STATUS.SCHEDULED || order.startedAt !== null) {
      throw new OrderTravelStatusNotApplicableException(order.status);
    }
  }
}
