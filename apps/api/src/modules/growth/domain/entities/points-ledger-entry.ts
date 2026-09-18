import { v7 as uuidv7 } from 'uuid';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

/**
 * IP-012 — Trust Points.
 *
 * DECISÃO DE DESIGN (ver IP-012-COMPLETION-REPORT.md §Decisões): Trust Points
 * usa um ledger PRÓPRIO (`points_ledger`), não o ledger financeiro do IP-010
 * (`ledger_entries`). Motivo: o ledger do IP-010 modela FATOS MONETÁRIOS reais
 * em `Cents`/`currency`, sempre amarrados a um `payment_id` e a partidas
 * dobradas entre contas monetárias (Shared Standards §5). "Ponto" não é
 * dinheiro — não tem `payment_id`, não tem câmbio decidido para Reais (ver
 * Conflict Escalation TRUST-POINTS-ACCRUAL), e forçá-lo para dentro do
 * ledger monetário criaria uma aparência de "valor em Reais" que a spec
 * explicitamente NÃO autoriza ("no cash-equivalent liability without ledger
 * treatment" — mas também nenhuma base para tratar 1 ponto = X centavos).
 * Ainda assim, ESTE ledger reusa os MESMOS invariantes de segurança do
 * IP-010: append-only (nunca UPDATE/DELETE), idempotente por
 * `source_event_id` (índice único), saldo sempre >= 0 (nunca materializado,
 * sempre somado on-demand — mesmo padrão de `sumByPaymentAndAccount`).
 */
export const POINTS_DIRECTIONS = { EARN: 'EARN', REDEEM: 'REDEEM', ADJUST: 'ADJUST' } as const;
export type PointsDirection = (typeof POINTS_DIRECTIONS)[keyof typeof POINTS_DIRECTIONS];

export interface PointsLedgerEntryProps {
  id: string;
  identityId: string;
  direction: PointsDirection;
  points: number;
  reason: string;
  sourceEventId: string;
  ruleId: string | null;
  createdAt: Date;
}

export class PointsLedgerEntry {
  private constructor(private readonly props: PointsLedgerEntryProps) {}

  static create(input: {
    identityId: string;
    direction: PointsDirection;
    points: number;
    reason: string;
    sourceEventId: string;
    ruleId?: string | null;
    now?: Date;
  }): PointsLedgerEntry {
    if (!Number.isInteger(input.points) || input.points <= 0) {
      throw new GrowthValidationException('points must be a positive integer.');
    }
    return new PointsLedgerEntry({
      id: uuidv7(),
      identityId: input.identityId,
      direction: input.direction,
      points: input.points,
      reason: input.reason,
      sourceEventId: input.sourceEventId,
      ruleId: input.ruleId ?? null,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(props: PointsLedgerEntryProps): PointsLedgerEntry {
    return new PointsLedgerEntry(props);
  }

  /** Sinal contábil: EARN/ADJUST(+) soma, REDEEM subtrai — mesma forma de `signedAmountCents`. */
  signedPoints(): number {
    return this.props.direction === POINTS_DIRECTIONS.REDEEM ? -this.props.points : this.props.points;
  }

  toProps(): PointsLedgerEntryProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get identityId(): string {
    return this.props.identityId;
  }
  get direction(): PointsDirection {
    return this.props.direction;
  }
  get points(): number {
    return this.props.points;
  }
  get sourceEventId(): string {
    return this.props.sourceEventId;
  }
}
