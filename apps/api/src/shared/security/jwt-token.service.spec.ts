import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { AppConfigService } from '../config/app-config.service';
import { JWT_ISSUER, JwtTokenService } from './jwt-token.service';

function makeService(ttlSeconds = 900): JwtTokenService {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwt = new JwtService({
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signOptions: { algorithm: 'ES256', issuer: JWT_ISSUER },
    verifyOptions: { algorithms: ['ES256'], issuer: JWT_ISSUER },
  });
  const config = { accessTokenTtlSeconds: ttlSeconds } as AppConfigService;
  return new JwtTokenService(jwt, config);
}

describe('JwtTokenService', () => {
  it('emite e verifica access token ES256 com sub, jti e issuer', () => {
    const service = makeService();
    const identityId = uuidv7();

    const issued = service.issueAccessToken(identityId);
    const payload = service.verifyAccessToken(issued.accessToken);

    expect(payload.sub).toBe(identityId);
    expect(payload.jti).toBe(issued.tokenId);
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('rejeita token adulterado', () => {
    const service = makeService();
    const issued = service.issueAccessToken(uuidv7());
    const tampered = `${issued.accessToken.slice(0, -4)}AAAA`;
    expect(() => service.verifyAccessToken(tampered)).toThrow();
  });

  it('rejeita token assinado por outra chave', () => {
    const serviceA = makeService();
    const serviceB = makeService();
    const issued = serviceA.issueAccessToken(uuidv7());
    expect(() => serviceB.verifyAccessToken(issued.accessToken)).toThrow();
  });
});
