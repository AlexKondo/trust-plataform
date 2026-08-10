'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import {
  Card,
  EmptyState,
  Loading,
  PageHeader,
  Pill,
  SectionTitle,
  toneForStatus,
} from '../../components/layout';
import { Banner, Icon } from '../../components/ui';
import { ApiError, authApi, tokenStore } from '../../lib/api';
import { VERIFICATION_STATUS_LABEL, VERIFICATION_TYPE_LABEL, formatDate } from '../../lib/labels';
import type { Verification } from '../../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Tipos oferecidos ao usuário, com o peso de cada um no Trust Score (seed TRS-009). */
const OFFERED = [
  { type: 'DOCUMENT', points: 150, icon: 'badge', evidences: ['DOCUMENT_FRONT', 'DOCUMENT_BACK'] },
  { type: 'BIOMETRIC', points: 150, icon: 'face', evidences: ['SELFIE'] },
  { type: 'ADDRESS', points: 100, icon: 'home_pin', evidences: ['PROOF_OF_ADDRESS'] },
  { type: 'BANK_ACCOUNT', points: 100, icon: 'account_balance', evidences: ['BANK_STATEMENT'] },
  { type: 'BUSINESS', points: 100, icon: 'store', evidences: ['BUSINESS_REGISTRATION'] },
] as const;

const OPEN_STATUSES = ['WAITING_FOR_EVIDENCE', 'PENDING_REVIEW', 'IN_REVIEW'];

