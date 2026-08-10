'use client';

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
import { Banner, Field, Icon, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { ApiError, authApi, authApiPaged } from '../../../lib/api';
import {
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_TYPE_LABEL,
  formatDateTime,
} from '../../../lib/labels';

interface QueueItem {
  verificationId: string;
  identityId: string;
  identityName: string;
  identityEmail: string;
  type: string;
  status: string;
  currentAttempt: number;
  createdAt: string;
  evidences: Array<{ id: string; type: string; fileName: string; fileSize: number }>;
}

const REJECTION_REASONS = [
  { value: 'DOCUMENT_UNREADABLE', label: 'Documento ilegível' },
  { value: 'DOCUMENT_EXPIRED', label: 'Documento vencido' },
  { value: 'DOCUMENT_INCOMPLETE', label: 'Documento incompleto' },
  { value: 'FACE_MISMATCH', label: 'Rosto não confere' },
  { value: 'ADDRESS_INVALID', label: 'Endereço inválido' },
  { value: 'INSUFFICIENT_EVIDENCE', label: 'Evidências insuficientes' },
  { value: 'FRAUD_SUSPECTED', label: 'Suspeita de fraude' },
  { value: 'OTHER', label: 'Outro' },
];

const EVIDENCE_LABEL: Record<string, string> = {
  DOCUMENT_FRONT: 'Frente do documento',
  DOCUMENT_BACK: 'Verso do documento',
  PROOF_OF_ADDRESS: 'Comprovante de endereço',
  BANK_STATEMENT: 'Comprovante bancário',
  BUSINESS_REGISTRATION: 'Registro da empresa',
  SELFIE: 'Selfie com documento',
};

function AdminVerificationsContent() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState('DOCUMENT_UNREADABLE');
  const [comments, setComments] = useState('');

  const reload = useCallback(async () => {
    const page = await authApiPaged<QueueItem>('/verifications/queue/pending').catch(() => ({
      items: [] as QueueItem[],
      pagination: { page: 1, pageSize: 0, totalItems: 0, totalPages: 0 },
    }));
    setItems(page.items);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startReview = async (verificationId: string) => {
    setBusy(verificationId);
    setMessage(null);
    try {
      await authApi(`/verifications/${verificationId}/review`, {
        method: 'POST',
        body: { reviewType: 'MANUAL' },
      });
      await reload();
      setMessage({ kind: 'success', text: 'Análise iniciada. Agora você pode decidir.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível iniciar a análise.',
      });
    } finally {
      setBusy(null);
    }
  };

  const approve = async (verificationId: string) => {
    setBusy(verificationId);
    setMessage(null);
    try {
      await authApi(`/verifications/${verificationId}/approve`, { method: 'POST', body: {} });
      await reload();
      setMessage({
        kind: 'success',
        text: 'Verificação aprovada. Os pontos já entraram no Trust Score do titular.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível aprovar.',
      });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (verificationId: string) => {
    setBusy(verificationId);
    setMessage(null);
    try {
      await authApi(`/verifications/${verificationId}/reject`, {
        method: 'POST',
        body: { reasonCode, comments: comments.trim() || undefined },
      });
      setRejecting(null);
      setComments('');
      await reload();
      setMessage({ kind: 'success', text: 'Verificação rejeitada. O titular foi notificado.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível rejeitar.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!items) {
    return <Loading label="Carregando a fila..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Fila de verificações"
        subtitle="Ordenada da mais antiga para a mais recente — quem esperou mais é atendido primeiro."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="task_alt"
            title="Fila vazia"
            description="Nenhuma verificação aguardando análise no momento."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <Card key={item.verificationId} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="body-lg font-semibold text-on-surface">
                    {VERIFICATION_TYPE_LABEL[item.type] ?? item.type}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    {item.identityName} · {item.identityEmail}
                  </p>
                  <p className="body-sm text-on-surface-variant">
                    Enviada em {formatDateTime(item.createdAt)}
                    {item.currentAttempt > 1 ? ` · ${item.currentAttempt}ª tentativa` : ''}
                  </p>
                </div>
                <Pill tone={toneForStatus(item.status)}>
                  {VERIFICATION_STATUS_LABEL[item.status] ?? item.status}
                </Pill>
              </div>

              <div className="rounded-lg bg-surface-container-low p-4">
                <p className="label-bold mb-2 uppercase text-on-surface-variant">
                  Documentos enviados
                </p>
                <ul className="flex flex-col gap-2">
                  {item.evidences.map((evidence) => (
                    <li key={evidence.id} className="flex items-center gap-2">
                      <Icon name="description" size={18} className="text-on-surface-variant" />
                      <span className="body-sm text-on-surface">
                        {EVIDENCE_LABEL[evidence.type] ?? evidence.type}
                      </span>
                      <span className="body-sm text-on-surface-variant">
                        · {evidence.fileName} ({Math.round(evidence.fileSize / 1024)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="body-sm mt-3 text-on-surface-variant">
                  Os arquivos ficam no armazenamento seguro e não são expostos pela API. A análise
                  visual acontece no console do Supabase Storage.
                </p>
              </div>

              {rejecting === item.verificationId ? (
                <div className="flex flex-col gap-4 rounded-lg border border-error-container p-4">
                  <Field id={`reason-${item.verificationId}`} label="Motivo da rejeição">
                    <select
                      id={`reason-${item.verificationId}`}
                      className="tds-input"
                      value={reasonCode}
                      onChange={(event) => setReasonCode(event.target.value)}
                    >
                      {REJECTION_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id={`comments-${item.verificationId}`} label="Observações para o titular">
                    <textarea
                      id={`comments-${item.verificationId}`}
                      className="tds-input min-h-20 resize-y"
                      value={comments}
                      maxLength={1000}
                      placeholder="Explique o que precisa ser corrigido na próxima tentativa."
                      onChange={(event) => setComments(event.target.value)}
                    />
                  </Field>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy === item.verificationId}
                      onClick={() => void reject(item.verificationId)}
                      className="btn-text rounded-xl bg-error px-5 py-3 text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      Confirmar rejeição
                    </button>
                    <SecondaryButton onClick={() => setRejecting(null)}>Cancelar</SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {item.status === 'PENDING_REVIEW' ? (
                    <div className="w-full md:w-56">
                      <PrimaryButton
                        type="button"
                        loading={busy === item.verificationId}
                        onClick={() => void startReview(item.verificationId)}
                      >
                        Iniciar análise
                      </PrimaryButton>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy === item.verificationId}
                        onClick={() => void approve(item.verificationId)}
                        className="btn-text flex items-center gap-2 rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary disabled:opacity-60"
                      >
                        <Icon name="check" size={18} />
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={busy === item.verificationId}
                        onClick={() => {
                          setRejecting(item.verificationId);
                          setComments('');
                        }}
                        className="btn-text flex items-center gap-2 rounded-xl border border-error px-5 py-3 text-error transition-colors hover:bg-error-container/40 disabled:opacity-60"
                      >
                        <Icon name="close" size={18} />
                        Rejeitar
                      </button>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminVerificationsPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminVerificationsContent />
      </AdminOnly>
    </AppShell>
  );
}
