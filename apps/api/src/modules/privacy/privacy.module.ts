import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { PaymentModule } from '../payment/payment.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { VerificationModule } from '../verification/verification.module';
import { GetPrivacyRequestsUseCase } from './application/usecases/get-privacy-requests.usecase';
import { RequestDataDeletionUseCase } from './application/usecases/request-data-deletion.usecase';
import { RequestDataExportUseCase } from './application/usecases/request-data-export.usecase';
import { DeletionEligibilityService } from './application/services/deletion-eligibility.service';
import { PrivacyRequestRepository } from './domain/repositories/privacy-request.repository';
import { PrivacyController } from './infrastructure/api/privacy.controller';
import { DrizzlePrivacyRequestRepository } from './infrastructure/persistence/drizzle-privacy-request.repository';

/**
 * IP-021 — Privacy, LGPD & Data Lifecycle. Módulo puramente ORQUESTRADOR:
 * não possui regra de negócio de outro domínio, só compõe repositórios já
 * exportados pelos módulos donos (mesmo padrão de `NotificationModule`
 * importando `IdentityModule` só para ler `IdentityRepository`, IP-002/013).
 * `PaymentModule`/`MarketplaceModule` são importados apenas para LEITURA
 * (checar elegibilidade de exclusão / montar a exportação) — nenhum arquivo
 * de `payment`/`marketplace` foi modificado por esta IP.
 */
@Module({
  imports: [IdentityModule, TrustPassportModule, VerificationModule, MarketplaceModule, PaymentModule],
  controllers: [PrivacyController],
  providers: [
    RequestDataExportUseCase,
    RequestDataDeletionUseCase,
    GetPrivacyRequestsUseCase,
    DeletionEligibilityService,
    { provide: PrivacyRequestRepository, useClass: DrizzlePrivacyRequestRepository },
  ],
  exports: [PrivacyRequestRepository],
})
export class PrivacyModule {}
