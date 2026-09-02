import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceCommercialSnapshot } from '../entities/marketplace-commercial-snapshot';

export abstract class MarketplaceCommercialSnapshotRepository {
  /**
   * Append-only: um snapshot por pedido (`UNIQUE(order_id)`), inserido uma
   * única vez no aceite da proposta e NUNCA atualizado depois — é o fato
   * econômico congelado do contrato (PACK-02 §7).
   */
  abstract save(
    snapshot: MarketplaceCommercialSnapshot,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract findByOrderId(
    orderId: string,
    executor?: DatabaseExecutor,
  ): Promise<MarketplaceCommercialSnapshot | null>;
}
