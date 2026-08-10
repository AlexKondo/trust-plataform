import { v7 as uuidv7 } from 'uuid';
import { MarketplaceReviewValidationException } from '../exceptions/marketplace.exceptions';

/**
 * Critérios opcionais da avaliação (MRK-025 BR-005). A spec pede que sejam
 * configuráveis pela Administração — por isso as notas vivem numa tabela
 * (`marketplace_review_scores`), e não em colunas fixas: incluir um critério
 * novo não exige migration.
 */
export const REVIEW_CRITERIA = [
  'quality',
  'communication',
  'punctuality',
  'costBenefit',
  'organization',
] as const;

export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number];

export type ReviewScores = Partial<Record<ReviewCriterion, number>>;

export interface MarketplaceReviewProps {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewedUserId: string;
  overallScore: number;
  recommended: boolean | null;
  comment: string | null;
  scores: ReviewScores;
  createdAt: Date;
  updatedAt: Date;
}

const MIN_SCORE = 1;
const MAX_SCORE = 5;

function assertScore(value: number, field: string): void {
  if (!Number.isInteger(value) || value < MIN_SCORE || value > MAX_SCORE) {
    throw new MarketplaceReviewValidationException(
      `${field} must be an integer between ${MIN_SCORE} and ${MAX_SCORE}.`,
    );
  }
}

/**
 * Avaliação da transação (MRK-025).
 * Invariantes: nota geral obrigatória de 1 a 5 (BR-004); demais critérios
 * opcionais mas na mesma escala; imutável após o registro (BR-007) — é o
 * insumo que alimenta a reputação pública e não pode ser reescrito.
 */
export class MarketplaceReview {
  private constructor(private readonly props: MarketplaceReviewProps) {}

  static create(input: {
    orderId: string;
    reviewerId: string;
    reviewedUserId: string;
    overallScore: number;
    recommended?: boolean | null;
    comment?: string | null;
    scores?: ReviewScores;
    now?: Date;
  }): MarketplaceReview {
    assertScore(input.overallScore, 'overallScore');

    const scores: ReviewScores = {};
    for (const [criterion, value] of Object.entries(input.scores ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }
      if (!REVIEW_CRITERIA.includes(criterion as ReviewCriterion)) {
        throw new MarketplaceReviewValidationException(`Unknown review criterion "${criterion}".`);
      }
      assertScore(value, criterion);
      scores[criterion as ReviewCriterion] = value;
    }

    const now = input.now ?? new Date();
    return new MarketplaceReview({
      id: uuidv7(),
      orderId: input.orderId,
      reviewerId: input.reviewerId,
      reviewedUserId: input.reviewedUserId,
      overallScore: input.overallScore,
      recommended: input.recommended ?? null,
      comment: input.comment?.trim() || null,
      scores,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: MarketplaceReviewProps): MarketplaceReview {
    return new MarketplaceReview(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get reviewerId(): string {
    return this.props.reviewerId;
  }

  get reviewedUserId(): string {
    return this.props.reviewedUserId;
  }

  get overallScore(): number {
    return this.props.overallScore;
  }

  get recommended(): boolean | null {
    return this.props.recommended;
  }

  get comment(): string | null {
    return this.props.comment;
  }

  get scores(): ReviewScores {
    return { ...this.props.scores };
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isPositive(): boolean {
    return this.props.overallScore >= 4;
  }

  toProps(): MarketplaceReviewProps {
    return { ...this.props, scores: { ...this.props.scores } };
  }
}
