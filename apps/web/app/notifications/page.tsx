'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader } from '../../components/layout';
import {
  NotificationItem,
  notificationHref,
} from '../../components/notification-bell';
import { Icon } from '../../components/ui';
import { authApi, authApiPaged } from '../../lib/api';
import { formatDateTime } from '../../lib/labels';

/** Ícone por família de aviso — dá leitura rápida à lista. */
const TYPE_ICON: Record<string, string> = {
  VERIFICATION_APPROVED: 'verified',
  VERIFICATION_REJECTED: 'gpp_bad',
  TRUST_LEVEL_UP: 'trending_up',
  BADGE_AWARDED: 'workspace_premium',
  MESSAGE_RECEIVED: 'forum',
  OFFER_RECEIVED: 'local_offer',
  OFFER_COUNTERED: 'swap_horiz',
  OFFER_ACCEPTED: 'handshake',
  OFFER_REJECTED: 'do_not_disturb_on',
  OFFER_WITHDRAWN: 'undo',
  ORDER_SCHEDULED: 'event',
  ORDER_STARTED: 'play_circle',
  ORDER_AWAITING_CONFIRMATION: 'task_alt',
  ORDER_CONFIRMED: 'check_circle',
  ORDER_CANCELLED: 'cancel',
  DISPUTE_OPENED: 'gavel',
  DISPUTE_RESOLVED: 'balance',
  REVIEW_RECEIVED: 'star',
};

function NotificationsContent() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    setItems(null);
    const page = await authApiPaged<NotificationItem>(
      `/notifications?size=50${onlyUnread ? '&onlyUnread=true' : ''}`,
    ).catch(() => null);
    setItems(page?.items ?? []);
  }, [onlyUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllAsRead = async () => {
    await authApi('/notifications/read-all', { method: 'PATCH' }).catch(() => undefined);
    await load();
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notificações"
        subtitle="Tudo que aconteceu nas suas negociações e no seu Trust Score."
        action={
          <button
            type="button"
            onClick={() => void markAllAsRead()}
            className="btn-text rounded-xl border border-outline-variant px-5 py-3 text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Marcar todas como lidas
          </button>
        }
      />

      <div className="flex gap-2">
        {[
          { value: false, label: 'Todas' },
          { value: true, label: 'Não lidas' },
        ].map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setOnlyUnread(filter.value)}
            className={`body-sm rounded-full px-4 py-2 font-medium transition-colors ${
              onlyUnread === filter.value
                ? 'bg-primary-container text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <Loading label="Carregando notificações..." />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="notifications_off"
            title={onlyUnread ? 'Nada não lido' : 'Nenhuma notificação ainda'}
            description="Avisos sobre mensagens, propostas, pedidos e seu Trust Score aparecem aqui."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item) => (
              <li key={item.notificationId}>
                <Link
                  href={notificationHref(item)}
                  className={`flex items-start gap-4 p-5 transition-colors hover:bg-surface-container-low ${
                    item.read ? '' : 'bg-primary-fixed/30'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      item.read
                        ? 'bg-surface-container text-on-surface-variant'
                        : 'bg-primary-fixed text-primary'
                    }`}
                  >
                    <Icon name={TYPE_ICON[item.type] ?? 'notifications'} size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="body-lg font-semibold text-on-surface">{item.title}</p>
                    <p className="body-sm text-on-surface-variant">{item.body}</p>
                    <p className="body-sm mt-1 text-outline">{formatDateTime(item.createdAt)}</p>
                  </div>
                  {!item.read ? (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-container" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AppShell>
      <NotificationsContent />
    </AppShell>
  );
}
