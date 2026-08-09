import { describe, expect, it } from 'vitest';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { ShareTokenService } from './share-token.service';

const config = { jwtPrivateKeyPem: 'test-secret-key-material' } as AppConfigService;

describe('ShareTokenService (TRS-017/018, P7)', () => {
  const service = new ShareTokenService(config);

  it('gera token <aleatório>.<hmac> verificável e único', () => {
    const a = service.generate();
    const b = service.generate();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(service.verify(a.token)?.tokenHash).toBe(a.tokenHash);
  });

  it('rejeita token adulterado ou malformado (assinatura HMAC)', () => {
    const { token } = service.generate();
    const [raw, sig] = token.split('.');
    expect(service.verify(`${raw}x.${sig}`)).toBeNull(); // raw adulterado
    expect(service.verify(`${raw}.${sig!.slice(0, -2)}AA`)).toBeNull(); // assinatura adulterada
    expect(service.verify('sem-ponto')).toBeNull();
    expect(service.verify(`${raw}.`)).toBeNull();
  });

  it('tokens de segredos diferentes não se validam entre si', () => {
    const other = new ShareTokenService({ jwtPrivateKeyPem: 'outro-segredo' } as AppConfigService);
    const { token } = service.generate();
    expect(other.verify(token)).toBeNull();
  });
});
