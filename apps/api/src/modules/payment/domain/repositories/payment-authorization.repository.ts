import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { PaymentAuthorization } from '../entities/payment-authorization';

export abstract class PaymentAuthorizationRepository {
  abstract save(
    authorization: PaymentAuthorization,
    executor?: DatabaseExecutor,
  ): Promise<void>;

  /**
   * Tentativa já registrada com esta chave (PAY-ARCH-001 §9). Encontrar aqui é
   * o que impede a segunda cobrança: devolvemos o resultado anterior em vez de
   * chamar o gateway de novo.
   */
  abstract findByIdempotencyKey(key: string): Promise<PaymentAuthorization | null>;

  abstract listByPayment(paymentId: string): Promise<PaymentAuthorization[]>;

  /** Autorização aprovada vigente do pagamento (a que a custódia vai usar). */
  abstract findApprovedByPayment(paymentId: string): Promise<PaymentAuthorization | null>;
}
