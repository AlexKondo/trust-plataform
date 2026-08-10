'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { Card, EmptyState, Loading, PageHeader, Pill } from '../../components/layout';
import { Icon } from '../../components/ui';
import { authApiPaged } from '../../lib/api';
import { formatRelative } from '../../lib/labels';
import type { ConversationSummary } from '../../lib/types';

function ConversationsContent() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    void authApiPaged<ConversationSummary>('/marketplace/conversations')
      .then((page) => setItems(page.items))
      .catch(() => setItems([]));
  }, []);

  if (!items) {
    return <Loading label="Carregando conversas..." />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Conversas"
        subtitle="Suas negociações — como cliente e como prestador."
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="forum"
            title="Nenhuma conversa ainda"
            description="Quando você entrar em contato com um anúncio, a conversa aparece aqui."
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
        <Card padded={false}>
          <ul className="divide-y divide-outline-variant/50">
            {items.map((item) => (
              <li key={item.conversationId}>
                <Link
                  href={`/conversations/${item.conversationId}`}
                  className="flex items-center gap-4 p-5 transition-colors hover:bg-surface-container-low"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                    <span className="label-bold">
                      {item.counterpartName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="body-lg font-semibold text-on-surface">
                        {item.counterpartName}
                      </p>
                      {item.status === 'CLOSED' ? <Pill>Encerrada</Pill> : null}
                    </div>
                    <p className="body-sm truncate text-on-surface-variant">{item.listingTitle}</p>
                    {item.lastMessagePreview ? (
                      <p className="body-sm mt-1 truncate text-on-surface-variant">
                        {item.lastMessagePreview}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="body-sm text-on-surface-variant">
                      {formatRelative(item.lastMessageAt)}
                    </span>
                    {item.unreadCount > 0 ? (
                      <span className="label-bold flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-container px-2 text-on-primary">
                        {item.unreadCount}
                      </span>
                    ) : (
                      <Icon name="chevron_right" className="text-outline" size={20} />
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <AppShell>
      <ConversationsContent />
    </AppShell>
  );
}
