import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { MarketplaceOffer } from '../entities/marketplace-offer';
import { MarketplaceOrder } from '../entities/marketplace-order';

export abstract class MarketplaceOfferRepository {
  abstract save(offer: MarketplaceOffer, executor?: DatabaseExecutor): Promise<void>;
  abstract saveAll(offers: MarketplaceOffer[], executor?: DatabaseExecutor): Promise<void>;
  abstract findById(id: string): Promise<MarketplaceOffer | null>;

  /** Histórico completo da negociação, da mais antiga para a mais recente. */
  abstract findByConversation(conversationId: string): Promise<MarketplaceOffer[]>;

  /**
   * Propostas ainda vivas na negociação. Usada para impedir duas propostas
   * simultâneas (MRK-009) e para encerrar as concorrentes no aceite (MRK-013
   * BR-004) — a expiração é avaliada pelo domínio, não pela query.
   */
  abstract findPendingByConversation(
    conversationId: string,
    executor?: DatabaseExecutor,
  ): Promise<MarketplaceOffer[]>;

  abstract findByParentOffer(parentOfferId: string): Promise<MarketplaceOffer | null>;

  // ── Pedidos (MRK-015; criados só pelo aceite) ──────────────────────────────
  abstract saveOrder(order: MarketplaceOrder, executor?: DatabaseExecutor): Promise<void>;
  abstract findOrderById(id: string): Promise<MarketplaceOrder | null>;
  abstract findOrderByOfferId(offerId: string): Promise<MarketplaceOrder | null>;
  abstract listOrdersForParticipant(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: MarketplaceOrder[]; totalItems: number }>;
}
