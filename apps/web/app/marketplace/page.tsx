'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader } from '../../components/layout';
import { ListingCard } from '../../components/listing-card';
import { Icon } from '../../components/ui';
import { api, query } from '../../lib/api';
import { LEVEL_LABEL } from '../../lib/labels';
import type { ListingSummary, MarketplaceCategory } from '../../lib/types';

const SORTS = [
  { value: 'relevance', label: 'Mais recentes' },
  { value: 'trust_score', label: 'Maior confiança' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
];

const TRUST_FILTERS = ['', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

function MarketplaceContent() {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [listings, setListings] = useState<ListingSummary[] | null>(null);
  const [total, setTotal] = useState(0);

  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('relevance');
  const [minimumTrustLevel, setMinimumTrustLevel] = useState('');

  useEffect(() => {
    void api<MarketplaceCategory[]>('/marketplace/listings/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const search = useCallback(async () => {
    setListings(null);
    const qs = query({ q: text.length >= 2 ? text : undefined, category, sort, minimumTrustLevel, size: 24 });
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/marketplace/listings${qs}`,
      );
      const payload = (await response.json()) as {
        success: boolean;
        data: ListingSummary[];
        pagination?: { totalItems: number };
      };
      setListings(payload.data ?? []);
      setTotal(payload.pagination?.totalItems ?? payload.data?.length ?? 0);
    } catch {
      setListings([]);
      setTotal(0);
    }
  }, [text, category, sort, minimumTrustLevel]);

  useEffect(() => {
    void search();
  }, [category, sort, minimumTrustLevel, search]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        title="Marketplace"
        subtitle="Encontre profissionais com reputação verificada perto de você."
        action={
          <Link
            href="/marketplace/mine"
            className="btn-text flex items-center gap-2 rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary"
          >
            <Icon name="add" size={18} />
            Meus anúncios
          </Link>
        }
      />

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                className="tds-input pl-12"
                placeholder="O que você precisa? Ex.: eletricista, diarista, montagem de móveis"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn-text rounded-xl bg-primary-container px-6 py-3 text-on-primary transition-colors hover:bg-primary"
            >
              Buscar
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              className="tds-input w-auto"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categories.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className="tds-input w-auto"
              value={minimumTrustLevel}
              onChange={(event) => setMinimumTrustLevel(event.target.value)}
            >
              {TRUST_FILTERS.map((value) => (
                <option key={value || 'any'} value={value}>
                  {value ? `${LEVEL_LABEL[value]} ou acima` : 'Qualquer nível de confiança'}
                </option>
              ))}
            </select>
            <select
              className="tds-input w-auto"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Card>

      {listings === null ? (
        <Loading label="Buscando anúncios..." />
      ) : listings.length === 0 ? (
        <Card>
          <EmptyState
            icon="search_off"
            title="Nenhum anúncio encontrado"
            description="Tente outra busca ou remova alguns filtros."
          />
        </Card>
      ) : (
        <>
          <p className="body-sm text-on-surface-variant">
            {total} {total === 1 ? 'anúncio encontrado' : 'anúncios encontrados'}
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.listingId} listing={listing} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketplacePage() {
  return (
    <AppShell>
      <MarketplaceContent />
    </AppShell>
  );
}
