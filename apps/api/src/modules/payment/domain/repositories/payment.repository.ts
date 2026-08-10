import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { Payment } from '../entities/payment';

export abstract class PaymentRepository {
  /** Insere; devolve false se o pedido já tinha pagamento (PAY-001 BR-001). */
  abstract create(payment: Payment, executor?: DatabaseExecutor): Promise<boolean>;
  abstract save(payment: Payment, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<Payment | null>;
  abstract findByOrderId(orderId: string, executor?: DatabaseExecutor): Promise<Payment | null>;
  abstract listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Payment[]; totalItems: number }>;
}
