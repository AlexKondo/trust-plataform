/**
 * IP-002 — Internationalization & Localization Foundation.
 * Espelha `apps/api/src/shared/i18n/locale.ts`: mesma lista, mesmo default.
 * Duplicado de propósito (frontend/backend são deploys independentes — Next
 * na Vercel, API no Render) em vez de um pacote compartilhado, que seria
 * infraestrutura nova fora do escopo "mínimo seguro" desta fundação.
 */
export const SUPPORTED_LOCALES = ['pt-BR', 'en-US'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** PT-BR é o default do produto (04_APPROVED_PRODUCT_DECISIONS). */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

export const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  'pt-BR': { label: 'Português (Brasil)', flag: '🇧🇷' },
  'en-US': { label: 'English (US)', flag: '🇺🇸' },
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  if (!value) {
    return false;
  }
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

const STORAGE_KEY = 'trust.locale';

/** Preferência guardada localmente — usada antes do login resolver e para usuário anônimo. */
export const localeStore = {
  get(): Locale | null {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return isSupportedLocale(value) ? value : null;
    } catch {
      return null;
    }
  },
  set(locale: Locale): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Best-effort — sessão privada/localStorage bloqueado não deve quebrar a troca de idioma.
    }
  },
};

/**
 * Locale inicial para um visitante sem sessão ainda: localStorage (escolha
 * anterior) → idioma do navegador → PT-BR default. Reflete a mesma ordem de
 * precedência do backend (`resolveLocale`), adaptada ao que existe no cliente.
 */
export function resolveInitialLocale(): Locale {
  const stored = localeStore.get();
  if (stored) {
    return stored;
  }
  if (typeof navigator !== 'undefined') {
    const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === candidate.toLowerCase());
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      if (!candidate) continue;
      const language = candidate.split('-')[0]?.toLowerCase();
      const byLanguage = SUPPORTED_LOCALES.find((l) => l.split('-')[0]?.toLowerCase() === language);
      if (byLanguage) return byLanguage;
    }
  }
  return DEFAULT_LOCALE;
}
