'use client';

import Link from 'next/link';
import { LISTING_TYPE_LABEL, formatCurrency } from '../lib/labels';
import type { ListingSummary } from '../lib/types';
import { Pill, TrustLevelBadge } from './layout';
import { Icon } from './ui';

/** Cartão de anúncio da busca — mostra preço e reputação lado a lado. */
export function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link
      href={`/marketplace/${listing.listingId}`}
      className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-ambient transition-shadow hover:shadow-lg"
    >
      <div className="flex h-36 items-center justify-center bg-surface-container">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Icon name="handyman" className="text-outline-variant" size={40} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          {listing.categoryName ? <Pill tone="info">{listing.categoryName}</Pill> : null}
          {listing.listingType ? (
            <span className="body-sm text-on-surface-variant">
              {LISTING_TYPE_LABEL[listing.listingType] ?? listing.listingType}
            </span>
          ) : null}
        </div>
        <h3 className="body-lg font-semibold text-on-surface">{listing.title}</h3>
        {listing.excerpt ? (
          <p className="body-sm line-clamp-2 text-on-surface-variant">{listing.excerpt}</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="headline-md text-lg text-primary">
              {formatCurrency(listing.price, listing.currency)}
            </p>
            {listing.location ? (
              <p className="body-sm flex items-center gap-1 text-on-surface-variant">
                <Icon name="location_on" size={14} />
                {listing.location}
              </p>
            ) : null}
          </div>
          <TrustLevelBadge
            level={listing.seller.trustLevel}
            score={listing.seller.trustScore}
            size="sm"
          />
        </div>
      </div>
    </Link>
  );
}
