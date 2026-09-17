'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Pill, toneForStatus } from '../../components/layout';
import { PrimaryButton } from '../../components/ui';
import { ApiError, authApiPaged } from '../../lib/api';
import { SERVICE_REQUEST_STATUS_LABEL, URGENCY_LABEL, formatDate } from '../../lib/labels';
import type { ServiceRequestSummary } from '../../lib/types';

/** IP-003 — lista dos pedidos de serviço do próprio Trust Member (`GET .../mine`). */
function ServiceRequestsContent() {
  const [items, setItems] = useState<ServiceRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApiPaged<ServiceRequestSummary>('/marketplace/service-requests/mine')
      .then((result) => setItems(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus pedidos.'));
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Meus pedidos de serviço"
        subtitle="Necessidades que você descreveu para os Trust Partners."
        action={
          <Link href="/service-requests/new">
            <PrimaryButton type="button">Descrever uma necessidade</PrimaryButton>
          </Link>
        }
      />

      {error ? <ErrorState message={error} /> : null}
      {!error && items === null ? <Loading label="Carregando seus pedidos..." /> : null}

      {items && items.length === 0 ? (
        <EmptyState
          icon="assignment_add"
          title="Nenhum pedido de serviço ainda"
          description="Descreva o que você precisa para começar a receber propostas de Trust Partners."
          action={
            <Link href="/service-requests/new">
              <PrimaryButton type="button">Descrever uma necessidade</PrimaryButton>
            </Link>
          }
        />
      ) : null}

      {items && items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Link key={item.serviceRequestId} href={`/service-requests/${item.serviceRequestId}`}>
              <Card className="transition-colors hover:border-primary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="body-lg font-medium text-on-surface">{item.title}</p>
                    <p className="body-sm text-on-surface-variant">
                      {item.locationLabel} · {URGENCY_LABEL[item.urgency] ?? item.urgency} ·{' '}
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <Pill tone={toneForStatus(item.status)}>
                    {SERVICE_REQUEST_STATUS_LABEL[item.status] ?? item.status}
                  </Pill>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ServiceRequestsPage() {
  return (
    <AppShell>
      <ServiceRequestsContent />
    </AppShell>
  );
}
