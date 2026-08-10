import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '../../../../shared/api/api-envelope';
import {
  MarketplaceConversationAccessDeniedException,
  MarketplaceConversationNotFoundException,
  MarketplaceOfferNotFoundException,
  MarketplaceOrderNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { OfferResponse, OrderResponse } from '../dto/marketplace-offer.dtos';
import { toOfferResponse, toOrderResponse } from '../mapper/marketplace.mapper';

/**
 * Leitura da negociação (MRK-012 §6.2 `findNegotiationHistory`) e dos pedidos
 * gerados. Só participantes enxergam — mesma porta de autorização das conversas.
 */
@Injectable()
export class GetOffersUseCase {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly conversationRepository: MarketplaceConversationRepository,
  ) {}

  /** Histórico completo da negociação, da rodada mais antiga para a mais nova. */
  async listByConversation(identityId: string, conversationId: string): Promise<OfferResponse[]> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new MarketplaceConversationNotFoundException();
    }
    conversation.assertParticipant(identityId);

    const now = new Date();
    const offers = await this.offerRepository.findByConversation(conversationId);
    return offers.map((offer) => toOfferResponse(offer, now));
  }

  async getOffer(identityId: string, offerId: string): Promise<OfferResponse> {
    const offer = await this.offerRepository.findById(offerId);
    if (!offer) {
      throw new MarketplaceOfferNotFoundException();
    }
    if (offer.buyerId !== identityId && offer.sellerId !== identityId) {
      throw new MarketplaceConversationAccessDeniedException();
    }
    return toOfferResponse(offer);
  }

  /** Meus pedidos (como comprador ou vendedor). O ciclo completo vem no Módulo 8. */
  async listMyOrders(
    identityId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<OrderResponse>> {
    const { items, totalItems } = await this.offerRepository.listOrdersForParticipant(
      identityId,
      page,
      pageSize,
    );
    return PaginatedResult.of(items.map(toOrderResponse), page, pageSize, totalItems);
  }

  async getOrder(identityId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.offerRepository.findOrderById(orderId);
    if (!order) {
      throw new MarketplaceOrderNotFoundException();
    }
    if (order.buyerId !== identityId && order.sellerId !== identityId) {
      throw new MarketplaceConversationAccessDeniedException();
    }
    return toOrderResponse(order);
  }
}
