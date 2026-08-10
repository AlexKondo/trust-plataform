'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell, useIdentity } from '../../../components/app-shell';
import {
  Card,
  ErrorState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  TrustLevelBadge,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Icon, PrimaryButton } from '../../../components/ui';
import { ApiError, api, authApi } from '../../../lib/api';
import {
  LISTING_STATUS_LABEL,
  LISTING_TYPE_LABEL,
  formatCurrency,
  formatDate,
} from '../../../lib/labels';
import type { Listing } from '../../../lib/types';

function ListingDetailContent() {
  const params = useParams<{ listingId: string }>();
  const router = useRouter();
  const identity = useIdentity();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    void authApi<Listing>(`/marketplace/listings/${params.listingId}`)
      .then(setListing)
      .catch((err: unknown) => {
        // Visitante ou anúncio indisponível: tenta a visão pública
        void api<Listing>(`/marketplace/listings/${params.listingId}`)
          .then(setListing)
          .catch(() =>
            setError(
              err instanceof ApiError && err.status === 404
                ? 'Este anúncio não está disponível.'
                : 'Não foi possível carregar o anúncio.',
            ),
          );
      });
  }, [params.listingId]);

  const handleContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setContactError(null);
    try {
      const result = await authApi<{ conversation: { conversationId: string } }>(
        `/marketplace/listings/${params.listingId}/contact`,
        { method: 'POST', body: { message } },
      );
      router.push(`/conversations/${result.conversation.conversationId}`);
    } catch (err) {
      setContactError(
        err instanceof ApiError ? err.message : 'Não foi possível enviar sua mensagem.',
      );
      setSending(false);
    }
  };

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!listing) {
    return <Loading label="Carregando anúncio..." />;
  }

  const isOwner = identity?.identityId === listing.ownerId;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title={listing.title}
        back={{ href: '/marketplace', label: 'Voltar para a busca' }}
        action={
          isOwner ? (
            <Pill tone={toneForStatus(listing.status)}>
              {LISTING_STATUS_LABEL[listing.status] ?? listing.status}
            </Pill>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {listing.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {listing.images.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-48 w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {listing.categoryName ? <Pill tone="info">{listing.categoryName}</Pill> : null}
              {listing.listingType ? (
                <Pill>{LISTING_TYPE_LABEL[listing.listingType] ?? listing.listingType}</Pill>
              ) : null}
              {listing.location ? (
                <span className="body-sm flex items-center gap-1 text-on-surface-variant">
                  <Icon name="location_on" size={16} />
                  {listing.location}
                </span>
              ) : null}
            </div>
            <p className="headline-lg mt-4 text-primary">
              {formatCurrency(listing.price, listing.currency)}
            </p>
            <p className="body-lg mt-6 whitespace-pre-line text-on-surface">
              {listing.description ?? 'Sem descrição.'}
            </p>
            <p className="body-sm mt-6 flex items-center gap-1 text-on-surface-variant">
              <Icon name="visibility" size={16} />
              {listing.viewCount} {listing.viewCount === 1 ? 'visualização' : 'visualizações'}
              {listing.publishedAt ? ` · publicado em ${formatDate(listing.publishedAt)}` : ''}
            </p>
          </Card>

          {isOwner && listing.publishing ? (
            <Card>
              <SectionTitle icon="checklist" title="Status de publicação" />
              {listing.publishing.missingFields.length === 0 ? (
                <Banner kind="success">Este anúncio está completo e pronto para publicar.</Banner>
              ) : (
                <Banner kind="warning">
                  Faltam informações: {listing.publishing.missingFields.join(', ')}
                </Banner>
              )}
              {listing.publishing.requiredTrustLevel ? (
                <p className="body-sm mt-3 text-on-surface-variant">
                  Esta categoria exige nível <strong>{listing.publishing.requiredTrustLevel}</strong>{' '}
                  de confiança para publicar.
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {/* O cartão de confiança do anunciante — o coração do produto */}
          {listing.seller ? (
            <Card>
              <SectionTitle icon="person" title="Quem oferece" />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <span className="label-bold">
                    {listing.seller.displayName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="body-lg font-semibold text-on-surface">
                    {listing.seller.displayName}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    Na plataforma desde {formatDate(listing.seller.memberSince)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <TrustLevelBadge
                  level={listing.seller.trustLevel}
                  score={listing.seller.trustScore}
                />
              </div>

              {listing.seller.verifications ? (
                <ul className="mt-4 flex flex-col gap-2">
                  {[
                    { key: 'documentVerified', label: 'Documento verificado' },
                    { key: 'addressVerified', label: 'Endereço verificado' },
                    { key: 'phoneVerified', label: 'Telefone verificado' },
                    { key: 'emailVerified', label: 'E-mail verificado' },
                  ].map((row) => {
                    const ok = (listing.seller!.verifications as Record<string, boolean>)[row.key];
                    return (
                      <li key={row.key} className="flex items-center gap-2">
                        <Icon
                          name={ok ? 'check_circle' : 'radio_button_unchecked'}
                          filled={ok}
                          size={16}
                          className={ok ? 'text-teal' : 'text-outline-variant'}
                        />
                        <span
                          className={`body-sm ${ok ? 'text-on-surface' : 'text-on-surface-variant'}`}
                        >
                          {row.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {listing.seller.badges && listing.seller.badges.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {listing.seller.badges.map((badge) => (
                    <Pill key={badge.code} tone="success" icon="workspace_premium">
                      {badge.name}
                    </Pill>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {!isOwner && listing.status === 'PUBLISHED' ? (
            <Card>
              <SectionTitle icon="forum" title="Entrar em contato" />
              <form className="flex flex-col gap-4" onSubmit={(event) => void handleContact(event)}>
                {contactError ? <Banner kind="error">{contactError}</Banner> : null}
                <textarea
                  className="tds-input min-h-28 resize-y"
                  placeholder="Olá! Gostaria de saber se você atende no sábado..."
                  value={message}
                  required
                  maxLength={2000}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <PrimaryButton loading={sending} loadingLabel="Enviando..." disabled={!message.trim()}>
                  Enviar mensagem
                </PrimaryButton>
              </form>
            </Card>
          ) : null}

          {isOwner ? (
            <Card>
              <SectionTitle icon="edit" title="Este anúncio é seu" />
              <a
                href="/marketplace/mine"
                className="btn-text flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant py-3 text-on-surface transition-colors hover:bg-surface-container-low"
              >
                Gerenciar meus anúncios
              </a>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ListingDetailPage() {
  return (
    <AppShell>
      <ListingDetailContent />
    </AppShell>
  );
}
