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
  /**
   * IP-021 — `executor` opcional: `DeletionEligibilityService` chama isto
   * de DENTRO da transação de anonimização (via `RequestDataDeletionUseCase`)
   * para que a checagem de elegibilidade leia o estado mais fresco possível
   * pela MESMA conexão que vai efetivar a mutação, e não uma leitura
   * separada e potencialmente desatualizada por uma segunda conexão do pool
   * (mesmo cuidado de `IdentityRepository.findById`, IP-002).
   */
  abstract listForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
    executor?: DatabaseExecutor,
  ): Promise<{ items: MarketplaceOrder[]; totalItems: number }>;

  // ── Agendamento (MRK-019 / reagendamento IP-005) ───────────────────────────
  abstract saveScheduling(scheduling: Scheduling, executor?: DatabaseExecutor): Promise<void>;
  /**
   * IP-005 — a linha mais RECENTE (por `createdAt`) entre todas as do pedido,
   * ativa ou cancelada. Antes desta IP só existia 0 ou 1 linha por pedido, e
   * "mais recente" e "a única" eram a mesma coisa — este método é um
   * substituto comportamentalmente idêntico ao antigo `findSchedulingByOrder`
   * para todo pedido que nunca foi reagendado, e correto (mostra a janela
   * ATIVA corrente) para todo pedido que já foi.
   */
  abstract findLatestSchedulingByOrder(orderId: string): Promise<Scheduling | null>;

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
