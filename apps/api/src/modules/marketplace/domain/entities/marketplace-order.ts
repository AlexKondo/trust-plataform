import { v7 as uuidv7 } from 'uuid';
import {
  MarketplaceOrderAccessDeniedException,
  MarketplaceOrderCancellationNotAllowedException,
  MarketplaceOrderTransitionException,
} from '../exceptions/marketplace.exceptions';
import { MarketplaceOffer } from './marketplace-offer';
import {
  CANCELLABLE_STATUSES,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  OrderStatus,
  PricingModel,
} from './marketplace-types';

export interface MarketplaceOrderProps {
  id: string;
  listingId: string;
  offerId: string;
  conversationId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  quantity: number;
  /** PACK-02 §4 — copiado do offer aceito; imutável (MRK-017 BR-001). */
  pricingModel: PricingModel;
  hourlyRateAmount: number | null;
  minimumMinutes: number | null;
  billingIncrementMinutes: number | null;
  status: OrderStatus;
  startedAt: Date | null;
  startedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  actualDuration: number | null;
  customerConfirmedAt: Date | null;
  customerConfirmedBy: string | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Próxima ação esperada (MRK-016 BR-004) — o que a tela precisa dizer ao usuário. */
export const NEXT_ACTION: Readonly<Record<OrderStatus, string>> = {
  CREATED: 'AWAITING_SCHEDULING',
  AWAITING_SCHEDULING: 'AWAITING_SCHEDULING',
  SCHEDULED: 'AWAITING_SERVICE_START',
  AWAITING_EXECUTION: 'AWAITING_SERVICE_START',
  IN_PROGRESS: 'AWAITING_SERVICE_COMPLETION',
  AWAITING_CUSTOMER_CONFIRMATION: 'AWAITING_CUSTOMER_CONFIRMATION',
  CUSTOMER_CONFIRMED: 'PROCESSING_COMPLETION',
  COMPLETED: 'AWAITING_REVIEW',
  CLOSED: 'NONE',
  CANCELLED: 'NONE',
  DISPUTE_OPEN: 'AWAITING_DISPUTE_RESOLUTION',
  DISPUTE_RESOLVED: 'PROCESSING_COMPLETION',
  REFUNDED: 'NONE',
};

/**
 * Aggregate root do pedido (MRK-015..022) — a entidade que orquestra a execução.
 *
 * Invariantes: dados comerciais são imutáveis depois do aceite (MRK-017 BR-001);
 * toda mudança de status passa por `transitionTo`, que recusa saltos (BR-004);
 * marcos de execução (check-in, check-out, confirmação) são permanentes.
 */
export class MarketplaceOrder {
  private constructor(private readonly props: MarketplaceOrderProps) {}

