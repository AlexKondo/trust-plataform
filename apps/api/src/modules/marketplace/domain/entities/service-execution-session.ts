import { v7 as uuidv7 } from 'uuid';
import { ServiceExecutionTransitionException } from '../exceptions/marketplace.exceptions';
import {
  EXECUTION_SESSION_STATUS,
  EXECUTION_SESSION_TRANSITIONS,
  ExecutionSessionStatus,
  PauseReasonCode,
} from './marketplace-types';

/** Minutos entre dois instantes, arredondados e nunca negativos. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export interface ServiceExecutionSessionProps {
  id: string;
  orderId: string;
  status: ExecutionSessionStatus;
  checkInAt: Date | null;
  checkInBy: string | null;
  checkOutAt: Date | null;
  checkOutBy: string | null;
  elapsedMinutes: number | null;
  pausedMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PACK-03 §10/§11 — sessão de execução do serviço.
 *
 * Existe para separar três coisas que o MRK-021 tratava como uma só: tempo
 * DECORRIDO, tempo PAUSADO e tempo ATIVO. O `actualDuration` do pedido continua
 * significando exatamente o que sempre significou (check-out − check-in) — não
 * foi redefinido, para não reescrever o passado de pedidos já concluídos.
 *
 * A sessão NÃO altera o status do pedido: pausa é fato da execução, não do
 * pedido, e por isso a máquina de 13 estados do MRK-017 não ganhou PAUSED.
 */
export class ServiceExecutionSession {
  private constructor(private readonly props: ServiceExecutionSessionProps) {}

