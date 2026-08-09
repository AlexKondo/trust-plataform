import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoTokenGeneratorService } from './crypto-token-generator.service';

describe('CryptoTokenGeneratorService', () => {
  const service = new CryptoTokenGeneratorService();

  it('gera tokens únicos de 256 bits com hash SHA-256 correspondente', () => {
    const a = service.generate();
    const b = service.generate();

    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url
    expect(a.tokenHash).toBe(createHash('sha256').update(a.token).digest('hex'));
    expect(a.tokenHash).toHaveLength(64);
    expect(a.tokenHash).not.toContain(a.token);
  });

  it('hash é determinístico para o mesmo token', () => {
    const { token, tokenHash } = service.generate();
    expect(service.hash(token)).toBe(tokenHash);
  });
});
