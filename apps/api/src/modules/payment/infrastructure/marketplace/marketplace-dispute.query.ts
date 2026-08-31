import { Injectable } from '@nestjs/common';
import { MarketplaceReviewRepository } from '../../../marketplace/domain/repositories/marketplace-review.repository';
import { OrderDisputeQuery } from '../../domain/services/order-dispute.query';

/**
 * Adapter da porta `OrderDisputeQuery` (PACK-01 §10).
 *
 * Cruza a fronteira Payments → Marketplace, e faz isso AQUI, na infraestrutura,
 * justamente para que o domínio financeiro continue sem saber o que é uma
 * disputa. Leitura pura: o Payments nunca escreve no Marketplace.
 */
@Injectable()
export class MarketplaceOrderDisputeQuery extends OrderDisputeQuery {
  constructor(private readonly reviewRepository: MarketplaceReviewRepository) {
    super();
  }

  async hasActiveDispute(orderId: string): Promise<boolean> {
    const dispute = await this.reviewRepository.findActiveDisputeByOrder(orderId);
    return dispute !== null;
  }
}
