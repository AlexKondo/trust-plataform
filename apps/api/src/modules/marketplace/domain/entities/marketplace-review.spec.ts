import { describe, expect, it } from 'vitest';
import { MarketplaceReviewValidationException } from '../exceptions/marketplace.exceptions';
import { MarketplaceReview } from './marketplace-review';

const ORDER = '019fe8f0-0000-7000-8000-0000000000b1';
const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';

const review = (overrides: Partial<Parameters<typeof MarketplaceReview.create>[0]> = {}) =>
  MarketplaceReview.create({
    orderId: ORDER,
    reviewerId: BUYER,
    reviewedUserId: SELLER,
    overallScore: 5,
    ...overrides,
  });

describe('MarketplaceReview (MRK-025)', () => {
  it('exige apenas a nota geral; o resto é opcional (BR-004/BR-005)', () => {
    const created = review();
    expect(created.overallScore).toBe(5);
    expect(created.recommended).toBeNull();
    expect(created.comment).toBeNull();
    expect(created.scores).toEqual({});
  });

  it('registra critérios opcionais e comentário', () => {
    const created = review({
      recommended: true,
      comment: '  Pontual e caprichoso.  ',
      scores: { quality: 5, punctuality: 4, communication: 5 },
    });
    expect(created.comment).toBe('Pontual e caprichoso.');
    expect(created.recommended).toBe(true);
    expect(created.scores).toEqual({ quality: 5, punctuality: 4, communication: 5 });
  });

  it('recusa nota fora da escala de 1 a 5', () => {
    expect(() => review({ overallScore: 0 })).toThrow(MarketplaceReviewValidationException);
    expect(() => review({ overallScore: 6 })).toThrow(MarketplaceReviewValidationException);
    expect(() => review({ overallScore: 4.5 })).toThrow(MarketplaceReviewValidationException);
  });

  it('recusa nota inválida em critério opcional', () => {
    expect(() => review({ scores: { quality: 9 } })).toThrow(MarketplaceReviewValidationException);
  });

  it('recusa critério desconhecido — o catálogo é fechado', () => {
    expect(() => review({ scores: { charisma: 5 } as never })).toThrow(
      MarketplaceReviewValidationException,
    );
  });

  it('ignora critérios sem valor em vez de gravar nulo', () => {
    const created = review({ scores: { quality: 4, punctuality: undefined } });
    expect(created.scores).toEqual({ quality: 4 });
  });

  it('classifica 4 e 5 como avaliação positiva', () => {
    expect(review({ overallScore: 5 }).isPositive()).toBe(true);
    expect(review({ overallScore: 4 }).isPositive()).toBe(true);
    expect(review({ overallScore: 3 }).isPositive()).toBe(false);
  });

  it('é imutável: mexer no snapshot não altera a avaliação (BR-007)', () => {
    const created = review({ comment: 'original', scores: { quality: 5 } });
    const props = created.toProps();
    props.comment = 'adulterado';
    props.scores.quality = 1;
    expect(created.comment).toBe('original');
    expect(created.scores.quality).toBe(5);
  });
});
