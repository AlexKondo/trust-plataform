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

  /**
   * IP-008 — CAS: só grava REFUNDED se o estado no banco ainda for IN_CUSTODY
   * (mesmo padrão de `markReadyForReleaseIfInCustody` do IP-007, aplicado à
   * custódia original). `false` quando outra operação concorrente (liberação
   * ou outro reembolso) já mudou o estado — quem chama não reaplica o efeito.
   */
  abstract markRefundedIfInCustody(
    id: string,
    now: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;
}
