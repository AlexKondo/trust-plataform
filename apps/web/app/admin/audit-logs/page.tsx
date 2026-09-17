'use client';

import { useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import { Card, EmptyState, PageHeader, Pill } from '../../../components/layout';
import { Banner, Field } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { formatDateTime } from '../../../lib/labels';

interface AuditLogRow {
  id: string;
  identityId: string | null;
  operation: string;
  resource: string;
  resourceId: string | null;
  result: string;
  correlationId: string | null;
  occurredAt: string;
}

interface AuditLogSearchResult {
  items: AuditLogRow[];
  totalItems: number;
}

/**
 * IP-018 — fecha o gap "audit exploration": `audit_logs` (IP-000) era
 * write-only até esta IP. Só leitura; a trilha continua append-only.
 */
function AdminAuditLogsContent() {
  const [identityId, setIdentityId] = useState('');
  const [operation, setOperation] = useState('');
  const [resource, setResource] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AuditLogSearchResult | null>(null);

  const search = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (identityId.trim()) params.set('identityId', identityId.trim());
      if (operation.trim()) params.set('operation', operation.trim());
      if (resource.trim()) params.set('resource', resource.trim());
      params.set('size', '50');
      const data = await authApi<AuditLogSearchResult>(`/admin/audit-logs?${params.toString()}`);
      setResult(data);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível buscar a auditoria.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Trilha de auditoria"
        subtitle="Busca sobre audit_logs (append-only, imutável). Filtros combinam por E; deixe em branco o que não quiser filtrar."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field id="filter-identity" label="ID da identidade (ator)">
            <input
              id="filter-identity"
              className="tds-input"
              value={identityId}
              onChange={(event) => setIdentityId(event.target.value)}
              placeholder="UUID"
            />
          </Field>
          <Field id="filter-operation" label="Operação">
            <input
              id="filter-operation"
              className="tds-input"
              value={operation}
              onChange={(event) => setOperation(event.target.value)}
              placeholder="Ex.: RefundPayment"
            />
          </Field>
          <Field id="filter-resource" label="Recurso">
            <input
              id="filter-resource"
              className="tds-input"
              value={resource}
              onChange={(event) => setResource(event.target.value)}
              placeholder="Ex.: Payment"
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void search()}
          className="btn-text w-full rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary disabled:opacity-60 md:w-56"
        >
          Buscar
        </button>
      </Card>

      {message ? <Banner kind="error">{message}</Banner> : null}

      {result ? (
        result.items.length === 0 ? (
          <Card>
            <EmptyState
              icon="history"
              title="Nenhum registro"
              description="Nenhuma entrada de auditoria corresponde a estes filtros."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="body-sm text-on-surface-variant">{result.totalItems} registro(s) no total.</p>
            {result.items.map((row) => (
              <Card key={row.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="body-sm font-semibold text-on-surface">
                    {row.operation} · {row.resource}
                    {row.resourceId ? ` (${row.resourceId})` : ''}
                  </p>
                  <Pill tone={row.result === 'SUCCESS' ? 'success' : 'error'}>{row.result}</Pill>
                </div>
                <p className="body-sm text-on-surface-variant">
                  Ator: {row.identityId ?? 'anônimo'} · {formatDateTime(row.occurredAt)}
                </p>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminAuditLogsContent />
      </AdminOnly>
    </AppShell>
  );
}
