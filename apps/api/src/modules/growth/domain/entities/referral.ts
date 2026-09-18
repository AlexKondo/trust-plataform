import { v7 as uuidv7 } from 'uuid';
import { GrowthValidationException, SelfReferralException } from '../exceptions/growth.exceptions';

/**
 * IP-012 — Referral. Código único por Identity (1:1) — infraestrutura de
 * atribuição real (não apenas "infra vazia"): existe spec basis suficiente
 * para código + atribuição + anti-abuso, mas NÃO para o valor/gatilho da
 * recompensa (ver Conflict Escalation REFERRAL-REWARD). Este arquivo cobre
 * só o código e a atribuição; a recompensa (se/quando decidida) consome o
 * evento `Referral.Confirmed` como fato de origem, nunca inventa o valor.
 */
export interface ReferralCodeProps {
  id: string;
  identityId: string;
  code: string;
  createdAt: Date;
}

export class ReferralCode {
  private constructor(private readonly props: ReferralCodeProps) {}

  static create(input: { identityId: string; code: string; now?: Date }): ReferralCode {
    if (!/^[A-Z0-9]{6,12}$/.test(input.code)) {
      throw new GrowthValidationException('referral code must be 6-12 uppercase alphanumeric chars.');
    }
    return new ReferralCode({
      id: uuidv7(),
      identityId: input.identityId,
      code: input.code,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(props: ReferralCodeProps): ReferralCode {
    return new ReferralCode(props);
  }

  toProps(): ReferralCodeProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get identityId(): string {
    return this.props.identityId;
  }
  get code(): string {
    return this.props.code;
  }
}

export const REFERRAL_ATTRIBUTION_STATUS = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED' } as const;
export type ReferralAttributionStatus =
  (typeof REFERRAL_ATTRIBUTION_STATUS)[keyof typeof REFERRAL_ATTRIBUTION_STATUS];

export interface ReferralAttributionProps {
  id: string;
  referralCodeId: string;
  referrerIdentityId: string;
  referredIdentityId: string;
  status: ReferralAttributionStatus;
  attributedAt: Date;
  confirmedAt: Date | null;
}

/**
 * Uma atribuição referrer→referred. Anti-abuso (acceptance criteria
 * "referral self-abuse blocked") é reforçado em DOIS lugares, mesmo padrão
 * de defesa em profundidade do resto do sistema:
 * (1) aqui no domínio — auto-referência nunca constrói o objeto;
 * (2) `idx_referral_attribution_referred_unique` no schema — 1 atribuição
 *     por identidade REFERIDA para sempre (nunca reatribuível, nem para
 *     outro código, nem para o mesmo).
 * `confirm()` só é chamado pelo use case depois de checar KYC aprovado
 * (reuso de `VerificationRepository`/`VERIFICATION_STATUS.APPROVED` — IP-012
 * não inventa uma segunda noção de "verificado").
 */
export class ReferralAttribution {
  private constructor(private readonly props: ReferralAttributionProps) {}

  static create(input: {
    referralCodeId: string;
    referrerIdentityId: string;
    referredIdentityId: string;
    now?: Date;
  }): ReferralAttribution {
    if (input.referrerIdentityId === input.referredIdentityId) {
      throw new SelfReferralException('an identity cannot refer itself.');
    }
    return new ReferralAttribution({
      id: uuidv7(),
      referralCodeId: input.referralCodeId,
      referrerIdentityId: input.referrerIdentityId,
      referredIdentityId: input.referredIdentityId,
      status: REFERRAL_ATTRIBUTION_STATUS.PENDING,
      attributedAt: input.now ?? new Date(),
      confirmedAt: null,
    });
  }

  static restore(props: ReferralAttributionProps): ReferralAttribution {
    return new ReferralAttribution(props);
  }

  confirm(now: Date = new Date()): ReferralAttribution {
    if (this.props.status === REFERRAL_ATTRIBUTION_STATUS.CONFIRMED) {
      return this;
    }
    return new ReferralAttribution({
      ...this.props,
      status: REFERRAL_ATTRIBUTION_STATUS.CONFIRMED,
      confirmedAt: now,
    });
  }

  toProps(): ReferralAttributionProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get status(): ReferralAttributionStatus {
    return this.props.status;
  }
  get referrerIdentityId(): string {
    return this.props.referrerIdentityId;
  }
  get referredIdentityId(): string {
    return this.props.referredIdentityId;
  }
}
