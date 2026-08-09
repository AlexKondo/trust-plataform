import { describe, expect, it } from 'vitest';
import {
  MarketplaceListingAlreadyPublishedException,
  MarketplaceListingIncompleteException,
  MarketplaceListingNotEditableException,
} from '../exceptions/marketplace.exceptions';
import { MarketplaceListing } from './marketplace-listing';
import { LISTING_STATUS, LISTING_TYPE } from './marketplace-types';

const OWNER = '019fe41e-0000-7000-8000-000000000001';

function completeDraft(): MarketplaceListing {
  return MarketplaceListing.createDraft({
    ownerId: OWNER,
    title: 'Instalação elétrica residencial',
    description: 'Instalo tomadas, disjuntores e chuveiros com garantia de 90 dias.',
    listingType: LISTING_TYPE.SERVICE,
    categoryId: '019fe41e-0000-7000-8000-0000000000c1',
    price: 150,
    currency: 'BRL',
  });
}

describe('MarketplaceListing (MRK-001..005)', () => {
  it('nasce em DRAFT e pertence ao criador (BR-003/BR-005)', () => {
    const listing = completeDraft();
    expect(listing.status).toBe(LISTING_STATUS.DRAFT);
    expect(listing.isOwnedBy(OWNER)).toBe(true);
    expect(listing.publishedAt).toBeNull();
    expect(listing.viewCount).toBe(0);
  });

  it('aceita rascunho incompleto e aponta o que falta para publicar (BR-004)', () => {
    const listing = MarketplaceListing.createDraft({ ownerId: OWNER, title: 'Eletricista' });
    expect(listing.missingRequiredFields()).toEqual([
      'description',
      'listingType',
      'categoryId',
      'price',
    ]);
    expect(() => listing.publish()).toThrow(MarketplaceListingIncompleteException);
  });

  it('preço zerado ou negativo conta como campo faltante', () => {
    const listing = completeDraft();
    listing.update({ price: 0 });
    expect(listing.missingRequiredFields()).toEqual(['price']);
  });

  it('update retorna os campos alterados e renova updatedAt (BR-005)', () => {
    const listing = completeDraft();
    const before = listing.updatedAt;
    const later = new Date(before.getTime() + 1000);

    const changed = listing.update({ title: 'Eletricista 24 horas', price: 180 }, later);

    expect(changed).toEqual(['title', 'price']);
    expect(listing.title).toBe('Eletricista 24 horas');
    expect(listing.updatedAt).toEqual(later);
  });

  it('update sem mudança real não altera updatedAt', () => {
    const listing = completeDraft();
    const before = listing.updatedAt;
    const changed = listing.update({ title: listing.title }, new Date(before.getTime() + 5000));
    expect(changed).toEqual([]);
    expect(listing.updatedAt).toEqual(before);
  });

  it('update não altera o status (BR-003 do MRK-002)', () => {
    const listing = completeDraft();
    listing.publish();
    listing.update({ price: 200 });
    expect(listing.status).toBe(LISTING_STATUS.PUBLISHED);
  });

  it('anúncio removido não pode mais ser editado', () => {
    const listing = MarketplaceListing.restore({
      ...completeDraft().toProps(),
      status: LISTING_STATUS.REMOVED,
    });
    expect(() => listing.update({ price: 10 })).toThrow(MarketplaceListingNotEditableException);
  });

  it('publica anúncio completo, muda status e registra publishedAt (BR-006/007)', () => {
    const listing = completeDraft();
    const now = new Date();
    listing.publish(now);
    expect(listing.status).toBe(LISTING_STATUS.PUBLISHED);
    expect(listing.publishedAt).toEqual(now);
    expect(listing.isPubliclyVisible()).toBe(true);
  });

  it('publicar duas vezes é conflito de estado (BR-002)', () => {
    const listing = completeDraft();
    listing.publish();
    expect(() => listing.publish()).toThrow(MarketplaceListingAlreadyPublishedException);
  });

  it('rascunho não é visível publicamente (MRK-004 BR-001 / MRK-005 BR-002)', () => {
    expect(completeDraft().isPubliclyVisible()).toBe(false);
  });

  it('registerView incrementa o contador (MRK-005 BR-004)', () => {
    const listing = completeDraft();
    const now = new Date();
    listing.registerView(now);
    listing.registerView(now);
    expect(listing.viewCount).toBe(2);
    expect(listing.lastViewedAt).toEqual(now);
  });
});
