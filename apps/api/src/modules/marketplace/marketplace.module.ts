import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { CloseConversationUseCase } from './application/usecases/close-conversation.usecase';
import { ContactListingOwnerUseCase } from './application/usecases/contact-listing-owner.usecase';
import { ConversationMessagingUseCase } from './application/usecases/conversation-messaging.usecase';
import { CreateListingUseCase } from './application/usecases/create-listing.usecase';
import { GetListingUseCase } from './application/usecases/get-listing.usecase';
import { PublishListingUseCase } from './application/usecases/publish-listing.usecase';
import { SearchListingsUseCase } from './application/usecases/search-listings.usecase';
import { UpdateListingUseCase } from './application/usecases/update-listing.usecase';
import { MarketplaceConversationRepository } from './domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from './domain/repositories/marketplace-listing.repository';
import { MarketplaceConversationController } from './infrastructure/api/marketplace-conversation.controller';
import { MarketplaceListingController } from './infrastructure/api/marketplace-listing.controller';
import { DrizzleMarketplaceConversationRepository } from './infrastructure/persistence/drizzle-marketplace-conversation.repository';
import { DrizzleMarketplaceListingRepository } from './infrastructure/persistence/drizzle-marketplace-listing.repository';

/**
 * Módulo 6 do MVP (MRK-001..008): anúncios e conversas.
 * É o primeiro módulo de negócio que CONSOME a Trust Layer (nível mínimo para
 * publicar, reputação na busca e no detalhe) — e nunca a altera (regra TP-001).
 */
@Module({
  imports: [IdentityModule, TrustPassportModule, TrustScoreModule],
  controllers: [MarketplaceListingController, MarketplaceConversationController],
  providers: [
    CreateListingUseCase,
    UpdateListingUseCase,
    PublishListingUseCase,
    SearchListingsUseCase,
    GetListingUseCase,
    ContactListingOwnerUseCase,
    ConversationMessagingUseCase,
    CloseConversationUseCase,
    { provide: MarketplaceListingRepository, useClass: DrizzleMarketplaceListingRepository },
    { provide: MarketplaceConversationRepository, useClass: DrizzleMarketplaceConversationRepository },
  ],
  exports: [MarketplaceListingRepository, MarketplaceConversationRepository],
})
export class MarketplaceModule {}
