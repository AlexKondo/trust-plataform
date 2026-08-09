import { describe, expect, it } from 'vitest';
import { MarketplacePublicationNotAllowedException } from '../exceptions/marketplace.exceptions';
import {
  PublicationCategoryRequirements,
  assertPublicationAllowed,
  evaluatePublicationEligibility,
  levelsAtOrAbove,
} from './marketplace-publication.service';

const LEVEL_RANKS = new Map([
  ['UNVERIFIED', 0],
  ['BRONZE', 1],
  ['SILVER', 2],
  ['GOLD', 3],
  ['PLATINUM', 4],
]);

function category(
  partial: Partial<PublicationCategoryRequirements> = {},
): PublicationCategoryRequirements {
  return {
    code: 'ELECTRICAL',
    name: 'Elétrica',
    active: true,
    minimumTrustLevel: 'SILVER',
    minimumScore: 0,
    ...partial,
  };
}

const input = (overrides: Partial<Parameters<typeof evaluatePublicationEligibility>[0]> = {}) => ({
  identityStatus: 'ACTIVE',
  score: 275,
  level: 'SILVER',
  levelRanks: LEVEL_RANKS,
  category: category(),
  ...overrides,
});

describe('evaluatePublicationEligibility (MRK-003 BR-004/BR-005)', () => {
  it('aprova quem tem conta ativa e o nível exigido', () => {
    expect(evaluatePublicationEligibility(input())).toEqual({ eligible: true });
  });

  it('aprova nível acima do exigido', () => {
    expect(evaluatePublicationEligibility(input({ level: 'PLATINUM', score: 800 }))).toEqual({
      eligible: true,
    });
  });

  it('bloqueia identidade não ativa (BR-004)', () => {
    const result = evaluatePublicationEligibility(
      input({ identityStatus: 'PENDING_EMAIL_VERIFICATION' }),
    );
    expect(result).toMatchObject({ eligible: false, reasonCode: 'IDENTITY_NOT_ACTIVE' });
  });

  it('bloqueia nível abaixo do exigido pela categoria (BR-005)', () => {
    const result = evaluatePublicationEligibility(input({ level: 'BRONZE', score: 25 }));
    expect(result).toMatchObject({ eligible: false, reasonCode: 'INSUFFICIENT_TRUST_LEVEL' });
  });

  it('bloqueia score abaixo do mínimo da categoria', () => {
    const result = evaluatePublicationEligibility(
      input({ score: 100, category: category({ minimumScore: 200 }) }),
    );
    expect(result).toMatchObject({ eligible: false, reasonCode: 'INSUFFICIENT_TRUST_SCORE' });
  });

  it('bloqueia categoria inativa', () => {
    const result = evaluatePublicationEligibility(input({ category: category({ active: false }) }));
    expect(result).toMatchObject({ eligible: false, reasonCode: 'CATEGORY_INACTIVE' });
  });

  it('categoria sem exigência aceita qualquer nível', () => {
    const result = evaluatePublicationEligibility(
      input({ level: 'UNVERIFIED', score: 0, category: category({ minimumTrustLevel: null }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it('nível exigido fora das regras vigentes não bloqueia (catálogo desatualizado)', () => {
    const result = evaluatePublicationEligibility(
      input({ level: 'BRONZE', category: category({ minimumTrustLevel: 'DIAMOND' }) }),
    );
    expect(result).toEqual({ eligible: true });
  });

  it('assertPublicationAllowed lança exceção de domínio quando reprova', () => {
    expect(() => assertPublicationAllowed(input({ level: 'BRONZE', score: 25 }))).toThrow(
      MarketplacePublicationNotAllowedException,
    );
  });
});

describe('levelsAtOrAbove (filtro minimumTrustLevel do MRK-004)', () => {
  it('devolve o nível pedido e todos acima', () => {
    expect(levelsAtOrAbove(LEVEL_RANKS, 'GOLD').sort()).toEqual(['GOLD', 'PLATINUM']);
  });

  it('nível desconhecido devolve lista vazia', () => {
    expect(levelsAtOrAbove(LEVEL_RANKS, 'DIAMOND')).toEqual([]);
  });
});
