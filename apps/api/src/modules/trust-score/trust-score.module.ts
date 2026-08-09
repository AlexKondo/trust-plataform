import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { RegisterTrustEventUseCase } from './application/usecases/register-trust-event.usecase';
import { TrustScoreController } from './infrastructure/api/trust-score.controller';
import {
  TrustPassportCreatedConsumer,
  VerificationApprovedScoringConsumer,
  VerificationRejectedScoringConsumer,
} from './infrastructure/consumers/trust-score.consumers';
import { TrustScoreRepository } from './infrastructure/persistence/drizzle-trust-score.repository';

@Module({
  imports: [IdentityModule],
  controllers: [TrustScoreController],
  providers: [
    TrustScoreRepository,
    RegisterTrustEventUseCase,
    TrustPassportCreatedConsumer,
    VerificationApprovedScoringConsumer,
    VerificationRejectedScoringConsumer,
  ],
  exports: [TrustScoreRepository],
})
export class TrustScoreModule {}
