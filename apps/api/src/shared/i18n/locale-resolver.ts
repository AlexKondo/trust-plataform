import { DEFAULT_LOCALE, isSupportedLocale, Locale, SUPPORTED_LOCALES } from './locale';

/**
 * IP-002 — resolução de locale efetivo de uma requisição/usuário.
 * Ordem de precedência (Shared Engineering Standards §8 + IP-002 §1):
 *   1. preferência explícita do usuário (persistida em `identities.preferred_locale`);
 *   2. cabeçalho `Accept-Language` da requisição;
 *   3. PT-BR (default do produto).
 *
 * Função pura e sem dependências de infraestrutura de propósito — testável
 * isoladamente e reutilizável tanto no fluxo de cadastro (locale inicial)
 * quanto na resolução de destinatário de notificação.
 */
export function resolveLocale(
  preferred?: string | null,
  acceptLanguageHeader?: string | null,
): Locale {
  if (isSupportedLocale(preferred)) {
    return preferred;
  }

  const fromHeader = parseAcceptLanguage(acceptLanguageHeader);
  if (fromHeader) {
    return fromHeader;
  }

  return DEFAULT_LOCALE;
}

/**
 * Parser mínimo de `Accept-Language` (RFC 7231 §5.3.5): tenta correspondência
 * exata da tag (`pt-BR`) e, na ausência, por família de idioma (`pt` → `pt-BR`).
 * Não implementa `q`-weight completo — o produto só precisa da ORDEM de
 * preferência declarada pelo navegador, que já vem em ordem decrescente na
 * ausência de pesos explícitos, e o primeiro suportado já resolve o caso de uso.
 */
function parseAcceptLanguage(header?: string | null): Locale | null {
  if (!header) {
    return null;
  }

  const tags = header
    .split(',')
    .map((part) => part.trim().split(';')[0]?.trim())
    .filter((tag): tag is string => Boolean(tag));

  for (const tag of tags) {
    const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
    if (exact) {
      return exact;
    }
  }

  for (const tag of tags) {
    const language = tag.split('-')[0]?.toLowerCase();
    const byLanguage = SUPPORTED_LOCALES.find(
      (locale) => locale.split('-')[0]?.toLowerCase() === language,
    );
    if (byLanguage) {
      return byLanguage;
    }
  }

  return null;
}
