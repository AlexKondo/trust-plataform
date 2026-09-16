import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, Database, DatabaseExecutor } from '../../../../shared/database/database.module';
import { OrderTravelStatus } from '../../domain/entities/order-travel-status';
import { EtaSource, TravelStatus } from '../../domain/entities/marketplace-types';
import { OrderTravelStatusRepository } from '../../domain/repositories/order-travel-status.repository';
import { OrderTravelStatusRow, marketplaceOrderTravelStatuses } from './order-travel-status.schema';

@Injectable()
export class DrizzleOrderTravelStatusRepository extends OrderTravelStatusRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    super();
  }

  async save(status: OrderTravelStatus, executor?: DatabaseExecutor): Promise<void> {
    const target = executor ?? this.db;
    const props = status.toProps();
    await target
      .insert(marketplaceOrderTravelStatuses)
      .values(props)
      .onConflictDoUpdate({
        target: marketplaceOrderTravelStatuses.orderId,
        set: {
          status: props.status,
          declaredEtaMinutes: props.declaredEtaMinutes,
          estimatedArrivalAt: props.estimatedArrivalAt,
          etaSource: props.etaSource,
          enRouteAt: props.enRouteAt,
          arrivedAt: props.arrivedAt,
          updatedAt: props.updatedAt,
        },
      });
  }

  async findByOrder(orderId: string): Promise<OrderTravelStatus | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceOrderTravelStatuses)
      .where(eq(marketplaceOrderTravelStatuses.orderId, orderId))
      .limit(1);
    return row ? toTravelStatus(row) : null;
  }
}

function toTravelStatus(row: OrderTravelStatusRow): OrderTravelStatus {
  return OrderTravelStatus.restore({
    id: row.id,
    orderId: row.orderId,
    status: row.status as TravelStatus,
    declaredEtaMinutes: row.declaredEtaMinutes,
    estimatedArrivalAt: row.estimatedArrivalAt,
    etaSource: row.etaSource as EtaSource | null,
    enRouteAt: row.enRouteAt,
    arrivedAt: row.arrivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
