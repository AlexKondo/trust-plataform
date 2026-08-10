import { v7 as uuidv7 } from 'uuid';
import {
  MarketplaceOfferAlreadyResolvedException,
  MarketplaceOfferExpiredException,
  MarketplaceOfferNotRecipientException,
  MarketplaceOfferOwnershipException,
  MarketplaceOfferValidationException,
} from '../exceptions/marketplace.exceptions';
import { OFFER_STATUS, OfferStatus } from './marketplace-types';

export interface MarketplaceOfferProps {
  id: string;
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  /** Quem propôs esta rodada — define quem pode editar e quem pode decidir. */
  createdBy: string;
  parentOfferId: string | null;
  amount: number;
  currency: string;
  quantity: number;
  status: OfferStatus;
  expiresAt: Date;
  notes: string | null;
  withdrewAt: Date | null;
  withdrewBy: string | null;
  withdrawReason: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfferTerms {
  amount: number;
  currency: string;
  quantity: number;
  expiresAt: Date;
  notes?: string | null;
}

/**
 * Aggregate root da proposta (MRK-009..014).
 *
 * Duas autorizações distintas convivem aqui e são a espinha dorsal do módulo:
 * - **quem propôs** (`createdBy`) pode atualizar (MRK-010) e retirar (MRK-011);
 * - **quem recebeu** (o outro lado) pode aceitar (MRK-013), rejeitar (MRK-014)
 *   ou contrapor (MRK-012) — nunca decidir a própria proposta.
 *
 * A expiração é **derivada** de `expiresAt` (não há job de varredura no MVP):
 * `effectiveStatus()` reporta EXPIRED e nenhuma operação passa (INCONSISTENCIAS #33).
 */
export class MarketplaceOffer {
  private constructor(private readonly props: MarketplaceOfferProps) {}

