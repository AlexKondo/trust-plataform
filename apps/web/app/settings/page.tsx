'use client';

import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { Card, PageHeader } from '../../components/layout';
import { Icon } from '../../components/ui';

const SECTIONS = [
  {
    href: '/settings/privacy',
    icon: 'visibility',
    title: 'Perfil público',
    description: 'Escolha o que aparece no seu link de confiança e gerencie os compartilhamentos.',
  },
  {
    href: '/settings/security/change-password',
    icon: 'lock',
    title: 'Segurança',
    description: 'Altere sua senha. As demais sessões são encerradas por precaução.',
  },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <PageHeader title="Configurações" />
        <div className="flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href}>
              <Card className="flex items-center gap-4 transition-shadow hover:shadow-lg">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <Icon name={section.icon} size={22} />
                </div>
                <div className="flex-1">
                  <p className="body-lg font-semibold text-on-surface">{section.title}</p>
                  <p className="body-sm text-on-surface-variant">{section.description}</p>
                </div>
                <Icon name="chevron_right" className="text-outline" size={22} />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
