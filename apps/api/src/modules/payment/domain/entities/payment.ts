import { v7 as uuidv7 } from 'uuid';
import { Cents, assertCents } from '../../../../shared/money/money';
import {
  PaymentAccessDeniedException,
  PaymentTransitionException,
  PaymentValidationException,
} from '../exceptions/payment.exceptions';
import { PAYMENT_STATUS, PAYMENT_TRANSITIONS, PaymentStatus } from './payment-types';

export interface PaymentProps {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  /** Sempre em CENTAVOS no domínio (skill trust-payments §1). */
  amountCents: Cents;
  currency: string;
  status: PaymentStatus;
  paymentMethodId: string | null;
  paymentProviderId: string | null;
  /** Total já devolvido, em centavos — teto para novos reembolsos (PAY-006 BR-005). */
  refundedCents: Cents;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate root do pagamento (PAY-001).
 *
 * Invariantes: valores nunca mudam depois de criados (são cópia do pedido);
 * status só muda por `transitionTo`, que recusa salto; o pagamento pertence a
 * exatamente um pedido e a duas pessoas, e nenhuma das três muda.
 *
 * O agregado NÃO conhece gateway: quem fala com provedor externo é a camada de
 * aplicação, pelo port `PaymentGateway` (PAY-ARCH-001).
 */
export class Payment {
  private constructor(private readonly props: PaymentProps) {}

  static create(input: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    amountCents: Cents;
    currency: string;
    now?: Date;
  }): Payment {
    assertCents(input.amountCents, 'amountCents');
    if (input.amountCents === 0) {
      throw new PaymentValidationException('Payment amount must be greater than zero.');
    }
    if (input.buyerId === input.sellerId) {
      throw new PaymentValidationException('Buyer and seller must be different identities.');
    }
    const now = input.now ?? new Date();
    return new Payment({
      id: uuidv7(),
      orderId: input.orderId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: PAYMENT_STATUS.CREATED,
      paymentMethodId: null,
      paymentProviderId: null,
      refundedCents: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: PaymentProps): Payment {
    return new Payment(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orderId(): string {
    return this.props.orderId;
  }

  get buyerId(): string {
    return this.props.buyerId;
  }

  get sellerId(): string {
    return this.props.sellerId;
  }

  get amountCents(): Cents {
    return this.props.amountCents;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get paymentProviderId(): string | null {
    return this.props.paymentProviderId;
  }

  get refundedCents(): Cents {
    return this.props.refundedCents;
  }

  /** Quanto ainda pode ser devolvido (PAY-006 BR-005). */
  get refundableCents(): Cents {
    return this.props.amountCents - this.props.refundedCents;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isParticipant(identityId: string): boolean {
    return this.props.buyerId === identityId || this.props.sellerId === identityId;
  }

  assertParticipant(identityId: string): void {
    if (!this.isParticipant(identityId)) {
      throw new PaymentAccessDeniedException();
    }
  }

  /** Só o comprador autoriza o próprio pagamento. */
  assertBuyer(identityId: string): void {
    if (this.props.buyerId !== identityId) {
      throw new PaymentAccessDeniedException('Only the buyer can pay for this order.');
    }
  }

  canTransitionTo(target: PaymentStatus): boolean {
    return PAYMENT_TRANSITIONS[this.props.status].includes(target);
  }

  /** Porta única de mudança de status — nenhum salto passa por aqui. */
  transitionTo(target: PaymentStatus, now = new Date()): void {
    if (!this.canTransitionTo(target)) {
      throw new PaymentTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  /** PAY-002 — autorização aprovada pelo provedor. */
  markAuthorized(providerId: string, now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.AUTHORIZED, now);
    this.props.paymentProviderId = providerId;
  }

  /** PAY-002 BR-005 — falha permite nova tentativa. */
  markAuthorizationFailed(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.AUTHORIZATION_FAILED, now);
  }

  /** Volta para CREATED para uma nova tentativa de pagamento. */
  retryAuthorization(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.CREATED, now);
  }

  /** PAY-003 — dinheiro sob custódia da plataforma. */
  markInCustody(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.FUNDS_IN_CUSTODY, now);
  }

  /** PAY-004 — custódia liberada para o prestador. */
  markReleased(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.FUNDS_RELEASED, now);
  }

  /** PAY-005 — liquidado junto ao provedor. */
  markSettled(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.SETTLED, now);
  }

  /**
   * PAY-006 — registra devolução. Soma acumulada nunca passa do valor pago
   * (BR-005); devolução integral leva a REFUNDED, parcial a PARTIALLY_REFUNDED.
   */
  registerRefund(amountCents: Cents, now = new Date()): void {
    assertCents(amountCents, 'refund amount');
    if (amountCents === 0) {
      throw new PaymentValidationException('Refund amount must be greater than zero.');
    }
    if (amountCents > this.refundableCents) {
      throw new PaymentValidationException(
        `Refund of ${amountCents} exceeds the refundable balance of ${this.refundableCents}.`,
      );
    }
    this.props.refundedCents += amountCents;
    this.transitionTo(
      this.refundableCents === 0 ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
      now,
    );
  }

  cancel(now = new Date()): void {
    this.transitionTo(PAYMENT_STATUS.CANCELLED, now);
  }

  toProps(): PaymentProps {
    return { ...this.props };
  }
}
