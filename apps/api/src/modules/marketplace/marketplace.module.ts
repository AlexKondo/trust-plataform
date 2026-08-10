import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { AcceptOfferUseCase } from './application/usecases/accept-offer.usecase';
import { CloseConversationUseCase } from './application/usecases/close-conversation.usecase';
import { CounterOfferUseCase } from './application/usecases/counter-offer.usecase';
import { CreateOfferUseCase } from './application/usecases/create-offer.usecase';
import { GetOffersUseCase } from './application/usecases/get-offers.usecase';
import { MarketplaceOfferService } from './application/usecases/marketplace-offer.service';
import {
  RejectOfferUseCase,
  WithdrawOfferUseCase,
} from './application/usecases/resolve-offer.usecase';
import { UpdateOfferUseCase } from './application/usecases/update-offer.usecase';
import { ContactListingOwnerUseCase } from './application/usecases/contact-listing-owner.usecase';
import { ConversationMessagingUseCase } from './application/usecases/conversation-messaging.usecase';
import { CreateListingUseCase } from './application/usecases/create-listing.usecase';
import { GetListingUseCase } from './application/usecases/get-listing.usecase';
import { PublishListingUseCase } from './application/usecases/publish-listing.usecase';
import { SearchListingsUseCase } from './application/usecases/search-listings.usecase';
import { UpdateListingUseCase } from './application/usecases/update-listing.usecase';
import { MarketplaceConversationRepository } from './domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from './domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from './domain/repositories/marketplace-offer.repository';
import { MarketplaceConversationController } from './infrastructure/api/marketplace-conversation.controller';
import { MarketplaceListingController } from './infrastructure/api/marketplace-listing.controller';
import { MarketplaceOfferController } from './infrastructure/api/marketplace-offer.controller';
import { DrizzleMarketplaceConversationRepository } from './infrastructure/persistence/drizzle-marketplace-conversation.repository';
import { DrizzleMarketplaceListingRepository } from './infrastructure/persistence/drizzle-marketplace-listing.repository';
import { DrizzleMarketplaceOfferRepository } from './infrastructure/persistence/drizzle-marketplace-offer.repository';

/**
 * Marketplace: Módulo 6 (MRK-001..008 — anúncios e conversas) e Módulo 7
 * (MRK-009..014 — propostas, contraofertas e aceite, que já cria o pedido).
 * É o primeiro módulo de negócio que CONSOME a Trust Layer (nível mínimo para
 * publicar, reputação na busca e no detalhe) — e nunca a altera (regra TP-001).
 */
@Module({
  imports: [IdentityModule, TrustPassportModule, TrustScoreModule],
  controllers: [
    MarketplaceListingController,
    MarketplaceConversationController,
    MarketplaceOfferController,
  ],
  providers: [
    CreateListingUseCase,
    UpdateListingUseCase,
    PublishListingUseCase,
    SearchListingsUseCase,
    GetListingUseCase,
    ContactListingOwnerUseCase,
    ConversationMessagingUseCase,
    CloseConversationUseCase,
    MarketplaceOfferService,
    CreateOfferUseCase,
    UpdateOfferUseCase,
    WithdrawOfferUseCase,
    CounterOfferUseCase,
    AcceptOfferUseCase,
    RejectOfferUseCase,
    GetOffersUseCase,
    { provide: MarketplaceListingRepository, useClass: DrizzleMarketplaceListingRepository },
    { provide: MarketplaceConversationRepository, useClass: DrizzleMarketplaceConversationRepository },
    { provide: MarketplaceOfferRepository, useClass: DrizzleMarketplaceOfferRepository },
  ],
  exports: [
    MarketplaceListingRepository,
    MarketplaceConversationRepository,
    MarketplaceOfferRepository,
  ],
})
export class MarketplaceModule {}
