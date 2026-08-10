import { v7 as uuidv7 } from 'uuid';
import { MarketplaceOffer } from './marketplace-offer';
import { ORDER_STATUS, OrderStatus } from './marketplace-types';

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
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pedido (MRK-015), na forma mínima que o Módulo 7 precisa.
 * Nasce **apenas** do aceite de uma proposta (BR-001: não há criação manual) e
 * congela os valores negociados (BR-005). Participantes são imutáveis (BR-006).
 * A máquina de 13 estados e as transições chegam no Módulo 8.
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
      status: ORDER_STATUS.CREATED,
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

  get status(): OrderStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toProps(): MarketplaceOrderProps {
    return { ...this.props };
  }
}
