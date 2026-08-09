import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v7 as uuidv7 } from 'uuid';
import { AppConfigService } from '../config/app-config.service';
import { AccessTokenPayload } from './authenticated-identity';

export const JWT_ISSUER = 'trust-platform';

export interface IssuedAccessToken {
  accessToken: string;
  tokenId: string;
  expiresAt: Date;
}

/**
 * Único componente que assina/verifica JWTs de acesso (ES256, 15 min — DOC-002).
 * O access token carrega apenas IdentityId (sub) e jti — nunca dados sensíveis.
 */
@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  issueAccessToken(identityId: string): IssuedAccessToken {
    const tokenId = uuidv7();
    const ttlSeconds = this.config.accessTokenTtlSeconds;
    const accessToken = this.jwt.sign(
      { sub: identityId },
      { jwtid: tokenId, expiresIn: ttlSeconds },
    );
    return {
      accessToken,
      tokenId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  /** Lança se assinatura inválida, expirado ou issuer errado — o guard converte em 401. */
  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token);
  }
}
