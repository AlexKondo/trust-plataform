import { Injectable } from '@nestjs/common';
import {
  MarketplaceConversationAccessDeniedException,
  MarketplaceConversationNotFoundException,
  MarketplaceOfferNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';
import { OfferResponse } from '../dto/marketplace-offer.dtos';
import { toOfferResponse } from '../mapper/marketplace.mapper';

/**
 * Leitura da negociação (MRK-012 §6.2 `findNegotiationHistory`).
 * Só participantes enxergam — mesma porta de autorização das conversas.
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

}
