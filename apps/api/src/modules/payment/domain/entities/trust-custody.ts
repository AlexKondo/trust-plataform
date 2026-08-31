import { v7 as uuidv7 } from 'uuid';
import { Cents, assertCents } from '../../../../shared/money/money';
import { TrustCustodyTransitionException } from '../exceptions/payment.exceptions';

/**
 * Estados da custódia (PACK-01 §7.2). `RELEASED` é terminal neste Pack —
 * liquidação e reembolso entram em Packs futuros.
 */
export const CUSTODY_STATUS = {
  IN_CUSTODY: 'IN_CUSTODY',
  READY_FOR_RELEASE: 'READY_FOR_RELEASE',
  RELEASED: 'RELEASED',
} as const;

export type CustodyStatus = (typeof CUSTODY_STATUS)[keyof typeof CUSTODY_STATUS];

export const CUSTODY_TRANSITIONS: Readonly<Record<CustodyStatus, readonly CustodyStatus[]>> = {
  IN_CUSTODY: [CUSTODY_STATUS.READY_FOR_RELEASE],
  READY_FOR_RELEASE: [CUSTODY_STATUS.RELEASED],
  RELEASED: [],
};

export interface TrustCustodyProps {
  id: string;
  paymentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  /** Sempre em CENTAVOS no domínio — mesma convenção do Payment. */
  amountCents: Cents;
  currency: string;
  status: CustodyStatus;
  startedAt: Date;
  releasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTrustCustodyInput {
  paymentId: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  amountCents: Cents;
  currency: string;
}

/**
 * TrustCustody (PAY-003/PAY-004, PACK-01 §6).
 *
 * É o agregado que sustenta a promessa central do produto: o dinheiro do cliente
 * sai na contratação e **não chega ao prestador** até que o serviço seja
 * confirmado como concluído e a política de liberação aprove.
 *
 * O snapshot financeiro é copiado do Payment na criação e é IMUTÁVEL: se
 * Payment e custódia divergirem depois, a política nega a liberação em vez de
 * "corrigir" o valor (PACK-01 §10).
 */
export class TrustCustody {
  private constructor(private readonly props: TrustCustodyProps) {}

  static create(input: CreateTrustCustodyInput, now = new Date()): TrustCustody {
    return new TrustCustody({
      id: uuidv7(),
      paymentId: input.paymentId,
      orderId: input.orderId,
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

  static restore(props: TrustCustodyProps): TrustCustody {
    return new TrustCustody({ ...props });
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

  canTransitionTo(target: CustodyStatus): boolean {
    return CUSTODY_TRANSITIONS[this.props.status].includes(target);
  }

  /**
   * Fase 1 da liberação (PACK-01 §11.1): a decisão da política é persistida
   * ANTES de qualquer efeito externo. Se o gateway falhar depois, a custódia
   * fica aqui e a mesma liberação pode ser retentada com segurança.
   */
  markReadyForRelease(now = new Date()): void {
    this.transitionTo(CUSTODY_STATUS.READY_FOR_RELEASE, now);
  }

  /**
   * Fase 2 (PACK-01 §11.1 passo 7): só depois de o gateway CONFIRMAR.
   * A plataforma nunca marca RELEASED por aprovação de política nem por
   * chegada de evento do Marketplace (§6.2).
   */
  markReleased(now = new Date()): void {
    this.transitionTo(CUSTODY_STATUS.RELEASED, now);
    this.props.releasedAt = now;
  }

  /** Porta única de mudança de estado — nenhum salto passa por aqui. */
  private transitionTo(target: CustodyStatus, now: Date): void {
    if (!this.canTransitionTo(target)) {
      throw new TrustCustodyTransitionException(this.props.status, target);
    }
    this.props.status = target;
    this.props.updatedAt = now;
  }

  toProps(): TrustCustodyProps {
    return { ...this.props };
  }
}
