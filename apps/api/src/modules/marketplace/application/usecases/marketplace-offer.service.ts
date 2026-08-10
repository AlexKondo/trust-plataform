import { Injectable } from '@nestjs/common';
import { MarketplaceConversation } from '../../domain/entities/marketplace-conversation';
import { MarketplaceListing } from '../../domain/entities/marketplace-listing';
import { MarketplaceOffer } from '../../domain/entities/marketplace-offer';
import {
  MarketplaceConversationClosedException,
  MarketplaceConversationNotFoundException,
  MarketplaceListingUnavailableException,
  MarketplaceOfferAlreadyExistsException,
  MarketplaceOfferNotFoundException,
} from '../../domain/exceptions/marketplace.exceptions';
import { MarketplaceConversationRepository } from '../../domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from '../../domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from '../../domain/repositories/marketplace-offer.repository';

export interface NegotiationContext {
  conversation: MarketplaceConversation;
  listing: MarketplaceListing;
}

export interface OfferContext extends NegotiationContext {
  offer: MarketplaceOffer;
}

/**
 * Contexto compartilhado das features de proposta (MRK-009 §6.3).
 * Concentra as três validações que toda operação de negociação repete:
 * participante da conversa, conversa OPEN e anúncio ainda disponível.
 */
@Injectable()
export class MarketplaceOfferService {
  constructor(
    private readonly offerRepository: MarketplaceOfferRepository,
    private readonly conversationRepository: MarketplaceConversationRepository,
    private readonly listingRepository: MarketplaceListingRepository,
  ) {}

  /** MRK-009 BR-002/BR-003 — conversa aberta + anúncio publicado. */
  async loadNegotiation(conversationId: string, actorId: string): Promise<NegotiationContext> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new MarketplaceConversationNotFoundException();
    }
    conversation.assertParticipant(actorId);
    if (!conversation.isOpen()) {
      throw new MarketplaceConversationClosedException();
    }

    const listing = await this.listingRepository.findById(conversation.listingId);
    if (!listing || !listing.isPubliclyVisible()) {
      throw new MarketplaceListingUnavailableException();
    }
    return { conversation, listing };
  }

  /** Carrega a proposta com o contexto da negociação já validado. */
  async loadOffer(offerId: string, actorId: string): Promise<OfferContext> {
    const offer = await this.offerRepository.findById(offerId);
    if (!offer) {
      throw new MarketplaceOfferNotFoundException();
    }
    const { conversation, listing } = await this.loadNegotiation(offer.conversationId, actorId);
    return { offer, conversation, listing };
  }

  /**
   * Uma proposta viva por negociação: enquanto houver PENDING não vencida, a
   * próxima rodada tem que passar por atualizar/retirar/decidir (MRK-009 §6.3,
   * exceção `MarketplaceOfferAlreadyExistsException`). Ver INCONSISTENCIAS #34.
   */
  async assertNoLiveOffer(conversationId: string, now = new Date()): Promise<void> {
    const pending = await this.offerRepository.findPendingByConversation(conversationId);
    if (pending.some((offer) => offer.isPending(now))) {
      throw new MarketplaceOfferAlreadyExistsException();
    }
  }
}
