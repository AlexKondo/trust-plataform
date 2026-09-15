'use client';

import { AppShell } from '../../../components/app-shell';
import { LanguageSelector } from '../../../components/language-selector';
import { Card, PageHeader, SectionTitle } from '../../../components/layout';
import { formatCurrency, formatDateTime } from '../../../lib/i18n/format';
import { LOCALE_META } from '../../../lib/i18n/locale';
import { useLocale } from '../../../lib/i18n/LocaleProvider';

/**
 * Prévia ao vivo, sem recarregar a página quando o idioma muda ao lado.
 * Prova as duas pernas da fundação de i18n na mesma tela — formatação
 * locale-aware (`Intl`, via `lib/i18n/format.ts`) e o catálogo de mensagens
 * (`t()`) — sobre uma fatia representativa (data/hora, moeda e um rótulo de
 * negócio), sem precisar traduzir as ~25 telas existentes para demonstrar
 * que a arquitetura funciona ponta a ponta com um segundo locale.
 */
function LivePreview() {
  const { locale, t } = useLocale();
  const now = new Date().toISOString();

  const rows: Array<{ label: string; value: string }> = [
    { label: 'locale', value: `${locale} — ${LOCALE_META[locale].label}` },
    { label: 'formatDateTime', value: formatDateTime(now, locale) },
    { label: 'formatCurrency', value: formatCurrency(1234.5, locale, 'BRL') },
    { label: 'orderStatus.CUSTOMER_CONFIRMED', value: t('orderStatus.CUSTOMER_CONFIRMED') },
    { label: 'levels.GOLD', value: t('levels.GOLD') },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-outline-variant p-3">
          <dt className="body-sm text-on-surface-variant">{row.label}</dt>
          <dd className="body-lg font-medium text-on-surface">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LanguageContent() {
  const { t } = useLocale();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title={t('settings.pageTitle')} subtitle={t('settings.pageSubtitle')} />
      <Card>
        <LanguageSelector />
      </Card>
      <Card>
        <SectionTitle icon="translate" title="Preview" />
        <LivePreview />
      </Card>
    </div>
  );
}

export default function LanguagePage() {
  return (
    <AppShell>
      <LanguageContent />
    </AppShell>
  );
}