  static createFromOffer(offer: MarketplaceOffer, now = new Date()): MarketplaceOrder {
    return new MarketplaceOrder({
      id: uuidv7(),
      listingId: offer.listingId,
      offerId: offer.id,
      conversationId: offer.conversationId,
      buyerId: offer.buyerId,
      sellerId: offer.sellerId,
      amount: offer.amount,
      currency: offer.currency,
      quantity: offer.quantity,
      pricingModel: offer.pricingModel,
      hourlyRateAmount: offer.hourlyRateAmount,
      minimumMinutes: offer.minimumMinutes,
      billingIncrementMinutes: offer.billingIncrementMinutes,
      status: ORDER_STATUS.CREATED,
      startedAt: null,
      startedBy: null,
      completedAt: null,
      completedBy: null,
      actualDuration: null,
      customerConfirmedAt: null,
      customerConfirmedBy: null,
      closedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: MarketplaceOrderProps): MarketplaceOrder {
    return new MarketplaceOrder(props);
  }

  get id(): string {
    return this.props.id;
  }

  get listingId(): string {
    return this.props.listingId;
  }

  get offerId(): string {
    return this.props.offerId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get buyerId(): string {
    return this.props.buyerId;
  }

  get sellerId(): string {
    return this.props.sellerId;
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get pricingModel(): PricingModel {
    return this.props.pricingModel;
  }

  get hourlyRateAmount(): number | null {
    return this.props.hourlyRateAmount;
  }

  get minimumMinutes(): number | null {
    return this.props.minimumMinutes;
  }

  get billingIncrementMinutes(): number | null {
    return this.props.billingIncrementMinutes;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get startedAt(): Date | null {
    return this.props.startedAt;
  }

  get startedBy(): string | null {
    return this.props.startedBy;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get completedBy(): string | null {
    return this.props.completedBy;
  }

  get actualDuration(): number | null {
    return this.props.actualDuration;
  }

  get customerConfirmedAt(): Date | null {
    return this.props.customerConfirmedAt;
  }

  get customerConfirmedBy(): string | null {
    return this.props.customerConfirmedBy;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }

  get cancelledBy(): string | null {
    return this.props.cancelledBy;
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get nextAction(): string {
    return NEXT_ACTION[this.props.status];
  }

  isParticipant(identityId: string): boolean {
    return this.props.buyerId === identityId || this.props.sellerId === identityId;
  }

  /** MRK-016 BR-001 — só comprador e vendedor consultam o pedido. */
  assertParticipant(identityId: string): void {
    if (!this.isParticipant(identityId)) {
      throw new MarketplaceOrderAccessDeniedException();
    }
  }

  canTransitionTo(target: OrderStatus): boolean {
    return ORDER_TRANSITIONS[this.props.status].includes(target);
  }

  /** MRK-017 BR-003/BR-004 — porta única de mudança de status. */
  transitionTo(target: OrderStatus, now = new Date()): void {
    if (!this.canTransitionTo(target)) {
      throw new MarketplaceOrderTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /** MRK-019 BR-005 — agendamento confirmado. */
  markScheduled(now = new Date()): void {
    this.transitionTo(ORDER_STATUS.SCHEDULED, now);
  }

  /** MRK-020 — check-in do prestador: a execução começou (BR-005). */
  start(performedBy: string, now = new Date()): void {
    this.transitionTo(ORDER_STATUS.IN_PROGRESS, now);
    this.props.startedAt = now;
    this.props.startedBy = performedBy;
  }

  /**
   * MRK-021 — check-out: a execução terminou e a bola passa para o cliente
   * (BR-005). A duração efetiva sai do intervalo entre os dois marcos (BR-004).
   */
  completeExecution(performedBy: string, now = new Date()): void {
    this.transitionTo(ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION, now);
    this.props.completedAt = now;
    this.props.completedBy = performedBy;
    this.props.actualDuration = this.props.startedAt
      ? Math.max(1, Math.round((now.getTime() - this.props.startedAt.getTime()) / 60000))
      : null;
  }

  /** MRK-022 — confirmação do cliente; ainda NÃO encerra o pedido (BR-006). */
  confirmByCustomer(confirmedBy: string, now = new Date()): void {
    this.transitionTo(ORDER_STATUS.CUSTOMER_CONFIRMED, now);
    this.props.customerConfirmedAt = now;
    this.props.customerConfirmedBy = confirmedBy;
  }

  /** MRK-022 BR-007 — só depois dos processos obrigatórios o pedido conclui. */
  complete(now = new Date()): void {
    this.transitionTo(ORDER_STATUS.COMPLETED, now);
  }

  /** MRK-018 — cancelamento com motivo obrigatório; o pedido nunca é apagado. */
  cancel(cancelledBy: string, reason: string, now = new Date()): void {
    if (!CANCELLABLE_STATUSES.includes(this.props.status)) {
      throw new MarketplaceOrderCancellationNotAllowedException(this.props.status);
    }
    this.transitionTo(ORDER_STATUS.CANCELLED, now);
    this.props.cancelledAt = now;
    this.props.cancelledBy = cancelledBy;
    this.props.cancellationReason = reason.trim();
  }

  toProps(): MarketplaceOrderProps {
    return { ...this.props };
  }
}
