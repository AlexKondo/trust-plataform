import { v7 as uuidv7 } from 'uuid';
import {
  MarketplaceDisputeAlreadyResolvedException,
  MarketplaceDisputeValidationException,
} from '../exceptions/marketplace.exceptions';

/**
 * Categorias iniciais (MRK-023 BR-004). A spec pede que sejam configuráveis
 * pela Administração; no MVP são catálogo fechado no código, como os motivos de
 * rejeição do VRF — a tela admin de categorias fica para depois.
 */
export const DISPUTE_CATEGORIES = [
  'SERVICE_NOT_COMPLETED',
  'SERVICE_PARTIALLY_EXECUTED',
  'PRODUCT_DIVERGENT',
  'PRODUCT_DAMAGED',
  'IMPROPER_CHARGE',
  'INAPPROPRIATE_CONDUCT',
  'OTHER',
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  IN_ANALYSIS: 'IN_ANALYSIS',
  MEDIATION: 'MEDIATION',
  RESOLVED: 'RESOLVED',
} as const;

export type DisputeStatus = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS];

/** Estados em que a disputa ainda está viva (MRK-023 BR-002 / MRK-024 BR-002). */
export const ACTIVE_DISPUTE_STATUSES: readonly DisputeStatus[] = [
  DISPUTE_STATUS.OPEN,
  DISPUTE_STATUS.IN_ANALYSIS,
  DISPUTE_STATUS.MEDIATION,
];

/** Tipos de decisão (MRK-024 BR-004). */
export const DECISION_TYPES = [
  'UPHELD',
  'PARTIALLY_UPHELD',
  'REJECTED',
  'SETTLED',
  'CANCELLED',
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

/** Decisões que reconhecem culpa da parte reclamada — as que pesam no score. */
const FAULT_DECISIONS: readonly DecisionType[] = ['UPHELD', 'PARTIALLY_UPHELD'];

export interface MarketplaceDisputeProps {
  id: string;
  orderId: string;
  openedBy: string;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  openedAt: Date;
  decisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeDecisionProps {
  id: string;
  disputeId: string;
  decidedBy: string;
  decisionType: DecisionType;
  justification: string;
  decidedAt: Date;
  createdAt: Date;
}

/** Decisão da disputa (MRK-024). Imutável por construção — só getters. */
export class DisputeDecision {
  private constructor(private readonly props: DisputeDecisionProps) {}

  static create(input: {
    disputeId: string;
    decidedBy: string;
    decisionType: DecisionType;
    justification: string;
    now?: Date;
  }): DisputeDecision {
    const justification = input.justification.trim();
    if (justification.length < 10) {
      throw new MarketplaceDisputeValidationException(
        'A decision must be justified with at least 10 characters.',
      );
    }
    const now = input.now ?? new Date();
    return new DisputeDecision({
      id: uuidv7(),
      disputeId: input.disputeId,
      decidedBy: input.decidedBy,
      decisionType: input.decisionType,
      justification,
      decidedAt: now,
      createdAt: now,
    });
  }

  static restore(props: DisputeDecisionProps): DisputeDecision {
    return new DisputeDecision(props);
  }

  get id(): string {
    return this.props.id;
  }

  get disputeId(): string {
    return this.props.disputeId;
  }

  get decidedBy(): string {
    return this.props.decidedBy;
  }

  get decisionType(): DecisionType {
    return this.props.decisionType;
  }

  get justification(): string {
    return this.props.justification;
  }

  get decidedAt(): Date {
    return this.props.decidedAt;
  }

  /** A decisão reconheceu culpa de quem foi reclamado? */
  recognizesFault(): boolean {
    return FAULT_DECISIONS.includes(this.props.decisionType);
  }

  toProps(): DisputeDecisionProps {
    return { ...this.props };
  }
}

/**
 * Aggregate root da disputa (MRK-023/024).
 * Invariantes: uma disputa ativa por pedido (garantida também por índice
 * parcial); abrir não altera evidência alguma (BR-006); a decisão é definitiva
 * e não pode ser revista (BR-006 do MRK-024).
 */
export class MarketplaceDispute {
  private constructor(private readonly props: MarketplaceDisputeProps) {}

  static open(input: {
    orderId: string;
    openedBy: string;
    category: DisputeCategory;
    description: string;
    now?: Date;
  }): MarketplaceDispute {
    const description = input.description.trim();
    if (description.length < 20) {
      throw new MarketplaceDisputeValidationException(
        'The problem description must have at least 20 characters.',
      );
    }
    const now = input.now ?? new Date();
    return new MarketplaceDispute({
      id: uuidv7(),
      orderId: input.orderId,
      openedBy: input.openedBy,
      category: input.category,
      description,
      status: DISPUTE_STATUS.OPEN,
      openedAt: now,
      decisionId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: MarketplaceDisputeProps): MarketplaceDispute {
    return new MarketplaceDispute(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get openedBy(): string {
    return this.props.openedBy;
  }

  get category(): DisputeCategory {
    return this.props.category;
  }

  get description(): string {
    return this.props.description;
  }

  get status(): DisputeStatus {
    return this.props.status;
  }

  get openedAt(): Date {
    return this.props.openedAt;
  }

  get decisionId(): string | null {
    return this.props.decisionId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isActive(): boolean {
    return ACTIVE_DISPUTE_STATUSES.includes(this.props.status);
  }

  /** MRK-024 — registra a decisão e encerra a disputa (BR-005). */
  resolve(decision: DisputeDecision, now = new Date()): void {
    if (!this.isActive()) {
      throw new MarketplaceDisputeAlreadyResolvedException();
    }
    this.props.status = DISPUTE_STATUS.RESOLVED;
    this.props.decisionId = decision.id;
    this.props.updatedAt = now;
  }

  toProps(): MarketplaceDisputeProps {
    return { ...this.props };
  }
}
