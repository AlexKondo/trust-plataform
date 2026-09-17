'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  TrustLevelBadge,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Icon, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi, authApiPaged } from '../../../lib/api';
import {
  SERVICE_REQUEST_STATUS_LABEL,
  URGENCY_LABEL,
  formatCurrency,
  formatDate,
} from '../../../lib/labels';
import type {
  ServiceRequest,
  ServiceRequestEngagement,
  ServiceRequestMatch,
  ServiceRequestOfferComparison,
} from '../../../lib/types';

/**
 * IP-003/IP-004 — detalhe do pedido de serviço: descoberta de Partners
 * elegíveis (`.../matches`) e comparação lado a lado das propostas vivas de
 * cada negociação já engajada (`.../offers`). Só valores voltados ao Trust
 * Member — nenhum campo de economia interna do Partner existe nesse shape.
 */
function ServiceRequestDetailContent() {
  const params = useParams<{ serviceRequestId: string }>();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [matches, setMatches] = useState<ServiceRequestMatch[] | null>(null);
  const [comparison, setComparison] = useState<ServiceRequestOfferComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [details, matchList, offerComparison] = await Promise.all([
        authApi<ServiceRequest>(`/marketplace/service-requests/${params.serviceRequestId}`),
        authApiPaged<ServiceRequestMatch>(`/marketplace/service-requests/${params.serviceRequestId}/matches`)
          .then((res) => res.items)
          .catch(() => [] as ServiceRequestMatch[]),
        authApi<ServiceRequestOfferComparison>(
          `/marketplace/service-requests/${params.serviceRequestId}/offers`,
        ).catch(() => null),
      ]);
      setRequest(details);
      setMatches(matchList);
      setComparison(offerComparison);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o pedido.');
    }
  }, [params.serviceRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const engage = async (listingId: string) => {
    setBusyListingId(listingId);
    setFeedback(null);
    try {
      const result = await authApi<ServiceRequestEngagement>(
        `/marketplace/service-requests/${params.serviceRequestId}/engage`,
        { method: 'POST', body: { listingId, message: 'Olá! Tenho interesse na sua proposta para o meu pedido.' } },
      );
      setFeedback({ kind: 'success', text: 'Partner contatado. Acompanhe a conversa para negociar.' });
      await load();
      window.location.href = `/conversations/${result.conversationId}`;
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Não foi possível engajar este Partner agora.',
      });
    } finally {
      setBusyListingId(null);
    }
  };

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!request) {
    return <Loading label="Carregando pedido de serviço..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={request.title}
        subtitle={request.locationLabel}
        back={{ href: '/service-requests', label: 'Meus pedidos de serviço' }}
        action={
          <Pill tone={toneForStatus(request.status)}>
            {SERVICE_REQUEST_STATUS_LABEL[request.status] ?? request.status}
          </Pill>
        }
      />

      {feedback ? (
        <Banner kind={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.text}</Banner>
      ) : null}

      <Card>
        <SectionTitle icon="description" title="Detalhes" />
        <p className="body-md whitespace-pre-wrap text-on-surface">{request.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <dt className="body-sm text-on-surface-variant">Urgência</dt>
            <dd className="body-md text-on-surface">{URGENCY_LABEL[request.urgency] ?? request.urgency}</dd>
          </div>
          {request.budgetMinAmount !== null || request.budgetMaxAmount !== null ? (
            <div>
              <dt className="body-sm text-on-surface-variant">Orçamento</dt>
              <dd className="body-md text-on-surface">
                {request.budgetMinAmount !== null ? formatCurrency(request.budgetMinAmount) : '—'} até{' '}
                {request.budgetMaxAmount !== null ? formatCurrency(request.budgetMaxAmount) : '—'}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {/* Comparação de propostas — IP-004 */}
      <Card>
        <SectionTitle
          icon="compare_arrows"
          title="Propostas recebidas"
          hint="Comparação lado a lado das negociações já iniciadas com cada Trust Partner."
        />
        {comparison && comparison.items.length > 0 ? (
          <div className="flex flex-col gap-4">
            {comparison.items.map((item) => (
              <div key={item.engagementId} className="rounded-lg border border-outline-variant p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="body-lg font-medium text-on-surface">
                      {item.listingTitle ?? 'Anúncio'}
                    </span>
                    <TrustLevelBadge level={item.partner.trustLevel} score={item.partner.trustScore} size="sm" />
                  </div>
                  <Link
                    href={`/conversations/${item.conversationId}`}
                    className="body-sm flex items-center gap-1 text-primary hover:underline"
                  >
                    Ver conversa
                    <Icon name="arrow_forward" size={16} />
                  </Link>
                </div>
                {item.offer ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <dt className="body-sm text-on-surface-variant">Modelo</dt>
                      <dd className="body-sm text-on-surface">
                        {item.offer.pricingModel === 'HOURLY' ? 'Por hora' : 'Preço fechado'}
                      </dd>
                    </div>
                    <div>
                      <dt className="body-sm text-on-surface-variant">
                        {item.offer.estimatedTotalBasis === 'HOURLY_MINIMUM_COMMITMENT'
                          ? 'Mínimo contratado'
                          : 'Valor total'}
                      </dt>
                      <dd className="body-md font-semibold text-on-surface">
                        {formatCurrency(item.offer.amount, item.offer.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="body-sm text-on-surface-variant">Status</dt>
                      <dd>
                        <Pill tone={toneForStatus(item.offer.status)}>{item.offer.status}</Pill>
                      </dd>
                    </div>
                    <div>
                      <dt className="body-sm text-on-surface-variant">Rodadas de negociação</dt>
                      <dd className="body-sm text-on-surface">{item.offer.roundCount}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="body-sm mt-3 text-on-surface-variant">
                    Nenhuma proposta enviada nesta conversa ainda.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="body-sm text-on-surface-variant">
            Você ainda não engajou nenhum Trust Partner. Escolha um candidato abaixo para começar.
          </p>
        )}
      </Card>

      {/* Descoberta de Partners elegíveis — IP-003 */}
      <Card>
        <SectionTitle
          icon="search"
          title="Trust Partners elegíveis"
          hint="Anúncios publicados que combinam com sua categoria, localização e nível mínimo de confiança."
        />
        {matches === null ? (
          <Loading label="Buscando Partners..." />
        ) : matches.length === 0 ? (
          <EmptyState
            icon="person_search"
            title="Nenhum Partner elegível encontrado ainda"
            description="Tente aumentar o raio de busca ou aguarde novos anúncios nessa categoria."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {matches.map((match) => (
              <div
                key={match.listingId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="body-lg font-medium text-on-surface">{match.title}</p>
                    <TrustLevelBadge level={match.partner.trustLevel} score={match.partner.trustScore} size="sm" />
                  </div>
                  <p className="body-sm text-on-surface-variant">
                    {match.location ?? 'Localização não informada'}
                    {match.price !== null ? ` · a partir de ${formatCurrency(match.price, match.currency)}` : ''}
                  </p>
                </div>
                {match.alreadyEngaged ? (
                  <Pill tone="info">Já contatado</Pill>
                ) : (
                  <SecondaryButton
                    onClick={() => void engage(match.listingId)}
                    disabled={busyListingId === match.listingId}
                  >
                    {busyListingId === match.listingId ? 'Enviando...' : 'Contatar Partner'}
                  </SecondaryButton>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="body-sm text-on-surface-variant">Criado em {formatDate(request.createdAt)}</p>
    </div>
  );
}

export default function ServiceRequestDetailPage() {
  return (
    <AppShell>
      <ServiceRequestDetailContent />
    </AppShell>
  );
}
