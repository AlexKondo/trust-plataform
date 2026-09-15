import { describe, expect, it } from 'vitest';
import { UnsupportedLocaleException } from '../exceptions/locale.exceptions';
import { Identity } from './identity';

function makeIdentity(preferredLocale?: string): Identity {
  return Identity.createNew({
    fullName: 'Maria Silva',
    email: 'maria@example.com',
    passwordHash: '$argon2id$secret-hash',
    preferredLocale,
  });
}

describe('Identity — preferredLocale (IP-002)', () => {
  it('sem locale informado no cadastro, assume PT-BR (default do produto)', () => {
    expect(makeIdentity().preferredLocale).toBe('pt-BR');
  });

  it('aceita um locale suportado explícito no cadastro (ex.: resolvido via Accept-Language)', () => {
    expect(makeIdentity('en-US').preferredLocale).toBe('en-US');
  });

  it('locale não suportado no cadastro cai silenciosamente para o default (nunca quebra o fluxo)', () => {
    expect(makeIdentity('fr-FR').preferredLocale).toBe('pt-BR');
  });

  it('changePreferredLocale troca para um locale suportado', () => {
    const identity = makeIdentity();
    const before = identity.updatedAt;
    identity.changePreferredLocale('en-US', new Date(before.getTime() + 1000));
    expect(identity.preferredLocale).toBe('en-US');
    expect(identity.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('changePreferredLocale REJEITA locale não suportado — invariante de domínio, não confia na borda', () => {
    const identity = makeIdentity();
    expect(() => identity.changePreferredLocale('xx-XX')).toThrow(UnsupportedLocaleException);
    expect(identity.preferredLocale).toBe('pt-BR');
  });
});
