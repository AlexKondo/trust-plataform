import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { RecordTrustSignalUseCase } from './application/usecases/record-trust-signal.usecase';
import { RegisterTrustEventUseCase } from './application/usecases/register-trust-event.usecase';
import { TrustProfileService } from './application/usecases/trust-profile.service';
import { ShareTokenService } from './domain/services/share-token.service';
import { TrustReputationController } from './infrastructure/api/trust-reputation.controller';
import { TrustScoreController } from './infrastructure/api/trust-score.controller';
import { AwardBadgesConsumer } from './infrastructure/consumers/award-badges.consumer';
import {
  DisputeResolvedScoringConsumer,
  OrderCancelledScoringConsumer,
  OrderConfirmedScoringConsumer,
  ReviewCreatedScoringConsumer,
} from './infrastructure/consumers/marketplace-scoring.consumers';
import {
  TrustPassportCreatedConsumer,
  VerificationApprovedScoringConsumer,
  VerificationRejectedScoringConsumer,
} from './infrastructure/consumers/trust-score.consumers';
import {
  ChangeOrderApprovedSignalConsumer,
  ChangeOrderRejectedSignalConsumer,
  ChangeOrderSubmittedSignalConsumer,
  FundsRefundCompletedSignalConsumer,
} from './infrastructure/consumers/trust-signal.consumers';
import { TrustReputationRepository } from './infrastructure/persistence/drizzle-trust-reputation.repository';
import { TrustScoreRepository } from './infrastructure/persistence/drizzle-trust-score.repository';
import { TrustSignalRepository } from './infrastructure/persistence/drizzle-trust-signal.repository';

@Module({
  imports: [IdentityModule, TrustPassportModule],
  controllers: [TrustScoreController, TrustReputationController],
  providers: [
    TrustScoreRepository,
    TrustReputationRepository,
    TrustSignalRepository,
    RegisterTrustEventUseCase,
    RecordTrustSignalUseCase,
    TrustProfileService,
    ShareTokenService,
    TrustPassportCreatedConsumer,
    VerificationApprovedScoringConsumer,
    VerificationRejectedScoringConsumer,
    AwardBadgesConsumer,
    OrderConfirmedScoringConsumer,
    OrderCancelledScoringConsumer,
    ReviewCreatedScoringConsumer,
    DisputeResolvedScoringConsumer,
    ChangeOrderSubmittedSignalConsumer,
    ChangeOrderApprovedSignalConsumer,
    ChangeOrderRejectedSignalConsumer,
    FundsRefundCompletedSignalConsumer,
  ],
  // TrustProfileService é exportado para o Marketplace montar o resumo público
  // do anunciante respeitando as Visibility Policies (MRK-005 BR-003/005).
  exports: [TrustScoreRepository, TrustProfileService],
})
export class TrustScoreModule {}
