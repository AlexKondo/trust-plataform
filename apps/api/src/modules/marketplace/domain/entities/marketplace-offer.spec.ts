import { describe, expect, it } from 'vitest';
import {
  MarketplaceOfferAlreadyResolvedException,
  MarketplaceOfferExpiredException,
  MarketplaceOfferNotRecipientException,
  MarketplaceOfferOwnershipException,
  MarketplaceOfferValidationException,
} from '../exceptions/marketplace.exceptions';
import { MarketplaceOffer } from './marketplace-offer';
import { OFFER_STATUS } from './marketplace-types';

const CONVERSATION = '019fe8f0-0000-7000-8000-0000000000f1';
const LISTING = '019fe8f0-0000-7000-8000-0000000000a1';
const BUYER = '019fe8f0-0000-7000-8000-000000000001';
const SELLER = '019fe8f0-0000-7000-8000-000000000002';
const STRANGER = '019fe8f0-0000-7000-8000-000000000003';

const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

function buyerOffer(overrides: { amount?: number; expiresAt?: Date } = {}): MarketplaceOffer {
  return MarketplaceOffer.create({
    conversationId: CONVERSATION,
    listingId: LISTING,
    buyerId: BUYER,
    sellerId: SELLER,
    createdBy: BUYER,
    terms: {
      amount: overrides.amount ?? 180,
      currency: 'BRL',
      quantity: 1,
      expiresAt: overrides.expiresAt ?? inDays(7),
      notes: '  Posso pagar à vista.  ',
    },
  });
}

describe('MarketplaceOffer — criação (MRK-009)', () => {
  it('nasce PENDING, vinculada à conversa e ao anúncio (BR-004/BR-006/BR-008)', () => {
    const offer = buyerOffer();
    expect(offer.status).toBe(OFFER_STATUS.PENDING);
    expect(offer.conversationId).toBe(CONVERSATION);
    expect(offer.listingId).toBe(LISTING);
    expect(offer.parentOfferId).toBeNull();
    expect(offer.notes).toBe('Posso pagar à vista.');
  });

  it('quem propõe não decide: o destinatário é o outro lado (MRK-013 BR-001)', () => {
    expect(buyerOffer().recipientId).toBe(SELLER);
  });

  it('valor deve ser maior que zero (BR-005)', () => {
    expect(() => buyerOffer({ amount: 0 })).toThrow(MarketplaceOfferValidationException);
  });

  it('validade tem que estar no futuro', () => {
    expect(() => buyerOffer({ expiresAt: inDays(-1) })).toThrow(MarketplaceOfferValidationException);
  });
});

describe('MarketplaceOffer — atualização e retirada (MRK-010/011)', () => {
  it('autor ajusta os termos e recebe a lista de campos alterados', () => {
    const offer = buyerOffer();
    const changed = offer.update(BUYER, { amount: 200, quantity: 2 });
    expect(changed.sort()).toEqual(['amount', 'quantity']);
    expect(offer.amount).toBe(200);
  });

  it('quem não propôs não edita (BR-001)', () => {
    const offer = buyerOffer();
    expect(() => offer.update(SELLER, { amount: 1 })).toThrow(MarketplaceOfferOwnershipException);
  });

  it('proposta já decidida não muda mais (BR-003)', () => {
    const offer = buyerOffer();
    offer.reject(SELLER, 'Fora do orçamento.');
    expect(() => offer.update(BUYER, { amount: 100 })).toThrow(
      MarketplaceOfferAlreadyResolvedException,
    );
  });

  it('retirada preserva a proposta com autor, momento e motivo (BR-004/BR-006)', () => {
    const offer = buyerOffer();
    offer.withdraw(BUYER, '  Encontrei outra solução.  ');
    expect(offer.status).toBe(OFFER_STATUS.WITHDRAWN);
    expect(offer.withdrawReason).toBe('Encontrei outra solução.');
    expect(offer.withdrewAt).not.toBeNull();
  });

  it('vendedor não retira proposta do comprador (BR-001)', () => {
    const offer = buyerOffer();
    expect(() => offer.withdraw(SELLER, null)).toThrow(MarketplaceOfferOwnershipException);
  });
});

