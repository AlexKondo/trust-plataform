'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, useIdentity } from '../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader, Pill, toneForStatus } from '../../components/layout';
import { Icon } from '../../components/ui';
import { authApiPaged } from '../../lib/api';
import {
  NEXT_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  formatCurrency,
  formatDate,
} from '../../lib/labels';
import type { Order } from '../../lib/types';

function OrdersContent() {
  const identity = useIdentity();
  const [items, setItems] = useState<Order[] | null>(null);

  useEffect(() => {
    void authApiPaged<Order>('/marketplace/orders')
      .then((page) => setItems(page.items))
      .catch(() => setItems([]));
  }, []);

  if (!items) {
    return <Loading label="Carregando pedidos..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Pedidos"
        subtitle="Acompanhe os serviços contratados e prestados, do agendamento à avaliação."
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt_long"
            title="Nenhum pedido ainda"
            description="Pedidos são criados automaticamente quando uma proposta é aceita."
            action={
              <Link
                href="/marketplace"
                className="btn-text rounded-xl bg-primary-container px-5 py-3 text-on-primary"
              >
                Explorar o marketplace
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((order) => {
            const isSeller = identity?.identityId === order.sellerId;
            return (
              <Link key={order.orderId} href={`/orders/${order.orderId}`}>
                <Card className="transition-shadow hover:shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Pill tone={toneForStatus(order.status)}>
                          {ORDER_STATUS_LABEL[order.status] ?? order.status}
                        </Pill>
                        <Pill tone="neutral">{isSeller ? 'Você presta' : 'Você contrata'}</Pill>
                      </div>
                      <p className="body-lg font-semibold text-on-surface">
                        {formatCurrency(order.amount, order.currency)}
                      </p>
                      <p className="body-sm text-on-surface-variant">
                        Criado em {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <div>
                        <p className="label-bold uppercase text-on-surface-variant">Próximo passo</p>
                        <p className="body-sm font-medium text-primary">
                          {NEXT_ACTION_LABEL[order.nextAction] ?? order.nextAction}
                        </p>
                      </div>
                      <Icon name="chevron_right" className="text-outline" size={22} />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <AppShell>
      <OrdersContent />
    </AppShell>
  );
}
