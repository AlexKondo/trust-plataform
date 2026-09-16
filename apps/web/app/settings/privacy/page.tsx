'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import { Card, Loading, PageHeader, Pill, SectionTitle } from '../../../components/layout';
import { Banner, Icon, PrimaryButton } from '../../../components/ui';
import { ApiError, authApi, logout } from '../../../lib/api';
import { formatDateTime } from '../../../lib/i18n/format';
import { useLocale } from '../../../lib/i18n/LocaleProvider';
import { formatDate } from '../../../lib/labels';
import type { PrivacyRequest, ProfileShare, VisibilityPolicy } from '../../../lib/types';

const TOGGLES: Array<{ key: keyof VisibilityPolicy; label: string; hint: string }> = [
  { key: 'showScore', label: 'Mostrar meu Trust Score', hint: 'O número exato da sua pontuação.' },
  { key: 'showLevel', label: 'Mostrar meu nível', hint: 'Bronze, Prata, Ouro ou Platina.' },
  { key: 'showBadges', label: 'Mostrar meus selos', hint: 'As conquistas do seu perfil.' },
  {
    key: 'showVerifications',
    label: 'Mostrar o que foi verificado',
    hint: 'Documento, endereço, telefone e e-mail.',
  },
];

const REJECTION_KEYS: Record<string, 'deleteRejected_ACTIVE_ORDERS' | 'deleteRejected_ACTIVE_CUSTODY' | 'deleteRejected_ACTIVE_SERVICE_REQUEST'> = {
  ACTIVE_ORDERS: 'deleteRejected_ACTIVE_ORDERS',
  ACTIVE_CUSTODY: 'deleteRejected_ACTIVE_CUSTODY',
  ACTIVE_SERVICE_REQUEST: 'deleteRejected_ACTIVE_SERVICE_REQUEST',
};

/**
 * IP-021 — workflow de acesso/exclusão de dados (LGPD art. 18). Todo conteúdo
 * NOVO desta seção passa por `t()` (Shared Standards §8/tarefa desta IP);
 * o resto da tela permanece como estava (decisão já tomada pela IP-002).
 */
