import { v7 as uuidv7 } from 'uuid';
import { InvalidSchedulingWindowException } from '../exceptions/marketplace.exceptions';
import {
  EXECUTION_EVENT_TYPE,
  ExecutionEventType,
  SCHEDULING_STATUS,
  SchedulingStatus,
} from './marketplace-types';

export interface SchedulingProps {
  id: string;
  orderId: string;
  scheduledStart: Date;
  /** Minutos previstos (MRK-019 BR-002). */
  estimatedDuration: number;
  scheduledEnd: Date;
  timezone: string;
  status: SchedulingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 24 * 60;

/**
 * Agendamento do serviço (MRK-019). O fim previsto é sempre derivado do início
 * + duração — nunca informado pelo cliente, para não divergir do que a agenda
 * do prestador usa na checagem de conflito (BR-004).
 */
export class Scheduling {
  private constructor(private readonly props: SchedulingProps) {}

  static create(input: {
    orderId: string;
    scheduledStart: Date;
    estimatedDuration: number;
    timezone: string;
    now?: Date;
  }): Scheduling {
    const now = input.now ?? new Date();
    if (input.scheduledStart.getTime() <= now.getTime()) {
      throw new InvalidSchedulingWindowException('scheduledStart must be in the future.');
    }
    if (
      !Number.isInteger(input.estimatedDuration) ||
      input.estimatedDuration < MIN_DURATION_MINUTES ||
      input.estimatedDuration > MAX_DURATION_MINUTES
    ) {
      throw new InvalidSchedulingWindowException(
        `estimatedDuration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`,
      );
    }

    return new Scheduling({
      id: uuidv7(),
      orderId: input.orderId,
      scheduledStart: input.scheduledStart,
      estimatedDuration: input.estimatedDuration,
      scheduledEnd: new Date(input.scheduledStart.getTime() + input.estimatedDuration * 60000),
      timezone: input.timezone,
      status: SCHEDULING_STATUS.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: SchedulingProps): Scheduling {
    return new Scheduling(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get scheduledStart(): Date {
    return this.props.scheduledStart;
  }

  get estimatedDuration(): number {
    return this.props.estimatedDuration;
  }

  get scheduledEnd(): Date {
    return this.props.scheduledEnd;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get status(): SchedulingStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** MRK-018: o agendamento morre junto com o pedido cancelado, mas fica no histórico. */
  cancel(now = new Date()): void {
    this.props.status = SCHEDULING_STATUS.CANCELLED;
    this.props.updatedAt = now;
  }

  /** MRK-019 BR-004 — dois agendamentos do mesmo prestador não podem se sobrepor. */
  overlaps(otherStart: Date, otherEnd: Date): boolean {
    return (
      this.props.scheduledStart.getTime() < otherEnd.getTime() &&
      otherStart.getTime() < this.props.scheduledEnd.getTime()
    );
  }

  toProps(): SchedulingProps {
    return { ...this.props };
  }
}

export interface ExecutionEventProps {
  id: string;
  orderId: string;
  eventType: ExecutionEventType;
  occurredAt: Date;
  performedBy: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface ExecutionEvidence {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Marco de execução (MRK-020/021): CHECK_IN e CHECK_OUT na mesma linha do tempo
 * (INCONSISTENCIAS #35). Append-only — nunca editado nem excluído (BR-007).
 * Geolocalização é opcional e informativa: nunca bloqueia o início do serviço
 * (MRK-020 BR-004).
 */
export class ExecutionEvent {
  private constructor(private readonly props: ExecutionEventProps) {}

  static checkIn(
    orderId: string,
    performedBy: string,
    evidence: ExecutionEvidence = {},
    now = new Date(),
  ): ExecutionEvent {
    return ExecutionEvent.of(EXECUTION_EVENT_TYPE.CHECK_IN, orderId, performedBy, evidence, now);
  }

  static checkOut(
    orderId: string,
    performedBy: string,
    evidence: ExecutionEvidence = {},
    now = new Date(),
  ): ExecutionEvent {
    return ExecutionEvent.of(EXECUTION_EVENT_TYPE.CHECK_OUT, orderId, performedBy, evidence, now);
  }

  private static of(
    eventType: ExecutionEventType,
    orderId: string,
    performedBy: string,
    evidence: ExecutionEvidence,
    now: Date,
  ): ExecutionEvent {
    return new ExecutionEvent({
      id: uuidv7(),
      orderId,
      eventType,
      occurredAt: now,
      performedBy,
      latitude: evidence.latitude ?? null,
      longitude: evidence.longitude ?? null,
      accuracy: evidence.accuracy ?? null,
      address: evidence.address?.trim() || null,
      notes: evidence.notes?.trim() || null,
      createdAt: now,
    });
  }

  static restore(props: ExecutionEventProps): ExecutionEvent {
    return new ExecutionEvent(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get eventType(): ExecutionEventType {
    return this.props.eventType;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get performedBy(): string {
    return this.props.performedBy;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get address(): string | null {
    return this.props.address;
  }

  hasLocation(): boolean {
    return this.props.latitude !== null && this.props.longitude !== null;
  }

  toProps(): ExecutionEventProps {
    return { ...this.props };
  }
}

export interface ConfirmationProps {
  id: string;
  orderId: string;
  confirmedBy: string;
  confirmedAt: Date;
  comments: string | null;
  createdAt: Date;
}

/** Confirmação do cliente (MRK-022). Registro permanente (BR-008). */
export class MarketplaceConfirmation {
  private constructor(private readonly props: ConfirmationProps) {}

  static create(input: {
    orderId: string;
    confirmedBy: string;
    comments?: string | null;
    now?: Date;
  }): MarketplaceConfirmation {
    const now = input.now ?? new Date();
    return new MarketplaceConfirmation({
      id: uuidv7(),
      orderId: input.orderId,
      confirmedBy: input.confirmedBy,
      confirmedAt: now,
      comments: input.comments?.trim() || null,
      createdAt: now,
    });
  }

  static restore(props: ConfirmationProps): MarketplaceConfirmation {
    return new MarketplaceConfirmation(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get confirmedBy(): string {
    return this.props.confirmedBy;
  }

  get confirmedAt(): Date {
    return this.props.confirmedAt;
  }

  get comments(): string | null {
    return this.props.comments;
  }

  toProps(): ConfirmationProps {
    return { ...this.props };
  }
}
