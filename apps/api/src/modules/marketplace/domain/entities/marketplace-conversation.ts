import { v7 as uuidv7 } from 'uuid';
import {
  MarketplaceConversationAccessDeniedException,
  MarketplaceConversationAlreadyClosedException,
  MarketplaceConversationClosedException,
} from '../exceptions/marketplace.exceptions';
import { CONVERSATION_STATUS, ConversationStatus } from './marketplace-types';

export interface MarketplaceConversationProps {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  status: ConversationStatus;
  startedAt: Date;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate root da conversa de negociação (MRK-006..008).
 * Invariantes: exatamente um anúncio (BR-006 do MRK-006); só comprador e
 * vendedor participam; encerrada nunca reabre e nunca perde histórico.
 */
export class MarketplaceConversation {
  private constructor(private readonly props: MarketplaceConversationProps) {}

  static open(input: { listingId: string; sellerId: string; buyerId: string }): MarketplaceConversation {
    const now = new Date();
    return new MarketplaceConversation({
      id: uuidv7(),
      listingId: input.listingId,
      sellerId: input.sellerId,
      buyerId: input.buyerId,
      status: CONVERSATION_STATUS.OPEN,
      startedAt: now,
      lastMessageAt: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: MarketplaceConversationProps): MarketplaceConversation {
    return new MarketplaceConversation(props);
  }

  get id(): string {
    return this.props.id;
  }

  get listingId(): string {
    return this.props.listingId;
  }

  get sellerId(): string {
    return this.props.sellerId;
  }

  get buyerId(): string {
    return this.props.buyerId;
  }

  get status(): ConversationStatus {
    return this.props.status;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get lastMessageAt(): Date | null {
    return this.props.lastMessageAt;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get closedBy(): string | null {
    return this.props.closedBy;
  }

  get closeReason(): string | null {
    return this.props.closeReason;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOpen(): boolean {
    return this.props.status === CONVERSATION_STATUS.OPEN;
  }

  isParticipant(identityId: string): boolean {
    return this.props.sellerId === identityId || this.props.buyerId === identityId;
  }

  /** O outro lado da conversa — quem recebe a mensagem enviada por `identityId`. */
  counterpartOf(identityId: string): string {
    return this.props.sellerId === identityId ? this.props.buyerId : this.props.sellerId;
  }

  /** MRK-007 BR-001 / MRK-008 BR-001 — porta única de autorização da conversa. */
  assertParticipant(identityId: string): void {
    if (!this.isParticipant(identityId)) {
      throw new MarketplaceConversationAccessDeniedException();
    }
  }

  /** MRK-007 BR-007 — nova mensagem atualiza a última atividade. */
  registerMessage(now = new Date()): void {
    if (!this.isOpen()) {
      throw new MarketplaceConversationClosedException();
    }
    this.props.lastMessageAt = now;
    this.props.updatedAt = now;
  }

  /** MRK-008 — encerra registrando autor, momento e motivo opcional (BR-005). */
  close(closedBy: string, reason: string | null, now = new Date()): void {
    this.assertParticipant(closedBy);
    if (!this.isOpen()) {
      throw new MarketplaceConversationAlreadyClosedException();
    }
    this.props.status = CONVERSATION_STATUS.CLOSED;
    this.props.closedAt = now;
    this.props.closedBy = closedBy;
    this.props.closeReason = reason?.trim() || null;
    this.props.updatedAt = now;
  }

  toProps(): MarketplaceConversationProps {
    return { ...this.props };
  }
}

export interface MarketplaceMessageProps {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  read: boolean;
  readAt: Date | null;
  sentAt: Date;
  createdAt: Date;
}

/**
 * Mensagem (MRK-007). Append-only: sem edição (BR-004) e sem exclusão pelos
 * participantes (BR-005) — o único estado mutável é a marcação de leitura.
 */
export class MarketplaceMessage {
  private constructor(private readonly props: MarketplaceMessageProps) {}

  static create(input: { conversationId: string; senderId: string; message: string; sentAt?: Date }): MarketplaceMessage {
    const now = input.sentAt ?? new Date();
    return new MarketplaceMessage({
      id: uuidv7(),
      conversationId: input.conversationId,
      senderId: input.senderId,
      message: input.message.trim(),
      read: false,
      readAt: null,
      sentAt: now,
      createdAt: now,
    });
  }

  static restore(props: MarketplaceMessageProps): MarketplaceMessage {
    return new MarketplaceMessage(props);
  }

  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get senderId(): string {
    return this.props.senderId;
  }

  get message(): string {
    return this.props.message;
  }

  get read(): boolean {
    return this.props.read;
  }

  get readAt(): Date | null {
    return this.props.readAt;
  }

  get sentAt(): Date {
    return this.props.sentAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toProps(): MarketplaceMessageProps {
    return { ...this.props };
  }
}
