import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { RegisterTrustEventUseCase } from './application/usecases/register-trust-event.usecase';
import { TrustProfileService } from './application/usecases/trust-profile.service';
import { ShareTokenService } from './domain/services/share-token.service';
import { TrustReputationController } from './infrastructure/api/trust-reputation.controller';
import { TrustScoreController } from './infrastructure/api/trust-score.controller';
import { AwardBadgesConsumer } from './infrastructure/consumers/award-badges.consumer';
import {
  TrustPassportCreatedConsumer,
  VerificationApprovedScoringConsumer,
  VerificationRejectedScoringConsumer,
} from './infrastructure/consumers/trust-score.consumers';
import { TrustReputationRepository } from './infrastructure/persistence/drizzle-trust-reputation.repository';
import { TrustScoreRepository } from './infrastructure/persistence/drizzle-trust-score.repository';

@Module({
  imports: [IdentityModule, TrustPassportModule],
  controllers: [TrustScoreController, TrustReputationController],
  providers: [
    TrustScoreRepository,
    TrustReputationRepository,
    RegisterTrustEventUseCase,
    TrustProfileService,
    ShareTokenService,
    TrustPassportCreatedConsumer,
    VerificationApprovedScoringConsumer,
    VerificationRejectedScoringConsumer,
    AwardBadgesConsumer,
  ],
  exports: [TrustScoreRepository],
})
export class TrustScoreModule {}
