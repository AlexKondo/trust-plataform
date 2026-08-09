import { Module } from '@nestjs/common';
import { CreateTrustPassportUseCase } from './application/usecases/create-trust-passport.usecase';
import { GetTrustPassportUseCase } from './application/usecases/get-trust-passport.usecase';
import { UpdateTrustPassportUseCase } from './application/usecases/update-trust-passport.usecase';
import { TrustPassportRepository } from './domain/repositories/trust-passport.repository';
import { TrustPassportController } from './infrastructure/api/trust-passport.controller';
import { IdentityCreatedConsumer } from './infrastructure/consumers/identity-created.consumer';
import { DrizzleTrustPassportRepository } from './infrastructure/persistence/drizzle-trust-passport.repository';

@Module({
  controllers: [TrustPassportController],
  providers: [
    CreateTrustPassportUseCase,
    GetTrustPassportUseCase,
    UpdateTrustPassportUseCase,
    IdentityCreatedConsumer,
    { provide: TrustPassportRepository, useClass: DrizzleTrustPassportRepository },
  ],
  exports: [TrustPassportRepository],
})
export class TrustPassportModule {}
