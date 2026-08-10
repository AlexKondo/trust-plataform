import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ExecutionEvent,
  MarketplaceConfirmation,
  Scheduling,
} from '../../domain/entities/marketplace-order-execution';
import { MarketplaceOrder } from '../../domain/entities/marketplace-order';
import {
  ExecutionEventType,
  OrderStatus,
  SCHEDULING_STATUS,
  SchedulingStatus,
} from '../../domain/entities/marketplace-types';
import { MarketplaceOrderRepository } from '../../domain/repositories/marketplace-order.repository';
import {
  MarketplaceConfirmationRow,
  MarketplaceExecutionEventRow,
  MarketplaceOrderRow,
  MarketplaceSchedulingRow,
  marketplaceConfirmations,
  marketplaceOrderExecutionEvents,
  marketplaceOrderSchedulings,
  marketplaceOrders,
} from './marketplace-order.schema';

@Injectable()
export class DrizzleMarketplaceOrderRepository extends MarketplaceOrderRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(order: MarketplaceOrder, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = order.toProps();
    const values = {
      ...props,
      amount: props.amount.toFixed(2),
      quantity: props.quantity.toFixed(4),
    };
    await target
      .insert(marketplaceOrders)
      .values(values)
      .onConflictDoUpdate({
        target: marketplaceOrders.id,
        // MRK-017 BR-001: partes, anúncio, proposta e valores nunca mudam.
        set: {
          status: values.status,
          startedAt: values.startedAt,
          startedBy: values.startedBy,
          completedAt: values.completedAt,
          completedBy: values.completedBy,
          actualDuration: values.actualDuration,
          customerConfirmedAt: values.customerConfirmedAt,
          customerConfirmedBy: values.customerConfirmedBy,
          closedAt: values.closedAt,
          cancelledAt: values.cancelledAt,
          cancelledBy: values.cancelledBy,
          cancellationReason: values.cancellationReason,
          updatedAt: values.updatedAt,
        },
      });
  }

  async findById(id: string, executor?: DatabaseExecutor): Promise<MarketplaceOrder | null> {
    const target = executor ?? this.db;
    const [row] = await target
      .select()
      .from(marketplaceOrders)
      .where(eq(marketplaceOrders.id, id))
      .limit(1);
    return row ? toOrder(row) : null;
  }

  async findByOfferId(offerId: string): Promise<MarketplaceOrder | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceOrders)
      .where(eq(marketplaceOrders.offerId, offerId))
      .limit(1);
    return row ? toOrder(row) : null;
  }

  async listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceOrder[]; totalItems: number }> {
    const where = or(
      eq(marketplaceOrders.buyerId, identityId),
      eq(marketplaceOrders.sellerId, identityId),
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(marketplaceOrders)
        .where(where)
        .orderBy(desc(marketplaceOrders.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ count: sql<number>`count(*)::int` }).from(marketplaceOrders).where(where),
    ]);
    return { items: rows.map(toOrder), totalItems: total?.count ?? 0 };
  }

  // ── Agendamento ────────────────────────────────────────────────────────────
  async saveScheduling(scheduling: Scheduling, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = scheduling.toProps();
    await target
      .insert(marketplaceOrderSchedulings)
      .values(props)
      .onConflictDoUpdate({
        target: marketplaceOrderSchedulings.orderId,
        set: {
          scheduledStart: props.scheduledStart,
          estimatedDuration: props.estimatedDuration,
          scheduledEnd: props.scheduledEnd,
          timezone: props.timezone,
          status: props.status,
          updatedAt: props.updatedAt,
        },
      });
  }

  async findSchedulingByOrder(orderId: string): Promise<Scheduling | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceOrderSchedulings)
      .where(eq(marketplaceOrderSchedulings.orderId, orderId))
      .limit(1);
    return row ? toScheduling(row) : null;
  }

  async findActiveSchedulingsForSeller(
    sellerId: string,
    exceptOrderId: string,
  ): Promise<Scheduling[]> {
    const rows = await this.db
      .select({ scheduling: marketplaceOrderSchedulings })
      .from(marketplaceOrderSchedulings)
      .innerJoin(marketplaceOrders, eq(marketplaceOrderSchedulings.orderId, marketplaceOrders.id))
      .where(
        and(
          eq(marketplaceOrders.sellerId, sellerId),
          ne(marketplaceOrderSchedulings.orderId, exceptOrderId),
          eq(marketplaceOrderSchedulings.status, SCHEDULING_STATUS.ACTIVE),
        ),
      );
    return rows.map((row) => toScheduling(row.scheduling));
  }

  // ── Execução ───────────────────────────────────────────────────────────────
  async saveExecutionEvent(event: ExecutionEvent, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = event.toProps();
    // Append-only (BR-007): insert puro, sem upsert.
    await target.insert(marketplaceOrderExecutionEvents).values({
      ...props,
      latitude: props.latitude === null ? null : props.latitude.toFixed(7),
      longitude: props.longitude === null ? null : props.longitude.toFixed(7),
      accuracy: props.accuracy === null ? null : props.accuracy.toFixed(2),
    });
  }

  async listExecutionEvents(orderId: string): Promise<ExecutionEvent[]> {
    const rows = await this.db
      .select()
      .from(marketplaceOrderExecutionEvents)
      .where(eq(marketplaceOrderExecutionEvents.orderId, orderId))
      .orderBy(asc(marketplaceOrderExecutionEvents.occurredAt));
    return rows.map(toExecutionEvent);
  }

  // ── Confirmação ────────────────────────────────────────────────────────────
  async saveConfirmation(
    confirmation: MarketplaceConfirmation,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const target = executor ?? this.db;
    await target.insert(marketplaceConfirmations).values(confirmation.toProps());
  }

  async findConfirmationByOrder(orderId: string): Promise<MarketplaceConfirmation | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceConfirmations)
      .where(eq(marketplaceConfirmations.orderId, orderId))
      .limit(1);
    return row ? toConfirmation(row) : null;
  }
}

