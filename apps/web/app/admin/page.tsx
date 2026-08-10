'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminOnly } from '../../components/admin-guard';
import { AppShell } from '../../components/app-shell';
import { Card, PageHeader } from '../../components/layout';
import { Icon } from '../../components/ui';
import { authApiPaged } from '../../lib/api';

function AdminHome() {
  const [pendingVerifications, setPendingVerifications] = useState<number | null>(null);
  const [openDisputes, setOpenDisputes] = useState<number | null>(null);

  useEffect(() => {
    void authApiPaged<unknown>('/verifications/queue/pending?size=1')
      .then((page) => setPendingVerifications(page.pagination.totalItems))
      .catch(() => setPendingVerifications(0));
    void authApiPaged<unknown>('/admin/marketplace/disputes?size=1')
      .then((page) => setOpenDisputes(page.pagination.totalItems))
      .catch(() => setOpenDisputes(0));
  }, []);

  const cards = [
    {
      href: '/admin/verifications',
      icon: 'fact_check',
      title: 'Verificações',
      description: 'Analise documentos enviados e decida aprovação ou rejeição.',
      count: pendingVerifications,
      countLabel: 'aguardando análise',
    },
    {
      href: '/admin/disputes',
      icon: 'gavel',
      title: 'Disputas',
      description: 'Medie conflitos entre cliente e prestador e registre a decisão.',
      count: openDisputes,
      countLabel: 'abertas',
    },
    {
      href: '/admin/trust-rules',
      icon: 'tune',
      title: 'Regras do Trust Score',
      description: 'Pontuação por evento, faixas de nível, selos e benefícios.',
      count: null,
      countLabel: '',
    },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Moderação"
        subtitle="As decisões desta área alteram a reputação de pessoas reais. Cada uma fica registrada com seu nome."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="flex h-full flex-col gap-3 transition-shadow hover:shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-container">
                  <Icon name={card.icon} size={22} />
                </div>
                {card.count !== null ? (
                  <div className="text-right">
                    <p className="headline-lg text-on-surface">{card.count}</p>
                    <p className="body-sm text-on-surface-variant">{card.countLabel}</p>
                  </div>
                ) : null}
              </div>
              <div>
                <p className="body-lg font-semibold text-on-surface">{card.title}</p>
                <p className="body-sm text-on-surface-variant">{card.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <AdminOnly>
        <AdminHome />
      </AdminOnly>
    </AppShell>
  );
}
