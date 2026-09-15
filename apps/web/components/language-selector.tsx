'use client';

import { useState } from 'react';
import { ApiError } from '../lib/api';
import { Locale, LOCALE_META, SUPPORTED_LOCALES } from '../lib/i18n/locale';
import { useLocale } from '../lib/i18n/LocaleProvider';
import { Banner } from './ui';

/**
 * IP-002 — seletor de idioma. Persiste via `PATCH /identities/me/locale`
 * quando autenticado (LocaleProvider cuida disso); sempre funciona também
 * sem sessão (fica só em localStorage) para não depender de estar logado.
 */
export function LanguageSelector() {
  const { locale, setLocale, t, saving } = useLocale();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const handleChange = async (next: Locale) => {
    if (next === locale) {
      return;
    }
    setMessage(null);
    try {
      await setLocale(next);
      setMessage({ kind: 'success', text: t('settings.savedMessage') });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof ApiError ? error.message : t('settings.errorMessage'),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {SUPPORTED_LOCALES.map((code) => (
          <li key={code}>
            <button
              type="button"
              role="radio"
              aria-checked={locale === code}
              disabled={saving}
              onClick={() => void handleChange(code)}
              className={`flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors disabled:opacity-60 ${
                locale === code
                  ? 'border-primary bg-primary-container/40'
                  : 'border-outline-variant hover:bg-surface-container-low'
              }`}
            >
              <span className="flex items-center gap-3">
                <span aria-hidden className="text-xl">
                  {LOCALE_META[code].flag}
                </span>
                <span className="body-lg font-medium text-on-surface">{LOCALE_META[code].label}</span>
              </span>
              {locale === code ? (
                <span className="body-sm font-semibold text-primary">{t('settings.current')}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {message ? (
        <Banner kind={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Banner>
      ) : null}
    </div>
  );
}
