import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { PaymentIncrementalAuthorization } from '../entities/payment-incremental-authorization';

/** IP-007 — persistência da tentativa de autorização incremental. */
export abstract class PaymentIncrementalAuthorizationRepository {
  /**
   * Insere; devolve `false` quando este Change Order já tem uma tentativa
   * registrada — `UNIQUE(change_order_id)` é a garantia final contra
   * duplicidade (reentrega do evento `TrustChangeOrder.Approved`), mesmo
   * quando o dedupe do outbox por si só já deveria ter impedido a segunda
   * chamada.
   */
  abstract create(
    authorization: PaymentIncrementalAuthorization,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  abstract findByChangeOrderId(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<PaymentIncrementalAuthorization | null>;

  abstract findByIdempotencyKey(key: string): Promise<PaymentIncrementalAuthorization | null>;

  abstract listByPayment(paymentId: string): Promise<PaymentIncrementalAuthorization[]>;
}
