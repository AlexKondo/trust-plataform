'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import {
  Card,
  EmptyState,
  Loading,
  PageHeader,
  Pill,
  toneForStatus,
} from '../../../components/layout';
import { Banner, Field, Icon, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi, authApiPaged } from '../../../lib/api';
import {
  DECISION_TYPE_LABEL,
  DISPUTE_CATEGORY_LABEL,
  DISPUTE_STATUS_LABEL,
  formatDateTime,
} from '../../../lib/labels';
import type { Dispute } from '../../../lib/types';

/** Só os desfechos com culpa penalizam o Trust Score — a tela avisa. */
const DECISION_HINT: Record<string, string> = {
  UPHELD: 'Penaliza a parte reclamada em 60 pontos.',
  PARTIALLY_UPHELD: 'Penaliza a parte reclamada em 30 pontos.',
  REJECTED: 'Não penaliza ninguém.',
  SETTLED: 'Não penaliza ninguém.',
  CANCELLED: 'Não penaliza ninguém.',
};

function AdminDisputesContent() {
  const [items, setItems] = useState<Dispute[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState('UPHELD');
  const [justification, setJustification] = useState('');

  const reload = useCallback(async () => {
    const page = await authApiPaged<Dispute>('/admin/marketplace/disputes').catch(() => ({
      items: [] as Dispute[],
      pagination: { page: 1, pageSize: 0, totalItems: 0, totalPages: 0 },
    }));
    setItems(page.items);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resolve = async (disputeId: string) => {
    setBusy(disputeId);
    setMessage(null);
    try {
      await authApi(`/marketplace/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: { decisionType, justification: justification.trim() },
      });
      setDeciding(null);
      setJustification('');
      await reload();
      setMessage({
        kind: 'success',
        text: 'Decisão registrada. Ela é definitiva e já refletiu no Trust Score quando aplicável.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível registrar a decisão.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!items) {
    return <Loading label="Carregando disputas..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Disputas abertas"
        subtitle="A decisão é definitiva e não admite revisão. Leia o relato antes de julgar."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="verified"
            title="Nenhuma disputa aberta"
            description="Quando um cliente ou prestador abrir uma disputa, ela aparece aqui."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((dispute) => (
            <Card key={dispute.disputeId} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="body-lg font-semibold text-on-surface">
                    {DISPUTE_CATEGORY_LABEL[dispute.category] ?? dispute.category}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    Aberta em {formatDateTime(dispute.openedAt)}
                  </p>
                  <Link
                    href={`/orders/${dispute.orderId}`}
                    className="body-sm flex items-center gap-1 text-primary hover:underline"
                  >
                    Ver o pedido
                    <Icon name="arrow_forward" size={14} />
                  </Link>
                </div>
                <Pill tone={toneForStatus(dispute.status)}>
                  {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
                </Pill>
              </div>

              <div className="rounded-lg bg-surface-container-low p-4">
                <p className="label-bold mb-2 uppercase text-on-surface-variant">Relato</p>
                <p className="body-sm whitespace-pre-line text-on-surface">{dispute.description}</p>
              </div>

              {deciding === dispute.disputeId ? (
                <div className="flex flex-col gap-4 rounded-lg border border-outline-variant p-4">
                  <Field id={`decision-${dispute.disputeId}`} label="Decisão">
                    <select
                      id={`decision-${dispute.disputeId}`}
                      className="tds-input"
                      value={decisionType}
                      onChange={(event) => setDecisionType(event.target.value)}
                    >
                      {Object.entries(DECISION_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Banner kind={decisionType === 'UPHELD' ? 'warning' : 'info'}>
                    {DECISION_HINT[decisionType]}
                  </Banner>
                  <Field
                    id={`justification-${dispute.disputeId}`}
                    label="Fundamentação (mínimo 10 caracteres)"
                  >
                    <textarea
                      id={`justification-${dispute.disputeId}`}
                      className="tds-input min-h-24 resize-y"
                      value={justification}
                      maxLength={5000}
                      placeholder="Explique o que embasou a decisão. Este texto fica visível para as duas partes."
                      onChange={(event) => setJustification(event.target.value)}
                    />
                  </Field>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy === dispute.disputeId || justification.trim().length < 10}
                      onClick={() => void resolve(dispute.disputeId)}
                      className="btn-text rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary disabled:opacity-60"
                    >
                      Registrar decisão
                    </button>
                    <SecondaryButton onClick={() => setDeciding(null)}>Cancelar</SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="w-full md:w-56">
                  <button
                    type="button"
                    onClick={() => {
                      setDeciding(dispute.disputeId);
                      setJustification('');
                    }}
                    className="btn-text w-full rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary"
                  >
                    Julgar disputa
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDisputesPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminDisputesContent />
      </AdminOnly>
    </AppShell>
  );
}
