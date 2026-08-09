import { describe, expect, it } from 'vitest';
import { Argon2PasswordHashService } from './argon2-password-hash.service';

describe('Argon2PasswordHashService', () => {
  const service = new Argon2PasswordHashService();

  it('gera hash argon2id que não contém a senha', async () => {
    const hash = await service.hash('Correct#Horse7Battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Correct#Horse7Battery');
  });

  it('verifica senha correta e rejeita incorreta', async () => {
    const hash = await service.hash('Correct#Horse7Battery');
    await expect(service.verify('Correct#Horse7Battery', hash)).resolves.toBe(true);
    await expect(service.verify('Wrong#Horse7Battery', hash)).resolves.toBe(false);
  });

  it('retorna false (não lança) para hash malformado', async () => {
    await expect(service.verify('whatever', 'not-a-hash')).resolves.toBe(false);
  });
});
