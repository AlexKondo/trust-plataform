import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { EntityNotFoundException } from '../../../../shared/domain/exceptions/domain.exception';
import { IdentityRepository } from '../../../identity/domain/repositories/identity.repository';
import { TrustPassportRepository } from '../../../trust-passport/domain/repositories/trust-passport.repository';
import { TrustReputationRepository } from '../../infrastructure/persistence/drizzle-trust-reputation.repository';
import { TrustScoreRepository } from '../../infrastructure/persistence/drizzle-trust-score.repository';
import { VisibilityPolicyRow } from '../../infrastructure/persistence/trust-reputation.schema';

export class TrustProfileNotFoundException extends EntityNotFoundException {
  readonly code = 'TRUST_PROFILE_NOT_FOUND';

  constructor() {
    super('Trust Profile not found.');
  }
}

export interface BadgeView {
  code: string;
  name: string;
  description: string;
  badgeType: string;
  awardedAt: string;
}

export interface TrustProfileView {
  view: 'PRIVATE_VIEW' | 'PUBLIC_VIEW';
  displayName: string;
  level: string | null;
  score: number | null;
  profileCompletion: number;
  verifications: {
    emailVerified: boolean;
    phoneVerified: boolean;
    documentVerified: boolean;
    addressVerified: boolean;
  } | null;
  badges: BadgeView[] | null;
  memberSince: string;
}

const DEFAULT_VISIBILITY = {
  showScore: true,
  showLevel: true,
  showBadges: true,
  showVerifications: true,
};

/**
 * TRS-015 — montagem do perfil consolidado. A visão PÚBLICA respeita as
 * políticas de visibilidade (TRS-016); a PRIVADA (dono) é sempre completa.
 */
@Injectable()
export class TrustProfileService {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly passportRepository: TrustPassportRepository,
    private readonly scoreRepository: TrustScoreRepository,
    private readonly reputationRepository: TrustReputationRepository,
  ) {}

  async getVisibility(trustPassportId: string): Promise<VisibilityPolicyRow> {
    const existing = await this.reputationRepository.findVisibility(trustPassportId);
    if (existing) {
      return existing;
    }
    const now = new Date();
    return {
      id: uuidv7(),
      trustPassportId,
      ...DEFAULT_VISIBILITY,
      createdAt: now,
      updatedAt: now,
    };
  }

  async buildByPassportId(
    trustPassportId: string,
    view: 'PRIVATE_VIEW' | 'PUBLIC_VIEW',
  ): Promise<TrustProfileView> {
    const passport = await this.passportRepository.findById(trustPassportId);
    if (!passport) {
      throw new TrustProfileNotFoundException();
    }
    const [identity, score, badges, visibility] = await Promise.all([
      this.identityRepository.findById(passport.identityId),
      this.scoreRepository.findScoreByPassportId(trustPassportId),
      this.reputationRepository.listAwardedWithCatalog(trustPassportId),
      this.getVisibility(trustPassportId),
    ]);

    const isPublic = view === 'PUBLIC_VIEW';
    const show = isPublic ? visibility : { ...DEFAULT_VISIBILITY };

    // Nome público: primeiro nome + inicial do sobrenome (privacidade por padrão)
    const fullName = identity?.fullName ?? 'Usuário';
    const displayName = isPublic ? abbreviateName(fullName) : fullName;

    return {
      view,
      displayName,
      level: show.showLevel ? (score?.level ?? 'UNVERIFIED') : null,
      score: show.showScore ? (score?.score ?? 0) : null,
      profileCompletion: passport.profileCompletion,
      verifications: show.showVerifications
        ? {
            emailVerified: passport.emailVerified,
            phoneVerified: passport.phoneVerified,
            documentVerified: passport.documentVerified,
            addressVerified: passport.addressVerified,
          }
        : null,
      badges: show.showBadges
        ? badges.map((badge) => ({
            code: badge.code,
            name: badge.name,
            description: badge.description,
            badgeType: badge.badgeType,
            awardedAt: badge.awardedAt.toISOString(),
          }))
        : null,
      memberSince: passport.createdAt.toISOString(),
    };
  }
}

function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!;
  }
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}
