import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { IncrementalTrustCustody } from '../entities/incremental-trust-custody';

/** IP-007 — persistência das tranches de custódia incremental. */
export abstract class IncrementalTrustCustodyRepository {
  /** Insere; devolve `false` quando o Change Order já tem uma tranche (idempotência, PACK-01 §6.2 aplicado à tranche). */
  abstract create(custody: IncrementalTrustCustody, executor?: DatabaseExecutor): Promise<boolean>;

  abstract findById(id: string, executor?: DatabaseExecutor): Promise<IncrementalTrustCustody | null>;

  abstract findByChangeOrderId(
    changeOrderId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody | null>;

  /** Todas as tranches incrementais de um pedido — usado pela liberação (§5 do mandato). */
  abstract listByOrderId(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody[]>;

  abstract listByPaymentId(
    paymentId: string,
    executor?: DatabaseExecutor,
  ): Promise<IncrementalTrustCustody[]>;

  /**
   * CAS fase 1 (mesmo padrão de `closePauseIfOpen` da IP-001): só grava se o
   * estado no banco ainda for IN_CUSTODY. Devolve `false` quando outra
   * liberação concorrente já mudou o estado — quem chama não reaplica o efeito.
   */
  abstract markReadyForReleaseIfInCustody(
    id: string,
    now: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;

  /** CAS fase 2 — só grava RELEASED se o estado no banco ainda for READY_FOR_RELEASE. */
  abstract markReleasedIfReady(
    id: string,
    releasedAt: Date,
    executor?: DatabaseExecutor,
  ): Promise<boolean>;
}
