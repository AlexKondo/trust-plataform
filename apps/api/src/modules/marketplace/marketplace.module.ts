import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { AcceptOfferUseCase } from './application/usecases/accept-offer.usecase';
import { CloseConversationUseCase } from './application/usecases/close-conversation.usecase';
import { CounterOfferUseCase } from './application/usecases/counter-offer.usecase';
import { CreateOfferUseCase } from './application/usecases/create-offer.usecase';
import { GetOffersUseCase } from './application/usecases/get-offers.usecase';
import { ManageDisputeUseCase } from './application/usecases/manage-dispute.usecase';
import { ManageChangeOrderUseCase } from './application/usecases/manage-change-order.usecase';
import { ManageOrderUseCase } from './application/usecases/manage-order.usecase';
import { ServiceExecutionUseCase } from './application/usecases/service-execution.usecase';
import { ReviewTransactionUseCase } from './application/usecases/review-transaction.usecase';
import { MarketplaceOfferService } from './application/usecases/marketplace-offer.service';
import { OrderLifecycleService } from './application/usecases/order-lifecycle.service';
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
import { CommercialPolicyRepository } from './domain/repositories/commercial-policy.repository';
import { MarketplaceCommercialSnapshotRepository } from './domain/repositories/marketplace-commercial-snapshot.repository';
import { MarketplaceConversationRepository } from './domain/repositories/marketplace-conversation.repository';
import { MarketplaceListingRepository } from './domain/repositories/marketplace-listing.repository';
import { MarketplaceOfferRepository } from './domain/repositories/marketplace-offer.repository';
import { MarketplaceOrderRepository } from './domain/repositories/marketplace-order.repository';
import { ServiceExecutionRepository } from './domain/repositories/service-execution.repository';
import { TrustChangeOrderRepository } from './domain/repositories/trust-change-order.repository';
import { MarketplaceReviewRepository } from './domain/repositories/marketplace-review.repository';
import { MarketplaceConversationController } from './infrastructure/api/marketplace-conversation.controller';
import { MarketplaceListingController } from './infrastructure/api/marketplace-listing.controller';
import { MarketplaceOfferController } from './infrastructure/api/marketplace-offer.controller';
import { MarketplaceChangeOrderController } from './infrastructure/api/marketplace-change-order.controller';
import { MarketplaceOrderController } from './infrastructure/api/marketplace-order.controller';
import {
  MarketplaceDisputeAdminController,
  MarketplaceReviewController,
} from './infrastructure/api/marketplace-review.controller';
import {
  CompleteOrderOnConfirmationConsumer,
  ReleaseListingOnCancelConsumer,
} from './infrastructure/consumers/order-lifecycle.consumers';
import { DrizzleCommercialPolicyRepository } from './infrastructure/persistence/drizzle-commercial-policy.repository';
import { DrizzleMarketplaceCommercialSnapshotRepository } from './infrastructure/persistence/drizzle-marketplace-commercial-snapshot.repository';
import { DrizzleMarketplaceConversationRepository } from './infrastructure/persistence/drizzle-marketplace-conversation.repository';
import { DrizzleMarketplaceListingRepository } from './infrastructure/persistence/drizzle-marketplace-listing.repository';
import { DrizzleMarketplaceOfferRepository } from './infrastructure/persistence/drizzle-marketplace-offer.repository';
import { DrizzleMarketplaceOrderRepository } from './infrastructure/persistence/drizzle-marketplace-order.repository';
import { DrizzleMarketplaceReviewRepository } from './infrastructure/persistence/drizzle-marketplace-review.repository';
import { DrizzleServiceExecutionRepository } from './infrastructure/persistence/drizzle-service-execution.repository';
import { DrizzleTrustChangeOrderRepository } from './infrastructure/persistence/drizzle-trust-change-order.repository';

/**
 * Marketplace — Módulos 6 a 9, o ciclo completo da transação:
 * - MRK-001..008: anúncios e conversas;
 * - MRK-009..014: propostas, contraofertas e aceite (que cria o pedido);
 * - MRK-015..022: ciclo de vida do pedido (13 estados);
 * - MRK-023..025: disputas e avaliações.
 *
 * CONSOME a Trust Layer (nível mínimo para publicar, reputação na busca) e a
 * ALIMENTA por eventos — mas nunca calcula score: quem pontua é o Trust Engine
 * (regra de ouro TP-001).
 */
@Module({
  imports: [IdentityModule, TrustPassportModule, TrustScoreModule],
  controllers: [
    MarketplaceListingController,
    MarketplaceConversationController,
    MarketplaceOfferController,
    MarketplaceOrderController,
    MarketplaceChangeOrderController,
    MarketplaceReviewController,
    MarketplaceDisputeAdminController,
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
    OrderLifecycleService,
    ManageOrderUseCase,
    ManageChangeOrderUseCase,
    ServiceExecutionUseCase,
    ManageDisputeUseCase,
    ReviewTransactionUseCase,
    ReleaseListingOnCancelConsumer,
    CompleteOrderOnConfirmationConsumer,
    { provide: MarketplaceListingRepository, useClass: DrizzleMarketplaceListingRepository },
    { provide: MarketplaceConversationRepository, useClass: DrizzleMarketplaceConversationRepository },
    { provide: MarketplaceOfferRepository, useClass: DrizzleMarketplaceOfferRepository },
    { provide: MarketplaceOrderRepository, useClass: DrizzleMarketplaceOrderRepository },
    { provide: MarketplaceReviewRepository, useClass: DrizzleMarketplaceReviewRepository },
    { provide: TrustChangeOrderRepository, useClass: DrizzleTrustChangeOrderRepository },
    { provide: ServiceExecutionRepository, useClass: DrizzleServiceExecutionRepository },
    { provide: CommercialPolicyRepository, useClass: DrizzleCommercialPolicyRepository },
    {
      provide: MarketplaceCommercialSnapshotRepository,
      useClass: DrizzleMarketplaceCommercialSnapshotRepository,
    },
  ],
  exports: [
    MarketplaceListingRepository,
    TrustChangeOrderRepository,
    ServiceExecutionRepository,
    MarketplaceConversationRepository,
    MarketplaceOfferRepository,
    MarketplaceOrderRepository,
    MarketplaceReviewRepository,
    CommercialPolicyRepository,
    MarketplaceCommercialSnapshotRepository,
  ],
})
export class MarketplaceModule {}
