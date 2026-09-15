'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, authApi, tokenStore } from '../api';
import { translate, MessageKey } from './catalog';
import { DEFAULT_LOCALE, Locale, localeStore, resolveInitialLocale } from './locale';

interface LocaleContextValue {
  locale: Locale;
  /** Troca local + (se autenticado) persiste via `PATCH /identities/me/locale`. */
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: MessageKey) => string;
  saving: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * IP-002 — fonte única do locale corrente no cliente.
 * Ordem de resolução ao montar (espelha o backend): preferência já salva na
 * conta (se autenticado) → localStorage → idioma do navegador → PT-BR.
 * Não bloqueia a renderização: a tela nasce no melhor palpite local
 * (`resolveInitialLocale`) e reconcilia com a API assim que a sessão responde.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocaleState(resolveInitialLocale());
  }, []);

  useEffect(() => {
    if (!tokenStore.access) {
      return;
    }
    authApi<{ preferredLocale: string }>('/identities/me')
      .then((identity) => {
        if (identity.preferredLocale === 'pt-BR' || identity.preferredLocale === 'en-US') {
          setLocaleState(identity.preferredLocale);
          localeStore.set(identity.preferredLocale);
        }
      })
      .catch(() => {
        // Sem sessão válida ainda / offline — mantém o palpite local.
      });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(async (next: Locale) => {
    const previous = locale;
    setLocaleState(next);
    localeStore.set(next);

    if (!tokenStore.access) {
      return;
    }
    setSaving(true);
    try {
      await authApi('/identities/me/locale', { method: 'PATCH', body: { preferredLocale: next } });
    } catch (error) {
      // Reverte só a exibição — a escolha some da UI se o servidor recusou.
      setLocaleState(previous);
      localeStore.set(previous);
      throw error instanceof ApiError ? error : new Error('Failed to update locale.');
    } finally {
      setSaving(false);
    }
  }, [locale]);

  const t = useCallback((key: MessageKey) => translate(locale, key), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t, saving }),
    [locale, setLocale, t, saving],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
