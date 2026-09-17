'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader, Pill, toneForStatus } from '../../../components/layout';
import { Banner, Field, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { formatDateTime } from '../../../lib/labels';

interface RiskFlag {
  id: string;
  entityType: string;
  entityId: string;
  subjectIdentityId: string | null;
  signal: string;
  reason: string;
  severity: string;
  status: string;
  raisedAt: string;
}

/** IP-018 — VERIFY_ONLY não se aplica aqui: a fila (IP-014) existia, a tela não. */
function AdminRiskFlagsContent() {
  const [items, setItems] = useState<RiskFlag[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    const result = await authApi<RiskFlag[]>('/admin/risk-flags?status=OPEN').catch(() => []);
    setItems(result);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const review = async (id: string, decision: 'CONFIRMED' | 'DISMISSED') => {
    setBusy(id);
    setMessage(null);
    try {
      await authApi(`/admin/risk-flags/${id}/review`, {
        method: 'POST',
        body: { decision, note: note.trim() || undefined },
      });
      setReviewing(null);
      setNote('');
      await reload();
      setMessage({ kind: 'success', text: 'Sinal revisado.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível revisar este sinal.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!items) {
    return <Loading label="Carregando sinais de risco..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Sinais de risco"
        subtitle="Sinais determinísticos abertos por regras de abuso/fraude (IP-014). Nenhuma ação aqui bloqueia nada sozinha — a decisão de suspender/cancelar continua no domínio dono da entidade sinalizada."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="shield"
            title="Nenhum sinal aberto"
            description="Quando uma regra determinística detectar um padrão suspeito, o sinal aparece aqui."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((flag) => (
            <Card key={flag.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="body-lg font-semibold text-on-surface">{flag.signal}</p>
                  <p className="body-sm text-on-surface-variant">
                    {flag.entityType} · {flag.entityId}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    Levantado em {formatDateTime(flag.raisedAt)}
                  </p>
                </div>
                <Pill tone={flag.severity === 'HIGH' ? 'error' : toneForStatus(flag.severity)}>
                  {flag.severity}
                </Pill>
              </div>

              <div className="rounded-lg bg-surface-container-low p-4">
                <p className="label-bold mb-2 uppercase text-on-surface-variant">Motivo</p>
                <p className="body-sm whitespace-pre-line text-on-surface">{flag.reason}</p>
              </div>

              {reviewing === flag.id ? (
                <div className="flex flex-col gap-4 rounded-lg border border-outline-variant p-4">
                  <Field id={`note-${flag.id}`} label="Nota (opcional)">
                    <textarea
                      id={`note-${flag.id}`}
                      className="tds-input min-h-20 resize-y"
                      value={note}
                      maxLength={2000}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy === flag.id}
                      onClick={() => void review(flag.id, 'CONFIRMED')}
                      className="btn-text rounded-xl bg-error-container px-5 py-3 text-on-error-container transition-colors disabled:opacity-60"
                    >
                      Confirmar risco
                    </button>
                    <button
                      type="button"
                      disabled={busy === flag.id}
                      onClick={() => void review(flag.id, 'DISMISSED')}
                      className="btn-text rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors disabled:opacity-60"
                    >
                      Descartar
                    </button>
                    <SecondaryButton onClick={() => setReviewing(null)}>Cancelar</SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="w-full md:w-56">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewing(flag.id);
                      setNote('');
                    }}
                    className="btn-text w-full rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary"
                  >
                    Revisar
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

export default function AdminRiskFlagsPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminRiskFlagsContent />
      </AdminOnly>
    </AppShell>
  );
}
