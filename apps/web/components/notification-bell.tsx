'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi, authApiPaged } from '../lib/api';
import { formatRelative } from '../lib/labels';
import { Icon } from './ui';

export interface NotificationItem {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
  read: boolean;
  createdAt: string;
}

/** Para onde o aviso leva quando é clicado. */
export function notificationHref(item: NotificationItem): string {
  switch (item.resourceType) {
    case 'MarketplaceConversation':
      return item.resourceId ? `/conversations/${item.resourceId}` : '/conversations';
    case 'MarketplaceOrder':
      return item.resourceId ? `/orders/${item.resourceId}` : '/orders';
    case 'Verification':
      return '/verifications';
    case 'TrustScore':
      return '/trust-score';
    default:
      return '/notifications';
  }
}

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const result = await authApi<{ unread: number }>('/notifications/unread-count');
      setUnread(result.unread);
    } catch {
      // contador é acessório: falha silenciosa não atrapalha a navegação
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(null);
      const page = await authApiPaged<NotificationItem>('/notifications?size=8').catch(() => null);
      setItems(page?.items ?? []);
    }
  };

  const openItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.read) {
      await authApi(`/notifications/${item.notificationId}/read`, { method: 'PATCH' }).catch(
        () => undefined,
      );
      void refreshCount();
    }
    router.push(notificationHref(item));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
        onClick={() => void toggle()}
        className="relative text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <Icon name="notifications" size={22} />
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-80 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-ambient">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <span className="label-bold uppercase text-on-surface">Notificações</span>
            {unread > 0 ? (
              <button
                type="button"
                className="body-sm text-primary hover:underline"
                onClick={() => {
                  void authApi('/notifications/read-all', { method: 'PATCH' }).then(() => {
                    setUnread(0);
                    setItems((current) =>
                      current ? current.map((item) => ({ ...item, read: true })) : current,
                    );
                  });
                }}
              >
                Marcar todas
              </button>
            ) : null}
          </div>

          {items === null ? (
            <div className="flex justify-center p-6">
              <Icon name="progress_activity" className="spinner text-primary" size={24} />
            </div>
          ) : items.length === 0 ? (
            <p className="body-sm p-6 text-center text-on-surface-variant">
              Nenhuma notificação ainda.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-outline-variant/50 overflow-y-auto">
              {items.map((item) => (
                <li key={item.notificationId}>
                  <button
                    type="button"
                    onClick={() => void openItem(item)}
                    className={`flex w-full gap-3 p-4 text-left transition-colors hover:bg-surface-container-low ${
                      item.read ? '' : 'bg-primary-fixed/40'
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        item.read ? 'bg-transparent' : 'bg-primary-container'
                      }`}
                    />
                    <span className="flex-1">
                      <span className="body-sm block font-semibold text-on-surface">
                        {item.title}
                      </span>
                      <span className="body-sm block text-on-surface-variant">{item.body}</span>
                      <span className="body-sm mt-1 block text-outline">
                        {formatRelative(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <a
            href="/notifications"
            className="body-sm block border-t border-outline-variant p-3 text-center font-medium text-primary hover:bg-surface-container-low"
          >
            Ver todas
          </a>
        </div>
      ) : null}
    </div>
  );
}
