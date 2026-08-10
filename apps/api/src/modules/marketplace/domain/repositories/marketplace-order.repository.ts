import { DatabaseExecutor } from '../../../../shared/database/database.module';
import {
  ExecutionEvent,
  MarketplaceConfirmation,
  Scheduling,
} from '../entities/marketplace-order-execution';
import { MarketplaceOrder } from '../entities/marketplace-order';

export abstract class MarketplaceOrderRepository {
  abstract save(order: MarketplaceOrder, executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string, executor?: DatabaseExecutor): Promise<MarketplaceOrder | null>;
  abstract findByOfferId(offerId: string): Promise<MarketplaceOrder | null>;
  abstract listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceOrder[]; totalItems: number }>;

  // ── Agendamento (MRK-019) ──────────────────────────────────────────────────
  abstract saveScheduling(scheduling: Scheduling, executor?: DatabaseExecutor): Promise<void>;
  abstract findSchedulingByOrder(orderId: string): Promise<Scheduling | null>;

  /**
   * Agendamentos ativos do prestador que podem colidir com a janela pedida
   * (MRK-019 BR-004). O pedido em questão é excluído para permitir idempotência.
   */
  abstract findActiveSchedulingsForSeller(
    sellerId: string,
    exceptOrderId: string,
  ): Promise<Scheduling[]>;

  // ── Execução (MRK-020/021) ─────────────────────────────────────────────────
  abstract saveExecutionEvent(event: ExecutionEvent, executor?: DatabaseExecutor): Promise<void>;
  abstract listExecutionEvents(orderId: string): Promise<ExecutionEvent[]>;

  // ── Confirmação (MRK-022) ──────────────────────────────────────────────────
  abstract saveConfirmation(
    confirmation: MarketplaceConfirmation,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  abstract findConfirmationByOrder(orderId: string): Promise<MarketplaceConfirmation | null>;
}
