import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { TrustCustody } from '../entities/trust-custody';

/** Persistência da custódia (PACK-01 §14). Transaction-aware como os demais. */
export abstract class TrustCustodyRepository {
  /**
   * Retorna false quando o Payment já tem custódia — o índice único em
   * `payment_id` é a garantia final contra duplicidade (PACK-01 §6.2).
   */
  abstract create(custody: TrustCustody, executor?: DatabaseExecutor): Promise<boolean>;
  abstract save(custody: TrustCustody, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<TrustCustody | null>;
  abstract findByPaymentId(
    paymentId: string,
    executor?: DatabaseExecutor,
  ): Promise<TrustCustody | null>;
  abstract findByOrderId(orderId: string, executor?: DatabaseExecutor): Promise<TrustCustody | null>;
  abstract existsByPaymentId(paymentId: string, executor?: DatabaseExecutor): Promise<boolean>;
}
