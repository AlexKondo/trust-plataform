import { Injectable } from '@nestjs/common';
import { DatabaseExecutor } from '../../../../shared/database/database.module';
import { ReferralAttribution, ReferralCode } from '../../domain/entities/referral';
import {
  GrowthValidationException,
  ReferralAlreadyAttributedException,
} from '../../domain/exceptions/growth.exceptions';
import { ReferralRepository } from '../../domain/repositories/growth.repository';
import { VERIFICATION_STATUS } from '../../../verification/domain/entities/verification-types';
import { VerificationRepository } from '../../../verification/domain/repositories/verification.repository';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';

/** Gera um código curto, sem caracteres ambíguos (0/O, 1/I), maiúsculo. */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

@Injectable()
export class GetOrCreateReferralCodeUseCase {
  constructor(private readonly referrals: ReferralRepository) {}

  async execute(identityId: string): Promise<{ code: string }> {
    const existing = await this.referrals.findCodeByIdentity(identityId);
    if (existing) {
      return { code: existing.code };
    }
    // Colisão de código é praticamente impossível (32^8) mas o índice único
    // em `referral_codes.code` é a garantia real; tenta algumas vezes por
    // robustez, mesmo padrão defensivo do resto do código.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateCode();
      const taken = await this.referrals.findCodeByValue(candidate);
      if (!taken) {
        const code = ReferralCode.create({ identityId, code: candidate });
        await this.referrals.saveCode(code);
        return { code: code.code };
      }
    }
    throw new GrowthValidationException('could not generate a unique referral code, retry.');
  }
}

export interface AttributeReferralInput {
  referralCode: string;
  referredIdentityId: string;
  now?: Date;
}

/**
 * Atribuição no signup de uma nova Identity (acceptance criteria "referral
 * self-abuse blocked"). Bloqueia:
 * (1) auto-referência — domínio (`ReferralAttribution.create` lança
 *     `SelfReferralException` se referrer === referred);
 * (2) reatribuição — `idx_referral_attribution_referred_unique` (1 código
 *     usado, para sempre, por identidade referida — cobre "one-time-use").
 * NÃO inventa o valor/gatilho da recompensa: só registra a atribuição como
 * PENDING. `confirmAfterVerification` promove para CONFIRMED reusando o
 * estado de verificação/KYC já existente (VRF), nunca uma segunda noção de
 * "verificado".
 */
@Injectable()
export class AttributeReferralUseCase {
  constructor(private readonly referrals: ReferralRepository) {}

  async execute(input: AttributeReferralInput): Promise<{ attributed: boolean }> {
    const code = await this.referrals.findCodeByValue(input.referralCode);
    if (!code) {
      throw new GrowthValidationException(`unknown referral code: ${input.referralCode}`);
    }
    const attribution = ReferralAttribution.create({
      referralCodeId: code.id,
      referrerIdentityId: code.identityId,
      referredIdentityId: input.referredIdentityId,
      now: input.now,
    });
    const inserted = await this.referrals.saveAttribution(attribution);
    if (!inserted) {
      throw new ReferralAlreadyAttributedException(
        `identity ${input.referredIdentityId} already has a referral attribution.`,
      );
    }
    return { attributed: true };
  }
}

/**
 * Promove uma atribuição PENDING para CONFIRMED quando a Identity referida
 * completa uma verificação real (VRF, status APPROVED) — anti-abuso
 * adicional pedido pelo brief ("requiring referred identity to complete
 * real KYC/verification before referral counts"). Nenhuma recompensa é
 * concedida aqui (ver Conflict Escalation REFERRAL-REWARD).
 */
@Injectable()
export class ConfirmReferralOnVerificationUseCase {
  constructor(
    private readonly referrals: ReferralRepository,
    private readonly verifications: VerificationRepository,
    private readonly trustPassports: TrustPassportRepository,
  ) {}

  async execute(
    referredIdentityId: string,
    now: Date = new Date(),
    tx?: DatabaseExecutor,
  ): Promise<{ confirmed: boolean }> {
    const attribution = await this.referrals.findAttributionByReferred(referredIdentityId);
    if (!attribution || attribution.status === 'CONFIRMED') {
      return { confirmed: false };
    }
    const passport = await this.trustPassports.findByIdentityId(referredIdentityId);
    if (!passport) {
      return { confirmed: false };
    }
    const verifications = await this.verifications.listByPassportId(passport.id);
    const hasApproved = verifications.some((v) => v.status === VERIFICATION_STATUS.APPROVED);
    if (!hasApproved) {
      return { confirmed: false };
    }
    await this.referrals.updateAttribution(attribution.confirm(now), tx);
    return { confirmed: true };
  }
}

/** Estatísticas do referrer — Member-facing, prova observável do wiring (Quality Gate finding #1/#4). */
@Injectable()
export class GetReferralStatsUseCase {
  constructor(private readonly referrals: ReferralRepository) {}

  async execute(identityId: string): Promise<{ confirmedReferrals: number }> {
    const confirmedReferrals = await this.referrals.countConfirmedByReferrer(identityId);
    return { confirmedReferrals };
  }
}
