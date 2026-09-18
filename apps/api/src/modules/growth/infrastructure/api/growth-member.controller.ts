import { Controller, Get, Post } from '@nestjs/common';
import { AuthenticatedIdentity } from '../../../../shared/security/authenticated-identity';
import { CurrentIdentity } from '../../../../shared/security/current-identity.decorator';
import {
  GetOrCreateReferralCodeUseCase,
  GetReferralStatsUseCase,
} from '../../application/usecases/referral.usecases';
import { GetPointsBalanceUseCase } from '../../application/usecases/points.usecases';

/**
 * IP-012 — superfície Member-facing mínima: saldo de pontos e código/stats de
 * referral. Sem catálogo de resgate (não decidido, ver Conflict Escalation
 * TRUST-POINTS-ACCRUAL) — apenas leitura de saldo, mesma disciplina de
 * "infra segura, nenhuma regra inventada" do resto da IP.
 */
@Controller('growth')
export class GrowthMemberController {
  constructor(
    private readonly getBalance: GetPointsBalanceUseCase,
    private readonly getOrCreateReferralCode: GetOrCreateReferralCodeUseCase,
    private readonly getReferralStats: GetReferralStatsUseCase,
  ) {}

  @Get('points/me/balance')
  async myBalance(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.getBalance.execute(identity.identityId);
  }

  @Post('referral/me/code')
  async myReferralCode(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.getOrCreateReferralCode.execute(identity.identityId);
  }

  /** Quality Gate finding #1/#4 — prova observável de que o signup wiring + a confirmação por KYC funcionam de ponta a ponta. */
  @Get('referral/me/stats')
  async myReferralStats(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.getReferralStats.execute(identity.identityId);
  }
}
