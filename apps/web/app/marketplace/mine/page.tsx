'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  Card,
  EmptyState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Field, Icon, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, api, authApi, authApiPaged } from '../../../lib/api';
import { LISTING_STATUS_LABEL, formatCurrency } from '../../../lib/labels';
import type { Listing, MarketplaceCategory, OwnerListingSummary } from '../../../lib/types';

const FIELD_LABEL: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  listingType: 'tipo (serviço ou produto)',
  categoryId: 'categoria',
  price: 'preço',
  currency: 'moeda',
};

interface FormState {
  listingId: string | null;
  title: string;
  description: string;
  listingType: string;
  category: string;
  price: string;
  location: string;
  images: string;
}

const EMPTY_FORM: FormState = {
  listingId: null,
  title: '',
  description: '',
  listingType: 'SERVICE',
  category: '',
  price: '',
  location: '',
  images: '',
};

function MyListingsContent() {
  const [listings, setListings] = useState<OwnerListingSummary[] | null>(null);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = async () => {
    const page = await authApiPaged<OwnerListingSummary>('/marketplace/listings/mine').catch(() => ({
      items: [],
      pagination: { page: 1, pageSize: 0, totalItems: 0, totalPages: 0 },
    }));
    setListings(page.items);
  };

  useEffect(() => {
    void reload();
    void api<MarketplaceCategory[]>('/marketplace/listings/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const openEditor = async (listingId?: string) => {
    setMessage(null);
    if (!listingId) {
      setForm(EMPTY_FORM);
      return;
    }
    const listing = await authApi<Listing>(`/marketplace/listings/${listingId}`);
    setForm({
      listingId: listing.listingId,
      title: listing.title,
      description: listing.description ?? '',
      listingType: listing.listingType ?? 'SERVICE',
      category: listing.category ?? '',
      price: listing.price === null ? '' : String(listing.price),
      location: listing.location ?? '',
      images: listing.images.join('\n'),
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);

    const images = form.images
      .split(/\s*\n\s*/)
      .map((url) => url.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = { title: form.title.trim() };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.listingType) body.listingType = form.listingType;
    if (form.category) body.category = form.category;
    if (form.price) body.price = Number(form.price);
    if (form.location.trim()) body.location = form.location.trim();
    if (images.length > 0 || form.listingId) body.images = images;

    try {
      if (form.listingId) {
        await authApi(`/marketplace/listings/${form.listingId}`, { method: 'PUT', body });
      } else {
        await authApi('/marketplace/listings', { method: 'POST', body });
      }
      await reload();
      setForm(null);
      setMessage({ kind: 'success', text: 'Anúncio salvo.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível salvar o anúncio.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (listingId: string) => {
    setBusyId(listingId);
    setMessage(null);
    try {
      await authApi(`/marketplace/listings/${listingId}/publish`, { method: 'POST' });
      await reload();
      setMessage({ kind: 'success', text: 'Anúncio publicado! Ele já aparece na busca.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível publicar este anúncio agora.',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!listings) {
    return <Loading label="Carregando seus anúncios..." />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Meus anúncios"
        subtitle="Crie, complete e publique o que você oferece."
        back={{ href: '/marketplace', label: 'Voltar para o marketplace' }}
        action={
          form === null ? (
            <button
              type="button"
              onClick={() => void openEditor()}
              className="btn-text flex items-center gap-2 rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary"
            >
              <Icon name="add" size={18} />
              Novo anúncio
            </button>
          ) : null
        }
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      {form ? (
        <Card>
          <SectionTitle
            icon={form.listingId ? 'edit' : 'add_box'}
            title={form.listingId ? 'Editar anúncio' : 'Novo anúncio'}
            hint="Só o título é obrigatório para salvar como rascunho. O resto é exigido na publicação."
          />
          <form className="flex flex-col gap-5" onSubmit={(event) => void handleSave(event)}>
            <Field id="title" label="Título">
              <input
                id="title"
                className="tds-input"
                value={form.title}
                required
                minLength={5}
                maxLength={255}
                placeholder="Ex.: Instalação elétrica residencial"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>

            <Field id="description" label="Descrição">
              <textarea
                id="description"
                className="tds-input min-h-28 resize-y"
                value={form.description}
                maxLength={5000}
                placeholder="Explique o que está incluso, prazos e garantias (mínimo 20 caracteres)."
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Field id="listingType" label="Tipo">
                <select
                  id="listingType"
                  className="tds-input"
                  value={form.listingType}
                  onChange={(event) => setForm({ ...form, listingType: event.target.value })}
                >
                  <option value="SERVICE">Serviço</option>
                  <option value="PRODUCT">Produto</option>
                </select>
              </Field>

              <Field id="category" label="Categoria">
                <select
                  id="category"
                  className="tds-input"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {categories.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                      {item.minimumTrustLevel ? ` (exige ${item.minimumTrustLevel})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="price" label="Preço (R$)">
                <input
                  id="price"
                  className="tds-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  placeholder="180.00"
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                />
              </Field>
            </div>

            <Field id="location" label="Localização">
              <input
                id="location"
                className="tds-input"
                value={form.location}
                placeholder="São Paulo/SP"
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              />
            </Field>

            <Field id="images" label="Imagens (uma URL por linha)">
              <textarea
                id="images"
                className="tds-input min-h-20 resize-y font-mono text-sm"
                value={form.images}
                placeholder="https://..."
                onChange={(event) => setForm({ ...form, images: event.target.value })}
              />
            </Field>

            <div className="flex flex-col gap-3 md:flex-row">
              <div className="md:w-48">
                <PrimaryButton loading={saving} loadingLabel="Salvando...">
                  Salvar
                </PrimaryButton>
              </div>
              <div className="md:w-48">
                <SecondaryButton onClick={() => setForm(null)}>Cancelar</SecondaryButton>
              </div>
            </div>
          </form>
        </Card>
      ) : null}

      {listings.length === 0 && !form ? (
        <Card>
          <EmptyState
            icon="storefront"
            title="Você ainda não tem anúncios"
            description="Crie o primeiro e comece a receber contatos de clientes."
            action={
              <button
                type="button"
                onClick={() => void openEditor()}
                className="btn-text rounded-xl bg-primary-container px-5 py-3 text-on-primary"
              >
                Criar anúncio
              </button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {listings.map((listing) => (
            <Card key={listing.listingId} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Pill tone={toneForStatus(listing.status)}>
                      {LISTING_STATUS_LABEL[listing.status] ?? listing.status}
                    </Pill>
                    {listing.categoryName ? (
                      <span className="body-sm text-on-surface-variant">{listing.categoryName}</span>
                    ) : null}
                  </div>
                  <Link
                    href={`/marketplace/${listing.listingId}`}
                    className="body-lg font-semibold text-on-surface hover:text-primary"
                  >
                    {listing.title}
                  </Link>
                  <p className="body-sm text-on-surface-variant">
                    {formatCurrency(listing.price, listing.currency)}
                    {listing.location ? ` · ${listing.location}` : ''}
                    {listing.status === 'PUBLISHED'
                      ? ` · ${listing.viewCount} ${listing.viewCount === 1 ? 'visualização' : 'visualizações'}`
                      : ''}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void openEditor(listing.listingId)}
                    className="btn-text rounded-lg border border-outline-variant px-4 py-2 text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    Editar
                  </button>
                  {listing.status === 'DRAFT' ? (
                    <button
                      type="button"
                      disabled={busyId === listing.listingId || listing.missingFields.length > 0}
                      onClick={() => void handlePublish(listing.listingId)}
                      className="btn-text rounded-lg bg-primary-container px-4 py-2 text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
                      title={
                        listing.missingFields.length > 0
                          ? 'Complete o anúncio antes de publicar'
                          : undefined
                      }
                    >
                      {busyId === listing.listingId ? 'Publicando...' : 'Publicar'}
                    </button>
                  ) : null}
                </div>
              </div>

              {listing.status === 'DRAFT' && listing.missingFields.length > 0 ? (
                <Banner kind="warning">
                  Para publicar, preencha:{' '}
                  {listing.missingFields.map((field) => FIELD_LABEL[field] ?? field).join(', ')}.
                </Banner>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyListingsPage() {
  return (
    <AppShell>
      <MyListingsContent />
    </AppShell>
  );
}