describe('MarketplaceOffer — decisões (MRK-013/014)', () => {
  it('quem recebeu aceita e a proposta vira ACCEPTED (BR-003)', () => {
    const offer = buyerOffer();
    const acceptedAt = new Date();
    offer.accept(SELLER, acceptedAt);
    expect(offer.status).toBe(OFFER_STATUS.ACCEPTED);
    expect(offer.acceptedBy).toBe(SELLER);
    expect(offer.acceptedAt).toEqual(acceptedAt);
  });

  it('o próprio autor não aceita a própria proposta (BR-001)', () => {
    const offer = buyerOffer();
    expect(() => offer.accept(BUYER)).toThrow(MarketplaceOfferNotRecipientException);
  });

  it('terceiro não decide nada', () => {
    const offer = buyerOffer();
    expect(() => offer.reject(STRANGER, null)).toThrow(MarketplaceOfferNotRecipientException);
  });

  it('aceitar duas vezes é conflito de estado (BR-002)', () => {
    const offer = buyerOffer();
    offer.accept(SELLER);
    expect(() => offer.accept(SELLER)).toThrow(MarketplaceOfferAlreadyResolvedException);
  });

  it('rejeição registra autor e motivo opcional (BR-006)', () => {
    const offer = buyerOffer();
    offer.reject(SELLER, null);
    expect(offer.status).toBe(OFFER_STATUS.REJECTED);
    expect(offer.rejectedBy).toBe(SELLER);
    expect(offer.rejectReason).toBeNull();
  });

  it('encerramento por tabela só afeta propostas pendentes (MRK-013 BR-004)', () => {
    const pending = buyerOffer();
    pending.closeAsSuperseded();
    expect(pending.status).toBe(OFFER_STATUS.CLOSED);

    const rejected = buyerOffer();
    rejected.reject(SELLER, null);
    rejected.closeAsSuperseded();
    expect(rejected.status).toBe(OFFER_STATUS.REJECTED); // não sobrescreve o desfecho
  });
});

describe('MarketplaceOffer — contraoferta (MRK-012)', () => {
  it('a original vira COUNTERED e a nova aponta para ela (BR-003/BR-004)', () => {
    const original = buyerOffer();
    const counter = original.counter(SELLER, {
      amount: 220,
      currency: 'USD', // ignorada: a moeda é a da negociação (BR-009)
      quantity: 1,
      expiresAt: inDays(3),
    });

    expect(original.status).toBe(OFFER_STATUS.COUNTERED);
    expect(counter.status).toBe(OFFER_STATUS.PENDING);
    expect(counter.parentOfferId).toBe(original.id);
    expect(counter.currency).toBe('BRL');
    expect(counter.createdBy).toBe(SELLER);
  });

  it('a contraoferta inverte quem decide — o comprador passa a responder (BR-006)', () => {
    const original = buyerOffer();
    const counter = original.counter(SELLER, {
      amount: 220,
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(3),
    });
    expect(counter.recipientId).toBe(BUYER);

    // e o comprador pode contrapor de volta, sem limite de rodadas (BR-007)
    const counterBack = counter.counter(BUYER, {
      amount: 200,
      currency: 'BRL',
      quantity: 1,
      expiresAt: inDays(3),
    });
    expect(counterBack.parentOfferId).toBe(counter.id);
    expect(counterBack.recipientId).toBe(SELLER);
  });

  it('quem propôs não contrapõe a si mesmo (BR-001)', () => {
    const original = buyerOffer();
    expect(() =>
      original.counter(BUYER, { amount: 1, currency: 'BRL', quantity: 1, expiresAt: inDays(1) }),
    ).toThrow(MarketplaceOfferNotRecipientException);
  });
});

describe('MarketplaceOffer — expiração derivada (MRK-009 BR-007)', () => {
  const expiredOffer = () => {
    const offer = buyerOffer();
    // vence entre a criação e a leitura: o relógio é o único juiz
    return { offer, later: new Date(offer.expiresAt.getTime() + 1000) };
  };

  it('PENDING vencida é apresentada como EXPIRED', () => {
    const { offer, later } = expiredOffer();
    expect(offer.status).toBe(OFFER_STATUS.PENDING);
    expect(offer.effectiveStatus(later)).toBe(OFFER_STATUS.EXPIRED);
    expect(offer.isPending(later)).toBe(false);
  });

  it('proposta vencida não pode ser aceita, rejeitada, atualizada nem contraposta', () => {
    const { offer, later } = expiredOffer();
    expect(() => offer.accept(SELLER, later)).toThrow(MarketplaceOfferExpiredException);
    expect(() => offer.reject(SELLER, null, later)).toThrow(MarketplaceOfferExpiredException);
    expect(() => offer.update(BUYER, { amount: 10 }, later)).toThrow(MarketplaceOfferExpiredException);
    expect(() =>
      offer.counter(SELLER, { amount: 10, currency: 'BRL', quantity: 1, expiresAt: inDays(30) }, later),
    ).toThrow(MarketplaceOfferExpiredException);
  });

  it('desfecho persistido continua valendo depois do vencimento', () => {
    const offer = buyerOffer();
    offer.accept(SELLER);
    const later = new Date(offer.expiresAt.getTime() + 1000);
    expect(offer.effectiveStatus(later)).toBe(OFFER_STATUS.ACCEPTED);
  });
});
