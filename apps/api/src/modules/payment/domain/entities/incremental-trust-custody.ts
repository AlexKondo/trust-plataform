import { v7 as uuidv7 } from 'uuid';
import { Cents, assertCents } from '../../../../shared/money/money';
import { TrustCustodyTransitionException } from '../exceptions/payment.exceptions';
import { CUSTODY_STATUS, CUSTODY_TRANSITIONS, CustodyStatus } from './trust-custody';

export interface IncrementalTrustCustodyProps {
  id: string;
  paymentId: string;
  orderId: string;
  /** O Change Order aprovado que esta tranche representa — 1:1 para sempre. */
  changeOrderId: string;
  /** A tentativa de autorização que colocou este valor em custódia. */
  incrementalAuthorizationId: string;
  buyerId: string;
  sellerId: string;
  /** Sempre em CENTAVOS — mesma convenção do TrustCustody original. */
  amountCents: Cents;
  currency: string;
  status: CustodyStatus;
  startedAt: Date;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIncrementalTrustCustodyInput {
  paymentId: string;
  orderId: string;
  changeOrderId: string;
  incrementalAuthorizationId: string;
  buyerId: string;
  sellerId: string;
  amountCents: Cents;
  currency: string;
}

/**
 * IP-007 — custódia de UMA TRANCHE incremental (um Change Order aprovado e
 * autorizado com sucesso no gateway sandbox).
 *
 * Por que é uma entidade/tabela própria e não uma segunda linha em
 * `trust_custodies`: aquela tabela tem `UNIQUE(payment_id)` (PACK-01 §6.2, "um
 * Payment tem no máximo uma custódia") — é a garantia final de que o valor
 * ORIGINAL nunca duplica. Reaproveitar a mesma tabela para tranches
 * incrementais exigiria remover ou reinterpretar essa garantia, uma mudança
 * destrutiva no significado de uma tabela do PACK-01 fechado. Em vez disso,
 * cada Change Order aprovado com autorização aprovada ganha sua PRÓPRIA linha
 * aqui — `UNIQUE(change_order_id)` cumpre, para a tranche, o mesmo papel que
 * `UNIQUE(payment_id)` cumpre para a custódia original.
 *
 * A máquina de estados é IDÊNTICA à de `TrustCustody` (mesmo
 * `CUSTODY_STATUS`/`CUSTODY_TRANSITIONS`, importados de lá — uma fonte só para
 * o vocabulário de estados) porque o fato que ela representa é o mesmo: dinheiro
 * que saiu da plataforma-cliente e ainda não é do prestador.
 */
export class IncrementalTrustCustody {
  private constructor(private readonly props: IncrementalTrustCustodyProps) {}

  static create(input: CreateIncrementalTrustCustodyInput, now = new Date()): IncrementalTrustCustody {
    return new IncrementalTrustCustody({
      id: uuidv7(),
      paymentId: input.paymentId,
      orderId: input.orderId,
      changeOrderId: input.changeOrderId,
      incrementalAuthorizationId: input.incrementalAuthorizationId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      amountCents: assertCents(input.amountCents),
      currency: input.currency,
      status: CUSTODY_STATUS.IN_CUSTODY,
      startedAt: now,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: IncrementalTrustCustodyProps): IncrementalTrustCustody {
    return new IncrementalTrustCustody({ ...props });
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

  get changeOrderId(): string {
    return this.props.changeOrderId;
  }

  get incrementalAuthorizationId(): string {
    return this.props.incrementalAuthorizationId;
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

  get status(): CustodyStatus {
    return this.props.status;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get releasedAt(): Date | null {
    return this.props.releasedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isInCustody(): boolean {
    return this.props.status === CUSTODY_STATUS.IN_CUSTODY;
  }

  isReadyForRelease(): boolean {
    return this.props.status === CUSTODY_STATUS.READY_FOR_RELEASE;
  }

  isReleased(): boolean {
    return this.props.status === CUSTODY_STATUS.RELEASED;
  }

  isRefunded(): boolean {
    return this.props.status === CUSTODY_STATUS.REFUNDED;
  }

  canTransitionTo(target: CustodyStatus): boolean {
    return CUSTODY_TRANSITIONS[this.props.status].includes(target);
  }

  /** Fase 1 da liberação — mesma semântica de `TrustCustody.markReadyForRelease`. */
  markReadyForRelease(now = new Date()): void {
    this.transitionTo(CUSTODY_STATUS.READY_FOR_RELEASE, now);
  }

  /** Fase 2 — só depois de o gateway CONFIRMAR (mesma regra do PACK-01 §11.1). */
  markReleased(now = new Date()): void {
    this.transitionTo(CUSTODY_STATUS.RELEASED, now);
    this.props.releasedAt = now;
  }

  /** IP-008 — mesma semântica de `TrustCustody.markRefunded`, por tranche. */
  markRefunded(now = new Date()): void {
    this.transitionTo(CUSTODY_STATUS.REFUNDED, now);
  }

  private transitionTo(target: CustodyStatus, now: Date): void {
    if (!this.canTransitionTo(target)) {
      throw new TrustCustodyTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  toProps(): IncrementalTrustCustodyProps {
    return { ...this.props };
  }
}
