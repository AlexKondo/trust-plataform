/**
 * IP-002 — Internationalization & Localization Foundation.
 * Fonte única de verdade de quais locales o produto suporta hoje (Shared
 * Engineering Standards §8: "estruturalmente pronto para múltiplos idiomas;
 * não é preciso ter todos os idiomas na Release 1.0"). Adicionar um locale
 * novo é alterar esta lista + os catálogos correspondentes — nenhuma outra
 * mudança estrutural é necessária.
 */
export const SUPPORTED_LOCALES = ['pt-BR', 'en-US'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** PT-BR é o default do produto (DOC §8 / 04_APPROVED_PRODUCT_DECISIONS). */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  if (!value) {
    return false;
  }
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
