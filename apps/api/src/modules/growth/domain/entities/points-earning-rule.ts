import { v7 as uuidv7 } from 'uuid';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

/**
 * IP-012 — regra de acúmulo de pontos (admin-config, TABELA VAZIA por
 * padrão). Nenhuma regra é seedada por esta IP: não existe taxa de acúmulo
 * decidida em nenhuma spec (ver Conflict Escalation TRUST-POINTS-ACCRUAL /
 * INCONSISTENCIAS.md #27). Mesma forma de `trust_score_rules` (TRS-009):
 * condição JSON avaliada pelo domínio, nunca hard-coded no código — e nunca
 * "para sempre": `startsAt`/`endsAt` + `active` (spec §4 "no hard-coded
 * campaign forever").
 */
export interface PointsEarningRuleProps {
  id: string;
  eventName: string;
  description: string;
  points: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PointsEarningRule {
  private constructor(private readonly props: PointsEarningRuleProps) {}

  static create(input: {
    eventName: string;
    description: string;
    points: number;
    active?: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    now?: Date;
  }): PointsEarningRule {
    if (!Number.isInteger(input.points) || input.points <= 0) {
      throw new GrowthValidationException('rule points must be a positive integer.');
    }
    if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) {
      throw new GrowthValidationException('rule startsAt must be before endsAt.');
    }
    const now = input.now ?? new Date();
    return new PointsEarningRule({
      id: uuidv7(),
      eventName: input.eventName,
      description: input.description,
      points: input.points,
      // "never on by accident": omitting `active` must mean OFF, not ON.
      active: input.active ?? false,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: PointsEarningRuleProps): PointsEarningRule {
    return new PointsEarningRule(props);
  }

  /** Uma regra só dispara se ativa E dentro da janela — nunca "para sempre" por acidente. */
  isEffectiveAt(instant: Date): boolean {
    if (!this.props.active) return false;
    if (this.props.startsAt && instant < this.props.startsAt) return false;
    if (this.props.endsAt && instant > this.props.endsAt) return false;
    return true;
  }

  toProps(): PointsEarningRuleProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get eventName(): string {
    return this.props.eventName;
  }
  get points(): number {
    return this.props.points;
  }
}