function toOrder(row: MarketplaceOrderRow): MarketplaceOrder {
  return MarketplaceOrder.restore({
    id: row.id,
    listingId: row.listingId,
    offerId: row.offerId,
    conversationId: row.conversationId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amount: Number(row.amount),
    // `char(3)` volta com padding do Postgres — o domínio guarda só o código.
    currency: row.currency.trim(),
    quantity: Number(row.quantity),
    status: row.status as OrderStatus,
    startedAt: row.startedAt,
    startedBy: row.startedBy,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    actualDuration: row.actualDuration,
    customerConfirmedAt: row.customerConfirmedAt,
    customerConfirmedBy: row.customerConfirmedBy,
    closedAt: row.closedAt,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toScheduling(row: MarketplaceSchedulingRow): Scheduling {
  return Scheduling.restore({
    id: row.id,
    orderId: row.orderId,
    scheduledStart: row.scheduledStart,
    estimatedDuration: row.estimatedDuration,
    scheduledEnd: row.scheduledEnd,
    timezone: row.timezone,
    status: row.status as SchedulingStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toExecutionEvent(row: MarketplaceExecutionEventRow): ExecutionEvent {
  return ExecutionEvent.restore({
    id: row.id,
    orderId: row.orderId,
    eventType: row.eventType as ExecutionEventType,
    occurredAt: row.occurredAt,
    performedBy: row.performedBy,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
    address: row.address,
    notes: row.notes,
    createdAt: row.createdAt,
  });
}

function toConfirmation(row: MarketplaceConfirmationRow): MarketplaceConfirmation {
  return MarketplaceConfirmation.restore({
    id: row.id,
    orderId: row.orderId,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt,
    comments: row.comments,
    createdAt: row.createdAt,
  });
}
