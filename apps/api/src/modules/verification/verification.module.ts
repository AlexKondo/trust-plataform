import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../shared/config/app-config.service';
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
import { EvidenceStorageService } from './domain/services/evidence-storage.service';
import { VerificationController } from './infrastructure/api/verification.controller';
import { DrizzleVerificationRepository } from './infrastructure/persistence/drizzle-verification.repository';
import {
  InMemoryEvidenceStorageService,
  SupabaseEvidenceStorageService,
} from './infrastructure/storage/supabase-evidence-storage.service';

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
    {
      // Supabase Storage quando configurado; memória em testes/CI
      provide: EvidenceStorageService,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger) =>
        config.supabaseUrl && config.supabaseServiceRoleKey
          ? new SupabaseEvidenceStorageService(config, logger)
          : new InMemoryEvidenceStorageService(),
    },
  ],
  exports: [VerificationRepository],
})
export class VerificationModule {}
