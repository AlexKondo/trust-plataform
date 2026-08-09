import { describe, expect, it } from 'vitest';
import { TrustPassport } from './trust-passport';

describe('TrustPassport aggregate (TPS-001..003)', () => {
  it('nasce ACTIVE, com e-mail verificado (fato gerador) e completude 25%', () => {
    const passport = TrustPassport.createNew('identity-1');

    expect(passport.status).toBe('ACTIVE');
    expect(passport.emailVerified).toBe(true);
    expect(passport.phoneVerified).toBe(false);
    expect(passport.documentVerified).toBe(false);
    expect(passport.addressVerified).toBe(false);
    expect(passport.profileCompletion).toBe(25);
    expect(passport.id).not.toBe('identity-1'); // BR-006: id próprio
  });

  it('updateProfile altera phone/address e retorna os campos alterados', () => {
    const passport = TrustPassport.createNew('identity-1');
    const fields = passport.updateProfile({
      phone: '+55 11 99999-9999',
      address: { country: 'BR', state: 'SP', city: 'Valinhos' },
    });

    expect(fields.sort()).toEqual(['address', 'phone']);
    expect(passport.profile.phone).toBe('+55 11 99999-9999');
    expect(passport.profile.addressCity).toBe('Valinhos');
  });

  it('alterar atributo verificável revoga a verificação e recalcula (BR-004/005)', () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.markVerified('phone');
    expect(passport.profileCompletion).toBe(50);

    const fields = passport.updateProfile({ phone: '+55 11 88888-8888' });
    expect(fields).toEqual(['phone']);
    expect(passport.phoneVerified).toBe(false); // verificação revogada
    expect(passport.profileCompletion).toBe(25);
  });

  it('valores idênticos não geram alteração nem evento', () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.updateProfile({ phone: '+55 11 99999-9999' });
    const before = passport.updatedAt;

    const fields = passport.updateProfile({ phone: '+55 11 99999-9999' });
    expect(fields).toEqual([]);
    expect(passport.updatedAt).toBe(before);
  });

  it('completude chega a 100 com os 4 atributos verificados', () => {
    const passport = TrustPassport.createNew('identity-1');
    passport.markVerified('phone');
    passport.markVerified('document');
    passport.markVerified('address');
    expect(passport.profileCompletion).toBe(100);
  });
});
