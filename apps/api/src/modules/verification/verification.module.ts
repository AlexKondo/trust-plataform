import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { CreateVerificationUseCase } from './application/usecases/create-verification.usecase';
import {
  ApproveVerificationUseCase,
  DecideVerificationUseCase,
  RejectVerificationUseCase,
} from './application/usecases/decide-verification.usecase';
import { GetVerificationUseCase } from './application/usecases/get-verification.usecase';
import { ReviewVerificationUseCase } from './application/usecases/review-verification.usecase';
import { SubmitEvidenceUseCase } from './application/usecases/submit-evidence.usecase';
import { VerificationRepository } from './domain/repositories/verification.repository';
import { VerificationController } from './infrastructure/api/verification.controller';
import { DrizzleVerificationRepository } from './infrastructure/persistence/drizzle-verification.repository';

@Module({
  imports: [IdentityModule, TrustPassportModule],
  controllers: [VerificationController],
  providers: [
    CreateVerificationUseCase,
    SubmitEvidenceUseCase,
    ReviewVerificationUseCase,
    DecideVerificationUseCase,
    ApproveVerificationUseCase,
    RejectVerificationUseCase,
    GetVerificationUseCase,
    { provide: VerificationRepository, useClass: DrizzleVerificationRepository },
  ],
  exports: [VerificationRepository],
})
export class VerificationModule {}
