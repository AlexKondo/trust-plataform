'use client';

import { useState } from 'react';
import { AdminOnly } from '../../../components/admin-guard';
import { AppShell } from '../../../components/app-shell';
import { Card, PageHeader, Pill, toneForStatus } from '../../../components/layout';
import { Banner, Field } from '../../../components/ui';
import { ApiError, authApi } from '../../../lib/api';
import { formatDateTime } from '../../../lib/labels';

interface SupportOrder {
  orderId: string;
  status: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  currency: string;
  createdAt: string;
}

interface SupportPayment {
  paymentId: string;
  orderId: string;
  status: string;
  amount: string;
  currency: string;
  refundedAmount: string;
  paymentProviderId: string | null;
  createdAt: string;
}

interface EmailLookupResult {
  identity: {
    id: string;
    fullName: string;
    email: string;
    status: string;
    isAdmin: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  };
  orders: SupportOrder[];
}

interface OrderLookupResult {
  order: SupportOrder;
  payment: SupportPayment | null;
}

interface PaymentLookupResult {
  payment: SupportPayment;
  order: SupportOrder | null;
}

type LookupKind = 'email' | 'orderId' | 'paymentId';

/**
 * IP-018 — fecha o gap "support pode rastrear um pedido/pagamento de ponta a
 * ponta" (acceptance criteria). Um identificador por busca; a resposta é
 * sempre uma VIEW consolidada e mascarada (`AdminSupportController`), nunca
 * uma linha crua de tabela.
 */
function AdminSupportContent() {
  const [kind, setKind] = useState<LookupKind>('email');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<EmailLookupResult | OrderLookupResult | PaymentLookupResult | null>(
    null,
  );

  const search = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const query = new URLSearchParams({ [kind]: value.trim() }).toString();
      const data = await authApi<EmailLookupResult | OrderLookupResult | PaymentLookupResult>(
        `/admin/support/lookup?${query}`,
      );
      setResult(data);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'Não foi possível concluir a busca.',
      });
    } finally {
      setBusy(false);
    }
  };

  const renderOrder = (order: SupportOrder) => (
    <div key={order.orderId} className="rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="body-sm font-semibold text-on-surface">Pedido {order.orderId}</p>
        <Pill tone={toneForStatus(order.status)}>{order.status}</Pill>
      </div>
      <p className="body-sm text-on-surface-variant">
        {order.currency} {order.amount} · criado em {formatDateTime(order.createdAt)}
      </p>
    </div>
  );

  const renderPayment = (payment: SupportPayment) => (
    <div key={payment.paymentId} className="rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="body-sm font-semibold text-on-surface">Pagamento {payment.paymentId}</p>
        <Pill tone={toneForStatus(payment.status)}>{payment.status}</Pill>
      </div>
      <p className="body-sm text-on-surface-variant">
        {payment.currency} {payment.amount} · reembolsado {payment.currency} {payment.refundedAmount}
      </p>
      <p className="body-sm text-on-surface-variant">
        Provedor: {payment.paymentProviderId ?? '—'} · criado em {formatDateTime(payment.createdAt)}
      </p>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Busca de suporte"
        subtitle="Rastreie uma identidade, um pedido ou um pagamento de ponta a ponta. Um identificador por busca — não é um editor genérico de tabela."
        back={{ href: '/admin', label: 'Moderação' }}
      />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          {(
            [
              { value: 'email', label: 'E-mail' },
              { value: 'orderId', label: 'ID do pedido' },
              { value: 'paymentId', label: 'ID do pagamento' },
            ] as const
          ).map((option) => (
            <label key={option.value} className="flex items-center gap-2 body-sm">
              <input
                type="radio"
                name="lookup-kind"
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <Field id="lookup-value" label="Valor da busca">
          <input
            id="lookup-value"
            className="tds-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={kind === 'email' ? 'pessoa@exemplo.com' : 'UUID'}
          />
        </Field>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void search()}
          className="btn-text w-full rounded-xl bg-primary-container px-5 py-3 text-on-primary transition-colors hover:bg-primary disabled:opacity-60 md:w-56"
        >
          Buscar
        </button>
      </Card>

      {message ? <Banner kind="error">{message.text}</Banner> : null}

      {result && 'identity' in result ? (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="body-lg font-semibold text-on-surface">{result.identity.fullName}</p>
            <p className="body-sm text-on-surface-variant">{result.identity.email}</p>
            <p className="body-sm text-on-surface-variant">
              Status: {result.identity.status} · desde {formatDateTime(result.identity.createdAt)}
              {result.identity.lastLoginAt
                ? ` · último acesso em ${formatDateTime(result.identity.lastLoginAt)}`
                : ''}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="label-bold uppercase text-on-surface-variant">
              Pedidos ({result.orders.length})
            </p>
            {result.orders.length === 0 ? (
              <p className="body-sm text-on-surface-variant">Nenhum pedido.</p>
            ) : (
              result.orders.map(renderOrder)
            )}
          </div>
        </Card>
      ) : null}

      {result && 'order' in result ? (
        <Card className="flex flex-col gap-4">
          {result.order ? renderOrder(result.order) : null}
          {'payment' in result && result.payment ? renderPayment(result.payment) : null}
        </Card>
      ) : null}
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminSupportContent />
      </AdminOnly>
    </AppShell>
  );
}
