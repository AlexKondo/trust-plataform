import { messages as enUS } from './messages/en-US';
import { messages as ptBR, Messages } from './messages/pt-BR';
import { Locale } from './locale';

export const CATALOG: Record<Locale, Messages> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

type DotPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Chave em "dot path" (ex.: `nav.home`, `orderStatus.CREATED`) validada em tempo de compilação. */
export type MessageKey = DotPaths<Messages>;

function lookup(dict: Messages, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, segment) => (node as Record<string, unknown>)?.[segment], dict);
  return typeof value === 'string' ? value : key;
}

/** Traduz `key` no `locale` dado; cai para PT-BR e, no limite, devolve a própria chave. */
export function translate(locale: Locale, key: MessageKey): string {
  const dict = CATALOG[locale] ?? CATALOG['pt-BR'];
  const value = lookup(dict, key);
  if (value !== key) {
    return value;
  }
  return lookup(CATALOG['pt-BR'], key);
}
