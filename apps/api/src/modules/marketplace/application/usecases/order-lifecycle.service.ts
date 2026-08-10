import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OutboxService } from '../../../../shared/events/outbox.service';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import {
  MarketplaceOrderAccessDeniedException,
  MarketplaceOrderNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import { RequestMeta } from '../dto/marketplace.dtos';
import { MRK_PRODUCER } from './create-listing.usecase';

export type OrderActorRole = 'BUYER' | 'SELLER';

export interface OrderTransitionInput {
  order: MarketplaceOrder;
  /** Quem provocou a mudança: identity ou processo interno (MRK-017 BR-005). */
  actorId: string | null;
  operation: string;
  eventName: string;
  eventPayload: Record<string, unknown>;
  auditMetadata?: Record<string, unknown>;
  meta?: RequestMeta;
  /** Escritas extras que precisam ser atômicas com a transição. */
  alsoInTransaction?: (tx: DatabaseExecutor) => Promise<void>;
}

/**
 * MRK-017 — porta única de mudança do pedido (`MarketplaceOrderLifecycleService`).
 * Não existe endpoint genérico de atualização: cada feature especializada
 * (agendar, iniciar, concluir, confirmar, cancelar) chama este serviço, que
 * garante persistência + evento + auditoria na MESMA transação (BR-005/BR-006).
 * A validação da transição em si mora no aggregate (BR-003/BR-004).
 */
@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly orderRepository: MarketplaceOrderRepository,
    private readonly outboxService: OutboxService,
    private readonly auditLogService: AuditLogService,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrderLifecycleService.name);
  }

  /** Carrega o pedido garantindo que o chamador é participante (MRK-016 BR-001). */
  async loadForParticipant(
    orderId: string,
    identityId: string,
  ): Promise<{ order: MarketplaceOrder; role: OrderActorRole }> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new MarketplaceOrderNotFoundException();
    }
    order.assertParticipant(identityId);
    return { order, role: order.sellerId === identityId ? 'SELLER' : 'BUYER' };
  }

  /** Exige que o chamador seja o prestador (check-in/check-out são dele). */
  async loadForSeller(orderId: string, identityId: string): Promise<MarketplaceOrder> {
    const { order, role } = await this.loadForParticipant(orderId, identityId);
    if (role !== 'SELLER') {
      throw new MarketplaceOrderAccessDeniedException(
        'Only the service provider can perform this operation.',
      );
    }
    return order;
  }

  /** Exige que o chamador seja o cliente (só ele confirma — MRK-022 BR-001). */
  async loadForBuyer(orderId: string, identityId: string): Promise<MarketplaceOrder> {
    const { order, role } = await this.loadForParticipant(orderId, identityId);
    if (role !== 'BUYER') {
      throw new MarketplaceOrderAccessDeniedException(
        'Only the customer can perform this operation.',
      );
    }
    return order;
  }

  /**
   * Persiste a transição já aplicada ao aggregate, publica o evento de domínio
   * e registra a auditoria — tudo atômico. `previousStatus` deve ser capturado
   * ANTES de chamar o método de transição no aggregate.
   */
  async commit(input: OrderTransitionInput & { previousStatus: string }): Promise<void> {
    const { order, meta = {} } = input;

    await this.db.transaction(async (tx) => {
      await this.orderRepository.save(order, tx);
      await input.alsoInTransaction?.(tx);
      await this.outboxService.enqueue(tx, {
        eventName: input.eventName,
        producer: MRK_PRODUCER,
        correlationId: meta.correlationId ?? order.id,
        payload: input.eventPayload,
      });
      await this.auditLogService.record(
        {
          identityId: input.actorId ?? undefined,
          operation: input.operation,
          resource: 'MarketplaceOrder',
          resourceId: order.id,
          result: 'SUCCESS',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          correlationId: meta.correlationId,
          requestId: meta.requestId,
          metadata: {
            previousStatus: input.previousStatus,
            newStatus: order.status,
            ...input.auditMetadata,
          },
        },
        tx,
      );
    });

    this.logger.info(
      {
        operation: input.operation,
        identityId: input.actorId,
        orderId: order.id,
        listingId: order.listingId,
        previousStatus: input.previousStatus,
        newStatus: order.status,
        correlationId: meta.correlationId,
        result: 'SUCCESS',
      },
      'Marketplace order transitioned.',
    );
  }
}
