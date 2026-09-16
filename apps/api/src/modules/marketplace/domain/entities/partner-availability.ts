import { v7 as uuidv7 } from 'uuid';
import { PartnerAvailabilityValidationException } from '../exceptions/marketplace.exceptions';
import { WEEKDAYS, Weekday } from './marketplace-types';

export interface PartnerAvailabilityWindowProps {
  id: string;
  partnerId: string;
  dayOfWeek: Weekday;
  /** Minutos desde meia-noite, hora local do fuso declarado (0-1439). */
  startMinute: number;
  /** Minutos desde meia-noite; pode ser 1440 (= meia-noite do dia seguinte). */
  endMinute: number;
  /** IANA timezone (ex.: "America/Sao_Paulo") — a mesma janela é sempre lida
   * nesta zona, nunca no fuso do servidor. */
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerAvailabilityWindowInput {
  partnerId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

const MIN_WINDOW_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

/**
 * IP-005 — janela de disponibilidade que o Trust Partner declara ("costumo
 * atender às terças, das 8h às 18h"). É uma PREFERÊNCIA geral, não uma reação
 * a um pedido específico — isso é o gap que `marketplace_order_schedulings`
 * (MRK-019) nunca cobriu: seu `findActiveSchedulingsForSeller` só detecta
 * conflito ENTRE agendamentos já confirmados, nunca sabe se o Partner
 * trabalha aos domingos.
 *
 * Deliberadamente pequeno: não é um calendário completo (sem exceções por
 * data, sem feriados, sem múltiplos fusos por janela) — o mínimo seguro que
 * satisfaz "Partner availability windows" sem inventar um produto de agenda.
 */
export class PartnerAvailabilityWindow {
  private constructor(private readonly props: PartnerAvailabilityWindowProps) {}

  static create(input: PartnerAvailabilityWindowInput, now = new Date()): PartnerAvailabilityWindow {
    if (!WEEKDAYS.includes(input.dayOfWeek as Weekday)) {
      throw new PartnerAvailabilityValidationException(
        'dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday).',
      );
    }
    if (
      !Number.isInteger(input.startMinute) ||
      !Number.isInteger(input.endMinute) ||
      input.startMinute < 0 ||
      input.startMinute >= MINUTES_PER_DAY ||
      input.endMinute <= input.startMinute ||
      input.endMinute > MINUTES_PER_DAY
    ) {
      throw new PartnerAvailabilityValidationException(
        'startMinute/endMinute must describe a single-day window (0-1440) with startMinute < endMinute.',
      );
    }
    if (input.endMinute - input.startMinute < MIN_WINDOW_MINUTES) {
      throw new PartnerAvailabilityValidationException(
        `Availability window must be at least ${MIN_WINDOW_MINUTES} minutes long.`,
      );
    }
    const timezone = input.timezone.trim();
    if (timezone.length < 3) {
      throw new PartnerAvailabilityValidationException('timezone is required.');
    }

    return new PartnerAvailabilityWindow({
      id: uuidv7(),
      partnerId: input.partnerId,
      dayOfWeek: input.dayOfWeek as Weekday,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      timezone,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: PartnerAvailabilityWindowProps): PartnerAvailabilityWindow {
    return new PartnerAvailabilityWindow(props);
  }

  get id(): string {
    return this.props.id;
  }

  get partnerId(): string {
    return this.props.partnerId;
  }

  get dayOfWeek(): Weekday {
    return this.props.dayOfWeek;
  }

  get startMinute(): number {
    return this.props.startMinute;
  }

  get endMinute(): number {
    return this.props.endMinute;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Duas janelas do mesmo dia se sobrepõem se seus intervalos [start,end) se cruzam. */
  overlaps(other: { dayOfWeek: number; startMinute: number; endMinute: number }): boolean {
    return (
      this.props.dayOfWeek === other.dayOfWeek &&
      this.props.startMinute < other.endMinute &&
      other.startMinute < this.props.endMinute
    );
  }

  toProps(): PartnerAvailabilityWindowProps {
    return { ...this.props };
  }
}

/** Recusa um conjunto com qualquer par de janelas sobrepostas no mesmo dia. */
export function assertNoOverlap(windows: readonly PartnerAvailabilityWindow[]): void {
  for (let i = 0; i < windows.length; i += 1) {
    const left = windows[i];
    for (let j = i + 1; j < windows.length; j += 1) {
      const right = windows[j];
      if (left && right && left.overlaps(right.toProps())) {
        throw new PartnerAvailabilityValidationException(
          'Availability windows cannot overlap on the same day.',
        );
      }
    }
  }
}
