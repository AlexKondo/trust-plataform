import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { FundsRefund } from '../entities/funds-refund';

/** IP-008 (PAY-006) — persistência dos reembolsos. */
export abstract class FundsRefundRepository {
  /** Insere; devolve `false` quando a chave de idempotência já existe (defesa 2, ver use case). */
  abstract create(refund: FundsRefund, executor?: DatabaseExecutor): Promise<boolean>;
  abstract save(refund: FundsRefund, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<FundsRefund | null>;

  /** Defesa 1 do use case — mesmo papel de `PaymentAuthorizationRepository.findByIdempotencyKey`. */
  abstract findByIdempotencyKey(key: string): Promise<FundsRefund | null>;

  abstract listByPayment(paymentId: string): Promise<FundsRefund[]>;
  abstract listByOrder(orderId: string): Promise<FundsRefund[]>;

  /** Soma de todos os reembolsos COMPLETED de um Payment — usado só para auditoria/leitura. */
  abstract sumCompletedByPayment(paymentId: string): Promise<number>;
}
