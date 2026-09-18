import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PaymentModule } from '../payment/payment.module';
import { TrustPassportModule } from '../trust-passport/trust-passport.module';
import { VerificationModule } from '../verification/verification.module';
import { AccrueCashbackLiabilityUseCase } from './application/usecases/cashback.usecases';
import {
  AccruePointsFromRuleUseCase,
  GetPointsBalanceUseCase,
  RedeemPointsUseCase,
} from './application/usecases/points.usecases';
import {
  AttributeReferralUseCase,
  ConfirmReferralOnVerificationUseCase,
  GetOrCreateReferralCodeUseCase,
  GetReferralStatsUseCase,
} from './application/usecases/referral.usecases';
import {
  ConfigureCashbackCampaignUseCase,
  ConfigurePointsRuleUseCase,
} from './application/usecases/admin-config.usecases';
import {
  CashbackCampaignRepository,
  PointsEarningRuleRepository,
  PointsLedgerRepository,
  ReferralRepository,
} from './domain/repositories/growth.repository';
import { VerificationApprovedReferralConfirmationConsumer } from './infrastructure/consumers/verification-approved.consumer';
import { GrowthAdminController } from './infrastructure/api/growth-admin.controller';
import { GrowthMemberController } from './infrastructure/api/growth-member.controller';
import {
  DrizzleCashbackCampaignRepository,
  DrizzlePointsEarningRuleRepository,
  DrizzlePointsLedgerRepository,
  DrizzleReferralRepository,
} from './infrastructure/persistence/drizzle-growth.repository';

/**
 * IP-012 — Trust Points, Benefits, Referral & Cashback.
 * Benefits (TRS-010/011) é reusado como está — VERIFY_ONLY, sem código novo
 * aqui (ver IP-012-COMPLETION-REPORT.md §Benefits). Este módulo só cobre
 * Points/Referral/Cashback, a parte de fato nova desta IP.
 *
 * Importa `IdentityModule` só pelo `AdminGuard` exportado (usado no
 * `GrowthAdminController`) — nenhum provider daqui depende de
 * `IdentityRepository` diretamente. Isto NÃO é circular: `IdentityModule`
 * não importa `GrowthModule` de volta. `CreateIdentityUseCase` (identity/**)
 * consome `AttributeReferralUseCase` via `ModuleRef.get(..., {strict:
 * false})` (resolução tardia, container inteiro) em vez de injeção de
 * construtor — evitando o ciclo real que existiria se `IdentityModule`
 * precisasse importar `GrowthModule` (`Identity → Growth →
 * Verification/Payment → Identity`, já que `VerificationModule`/
 * `PaymentModule` já importam `IdentityModule`). Ver
 * `create-identity.usecase.ts` para o outro lado do fio.
 */
@Module({
  imports: [IdentityModule, TrustPassportModule, VerificationModule, PaymentModule],
  controllers: [GrowthMemberController, GrowthAdminController],
  providers: [
    { provide: PointsLedgerRepository, useClass: DrizzlePointsLedgerRepository },
    { provide: PointsEarningRuleRepository, useClass: DrizzlePointsEarningRuleRepository },
    { provide: ReferralRepository, useClass: DrizzleReferralRepository },
    { provide: CashbackCampaignRepository, useClass: DrizzleCashbackCampaignRepository },
    AccruePointsFromRuleUseCase,
    RedeemPointsUseCase,
    GetPointsBalanceUseCase,
    GetOrCreateReferralCodeUseCase,
    GetReferralStatsUseCase,
    AttributeReferralUseCase,
    ConfirmReferralOnVerificationUseCase,
    AccrueCashbackLiabilityUseCase,
    ConfigurePointsRuleUseCase,
    ConfigureCashbackCampaignUseCase,
    // IP-012 (Quality Gate finding #1) — wiring real: promove PENDING→CONFIRMED
    // quando a Identity referida tem uma verificação aprovada de verdade.
    VerificationApprovedReferralConfirmationConsumer,
  ],
  exports: [
    PointsLedgerRepository,
    ReferralRepository,
    CashbackCampaignRepository,
    AccruePointsFromRuleUseCase,
    AccrueCashbackLiabilityUseCase,
    ConfirmReferralOnVerificationUseCase,
    // IP-012 (Quality Gate finding #1) — consumido diretamente por
    // `CreateIdentityUseCase` (identity/**) no cadastro.
    AttributeReferralUseCase,
  ],
})
export class GrowthModule {}
