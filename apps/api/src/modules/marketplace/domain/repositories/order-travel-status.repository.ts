import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { OrderTravelStatus } from '../entities/order-travel-status';

export abstract class OrderTravelStatusRepository {
  abstract save(status: OrderTravelStatus, executor?: DatabaseExecutor): Promise<void>;
  abstract findByOrder(orderId: string): Promise<OrderTravelStatus | null>;
}
