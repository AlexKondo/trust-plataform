import { v7 as uuidv7 } from 'uuid';
import { GrowthValidationException } from '../exceptions/growth.exceptions';

/**
 * IP-012 — Cashback. Campanha admin-configurada, TABELA VAZIA por padrão
 * (nenhuma campanha seedada) — nenhum percentual/regra foi decidido em
 * nenhuma spec (ver Conflict Escalation CASHBACK-CAMPAIGN). `percentageBps`
 * em basis points (1/100 de 1%) evita ponto flutuante (Shared Standards §5),
 * mesma disciplina de `Cents`. Nunca "para sempre": `startsAt`/`endsAt` +
 * `active` obrigatórios pela spec §4.
 */
export interface CashbackCampaignProps {
  id: string;
  name: string;
  percentageBps: number;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class CashbackCampaign {
  private constructor(private readonly props: CashbackCampaignProps) {}

  static create(input: {
    name: string;
    percentageBps: number;
    active?: boolean;
    startsAt: Date;
    endsAt: Date;
    now?: Date;
  }): CashbackCampaign {
    if (!Number.isInteger(input.percentageBps) || input.percentageBps <= 0 || input.percentageBps > 10_000) {
      throw new GrowthValidationException('percentageBps must be an integer in (0, 10000].');
    }
    if (input.startsAt >= input.endsAt) {
      throw new GrowthValidationException('startsAt must be before endsAt — no campaign runs forever.');
    }
    const now = input.now ?? new Date();
    return new CashbackCampaign({
      id: uuidv7(),
      name: input.name,
      percentageBps: input.percentageBps,
      // "never on by accident": omitting `active` must mean OFF, not ON.
      active: input.active ?? false,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: CashbackCampaignProps): CashbackCampaign {
    return new CashbackCampaign(props);
  }

  isEffectiveAt(instant: Date): boolean {
    return this.props.active && instant >= this.props.startsAt && instant <= this.props.endsAt;
  }

  computeCashbackCents(amountCents: number): number {
    return Math.floor((amountCents * this.props.percentageBps) / 10_000);
  }

  toProps(): CashbackCampaignProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get percentageBps(): number {
    return this.props.percentageBps;
  }
}