function DataLifecycleSection() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const reload = async () => {
    const list = await authApi<PrivacyRequest[]>('/privacy/requests').catch(() => [] as PrivacyRequest[]);
    setRequests(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  const statusLabel = (status: PrivacyRequest['status']) =>
    ({
      REQUESTED: t('privacy.statusRequested'),
      PROCESSING: t('privacy.statusProcessing'),
      COMPLETED: t('privacy.statusCompleted'),
      REJECTED: t('privacy.statusRejected'),
    })[status];

  const handleExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const result = await authApi<PrivacyRequest>('/privacy/requests', {
        method: 'POST',
        body: { type: 'DATA_EXPORT' },
      });
      const blob = new Blob([JSON.stringify(result.exportedData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trust-platform-meus-dados-${result.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage({ kind: 'success', text: t('privacy.exportSuccess') });
      await reload();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : t('privacy.exportError'),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    setMessage(null);
    try {
      const result = await authApi<PrivacyRequest>('/privacy/requests', {
        method: 'POST',
        body: { type: 'DATA_DELETION' },
      });
      if (result.status === 'REJECTED') {
        const key = result.rejectionReason ? REJECTION_KEYS[result.rejectionReason] : undefined;
        setMessage({
          kind: 'error',
          text: `${t('privacy.deleteRejectedPrefix')} ${key ? t(`privacy.${key}`) : result.rejectionReason}`,
        });
        setConfirmDelete(false);
        await reload();
        return;
      }
      setMessage({ kind: 'success', text: t('privacy.deleteSuccess') });
      await logout();
      router.replace('/login');
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : t('privacy.exportError'),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <SectionTitle icon="download" title={t('privacy.dataSectionTitle')} hint={t('privacy.dataSectionHint')} />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <PrimaryButton type="button" loading={busy === 'export'} onClick={() => void handleExport()}>
          {t('privacy.exportButton')}
        </PrimaryButton>
      </div>

      <div className="mt-6 rounded-lg border border-error/30 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={confirmDelete}
            onChange={(event) => setConfirmDelete(event.target.checked)}
            className="mt-1"
          />
          <span className="body-sm text-on-surface-variant">{t('privacy.deleteConfirmLabel')}</span>
        </label>
        <button
          type="button"
          disabled={!confirmDelete || busy === 'delete'}
          onClick={() => void handleDelete()}
          className="btn-text mt-3 rounded-xl bg-error px-4 py-2 text-sm font-medium text-on-error disabled:opacity-50"
        >
          {t('privacy.deleteButton')}
        </button>
      </div>

      <div className="mt-6">
        <p className="body-sm mb-2 font-medium text-on-surface">{t('privacy.historyTitle')}</p>
        {requests.length === 0 ? (
          <p className="body-sm text-on-surface-variant">{t('privacy.historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
              >
                <div>
                  <p className="body-sm text-on-surface">
                    {item.type === 'DATA_EXPORT' ? t('privacy.typeExport') : t('privacy.typeDeletion')}
                  </p>
                  <p className="body-sm text-on-surface-variant">{formatDateTime(item.requestedAt, locale)}</p>
                </div>
                <Pill
                  tone={
                    item.status === 'COMPLETED'
                      ? 'success'
                      : item.status === 'REJECTED'
                        ? 'error'
                        : 'neutral'
                  }
                >
                  {statusLabel(item.status)}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function PrivacyContent() {
  const [policy, setPolicy] = useState<VisibilityPolicy | null>(null);
  const [shares, setShares] = useState<ProfileShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const reload = async () => {
    const [visibility, shareList] = await Promise.all([
      authApi<VisibilityPolicy>('/trust-profile/visibility'),
      authApi<ProfileShare[]>('/trust-profile/shares').catch(() => [] as ProfileShare[]),
    ]);
    setPolicy(visibility);
    setShares(shareList);
  };

  useEffect(() => {
    void reload().catch(() => setPolicy(null));
  }, []);

  const toggle = async (key: keyof VisibilityPolicy) => {
    if (!policy) return;
    const next = { ...policy, [key]: !policy[key] };
    setPolicy(next);
    try {
      await authApi('/trust-profile/visibility', { method: 'PUT', body: next });
    } catch {
      setPolicy(policy);
      setMessage({ kind: 'error', text: 'Não foi possível salvar a preferência.' });
    }
  };

  const createShare = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await authApi<{ shareUrl: string }>('/trust-profile/shares', {
        method: 'POST',
        body: { expiresInDays: 30 },
      });
      setLastLink(result.shareUrl);
      await reload();
      setMessage({ kind: 'success', text: 'Link criado! Válido por 30 dias.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível criar o link.',
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    setBusy(true);
    try {
      await authApi(`/trust-profile/shares/${shareId}`, { method: 'DELETE' });
      await reload();
      setMessage({ kind: 'success', text: 'Link revogado. Ele deixou de funcionar imediatamente.' });
    } finally {
      setBusy(false);
    }
  };

  if (!policy) {
    return <Loading label="Carregando preferências..." />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Perfil público"
        subtitle="Você decide o que aparece para quem recebe seu link de confiança."
      />

      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}

      <Card>
        <SectionTitle icon="visibility" title="O que mostrar" />
        <ul className="flex flex-col gap-3">
          {TOGGLES.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant p-4"
            >
              <div>
                <p className="body-lg font-medium text-on-surface">{item.label}</p>
                <p className="body-sm text-on-surface-variant">{item.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={policy[item.key]}
                onClick={() => void toggle(item.key)}
                className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
                  policy[item.key] ? 'bg-primary-container' : 'bg-surface-container-high'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    policy[item.key] ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle
          icon="share"
          title="Links compartilháveis"
          hint="Cada link tem validade e pode ser revogado a qualquer momento."
        />

        {lastLink ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg bg-secondary-container/40 p-4">
            <p className="body-sm font-medium text-on-secondary-container">Seu link:</p>
            <div className="flex items-center gap-2">
              <input readOnly className="tds-input flex-1 font-mono text-xs" value={lastLink} />
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(lastLink)}
                className="btn-text flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container text-on-primary"
                aria-label="Copiar link"
              >
                <Icon name="content_copy" size={20} />
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-6 md:w-64">
          <PrimaryButton type="button" loading={busy} onClick={() => void createShare()}>
            Criar novo link
          </PrimaryButton>
        </div>

        {shares.length === 0 ? (
          <p className="body-sm text-on-surface-variant">Nenhum link criado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shares.map((share) => (
              <li
                key={share.shareId}
                className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant p-3"
              >
                <div>
                  <p className="body-sm text-on-surface">
                    Criado em {formatDate(share.createdAt)} · expira em {formatDate(share.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Pill
                    tone={
                      share.status === 'ACTIVE'
                        ? 'success'
                        : share.status === 'REVOKED'
                          ? 'error'
                          : 'neutral'
                    }
                  >
                    {share.status === 'ACTIVE'
                      ? 'Ativo'
                      : share.status === 'REVOKED'
                        ? 'Revogado'
                        : 'Expirado'}
                  </Pill>
                  {share.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(share.shareId)}
                      className="body-sm text-error hover:underline disabled:opacity-60"
                    >
                      Revogar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DataLifecycleSection />
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <AppShell>
      <PrivacyContent />
    </AppShell>
  );
}
