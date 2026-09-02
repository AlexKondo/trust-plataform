import { describe, expect, it } from 'vitest';
import {
  MarketplaceOrderAccessDeniedException,
  MarketplaceOrderCancellationNotAllowedException,
  MarketplaceOrderTransitionException,
} from '../exceptions/marketplace.exceptions';
import { MarketplaceOffer } from './marketplace-offer';
import { MarketplaceOrder } from './marketplace-order';
import { ORDER_STATUS, ORDER_TRANSITIONS, OrderStatus, PRICING_MODEL } from './marketplace-types';

const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';
const STRANGER = '019fe8f0-0000-7000-8000-000000000003';

function newOrder(): MarketplaceOrder {
  const offer = MarketplaceOffer.create({
    conversationId: '019fe8f0-0000-7000-8000-0000000000f1',
    listingId: '019fe8f0-0000-7000-8000-0000000000a1',
    buyerId: BUYER,
    sellerId: SELLER,
    createdBy: BUYER,
    terms: {
      amount: 540,
      currency: 'BRL',
      quantity: 1,
      expiresAt: new Date(Date.now() + 86400000),
      pricingModel: PRICING_MODEL.FIXED_PRICE,
      hourlyRateAmount: null,
      minimumMinutes: null,
      billingIncrementMinutes: null,
    },
  });
  return MarketplaceOrder.createFromOffer(offer);
}

/** Leva o pedido até o estado desejado pelo caminho feliz. */
function orderAt(status: OrderStatus): MarketplaceOrder {
  const order = newOrder();
  if (status === ORDER_STATUS.CREATED) return order;
  order.markScheduled();
  if (status === ORDER_STATUS.SCHEDULED) return order;
  order.start(SELLER);
  if (status === ORDER_STATUS.IN_PROGRESS) return order;
  order.completeExecution(SELLER);
  if (status === ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION) return order;
  order.confirmByCustomer(BUYER);
  if (status === ORDER_STATUS.CUSTOMER_CONFIRMED) return order;
  order.complete();
  return order;
}

describe('MarketplaceOrder — criação (MRK-015)', () => {
  it('nasce em CREATED com os valores congelados da proposta (BR-004/BR-005)', () => {
    const order = newOrder();
    expect(order.status).toBe(ORDER_STATUS.CREATED);
    expect(order.amount).toBe(540);
    expect(order.currency).toBe('BRL');
    expect(order.startedAt).toBeNull();
    expect(order.nextAction).toBe('AWAITING_SCHEDULING');
  });

  it('só comprador e vendedor acessam (MRK-016 BR-001)', () => {
    const order = newOrder();
    expect(order.isParticipant(BUYER)).toBe(true);
    expect(order.isParticipant(SELLER)).toBe(true);
    expect(() => order.assertParticipant(STRANGER)).toThrow(MarketplaceOrderAccessDeniedException);
  });

  it('PACK-02 §4 — copia o modelo comercial e os termos hourly do offer aceito', () => {
    const hourlyOffer = MarketplaceOffer.create({
      conversationId: '019fe8f0-0000-7000-8000-0000000000f1',
      listingId: '019fe8f0-0000-7000-8000-0000000000a1',
      buyerId: BUYER,
      sellerId: SELLER,
      createdBy: BUYER,
      terms: {
        amount: 150,
        currency: 'BRL',
        quantity: 1,
        expiresAt: new Date(Date.now() + 86400000),
        pricingModel: 'HOURLY',
        hourlyRateAmount: 150,
        minimumMinutes: 60,
        billingIncrementMinutes: 30,
      },
    });
    const order = MarketplaceOrder.createFromOffer(hourlyOffer);
    expect(order.pricingModel).toBe('HOURLY');
    expect(order.hourlyRateAmount).toBe(150);
    expect(order.minimumMinutes).toBe(60);
    expect(order.billingIncrementMinutes).toBe(30);

    const fixedOrder = newOrder();
    expect(fixedOrder.pricingModel).toBe('FIXED_PRICE');
    expect(fixedOrder.hourlyRateAmount).toBeNull();
  });
});