  static create(input: {
    conversationId: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    createdBy: string;
    parentOfferId?: string | null;
    terms: OfferTerms;
    now?: Date;
  }): MarketplaceOffer {
    const now = input.now ?? new Date();
    assertTerms(input.terms, now);
    return new MarketplaceOffer({
      id: uuidv7(),
      conversationId: input.conversationId,
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      createdBy: input.createdBy,
      parentOfferId: input.parentOfferId ?? null,
      amount: input.terms.amount,
      currency: input.terms.currency,
      quantity: input.terms.quantity,
      status: OFFER_STATUS.PENDING,
      expiresAt: input.terms.expiresAt,
      notes: input.terms.notes?.trim() || null,
      withdrewAt: null,
      withdrewBy: null,
      withdrawReason: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectReason: null,
      acceptedAt: null,
      acceptedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: MarketplaceOfferProps): MarketplaceOffer {
    return new MarketplaceOffer(props);
  }

  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get listingId(): string {
    return this.props.listingId;
  }

  get buyerId(): string {
    return this.props.buyerId;
  }

  get sellerId(): string {
    return this.props.sellerId;
  }

  get createdBy(): string {
    return this.props.createdBy;
  }

  get parentOfferId(): string | null {
    return this.props.parentOfferId;
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

  get status(): OfferStatus {
    return this.props.status;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get withdrewAt(): Date | null {
    return this.props.withdrewAt;
  }

  get withdrawReason(): string | null {
    return this.props.withdrawReason;
  }

  get rejectedAt(): Date | null {
    return this.props.rejectedAt;
  }

  get rejectedBy(): string | null {
    return this.props.rejectedBy;
  }

  get rejectReason(): string | null {
    return this.props.rejectReason;
  }

  get acceptedAt(): Date | null {
    return this.props.acceptedAt;
  }

  get acceptedBy(): string | null {
    return this.props.acceptedBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Quem deve decidir esta proposta: sempre o outro lado de quem propôs. */
  get recipientId(): string {
    return this.props.createdBy === this.props.buyerId ? this.props.sellerId : this.props.buyerId;
  }

  isExpired(now = new Date()): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  /** Status para leitura: PENDING vencido é apresentado como EXPIRED. */
  effectiveStatus(now = new Date()): OfferStatus {
    if (this.props.status === OFFER_STATUS.PENDING && this.isExpired(now)) {
      return OFFER_STATUS.EXPIRED;
    }
    return this.props.status;
  }

  isPending(now = new Date()): boolean {
    return this.effectiveStatus(now) === OFFER_STATUS.PENDING;
  }

  /** MRK-010 — quem propôs ajusta os termos enquanto a proposta está viva. */
  update(actorId: string, changes: Partial<OfferTerms>, now = new Date()): string[] {
    this.assertOwner(actorId);
    this.assertPending(now);

    const terms: OfferTerms = {
      amount: changes.amount ?? this.props.amount,
      currency: this.props.currency, // moeda não muda: é a do anúncio (MRK-012 BR-009)
      quantity: changes.quantity ?? this.props.quantity,
      expiresAt: changes.expiresAt ?? this.props.expiresAt,
      notes: changes.notes === undefined ? this.props.notes : changes.notes,
    };
    assertTerms(terms, now);

    const updatedFields: string[] = [];
    if (terms.amount !== this.props.amount) {
      this.props.amount = terms.amount;
      updatedFields.push('amount');
    }
    if (terms.quantity !== this.props.quantity) {
      this.props.quantity = terms.quantity;
      updatedFields.push('quantity');
    }
    if (terms.expiresAt.getTime() !== this.props.expiresAt.getTime()) {
      this.props.expiresAt = terms.expiresAt;
      updatedFields.push('expiresAt');
    }
    const notes = terms.notes?.trim() || null;
    if (notes !== this.props.notes) {
      this.props.notes = notes;
      updatedFields.push('notes');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = now;
    }
    return updatedFields;
  }

  /** MRK-011 — retirada pelo autor; a proposta nunca é apagada (BR-004). */
  withdraw(actorId: string, reason: string | null, now = new Date()): void {
    this.assertOwner(actorId);
    this.assertPending(now);
    this.props.status = OFFER_STATUS.WITHDRAWN;
    this.props.withdrewAt = now;
    this.props.withdrewBy = actorId;
    this.props.withdrawReason = reason?.trim() || null;
    this.props.updatedAt = now;
  }

  /** MRK-014 — rejeição por quem recebeu; a conversa segue aberta (BR-004). */
  reject(actorId: string, reason: string | null, now = new Date()): void {
    this.assertRecipient(actorId);
    this.assertPending(now);
    this.props.status = OFFER_STATUS.REJECTED;
    this.props.rejectedAt = now;
    this.props.rejectedBy = actorId;
    this.props.rejectReason = reason?.trim() || null;
    this.props.updatedAt = now;
  }

  /** MRK-013 — aceite por quem recebeu. Pivô da negociação. */
  accept(actorId: string, now = new Date()): void {
    this.assertRecipient(actorId);
    this.assertPending(now);
    this.props.status = OFFER_STATUS.ACCEPTED;
    this.props.acceptedAt = now;
    this.props.acceptedBy = actorId;
    this.props.updatedAt = now;
  }

  /**
   * MRK-012 — quem recebeu responde com novos termos: esta proposta vira
   * COUNTERED (BR-003) e nasce a próxima rodada apontando para ela (BR-004).
   */
  counter(actorId: string, terms: OfferTerms, now = new Date()): MarketplaceOffer {
    this.assertRecipient(actorId);
    this.assertPending(now);

    const counterOffer = MarketplaceOffer.create({
      conversationId: this.props.conversationId,
      listingId: this.props.listingId,
      buyerId: this.props.buyerId,
      sellerId: this.props.sellerId,
      createdBy: actorId,
      parentOfferId: this.props.id,
      // BR-009: a contraoferta herda a moeda da negociação
      terms: { ...terms, currency: this.props.currency },
      now,
    });

    this.props.status = OFFER_STATUS.COUNTERED;
    this.props.updatedAt = now;
    return counterOffer;
  }

  /** MRK-013 BR-004 — encerrada por tabela: outra proposta da negociação venceu. */
  closeAsSuperseded(now = new Date()): void {
    if (this.props.status !== OFFER_STATUS.PENDING) {
      return;
    }
    this.props.status = OFFER_STATUS.CLOSED;
    this.props.updatedAt = now;
  }

  private assertOwner(actorId: string): void {
    if (this.props.createdBy !== actorId) {
      throw new MarketplaceOfferOwnershipException();
    }
  }

  private assertRecipient(actorId: string): void {
    if (this.recipientId !== actorId) {
      throw new MarketplaceOfferNotRecipientException();
    }
  }

  private assertPending(now: Date): void {
    if (this.props.status !== OFFER_STATUS.PENDING) {
      throw new MarketplaceOfferAlreadyResolvedException(this.props.status);
    }
    if (this.isExpired(now)) {
      throw new MarketplaceOfferExpiredException();
    }
  }

  toProps(): MarketplaceOfferProps {
    return { ...this.props };
  }
}

/** MRK-009 BR-005 / MRK-010 BR-005/006 — invariantes dos termos da proposta. */
function assertTerms(terms: OfferTerms, now: Date): void {
  if (!(terms.amount > 0)) {
    throw new MarketplaceOfferValidationException('Offer amount must be greater than zero.');
  }
  if (!(terms.quantity > 0)) {
    throw new MarketplaceOfferValidationException('Offer quantity must be greater than zero.');
  }
  if (terms.expiresAt.getTime() <= now.getTime()) {
    throw new MarketplaceOfferValidationException('Offer expiration must be in the future.');
  }
}