  /** Nasce junto do check-in, mas ainda no estado inicial declarado (§10). */
  static create(orderId: string, now = new Date()): ServiceExecutionSession {
    return new ServiceExecutionSession({
      id: uuidv7(),
      orderId,
      status: EXECUTION_SESSION_STATUS.NOT_STARTED,
      checkInAt: null,
      checkInBy: null,
      checkOutAt: null,
      checkOutBy: null,
      elapsedMinutes: null,
      pausedMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: ServiceExecutionSessionProps): ServiceExecutionSession {
    return new ServiceExecutionSession(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get status(): ExecutionSessionStatus {
    return this.props.status;
  }

  get checkInAt(): Date | null {
    return this.props.checkInAt;
  }

  get checkInBy(): string | null {
    return this.props.checkInBy;
  }

  get checkOutAt(): Date | null {
    return this.props.checkOutAt;
  }

  get checkOutBy(): string | null {
    return this.props.checkOutBy;
  }

  /** Tempo decorrido total, incluindo pausas (§11). */
  get elapsedMinutes(): number | null {
    return this.props.elapsedMinutes;
  }

  get pausedMinutes(): number {
    return this.props.pausedMinutes;
  }

  /**
   * §11 — tempo efetivamente trabalhado: decorrido menos pausado. Ainda NÃO é
   * tempo faturável: quem decide isso é o que foi comercialmente autorizado
   * (`authorized-commercial.service.ts`).
   */
  get rawActiveMinutes(): number | null {
    if (this.props.elapsedMinutes === null) {
      return null;
    }
    return Math.max(0, this.props.elapsedMinutes - this.props.pausedMinutes);
  }

  isActive(): boolean {
    return this.props.status === EXECUTION_SESSION_STATUS.ACTIVE;
  }

  isPaused(): boolean {
    return this.props.status === EXECUTION_SESSION_STATUS.PAUSED;
  }

  isCompleted(): boolean {
    return this.props.status === EXECUTION_SESSION_STATUS.COMPLETED;
  }

  canTransitionTo(target: ExecutionSessionStatus): boolean {
    return EXECUTION_SESSION_TRANSITIONS[this.props.status].includes(target);
  }

  private transitionTo(target: ExecutionSessionStatus, now: Date): void {
    if (!this.canTransitionTo(target)) {
      throw new ServiceExecutionTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /** §10.1 — Trust Check-in: marca imutável de início. */
  checkIn(performedBy: string, now = new Date()): void {
    this.transitionTo(EXECUTION_SESSION_STATUS.ACTIVE, now);
    this.props.checkInAt = now;
    this.props.checkInBy = performedBy;
  }

  /** §10.2 — Trust Pause: interrupção não faturável. */
  pause(now = new Date()): void {
    this.transitionTo(EXECUTION_SESSION_STATUS.PAUSED, now);
  }

  /** §10.3 — Trust Resume: soma a pausa fechada ao acumulado. */
  resume(pausedMinutes: number, now = new Date()): void {
    this.transitionTo(EXECUTION_SESSION_STATUS.ACTIVE, now);
    this.props.pausedMinutes += Math.max(0, pausedMinutes);
  }

  /**
   * §10.4 — Trust Check-out. Se havia pausa aberta, ela é fechada no próprio
   * check-out (regra determinística declarada no preflight) e os minutos entram
   * no acumulado por `closingPauseMinutes`.
   */
  checkOut(performedBy: string, closingPauseMinutes = 0, now = new Date()): void {
    this.transitionTo(EXECUTION_SESSION_STATUS.COMPLETED, now);
    this.props.checkOutAt = now;
    this.props.checkOutBy = performedBy;
    this.props.pausedMinutes += Math.max(0, closingPauseMinutes);
    this.props.elapsedMinutes = this.props.checkInAt
      ? minutesBetween(this.props.checkInAt, now)
      : null;
  }

  toProps(): ServiceExecutionSessionProps {
    return { ...this.props };
  }
}

export interface ServiceExecutionPauseProps {
  id: string;
  sessionId: string;
  orderId: string;
  reasonCode: PauseReasonCode;
  note: string | null;
  performedBy: string;
  pausedAt: Date;
  resumedAt: Date | null;
  durationMinutes: number | null;
  createdAt: Date;
}

/**
 * PACK-03 §10.2 — uma interrupção não faturável. Nasce aberta e só ganha fim:
 * o registro é a prova auditável de por que aquele intervalo não foi cobrado.
 * Nenhum motivo é inferido do aparelho do prestador (§10.2, §4.2).
 */
export class ServiceExecutionPause {
  private constructor(private readonly props: ServiceExecutionPauseProps) {}

  static open(input: {
    sessionId: string;
    orderId: string;
    reasonCode: PauseReasonCode;
    note?: string | null;
    performedBy: string;
    now?: Date;
  }): ServiceExecutionPause {
    const now = input.now ?? new Date();
    return new ServiceExecutionPause({
      id: uuidv7(),
      sessionId: input.sessionId,
      orderId: input.orderId,
      reasonCode: input.reasonCode,
      note: input.note?.trim() || null,
      performedBy: input.performedBy,
      pausedAt: now,
      resumedAt: null,
      durationMinutes: null,
      createdAt: now,
    });
  }

  static restore(props: ServiceExecutionPauseProps): ServiceExecutionPause {
    return new ServiceExecutionPause(props);
  }

  get id(): string {
    return this.props.id;
  }

  get sessionId(): string {
    return this.props.sessionId;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get reasonCode(): PauseReasonCode {
    return this.props.reasonCode;
  }

  get note(): string | null {
    return this.props.note;
  }

  get performedBy(): string {
    return this.props.performedBy;
  }

  get pausedAt(): Date {
    return this.props.pausedAt;
  }

  get resumedAt(): Date | null {
    return this.props.resumedAt;
  }

  get durationMinutes(): number | null {
    return this.props.durationMinutes;
  }

  isOpen(): boolean {
    return this.props.resumedAt === null;
  }

  /** Fecha a pausa e devolve os minutos que devem sair do tempo faturável. */
  close(now = new Date()): number {
    if (!this.isOpen()) {
      return 0;
    }
    this.props.resumedAt = now;
    this.props.durationMinutes = minutesBetween(this.props.pausedAt, now);
    return this.props.durationMinutes;
  }

  toProps(): ServiceExecutionPauseProps {
    return { ...this.props };
  }
}