function VerificationsContent() {
  const [items, setItems] = useState<Verification[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = async () => {
    const list = await authApi<Verification[]>('/verifications').catch(() => []);
    setItems(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  const startVerification = async (type: string) => {
    setBusy(type);
    setMessage(null);
    try {
      await authApi<{ verificationId: string }>('/verifications', { method: 'POST', body: { type } });
      await reload();
      setMessage({
        kind: 'success',
        text: 'Verificação iniciada. Envie os documentos solicitados abaixo.',
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível iniciar agora.',
      });
    } finally {
      setBusy(null);
    }
  };

  /** Upload multipart: o endpoint de evidências espera `type` + `file`. */
  const uploadEvidence = async (
    verificationId: string,
    evidenceType: string,
    file: File,
  ): Promise<void> => {
    setBusy(verificationId + evidenceType);
    setMessage(null);
    const form = new FormData();
    form.append('type', evidenceType);
    form.append('file', file);
    try {
      const response = await fetch(`${API_URL}/verifications/${verificationId}/evidence`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenStore.access ?? ''}` },
        body: form,
      });
      const payload = (await response.json()) as
        | { success: true }
        | { success: false; error: { message: string } };
      if (!payload.success) {
        throw new Error(payload.error.message);
      }
      await reload();
      setMessage({ kind: 'success', text: 'Documento enviado com sucesso.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Falha no envio do documento.',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!items) {
    return <Loading label="Carregando suas verificações..." />;
  }

  const openTypes = new Set(
    items.filter((item) => OPEN_STATUSES.includes(item.status)).map((item) => item.type),
  );
  const approvedTypes = new Set(
    items.filter((item) => item.status === 'APPROVED').map((item) => item.type),
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Verificações"
        subtitle="Comprove quem você é. Cada verificação aprovada soma pontos permanentes ao seu Trust Score."
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      <Card>
        <SectionTitle icon="add_task" title="Iniciar nova verificação" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {OFFERED.map((option) => {
            const done = approvedTypes.has(option.type);
            const open = openTypes.has(option.type);
            return (
              <div
                key={option.type}
                className="flex items-center gap-4 rounded-lg border border-outline-variant p-4"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    done ? 'bg-secondary-container text-teal' : 'bg-primary-fixed text-primary'
                  }`}
                >
                  <Icon name={done ? 'verified' : option.icon} filled={done} size={22} />
                </div>
                <div className="flex-1">
                  <p className="body-lg font-medium text-on-surface">
                    {VERIFICATION_TYPE_LABEL[option.type]}
                  </p>
                  <p className="body-sm text-on-surface-variant">+{option.points} pontos</p>
                </div>
                {done ? (
                  <Pill tone="success">Aprovada</Pill>
                ) : open ? (
                  <Pill tone="warning">Em andamento</Pill>
                ) : (
                  <button
                    type="button"
                    disabled={busy === option.type}
                    onClick={() => void startVerification(option.type)}
                    className="btn-text rounded-lg bg-primary-container px-4 py-2 text-on-primary transition-colors hover:bg-primary disabled:opacity-60"
                  >
                    {busy === option.type ? 'Iniciando...' : 'Iniciar'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card padded={false}>
        <div className="border-b border-outline-variant p-6">
          <h2 className="headline-md text-lg text-on-surface">Minhas verificações</h2>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon="fact_check"
            title="Nenhuma verificação ainda"
            description="Escolha um tipo acima para começar. O documento de identidade é o que mais pesa."
          />
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item) => {
              const required =
                OFFERED.find((option) => option.type === item.type)?.evidences ?? [];
              const sent = new Set(item.evidences.map((evidence) => evidence.type));
              const missing = required.filter((evidence) => !sent.has(evidence));

              return (
                <li key={item.verificationId} className="flex flex-col gap-4 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="body-lg font-semibold text-on-surface">
                        {VERIFICATION_TYPE_LABEL[item.type] ?? item.type}
                      </p>
                      <p className="body-sm text-on-surface-variant">
                        Iniciada em {formatDate(item.createdAt)}
                        {item.currentAttempt > 1 ? ` · ${item.currentAttempt}ª tentativa` : ''}
                      </p>
                    </div>
                    <Pill tone={toneForStatus(item.status)}>
                      {VERIFICATION_STATUS_LABEL[item.status] ?? item.status}
                    </Pill>
                  </div>

                  {item.decision?.decision === 'REJECTED' ? (
                    <Banner kind="error">
                      {item.decision.comments ??
                        'Verificação rejeitada. Você pode iniciar uma nova tentativa.'}
                    </Banner>
                  ) : null}

                  {item.status === 'WAITING_FOR_EVIDENCE' ? (
                    <div className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4">
                      <p className="body-sm font-medium text-on-surface">
                        Envie {missing.length === 1 ? 'o documento' : 'os documentos'}:
                      </p>
                      {missing.map((evidenceType) => (
                        <label
                          key={evidenceType}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:border-primary"
                        >
                          <span className="body-sm flex items-center gap-2 text-on-surface-variant">
                            <Icon name="upload_file" size={20} />
                            {EVIDENCE_LABEL[evidenceType] ?? evidenceType}
                          </span>
                          <span className="body-sm font-medium text-primary">
                            {busy === item.verificationId + evidenceType
                              ? 'Enviando...'
                              : 'Escolher arquivo'}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void uploadEvidence(item.verificationId, evidenceType, file);
                              }
                            }}
                          />
                        </label>
                      ))}
                      {missing.length === 0 ? (
                        <p className="body-sm text-on-surface-variant">
                          Todos os documentos foram enviados.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {item.status === 'PENDING_REVIEW' || item.status === 'IN_REVIEW' ? (
                    <Banner kind="info" icon="hourglass_top">
                      Documentos recebidos. Nossa equipe está analisando — você será avisado quando
                      houver decisão.
                    </Banner>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

const EVIDENCE_LABEL: Record<string, string> = {
  DOCUMENT_FRONT: 'Frente do documento',
  DOCUMENT_BACK: 'Verso do documento',
  PROOF_OF_ADDRESS: 'Comprovante de endereço',
  BANK_STATEMENT: 'Extrato ou comprovante bancário',
  BUSINESS_REGISTRATION: 'Contrato social ou cartão CNPJ',
  SELFIE: 'Selfie segurando o documento',
};

export default function VerificationsPage() {
  return (
    <AppShell>
      <VerificationsContent />
    </AppShell>
  );
}