describe('MarketplaceOrder — máquina de estados (MRK-017)', () => {
  it('declara os 13 estados canônicos (INCONSISTENCIAS #8)', () => {
    expect(Object.keys(ORDER_TRANSITIONS)).toHaveLength(13);
    expect(ORDER_TRANSITIONS.CUSTOMER_CONFIRMED).toContain(ORDER_STATUS.COMPLETED);
  });

  it('percorre o caminho feliz completo', () => {
    const order = newOrder();
    order.markScheduled();
    expect(order.status).toBe(ORDER_STATUS.SCHEDULED);
    order.start(SELLER);
    expect(order.status).toBe(ORDER_STATUS.IN_PROGRESS);
    order.completeExecution(SELLER);
    expect(order.status).toBe(ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION);
    order.confirmByCustomer(BUYER);
    expect(order.status).toBe(ORDER_STATUS.CUSTOMER_CONFIRMED);
    order.complete();
    expect(order.status).toBe(ORDER_STATUS.COMPLETED);
  });

  it('recusa salto de estado — CREATED não vai direto a COMPLETED (BR-004)', () => {
    const order = newOrder();
    expect(() => order.complete()).toThrow(MarketplaceOrderTransitionException);
    expect(() => order.start(SELLER)).toThrow(MarketplaceOrderTransitionException);
    expect(() => order.confirmByCustomer(BUYER)).toThrow(MarketplaceOrderTransitionException);
  });

  it('não inicia execução duas vezes', () => {
    const order = orderAt(ORDER_STATUS.IN_PROGRESS);
    expect(() => order.start(SELLER)).toThrow(MarketplaceOrderTransitionException);
  });

  it('estados terminais não têm saída', () => {
    expect(ORDER_TRANSITIONS.CLOSED).toHaveLength(0);
    expect(ORDER_TRANSITIONS.CANCELLED).toHaveLength(0);
  });
});

describe('MarketplaceOrder — execução (MRK-020/021)', () => {
  it('check-in registra quem iniciou e quando (BR-002)', () => {
    const order = orderAt(ORDER_STATUS.SCHEDULED);
    const at = new Date();
    order.start(SELLER, at);
    expect(order.startedBy).toBe(SELLER);
    expect(order.startedAt).toEqual(at);
    expect(order.nextAction).toBe('AWAITING_SERVICE_COMPLETION');
  });

  it('check-out calcula a duração efetiva em minutos (BR-004)', () => {
    const order = orderAt(ORDER_STATUS.SCHEDULED);
    const start = new Date('2026-08-10T09:00:00.000Z');
    const end = new Date('2026-08-10T11:30:00.000Z');
    order.start(SELLER, start);
    order.completeExecution(SELLER, end);
    expect(order.actualDuration).toBe(150);
    expect(order.completedBy).toBe(SELLER);
  });

  it('duração mínima de 1 minuto mesmo em execução instantânea', () => {
    const order = orderAt(ORDER_STATUS.SCHEDULED);
    const now = new Date();
    order.start(SELLER, now);
    order.completeExecution(SELLER, now);
    expect(order.actualDuration).toBe(1);
  });
});

describe('MarketplaceOrder — confirmação do cliente (MRK-022)', () => {
  it('confirma e registra autor/momento, mas NÃO encerra o pedido (BR-006)', () => {
    const order = orderAt(ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION);
    const at = new Date();
    order.confirmByCustomer(BUYER, at);
    expect(order.status).toBe(ORDER_STATUS.CUSTOMER_CONFIRMED);
    expect(order.customerConfirmedBy).toBe(BUYER);
    expect(order.customerConfirmedAt).toEqual(at);
    expect(order.nextAction).toBe('PROCESSING_COMPLETION');
  });

  it('só depois dos processos obrigatórios o pedido conclui (BR-007)', () => {
    const order = orderAt(ORDER_STATUS.CUSTOMER_CONFIRMED);
    order.complete();
    expect(order.status).toBe(ORDER_STATUS.COMPLETED);
    expect(order.nextAction).toBe('AWAITING_REVIEW');
  });
});

describe('MarketplaceOrder — cancelamento (MRK-018)', () => {
  it('cancela antes da execução, guardando autor e motivo (BR-003/BR-004)', () => {
    const order = orderAt(ORDER_STATUS.SCHEDULED);
    const at = new Date();
    order.cancel(BUYER, '  Mudança de planos.  ', at);
    expect(order.status).toBe(ORDER_STATUS.CANCELLED);
    expect(order.cancelledBy).toBe(BUYER);
    expect(order.cancellationReason).toBe('Mudança de planos.');
    expect(order.cancelledAt).toEqual(at);
  });

  it('cancelamento é permitido em CREATED e SCHEDULED', () => {
    expect(() => orderAt(ORDER_STATUS.CREATED).cancel(SELLER, 'motivo')).not.toThrow();
    expect(() => orderAt(ORDER_STATUS.SCHEDULED).cancel(SELLER, 'motivo')).not.toThrow();
  });

  it('serviço em andamento não cancela direto — exige disputa (BR-002)', () => {
    const order = orderAt(ORDER_STATUS.IN_PROGRESS);
    expect(() => order.cancel(BUYER, 'desisti')).toThrow(
      MarketplaceOrderCancellationNotAllowedException,
    );
    expect(order.status).toBe(ORDER_STATUS.IN_PROGRESS);
  });

  it('pedido aguardando confirmação e concluído nunca cancelam', () => {
    expect(() =>
      orderAt(ORDER_STATUS.AWAITING_CUSTOMER_CONFIRMATION).cancel(BUYER, 'motivo'),
    ).toThrow(MarketplaceOrderCancellationNotAllowedException);
    expect(() => orderAt(ORDER_STATUS.COMPLETED).cancel(BUYER, 'motivo')).toThrow(
      MarketplaceOrderCancellationNotAllowedException,
    );
  });
});
