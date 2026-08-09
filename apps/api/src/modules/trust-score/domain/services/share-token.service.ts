import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../../../shared/config/app-config.service';

/**
 * Tokens de compartilhamento (TRS-017/018, P7): `<aleatório>.<hmac>`.
 * O HMAC-SHA256 permite provar integridade/autenticidade do link SEM consultar
 * o banco (TRS-018); o banco guarda apenas o SHA-256 da parte aleatória.
 * Segredo derivado da chave privada JWT — nenhuma env nova necessária.
 */
@Injectable()
export class ShareTokenService {
  private readonly secret: Buffer;

  constructor(config: AppConfigService) {
    this.secret = createHash('sha256')
      .update(`${config.jwtPrivateKeyPem}:trust-profile-share`)
      .digest();
  }

  generate(): { token: string; tokenHash: string } {
    const raw = randomBytes(24).toString('base64url');
    return { token: `${raw}.${this.sign(raw)}`, tokenHash: this.hashRaw(raw) };
  }

  /** Valida o formato e o HMAC; retorna o hash para lookup, ou null se forjado. */
  verify(token: string): { tokenHash: string } | null {
    const [raw, signature] = token.split('.');
    if (!raw || !signature) {
      return null;
    }
    const expected = this.sign(raw);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
    return { tokenHash: this.hashRaw(raw) };
  }

  private sign(raw: string): string {
    return createHmac('sha256', this.secret).update(raw).digest('base64url').slice(0, 22);
  }

  private hashRaw(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
