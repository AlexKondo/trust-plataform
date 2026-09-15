import { describe, expect, it } from 'vitest';
import { resolveLocale } from './locale-resolver';

describe('resolveLocale (IP-002)', () => {
  it('usa a preferência do usuário quando suportada', () => {
    expect(resolveLocale('en-US', 'pt-BR')).toBe('en-US');
  });

  it('ignora preferência não suportada e cai para o header', () => {
    expect(resolveLocale('fr-FR', 'en-US,pt-BR;q=0.8')).toBe('en-US');
  });

  it('sem preferência, usa o Accept-Language por correspondência exata', () => {
    expect(resolveLocale(null, 'en-US')).toBe('en-US');
  });

  it('sem preferência, casa por família de idioma (pt → pt-BR)', () => {
    expect(resolveLocale(undefined, 'pt;q=0.9,fr;q=0.8')).toBe('pt-BR');
  });

  it('respeita a ordem de preferência declarada no header', () => {
    expect(resolveLocale(null, 'fr-FR,en-US,pt-BR')).toBe('en-US');
  });

  it('sem usuário e sem header suportado, cai para PT-BR default', () => {
    expect(resolveLocale(null, null)).toBe('pt-BR');
    expect(resolveLocale(null, 'fr-FR,de-DE')).toBe('pt-BR');
  });

  it('preferência suportada sempre vence o header, mesmo divergentes', () => {
    expect(resolveLocale('pt-BR', 'en-US')).toBe('pt-BR');
  });
});
