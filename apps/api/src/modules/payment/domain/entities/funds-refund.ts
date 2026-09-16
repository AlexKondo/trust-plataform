import { v7 as uuidv7 } from 'uuid';
import { Cents, assertCents } from '../../../../shared/money/money';
import { sanitize } from './payment-authorization';
import { RefundResult } from '../services/payment-gateway';
import { RefundTransitionException, RefundValidationException } from '../exceptions/payment.exceptions';

/**
 * IP-008 (PAY-006 BR-003) — motivos iniciais, catálogo fechado no código (mesmo
 * padrão de `DISPUTE_CATEGORIES`, MRK-023: a spec pede "configurável pela
 * Administração", a tela admin fica para depois). `ORDER_CANCELLED_BEFORE_EXECUTION`
 * e `DISPUTE_UPHELD` são os dois gatilhos automáticos desta IP (§ cancelamento
 * e § disputa); os demais existem para o catálogo nascer completo mas não têm
 * nenhum consumer automático apontando para eles nesta IP.
 */
export const REFUND_REASONS = [
  'ORDER_CANCELLED_BEFORE_EXECUTION',
  'DISPUTE_UPHELD',
  'OPERATIONAL_ERROR',
  'ADMINISTRATIVE_REFUND',
  'IMPROPER_CHARGE',
  'OTHER',
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

/** PAY-006 BR-006 — estados possíveis do reembolso. */
export const REFUND_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

export const REFUND_TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = {
  PENDING: [REFUND_STATUS.PROCESSING],
  PROCESSING: [REFUND_STATUS.COMPLETED, REFUND_STATUS.FAILED],
  COMPLETED: [],
  // BR-005/PAY-006 §4: nenhuma reautorização falsa é inventada aqui — uma
  // falha é um fato definitivo. Um novo reembolso, se necessário, é uma NOVA
  // linha (com sua própria chave de idempotência), nunca uma reabertura desta.
  FAILED: [],
};

export interface FundsRefundProps {
  id: string;
  paymentId: string;
  /** Denormalizado do Payment — permite consultar "todos os reembolsos do pedido" sem join. */
  orderId: string;
  /** Sempre em CENTAVOS — mesma convenção de `Payment`/`TrustCustody`. */
  amountCents: Cents;
  currency: string;
  reason: RefundReason;
  reasonDetail: string | null;
  /** Quem pediu — comprador (cancelamento) ou administrador (disputa/manual). */
  requestedBy: string;
  /** Disputa que originou este reembolso, quando aplicável (rastreabilidade). */
  disputeId: string | null;
  status: RefundStatus;
  providerId: string;
  idempotencyKey: string;
  providerRefundId: string | null;
  providerCode: string | null;
  message: string | null;
  gatewayResponse: Record<string, unknown>;
  requestedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * FundsRefund (PAY-006) — o registro formal de UM reembolso, total ou parcial.
 *
 * Um `Payment` pode ter VÁRIOS `FundsRefund` (BR-005: "a soma dos valores não
 * ultrapassa o valor originalmente liquidado") — por isso esta é uma entidade
 * própria, não um campo escalar em `Payment` (que já guarda só o acumulado,
 * `refundedCents`, como teto). Cada linha aqui é uma TENTATIVA, no mesmo
 * espírito de `PaymentAuthorization`: nasce PENDING, e só vira COMPLETED depois
 * que o gateway confirma — nunca antes (mesma disciplina de duas fases que
 * `TrustCustody`/`ReleaseFundsUseCase` já aplicam à liberação).
 *
 * Quem decide QUANTO reembolsar é sempre humano (cancelamento = o valor
 * inteiro que estava retido, sem cálculo de negócio; disputa = valor que o
 * administrador digitou na decisão) — esta entidade só garante que o valor é
 * positivo, inteiro em centavos, e nunca decide um percentual sozinha (Shared
 * Standards: nenhuma política de negócio nova é inventada aqui).
 */
export class FundsRefund {
  private constructor(private readonly props: FundsRefundProps) {}

  static request(input: {
    paymentId: string;
    orderId: string;
    amountCents: Cents;
    currency: string;
    reason: RefundReason;
    reasonDetail?: string | null;
    requestedBy: string;
    disputeId?: string | null;
    providerId: string;
    idempotencyKey: string;
    now?: Date;
  }): FundsRefund {
    assertCents(input.amountCents, 'refund amountCents');
    if (input.amountCents === 0) {
      throw new RefundValidationException('Refund amount must be greater than zero.');
    }
    const now = input.now ?? new Date();
    return new FundsRefund({
      id: uuidv7(),
      paymentId: input.paymentId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency,
      reason: input.reason,
      reasonDetail: input.reasonDetail?.trim() || null,
      requestedBy: input.requestedBy,
      disputeId: input.disputeId ?? null,
      status: REFUND_STATUS.PENDING,
      providerId: input.providerId,
      idempotencyKey: input.idempotencyKey,
      providerRefundId: null,
      providerCode: null,
      message: null,
      gatewayResponse: {},
      requestedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: FundsRefundProps): FundsRefund {
    return new FundsRefund(props);
  }

  get id(): string {
    return this.props.id;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get amountCents(): Cents {
    return this.props.amountCents;
  }

  get currency(): string {
    return this.props.currency;
  }

  get reason(): RefundReason {
    return this.props.reason;
  }

  get reasonDetail(): string | null {
    return this.props.reasonDetail;
  }

  get requestedBy(): string {
    return this.props.requestedBy;
  }

  get disputeId(): string | null {
    return this.props.disputeId;
  }

  get status(): RefundStatus {
    return this.props.status;
  }

  get providerId(): string {
    return this.props.providerId;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get providerRefundId(): string | null {
    return this.props.providerRefundId;
  }

  get requestedAt(): Date {
    return this.props.requestedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isPending(): boolean {
    return this.props.status === REFUND_STATUS.PENDING;
  }

  isCompleted(): boolean {
    return this.props.status === REFUND_STATUS.COMPLETED;
  }

  canTransitionTo(target: RefundStatus): boolean {
    return REFUND_TRANSITIONS[this.props.status].includes(target);
  }

  private transitionTo(target: RefundStatus, now: Date): void {
    if (!this.canTransitionTo(target)) {
      throw new RefundTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /** Marca que o pedido foi enviado ao gateway (fora de transação, ver use case). */
  markProcessing(now = new Date()): void {
    this.transitionTo(REFUND_STATUS.PROCESSING, now);
  }

  /** Só chamado depois de `result.outcome === 'APPROVED'` (mesma disciplina do PAY-004). */
  markCompleted(result: RefundResult, now = new Date()): void {
    this.transitionTo(REFUND_STATUS.COMPLETED, now);
    this.props.providerRefundId = result.providerTransactionId;
    this.props.providerCode = result.providerCode;
    this.props.message = result.message;
    this.props.gatewayResponse = sanitize(result.rawResponse);
    this.props.completedAt = now;
  }

  markFailed(result: RefundResult | null, now = new Date()): void {
    this.transitionTo(REFUND_STATUS.FAILED, now);
    this.props.providerCode = result?.providerCode ?? null;
    this.props.message = result?.message ?? null;
    this.props.gatewayResponse = result ? sanitize(result.rawResponse) : {};
  }

  toProps(): FundsRefundProps {
    return { ...this.props };
  }
}
