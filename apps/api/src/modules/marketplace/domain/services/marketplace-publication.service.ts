import { MarketplacePublicationNotAllowedException } from '../exceptions/marketplace.exceptions';

export interface PublicationCategoryRequirements {
  code: string;
  name: string;
  active: boolean;
  minimumTrustLevel: string | null;
  minimumScore: number;
}

export interface PublicationEligibilityInput {
  /** Status da Identity do anunciante (MRK-003 BR-004). */
  identityStatus: string;
  /** Score/nível vigentes do anunciante — o Marketplace só LÊ o Trust Layer. */
  score: number;
  level: string;
  /** Ranking dos níveis vindo das trust_level_rules (TRS-008): level → rank. */
  levelRanks: Map<string, number>;
  category: PublicationCategoryRequirements;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reasonCode: string; reason: string };

/**
 * MRK-003 BR-004/BR-005 — elegibilidade do anunciante para publicar.
 * Função pura: recebe o retrato do Trust Layer e devolve o veredito. É o único
 * ponto do MVP em que reputação vira permissão de negócio.
 */
export function evaluatePublicationEligibility(
  input: PublicationEligibilityInput,
): EligibilityResult {
  if (input.identityStatus !== 'ACTIVE') {
    return {
      eligible: false,
      reasonCode: 'IDENTITY_NOT_ACTIVE',
      reason: 'Your account must be active to publish listings.',
    };
  }

  if (!input.category.active) {
    return {
      eligible: false,
      reasonCode: 'CATEGORY_INACTIVE',
      reason: `Category "${input.category.code}" is not accepting new listings.`,
    };
  }

  if (input.score < input.category.minimumScore) {
    return {
      eligible: false,
      reasonCode: 'INSUFFICIENT_TRUST_SCORE',
      reason: `Category "${input.category.name}" requires a Trust Score of at least ${input.category.minimumScore}; yours is ${input.score}.`,
    };
  }

  const required = input.category.minimumTrustLevel;
  if (required) {
    const requiredRank = input.levelRanks.get(required);
    const currentRank = input.levelRanks.get(input.level);
    // Nível exigido desconhecido nas regras vigentes: não bloqueia a publicação
    // (dado de catálogo desatualizado não pode virar um "não" para o usuário).
    if (requiredRank !== undefined && (currentRank ?? -1) < requiredRank) {
      return {
        eligible: false,
        reasonCode: 'INSUFFICIENT_TRUST_LEVEL',
        reason: `Category "${input.category.name}" requires Trust Level ${required}; yours is ${input.level}.`,
      };
    }
  }

  return { eligible: true };
}

/** Versão que lança a exceção de domínio — usada pelo caso de uso. */
export function assertPublicationAllowed(input: PublicationEligibilityInput): void {
  const result = evaluatePublicationEligibility(input);
  if (!result.eligible) {
    throw new MarketplacePublicationNotAllowedException(result.reason);
  }
}

/** Níveis com rank ≥ ao do nível informado (filtro `minimumTrustLevel` da busca). */
export function levelsAtOrAbove(levelRanks: Map<string, number>, level: string): string[] {
  const minimumRank = levelRanks.get(level);
  if (minimumRank === undefined) {
    return [];
  }
  return [...levelRanks.entries()]
    .filter(([, rank]) => rank >= minimumRank)
    .map(([name]) => name);
}
