import { DEFAULT_LOCALE, Locale } from './locale';

/**
 * IP-002 — formatação locale-aware com `Intl` (Shared Engineering Standards
 * §8: "moeda, data, hora, número e endereço com formatação locale-aware").
 * `apps/web/lib/labels.ts` mantém suas funções `format*` como estão — hoje
 * chamadas em ~25 telas com 'pt-BR' fixo — e passa a delegar para estas aqui
 * com locale='pt-BR' explícito, então nenhuma tela muda de comportamento.
 * Telas NOVAS (e a própria tela de idioma) usam estas funções diretamente
 * com o locale corrente do `LocaleProvider`.
 */

export function formatCurrency(
  value: number | null,
  locale: Locale = DEFAULT_LOCALE,
  currency = 'BRL',
): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

export function formatNumber(value: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat(locale).format(value);
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(iso: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  const date = parseDate(iso);
  return date ? new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date) : '—';
}

export function formatDateTime(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = parseDate(iso);
  return date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : '—';
}

/** "3 days ago" / "há 3 dias" — usa `Intl.RelativeTimeFormat`, sem strings hard-coded por idioma. */
export function formatRelative(
  iso: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
  now: number = Date.now(),
): string {
  const date = parseDate(iso);
  if (!date) {
    return '—';
  }
  const diffMs = now - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (minutes < 1) {
    return rtf.format(0, 'second');
  }
  if (minutes < 60) {
    return rtf.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return rtf.format(-hours, 'hour');
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return rtf.format(-days, 'day');
  }
  return formatDate(iso, locale);
}

export function formatDuration(minutes: number | null, locale: Locale = DEFAULT_LOCALE): string {
  if (minutes === null) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const nf = new Intl.NumberFormat(locale);
  if (hours === 0) return `${nf.format(rest)} min`;
  if (rest === 0) return `${nf.format(hours)} h`;
  return `${nf.format(hours)} h ${nf.format(rest)} min`;
}
